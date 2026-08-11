const rawHeadElements = new Set(["noframes", "script", "style", "title"]);
const voidHeadElements = new Set(["base", "basefont", "bgsound", "meta"]);

function isHtmlWhitespace(character) {
  return Boolean(character) && /[\t\n\f\r ]/.test(character);
}

function isTagNameCharacter(character) {
  return Boolean(character) && /[A-Za-z0-9:-]/.test(character);
}

function findTagEnd(source, start) {
  let quote = null;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }

  return -1;
}

function readTag(source, start) {
  if (source[start] !== "<") return null;

  let cursor = start + 1;
  const closing = source[cursor] === "/";
  if (closing) cursor += 1;

  const nameStart = cursor;
  while (isTagNameCharacter(source[cursor])) cursor += 1;
  if (cursor === nameStart) return null;

  const boundary = source[cursor];
  if (!(isHtmlWhitespace(boundary) || boundary === "/" || boundary === ">")) {
    return null;
  }

  const end = findTagEnd(source, cursor);
  if (end === -1) return null;

  return {
    closing,
    end,
    name: source.slice(nameStart, cursor).toLowerCase(),
    nameEnd: cursor,
  };
}

function findClosingTag(source, name, start) {
  const closingPattern = new RegExp(
    `</${name}(?=[\\t\\n\\f\\r \\/>])`,
    "gi",
  );
  closingPattern.lastIndex = start;

  for (const match of source.matchAll(closingPattern)) {
    const parsedTag = readTag(source, match.index);
    if (parsedTag?.closing && parsedTag.name === name) return parsedTag;
  }

  return null;
}

function readAttributes(tag, nameEnd) {
  const attributes = new Map();
  let selfClosingStart = null;
  let cursor = nameEnd;

  while (cursor < tag.length - 1) {
    while (isHtmlWhitespace(tag[cursor])) cursor += 1;
    if (tag[cursor] === "/") {
      if (tag[cursor + 1] === ">") selfClosingStart = cursor;
      cursor += 1;
      continue;
    }
    if (!tag[cursor] || tag[cursor] === ">") break;

    const start = cursor;
    while (
      tag[cursor]
      && !isHtmlWhitespace(tag[cursor])
      && tag[cursor] !== "="
      && tag[cursor] !== "/"
      && tag[cursor] !== ">"
    ) {
      cursor += 1;
    }
    if (cursor === start) {
      cursor += 1;
      continue;
    }

    const name = tag.slice(start, cursor).toLowerCase();
    while (isHtmlWhitespace(tag[cursor])) cursor += 1;

    let value = "";
    if (tag[cursor] === "=") {
      cursor += 1;
      while (isHtmlWhitespace(tag[cursor])) cursor += 1;

      const quote = tag[cursor] === '"' || tag[cursor] === "'" ? tag[cursor] : null;
      if (quote) {
        cursor += 1;
        const valueStart = cursor;
        while (tag[cursor] && tag[cursor] !== quote) cursor += 1;
        value = tag.slice(valueStart, cursor);
        if (tag[cursor] === quote) cursor += 1;
      } else {
        const valueStart = cursor;
        while (tag[cursor] && !isHtmlWhitespace(tag[cursor]) && tag[cursor] !== ">") {
          cursor += 1;
        }
        value = tag.slice(valueStart, cursor);
      }
    }

    if (!attributes.has(name)) {
      attributes.set(name, { end: cursor, start, value });
    }
  }

  return { attributes, selfClosingStart };
}

function relTokens(attributes) {
  return (attributes.get("rel")?.value ?? "")
    .toLowerCase()
    .split(/[\t\n\f\r ]+/)
    .filter(Boolean);
}

function normalizeCrossorigin(value) {
  const normalized = value?.toLowerCase();
  return !normalized || normalized === "anonymous" ? "anonymous" : normalized;
}

