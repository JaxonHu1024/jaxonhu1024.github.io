import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the JAXON portfolio and public contact paths", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>JAXON — Compiling Intelligence for the Real World<\/title>/i);
  assert.match(html, /COMPILING INTELLIGENCE/);
  assert.match(html, /FOR THE REAL WORLD_/);
  assert.match(html, /字节跳动/);
  assert.match(html, /FOUNDATIONS/);
  assert.match(html, /FOUNDATIONS\.INDEX/);
  for (const id of ["hero", "experience", "research", "foundations", "contact"]) {
    assert.match(
      html,
      new RegExp(`<section(?=[^>]*\\bid="${id}")(?=[^>]*\\btabindex="-1")[^>]*>`),
    );
  }
  assert.doesNotMatch(html, /class="foundations-title/);
  assert.doesNotMatch(html, /foundation-spine/);
  assert.match(html, /mailto:jaxonhu01@gmail\.com/);
  assert.match(html, /CONTACT ENDPOINTS/);
  assert.match(html, /https:\/\/github\.com\/JaxonHu1024/);
  assert.match(html, /https:\/\/x\.com\/HuEnzo33232/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/in\/jaxon-hu-10977a221/);
  assert.doesNotMatch(html, /hujiaxingseu@163\.com/);
  assert.match(html, /https:\/\/ieeexplore\.ieee\.org\/document\/9170807/);
  assert.match(html, /https:\/\/ieeexplore\.ieee\.org\/document\/9831898/);
  assert.match(html, /PUBLICATION\s*(?:<!-- -->)?\s*01/);
  assert.match(html, /PUBLICATION\s*(?:<!-- -->)?\s*02/);
  assert.doesNotMatch(html, /JAXON\s*\/\s*PUBLICATION/);
  assert.ok(html.indexOf("9831898") < html.indexOf("9170807"));
  assert.doesNotMatch(html, /road-network-geolocalization\.png/);
  assert.doesNotMatch(html, /胡嘉星/);
  assert.doesNotMatch(html, /JAXON\.EXE/);
});

test("keeps the hero private, English-only, and decoupled from paper topics", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const heroStart = page.indexOf('<section className="section hero');
  const heroEnd = page.indexOf('<section\n          className="section experience');
  assert.ok(heroStart >= 0 && heroEnd > heroStart);

  const hero = page.slice(heroStart, heroEnd);
  assert.match(hero, /JAXON/);
  assert.match(hero, /COMPILING INTELLIGENCE/);
  assert.match(hero, /FOR THE REAL WORLD_/);
  assert.match(hero, /hero-processor-field\.webp/);
  assert.match(hero, /HeroSignalField/);
  assert.doesNotMatch(hero, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(hero, /字节|阿里巴巴|Road|ResFi|Respiration/i);
  assert.doesNotMatch(page, /胡嘉星/);
});

test("implements ambient motion as accessible code-native layers", async () => {
  const heroMotion = await readFile(new URL("../app/components/HeroSignalField.tsx", import.meta.url), "utf8");
  const researchMotion = await readFile(new URL("../app/components/ResearchVisual.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(heroMotion, /prefers-reduced-motion: reduce/);
  assert.match(heroMotion, /IntersectionObserver/);
  assert.match(heroMotion, /data-motion-layer="hero-flow"/);
  assert.match(researchMotion, /prefers-reduced-motion: reduce/);
  assert.match(researchMotion, /data-motion-layer={`research-\$\{variant\}`}/);
  assert.match(researchMotion, /const roadRoutes/);
  assert.match(researchMotion, /pointOnRoute/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
