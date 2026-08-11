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
    /npx playwright install --with-deps --only-shell chromium webkit/,
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

test("Pages CI verifies pull requests but deploys only main pushes", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );
  const mainPushCondition = "github.event_name == 'push' && github.ref == 'refs/heads/main'";

  assert.match(workflow, /\n  pull_request:\s*\n/);
  assert.match(
    workflow,
    new RegExp(`\\n  deploy:\\n    if: ${mainPushCondition.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),
    "the deploy job must be impossible to enter from pull_request or workflow_dispatch",
  );

  for (const stepName of ["Configure Pages", "Upload Pages artifact"]) {
    assert.match(
      workflow,
      new RegExp(`- name: ${stepName}\\n        if: ${mainPushCondition.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),
      `${stepName} should run only for a deployable main push`,
    );
  }

  const [verificationWorkflow, deployJob] = workflow.split("\n  deploy:");
  assert.doesNotMatch(verificationWorkflow, /(?:pages|id-token):\s*write/);
  assert.match(
    verificationWorkflow,
    /build:\n    permissions:\n      contents: read\n      pages: read/,
    "configure-pages needs read-only access to the Pages site metadata",
  );
  assert.match(deployJob, /permissions:\n      actions: read\n      pages: write\n      id-token: write/);
  assert.match(workflow, /group:\s*\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*true/);
});

test("Pages CI pins every official action to the reviewed full commit SHA", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
    "utf8",
  );
  const expectedActions = new Map([
    ["actions/checkout", "d23441a48e516b6c34aea4fa41551a30e30af803"],
    ["actions/setup-node", "249970729cb0ef3589644e2896645e5dc5ba9c38"],
    ["actions/configure-pages", "45bfe0192ca1faeb007ade9deae92b16b8254a0d"],
    ["actions/upload-pages-artifact", "fc324d3547104276b827a68afc52ff2a11cc49c9"],
    ["actions/deploy-pages", "cd2ce8fcbc39b97be8ca5fce6e763baed58fa128"],
  ]);
  const actionReferences = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);

  assert.equal(actionReferences.length, expectedActions.size);
  for (const [action, sha] of expectedActions) {
    assert.ok(
      actionReferences.includes(`${action}@${sha}`),
      `${action} must be pinned to the reviewed ${sha} commit`,
    );
  }
  for (const reference of actionReferences) {
    assert.match(reference, /^actions\/[a-z-]+@[0-9a-f]{40}$/);
  }
});

test("local and CI runtimes share the Node 22 version contract", async () => {
  const [nodeVersion, packageJson, workflow] = await Promise.all([
    readFile(new URL("../.node-version", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
  ]);

  assert.equal(nodeVersion.trim(), "22");
  assert.match(packageJson.engines.node, /^>=22\./);
  assert.match(workflow, /node-version-file:\s*\.node-version/);
  assert.doesNotMatch(workflow, /node-version:\s*\d/);
});

test("release viewport aggregation attempts every route at every viewport", async () => {
  const { releaseViewports, runReleaseViewportMatrix } = await import(
    "./browser-release-harness.mjs"
  );
  const attempted = [];
  const reported = [];
  const checks = ["homepage", "404"].map((name) => ({
    name,
    async run(viewport) {
      attempted.push(`${name} ${viewport.width}x${viewport.height}`);
      throw new Error(`${name} synthetic failure`);
    },
  }));

  await assert.rejects(
    runReleaseViewportMatrix(checks, {
      reportFailure(label) {
        reported.push(label);
      },
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, 16);
      assert.match(error.message, /16 release viewport checks failed/);
      return true;
    },
  );
  assert.equal(releaseViewports.length, 8);
  assert.equal(attempted.length, 16);
  assert.deepEqual(reported, attempted);
  assert.equal(new Set(attempted).size, 16);
});