function modulePreloadRequestKey(attributes) {
  const href = attributes.get("href")?.value;
  if (!href) return null;

  const semantics = [];
  for (const [name, attribute] of attributes) {
    if (name === "href" || name === "fetchpriority" || name === "crossorigin") continue;
    semantics.push([
      name,
      name === "rel" ? relTokens(attributes).sort().join(" ") : attribute.value,
    ]);
  }
  semantics.push([
    "crossorigin",
    normalizeCrossorigin(attributes.get("crossorigin")?.value),
  ]);
  semantics.sort(([leftName, leftValue], [rightName, rightValue]) => (
    leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
  ));

  return JSON.stringify([href, semantics]);
}

function withLowFetchPriority(tag, attributes, selfClosingStart) {
  const existing = attributes.get("fetchpriority");
  if (existing) {
    return `${tag.slice(0, existing.start)}fetchpriority="low"${tag.slice(existing.end)}`;
  }

  const closingStart = selfClosingStart ?? tag.length - 1;
  const separator = isHtmlWhitespace(tag[closingStart - 1]) ? "" : " ";
  return `${tag.slice(0, closingStart)}${separator}fetchpriority="low"${tag.slice(closingStart)}`;
}

function optimizeLinkTag(tag, nameEnd, seenRequests) {
  const { attributes, selfClosingStart } = readAttributes(tag, nameEnd);
  if (!relTokens(attributes).includes("modulepreload")) return tag;

  const requestKey = modulePreloadRequestKey(attributes);
  if (requestKey && seenRequests.has(requestKey)) return "";
  if (requestKey) seenRequests.add(requestKey);

  return withLowFetchPriority(tag, attributes, selfClosingStart);
}

function findHeadContentStart(source) {
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start === -1) return null;

    if (source.startsWith("<!--", start)) {
      const commentEnd = source.indexOf("-->", start + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }
    if (source[start + 1] === "!" || source[start + 1] === "?") {
      const declarationEnd = source.indexOf(">", start + 2);
      cursor = declarationEnd === -1 ? source.length : declarationEnd + 1;
      continue;
    }

    const parsedTag = readTag(source, start);
    if (!parsedTag) return null;
    if (!parsedTag.closing && parsedTag.name === "head") return parsedTag.end + 1;
    if (!parsedTag.closing && parsedTag.name === "html") {
      cursor = parsedTag.end + 1;
      continue;
    }
    return null;
  }

  return null;
}

export function optimizeHeadModulePreloads(source) {
  const headStart = findHeadContentStart(source);
  if (headStart === null) return source;

  const seenRequests = new Set();
  const chunks = [];
  let emittedUntil = 0;
  let cursor = headStart;

  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start === -1 || /[^\t\n\f\r ]/.test(source.slice(cursor, start))) break;

    if (source.startsWith("<!--", start)) {
      const commentEnd = source.indexOf("-->", start + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }

    const parsedTag = readTag(source, start);
    if (!parsedTag) break;
    if (parsedTag.closing) {
      if (parsedTag.name === "head") cursor = parsedTag.end + 1;
      break;
    }

    if (parsedTag.name === "link") {
      const tag = source.slice(start, parsedTag.end + 1);
      chunks.push(source.slice(emittedUntil, start));
      chunks.push(optimizeLinkTag(tag, parsedTag.nameEnd - start, seenRequests));
      emittedUntil = parsedTag.end + 1;
      cursor = parsedTag.end + 1;
      continue;
    }

    cursor = parsedTag.end + 1;
    if (rawHeadElements.has(parsedTag.name) || parsedTag.name === "noscript") {
      const closingTag = findClosingTag(source, parsedTag.name, cursor);
      if (!closingTag) break;
      cursor = closingTag.end + 1;
      continue;
    }
    if (voidHeadElements.has(parsedTag.name)) continue;

    // Template and foreign/body content need full HTML tree construction. Stop at
    // that boundary rather than risking edits outside Vinext's direct head hints.
    break;
  }

  chunks.push(source.slice(emittedUntil));
  return chunks.join("");
}
