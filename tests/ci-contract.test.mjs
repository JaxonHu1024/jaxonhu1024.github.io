import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the authoritative release gate rejects TypeScript errors", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    packageJson.scripts.typecheck,
    "tsc --noEmit --incremental false",
    "typecheck should expose the repository-wide TypeScript contract",
  );
  assert.match(
    packageJson.scripts.verify,
    /(?:^|&&\s*)npm run typecheck(?:\s*&&|$)/,
    "npm run verify should fail when the TypeScript contract fails",
  );
});

test("SVG optimization remains reproducible", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(packageJson.scripts["optimize:svg"], /^svgo --multipass /);
  for (const file of [
    "logo-ntu.svg",
    "logo-seu-color.svg",
    "logo-alibaba-color.svg",
    "logo-bytedance-color.svg",
  ]) {
    assert.match(packageJson.scripts["optimize:svg"], new RegExp(`public/assets/${file}`));
  }
});

test("browser release checks stay split by responsibility", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const browserScript = packageJson.scripts["test:browser"];

  assert.match(browserScript, /--test-concurrency=1/);
  for (const file of [
    "browser-resilience.test.mjs",
    "browser-interactions.test.mjs",
    "browser-release-gate.test.mjs",
  ]) {
    assert.match(browserScript, new RegExp(`tests/${file}`));
  }
});

test("Pages CI delegates once to the authoritative release gate", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );

  assert.match(
    workflow,
    /npx playwright install --with-deps --only-shell chromium/,
  );
  assert.equal(
    workflow.match(/run:\s*npm run verify/g)?.length,
    1,
    "Pages CI should invoke the release gate exactly once",
  );
  assert.doesNotMatch(
    workflow,
    /run:\s*npm run (?:build|export:github-pages|test:browser|test:export)\b/,
    "Pages CI should not duplicate work already owned by npm run verify",
  );
});
