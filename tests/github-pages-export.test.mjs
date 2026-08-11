import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";

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

test("exports a complete static GitHub Pages artifact", async () => {
  for (const file of [
    "index.html",
    "404.html",
    "apple-touch-icon.png",
    "favicon.svg",
    "robots.txt",
    "sitemap.xml",
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
