import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

import { optimizeHeadModulePreloads } from "../scripts/lib/module-preload-hints.mjs";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "github-pages-dist");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function measureFiles(paths) {
  const files = await Promise.all(paths.map((path) => readFile(path)));

  return files.reduce(
    (totals, file) => ({
      raw: totals.raw + file.byteLength,
      gzip: totals.gzip + gzipSync(file, { level: 9 }).byteLength,
    }),
    { raw: 0, gzip: 0 },
  );
}

function findMarkupEnd(source, start) {
  let quote = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function readMarkup(source, start) {
  const end = findMarkupEnd(source, start);
  if (end === -1) return null;

  const tag = source.slice(start, end + 1);
  const tagName = tag.match(/^<(\/)?([A-Za-z0-9:-]+)(?=[\t\n\f\r \/>])/);
  if (!tagName) return null;

  return {
    closing: Boolean(tagName[1]),
    end,
    name: tagName[2].toLowerCase(),
    start,
    tag,
  };
}

function findClosingMarkup(source, name, start) {
  if (name === "plaintext") return null;

  const closingPattern = new RegExp(
    `</${name}(?=[\\t\\n\\f\\r \\/>])`,
    "gi",
  );
  closingPattern.lastIndex = start;

  for (const match of source.matchAll(closingPattern)) {
    const markup = readMarkup(source, match.index);
    if (markup?.closing && markup.name === name) return markup;
  }

  return null;
}

function findHeadContent(source) {
  const headStart = source.search(/<head(?=[\t\n\f\r \/>])/i);
  if (headStart === -1) return null;

  const openingEnd = findMarkupEnd(source, headStart);
  if (openingEnd === -1) return null;
  const closingHead = findClosingMarkup(source, "head", openingEnd + 1);
  if (!closingHead) return null;

  return source.slice(openingEnd + 1, closingHead.start);
}

function findHeadLinkTags(source) {
  const head = findHeadContent(source);
  if (head === null) return [];

  const tags = [];
  let cursor = 0;

  while (cursor < head.length) {
    const start = head.indexOf("<", cursor);
    if (start === -1) break;
    if (head.startsWith("<!--", start)) {
      const commentEnd = head.indexOf("-->", start + 4);
      cursor = commentEnd === -1 ? head.length : commentEnd + 3;
      continue;
    }

    const markup = readMarkup(head, start);
    if (!markup) {
      cursor = start + 1;
      continue;
    }
    if (!markup.closing && markup.name === "link") tags.push(markup.tag);

    cursor = markup.end + 1;
    if (
      !markup.closing
      && ["noframes", "noscript", "script", "style", "title"].includes(markup.name)
    ) {
      const closingMarkup = findClosingMarkup(
        head,
        markup.name,
        cursor,
      );
      cursor = closingMarkup ? closingMarkup.end + 1 : head.length;
    }
  }

  return tags;
}

function readTagAttributes(tag) {
  const attributes = new Map();
  const nameEnd = tag.search(/[\t\n\f\r \/>]/);
  const attributeSource = tag.slice(nameEnd, -1);
  const attributePattern = /(?:^|[\t\n\f\r ])([^\t\n\f\r "'<>\/=]+)(?:[\t\n\f\r ]*=[\t\n\f\r ]*(?:"([^"]*)"|'([^']*)'|([^\t\n\f\r "'=<>`]+)))?/g;

  for (const match of attributeSource.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "");
    }
  }

  return attributes;
}

function readAttribute(tag, name) {
  return readTagAttributes(tag).get(name.toLowerCase());
}

function hasRelToken(tag, token) {
  return (readAttribute(tag, "rel") ?? "")
    .toLowerCase()
    .split(/[\t\n\f\r ]+/)
    .includes(token);
}

function modulePreloadRequestKey(tag) {
  const attributes = readTagAttributes(tag);
  const semantics = [];
  for (const [name, value] of attributes) {
    if (name === "href" || name === "fetchpriority" || name === "crossorigin") continue;
    semantics.push([
      name,
      name === "rel"
        ? value.toLowerCase().split(/[\t\n\f\r ]+/).filter(Boolean).sort().join(" ")
        : value,
    ]);
  }
  const crossorigin = attributes.get("crossorigin")?.toLowerCase();
  semantics.push([
    "crossorigin",
    !crossorigin || crossorigin === "anonymous" ? "anonymous" : crossorigin,
  ]);
  semantics.sort(([leftName, leftValue], [rightName, rightValue]) => (
    leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue)
  ));
  return JSON.stringify([attributes.get("href"), semantics]);
}

test("optimizes only equivalent direct-head modulepreload requests", () => {
  const portraitPreload = '<link data-rel="modulepreload" rel="preload" href="/portrait.webp" data-fetchpriority="low" fetchpriority="high">';
  const commentedPreload = '<!-- <link rel="modulepreload" href="/comment.js"> -->';
  const scriptedPreload = `<script>window.template = '<link rel="modulepreload" href="/script.js">';</script>`;
  const prefixedRawTextPreload = `<script>window.template = '</scripture><link rel="modulepreload" href="/raw-prefix.js">';</script>`;
  const unicodeScript = `<script>${"İ".repeat(8)}</script>`;
  const templatePreload = '<template><link rel="modulepreload" href="/template-entry.js"></template>';
  const nestedTemplatePreload = '<template><template><link rel="modulepreload" href="/nested-template.js"></template></template>';
  const noscriptPreload = '<noscript><link rel="modulepreload" href="/noscript-entry.js"></noscript>';
  const noscriptRawTextPreload = '<noscript><title><link rel="modulepreload" href="/noscript-raw.js"></noscript>';
  const svgPreload = '<svg><link rel="modulepreload" href="/foreign-svg.js"></link></svg>';
  const mathPreload = '<math><link rel="modulepreload" href="/foreign-math.js"></link></math>';
  const svgCdataPreload = '<svg><![CDATA[</svg><link rel="modulepreload" href="/foreign-cdata.js">]]></svg>';
  const selfClosingSvg = '<svg viewBox="0 0 1 1"/>';
  const bodyIntegrationPreload = '<svg><foreignObject><link rel="modulepreload" href="/body-integration.js"></foreignObject></svg>';
  const declarativeShadowPreload = '<div><template shadowrootmode="open"><link rel="modulepreload" href="/shadow-root.js"></template></div>';
  const nestedPreload = `<meta content='<link rel="modulepreload" href="/meta.js">'>`;
  const head = [
    portraitPreload,
    commentedPreload,
    scriptedPreload,
    prefixedRawTextPreload,
    unicodeScript,
    noscriptPreload,
    noscriptRawTextPreload,
    nestedPreload,
    '<link rel="modulepreload" href="/entry.js" crossorigin="">',
    "<link href='/entry.js' rel = 'modulepreload'>",
    '<link rel="modulepreload" href="/responsive.js" media="(max-width: 600px)">',
    '<link rel="modulepreload" href="/responsive.js" media="(min-width: 601px)">',
    '<link rel="modulepreload" href="/wide.js" media="(width > 600px)">',
    '<link rel="modulepreload" href="/secure.js" integrity="sha256-a">',
    '<link rel="modulepreload" href="/secure.js" integrity="sha256-b">',
    '<link rel="modulepreload" href="/credentialed.js" crossorigin>',
    '<link rel="modulepreload" href="/credentialed.js" crossorigin="use-credentials">',
    '<link rel="stylesheet modulepreload" data-href="/fake.js" href="/real.js" data-fetchpriority="high">',
    '<link rel="modulepreload" href="/priority.js" data-fetchpriority="keep" fetchPriority = "high">',
    `<link rel="modulepreload" data-note=' keep fetchpriority="fake" here' href="/quoted.js" fetchpriority="high">`,
    '<link rel="modulepreload" href="/raw-prefix.js">',
    '<link rel="modulepreload" href="/template-entry.js">',
    '<link rel="modulepreload" href="/nested-template.js">',
    '<link rel="modulepreload" href="/noscript-entry.js">',
    '<link rel="modulepreload" href="/noscript-raw.js">',
    '<link rel="modulepreload" href="/unicode-index.js">',
    '<link rel="modulepreload" href="/foreign-svg.js">',
    '<link rel="modulepreload" href="/foreign-math.js">',
    '<link rel="modulepreload" href="/foreign-cdata.js">',
    '<link rel="modulepreload" href="/after-self-closing-svg.js">',
    '<link rel=modulepreload href=/module/>',
    '<link rel="modulepreload" href="/self-closing.js"/>',
  ].join("\n");
  const body = [
    templatePreload,
    nestedTemplatePreload,
    svgPreload,
    mathPreload,
    svgCdataPreload,
    selfClosingSvg,
    bodyIntegrationPreload,
    declarativeShadowPreload,
  ].join("\n");
  const source = `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

  const optimized = optimizeHeadModulePreloads(source);
  assert.equal(optimized.includes(portraitPreload), true, "data-* attributes changed a normal preload");
  assert.equal(optimized.includes(commentedPreload), true, "commented markup should stay inert");
  assert.equal(optimized.includes(scriptedPreload), true, "script text should stay inert");
  assert.equal(optimized.includes(prefixedRawTextPreload), true, "raw-text prefixes are not closing tags");
  assert.equal(optimized.includes(unicodeScript), true, "Unicode raw text should preserve source indexes");
  assert.equal(optimized.includes(templatePreload), true, "template contents should stay inert");
  assert.equal(optimized.includes(nestedTemplatePreload), true, "nested templates should stay inert");
  assert.equal(optimized.includes(noscriptPreload), true, "noscript contents should stay inert");
  assert.equal(optimized.includes(noscriptRawTextPreload), true, "noscript should use raw-text boundaries");
  assert.equal(optimized.includes(svgPreload), true, "SVG links should stay in their foreign namespace");
  assert.equal(optimized.includes(mathPreload), true, "MathML links should stay in their foreign namespace");
  assert.equal(optimized.includes(svgCdataPreload), true, "foreign CDATA should stay opaque");
  assert.equal(optimized.includes(selfClosingSvg), true, "self-closing foreign elements should stay intact");
  assert.equal(optimized.includes(bodyIntegrationPreload), true, "body integration points are out of scope");
  assert.equal(optimized.includes(declarativeShadowPreload), true, "body shadow roots are out of scope");
  assert.equal(optimized.includes(nestedPreload), true, "quoted markup should stay inert");
  assert.equal((optimized.match(/href=(["'])\/entry\.js\1/g) ?? []).length, 1);
  assert.equal((optimized.match(/href=(["'])\/responsive\.js\1/g) ?? []).length, 2);
  assert.equal((optimized.match(/href=(["'])\/secure\.js\1/g) ?? []).length, 2);
  assert.equal((optimized.match(/href=(["'])\/credentialed\.js\1/g) ?? []).length, 2);
  assert.match(
    optimized,
    /href="\/wide\.js" media="\(width > 600px\)" fetchpriority="low"/,
  );
  assert.match(
    optimized,
    /data-href="\/fake\.js" href="\/real\.js" data-fetchpriority="high" fetchpriority="low"/,
  );
  assert.match(
    optimized,
    /href="\/priority\.js" data-fetchpriority="keep" fetchpriority="low"/,
  );
  assert.match(
    optimized,
    /data-note=' keep fetchpriority="fake" here' href="\/quoted\.js" fetchpriority="low"/,
  );
  for (const href of [
    "/raw-prefix.js",
    "/template-entry.js",
    "/nested-template.js",
    "/noscript-entry.js",
    "/noscript-raw.js",
    "/foreign-svg.js",
    "/foreign-math.js",
    "/foreign-cdata.js",
  ]) {
    assert.equal(
      optimized.split(`href="${href}"`).length - 1,
      2,
      `${href} should retain both inert markup and its active preload`,
    );
  }
  assert.match(optimized, /<link rel=modulepreload href=\/module\/ fetchpriority="low">/);
  assert.match(
    optimized,
    /<link rel="modulepreload" href="\/unicode-index\.js" fetchpriority="low">/,
  );
  assert.match(
    optimized,
    /<link rel="modulepreload" href="\/after-self-closing-svg\.js" fetchpriority="low">/,
  );
  assert.match(
    optimized,
    /<link rel="modulepreload" href="\/self-closing\.js" fetchpriority="low"\/>/,
  );
  assert.equal(optimizeHeadModulePreloads(optimized), optimized, "optimizer should be idempotent");

  const plaintextSource = '<plaintext></plaintext><link rel="modulepreload" href="/still-plain-text.js">';
  assert.equal(
    optimizeHeadModulePreloads(plaintextSource),
    plaintextSource,
    "plaintext should keep the remainder of the document inert",
  );
  assert.deepEqual(findHeadLinkTags(plaintextSource), []);

  const nonSelfClosingSvg = '<svg data-path=/icon/><link rel="modulepreload" href="/still-svg.js">';
  assert.equal(
    optimizeHeadModulePreloads(nonSelfClosingSvg),
    nonSelfClosingSvg,
    "an unquoted trailing slash remains part of a foreign attribute value",
  );
  assert.deepEqual(findHeadLinkTags(nonSelfClosingSvg), []);
});

test("exports a complete static GitHub Pages artifact", async () => {
  for (const file of [
    "index.html",
    "404.html",
    "apple-touch-icon.png",
    "favicon.svg",
    "robots.txt",
    "sitemap.xml",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.equal(await exists(resolve(output, file)), true, `${file} should exist`);
  }
  assert.equal(
    await exists(resolve(output, "assets/jaxon-signal-og.png")),
    true,
    "the social preview image should be present in the export",
  );

  const html = await readFile(resolve(output, "index.html"), "utf8");
  const notFoundHtml = await readFile(resolve(output, "404.html"), "utf8");
  const robots = await readFile(resolve(output, "robots.txt"), "utf8");
  const sitemap = await readFile(resolve(output, "sitemap.xml"), "utf8");
  const notices = await readFile(resolve(output, "THIRD_PARTY_NOTICES.md"), "utf8");

  for (const [label, source] of [
    ["homepage", html],
    ["404", notFoundHtml],
  ]) {
    const head = findHeadContent(source);
    assert.ok(head, `${label} should export a head element`);
    assert.doesNotMatch(
      head,
      /<(?:math|svg|template)(?=[\t\n\f\r \/>])/i,
      `${label} head should keep preload hints in the supported direct-head scope`,
    );
    const linkTags = findHeadLinkTags(source);
    const modulePreloads = linkTags.filter((tag) => hasRelToken(tag, "modulepreload"));

    assert.ok(modulePreloads.length > 0, `${label} should preload client modules`);
    const modulePreloadHrefs = modulePreloads.map((tag) => readAttribute(tag, "href"));
    assert.equal(modulePreloadHrefs.every(Boolean), true, `${label} modulepreload needs an href`);
    const modulePreloadKeys = modulePreloads.map(modulePreloadRequestKey);
    assert.equal(
      new Set(modulePreloadKeys).size,
      modulePreloadKeys.length,
      `${label} should not duplicate equivalent modulepreloads`,
    );
    for (const tag of modulePreloads) {
      assert.equal(
        readAttribute(tag, "fetchpriority"),
        "low",
        `${label} modulepreload should not compete with the LCP image`,
      );
    }
  }

  const portraitPreload = findHeadLinkTags(html).find((tag) => (
    hasRelToken(tag, "preload")
    && readAttribute(tag, "href") === "/assets/jaxon-sea-portrait.webp"
  ));
  assert.ok(portraitPreload, "homepage should preload the LCP portrait");
  assert.equal(
    readAttribute(portraitPreload, "fetchpriority")?.toLowerCase(),
    "high",
    "the LCP portrait should retain high fetch priority",
  );

  assert.match(html, /<title>Jaxon \| AI Engineer<\/title>/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /property="og:image" content="https:\/\/jaxonhu1024\.github\.io\/assets\/jaxon-signal-og\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/jaxonhu1024\.github\.io\/assets\/jaxon-signal-og\.png"/);
  assert.match(html, /name="twitter:image:alt" content="JAXON signal field"/);
  assert.match(
    html,
    /<link(?=[^>]*\brel="apple-touch-icon")(?=[^>]*\bhref="https:\/\/jaxonhu1024\.github\.io\/apple-touch-icon\.png")(?=[^>]*\bsizes="180x180")(?=[^>]*\btype="image\/png")[^>]*\/>/,
  );
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, new RegExp(`JAXON \/ (?:<!-- -->)?${new Date().getUTCFullYear()}`));
  assert.match(robots, /Sitemap: https:\/\/jaxonhu1024\.github\.io\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/jaxonhu1024\.github\.io\/<\/loc>/);
  assert.match(notices, /Aceternity UI — Existing component adaptations/);
  assert.match(notices, /public-source redistribution permission .* remains unresolved/);
  assert.doesNotMatch(notices, /React Bits|SpotlightCard|Commons Clause|David Haz/);
  assert.match(html, /Road-Network-Based/);
  assert.match(html, /ResFi:/);
  assert.ok(html.indexOf("9831898") < html.indexOf("9170807"));
  assert.doesNotMatch(html, /road-network-geolocalization\.png|codex-clipboard/i);
  assert.notEqual(notFoundHtml, html);
  assert.match(notFoundHtml, /<title>404 - Signal Lost \| JAXON<\/title>/);
  assert.match(notFoundHtml, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.doesNotMatch(notFoundHtml, /rel="canonical"/);
  assert.doesNotMatch(notFoundHtml, /property="og:/);
  assert.doesNotMatch(notFoundHtml, /name="twitter:/);
  assert.match(notFoundHtml, /404 \/ SIGNAL LOST/);
  assert.match(notFoundHtml, /ROUTE NOT FOUND_/);
  assert.match(notFoundHtml, /class="wordmark" href="\/"/);
  assert.equal(
    (notFoundHtml.match(/href="\/#(?:about|experience|foundations|research|contact)"/g) ?? []).length,
    5,
  );
  assert.doesNotMatch(notFoundHtml, /EXPERIENCE\.LOG|PUBLICATION 01/);

  const assetPaths = [
    ...html.matchAll(/(?:href|src)="(\/assets\/[^"?]+)(?:\?[^\"]*)?"/g),
  ].map((match) => match[1]);
  assert.ok(assetPaths.length > 0, "rendered HTML should reference built assets");

  for (const assetPath of new Set(assetPaths)) {
    assert.equal(
      await exists(resolve(output, `.${assetPath}`)),
      true,
      `${assetPath} should exist in the exported artifact`,
    );
  }

  for (const internalFile of [".vite/manifest.json", "_headers", ".openai/hosting.json"]) {
    assert.equal(await exists(resolve(output, internalFile)), false, `${internalFile} should not be published`);
  }
});

test("keeps optimized visual assets within their checked-in budgets", async () => {
  const assets = resolve(root, "public/assets");
  const budgets = new Map([
    ["logo-bytedance-color.svg", 900],
    ["logo-alibaba-color.svg", 1_500],
    ["logo-ntu.svg", 83_000],
    ["logo-seu-color.svg", 60_000],
    ["jaxon-sea-portrait.webp", 36_000],
    ["jaxon-signal-og.png", 320_000],
    ["travel-world-solid.svg", 65_000],
  ]);

  for (const [file, budget] of budgets) {
    const size = (await stat(resolve(assets, file))).size;
    assert.ok(size <= budget, `${file} totalled ${size} bytes`);
  }
  const appleTouchIconSize = (await stat(resolve(root, "public/apple-touch-icon.png"))).size;
  assert.ok(
    appleTouchIconSize <= 30_000,
    `apple-touch-icon.png totalled ${appleTouchIconSize} bytes`,
  );
});

test("keeps exported HTML, CSS, and JavaScript within transfer budgets", async () => {
  const assets = resolve(output, "assets");
  const assetFiles = await readdir(assets);
  const homepagePath = resolve(output, "index.html");
  const homepageHtml = await readFile(homepagePath, "utf8");
  const preloadedScripts = [...new Set(
    [...homepageHtml.matchAll(/<link rel="modulepreload" href="(\/assets\/[^"?]+\.js)(?:\?[^\"]*)?"[^>]*>/g)]
      .map((match) => resolve(output, `.${match[1]}`)),
  )];
  const groups = new Map([
    ["homepage HTML", {
      paths: [homepagePath],
      budget: { raw: 85_000, gzip: 14_000 },
    }],
    ["404 HTML", {
      paths: [resolve(output, "404.html")],
      budget: { raw: 12_000, gzip: 3_000 },
    }],
    ["stylesheets", {
      paths: assetFiles.filter((file) => file.endsWith(".css")).map((file) => resolve(assets, file)),
      budget: { raw: 90_000, gzip: 18_000 },
    }],
    ["all client scripts", {
      paths: assetFiles.filter((file) => file.endsWith(".js")).map((file) => resolve(assets, file)),
      budget: { raw: 350_000, gzip: 112_000 },
    }],
    ["preloaded client scripts", {
      paths: preloadedScripts,
      budget: { raw: 340_000, gzip: 108_000 },
    }],
  ]);

  for (const [label, { paths, budget }] of groups) {
    assert.ok(paths.length > 0, `${label} should include at least one exported file`);
    const size = await measureFiles(paths);

    for (const encoding of ["raw", "gzip"]) {
      assert.ok(
        size[encoding] <= budget[encoding],
        `${label} totalled ${size[encoding]} ${encoding} bytes (budget ${budget[encoding]})`,
      );
    }
  }
});

test("publishes only the required Latin WOFF2 font budget", async () => {
  const assets = resolve(output, "assets");
  const fontFiles = (await readdir(assets))
    .filter((file) => /\.woff2?$/.test(file))
    .sort();
  const fontBytes = (
    await Promise.all(fontFiles.map(async (file) => (await stat(resolve(assets, file))).size))
  ).reduce((total, size) => total + size, 0);

  assert.equal(fontFiles.length, 5, `unexpected font files: ${fontFiles.join(", ")}`);
  assert.equal(fontFiles.every((file) => file.endsWith(".woff2")), true);
  assert.equal(fontFiles.some((file) => /cyrillic|vietnamese|latin-ext/.test(file)), false);
  assert.equal(fontFiles.filter((file) => file.startsWith("ibm-plex-mono-latin-")).length, 3);
  assert.equal(fontFiles.filter((file) => file.startsWith("oxanium-latin-")).length, 1);
  assert.equal(fontFiles.filter((file) => file.startsWith("geist-latin-")).length, 1);
  assert.ok(fontBytes <= 95_000, `font assets totalled ${fontBytes} bytes`);
});
