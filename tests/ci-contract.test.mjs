import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
