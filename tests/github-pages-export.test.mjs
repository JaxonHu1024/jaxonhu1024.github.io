import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

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

test("exports a complete static GitHub Pages artifact", async () => {
  for (const file of ["index.html", "404.html", "favicon.svg", "og.png"]) {
    assert.equal(await exists(resolve(output, file)), true, `${file} should exist`);
  }

  const html = await readFile(resolve(output, "index.html"), "utf8");
  const notFoundHtml = await readFile(resolve(output, "404.html"), "utf8");
  assert.match(html, /<title>JAXON — Compiling Intelligence for the Real World<\/title>/i);
  assert.match(html, /Road-Network-Based/);
  assert.match(html, /ResFi:/);
  assert.ok(html.indexOf("9831898") < html.indexOf("9170807"));
  assert.doesNotMatch(html, /road-network-geolocalization\.png|codex-clipboard/i);
  assert.notEqual(notFoundHtml, html);
  assert.match(notFoundHtml, /<title>404 — Signal Lost \| JAXON<\/title>/);
  assert.match(notFoundHtml, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.match(notFoundHtml, /404 \/ SIGNAL LOST/);
  assert.match(notFoundHtml, /ROUTE NOT FOUND_/);
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
