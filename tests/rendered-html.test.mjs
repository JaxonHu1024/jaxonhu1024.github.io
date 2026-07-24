import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(pathname, "http://localhost/"), {
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
  assert.match(
    html,
    /Portfolio of Jaxon, an AI Algorithm Engineer, featuring selected experience, education, and research publications\./,
  );
  assert.match(html, /rel="canonical" href="http:\/\/localhost:3000\/"/);
  assert.match(html, /property="og:url" content="http:\/\/localhost:3000"/);
  assert.match(html, /COMPILING INTELLIGENCE/);
  assert.match(html, /FOR THE REAL WORLD_/);
  assert.match(html, /AI ALGORITHM ENGINEER · EXPERIENCE · RESEARCH/);
  assert.match(html, /ByteDance/);
  assert.match(html, /<h3 id="alibaba-group-title">Alibaba<\/h3>/);
  assert.match(html, /Damo Academy/);
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
  assert.match(html, /DIRECT CONTACT/);
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
  assert.doesNotMatch(html, /Jaxon Hu|Hu Jiaxing/i);
  assert.doesNotMatch(html, /JAXON\.EXE/);
});

test("renders a branded not-found route instead of the homepage", async () => {
  const response = await render("/missing-route");
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<meta content="noindex" name="robots"\/>/);
  assert.match(html, /404 \/ SIGNAL LOST/);
  assert.match(html, /ROUTE NOT FOUND_/);
  assert.match(html, /The requested coordinate is outside this system\./);
  assert.match(html, /href="\/"[^>]*><span>RETURN HOME<\/span>/);
  assert.doesNotMatch(html, /EXPERIENCE\.LOG|PUBLICATION 01/);
});

test("renders an exportable 404 route with dedicated metadata", async () => {
  const response = await render("/404");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>404 — Signal Lost \| JAXON<\/title>/);
  assert.match(html, /<meta name="description" content="The requested route could not be found on JAXON\."\/>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.match(html, /ROUTE NOT FOUND_/);
});

test("research titles expose complete readable names", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /<h3 aria-label="ResFi: WiFi-Enabled Device-Free Respiration Detection Based on Deep Learning">/,
  );
  assert.match(
    html,
    /<h3 aria-label="Road-Network-Based Fast Geolocalization">/,
  );
});

test("renders all public portfolio copy in English", async () => {
  const response = await render();
  const html = await response.text();
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /VIEW EXPERIENCE/);
  assert.match(html, /2025\.02–PRESENT/);
  assert.doesNotMatch(html, /2025\.02–NOW/);
  assert.match(html, /<h3>ByteDance<\/h3>/);
  assert.match(html, /<p>AI Algorithm Engineer<\/p>/);
  assert.equal(page.match(/<p>AI Algorithm Engineer<\/p>/g)?.length, 2);
  assert.match(html, /<h3>Nanyang Technological University<\/h3>/);
  assert.match(html, /<p>MSc in Computer Control and Automation<\/p>/);
  assert.match(html, /<h3>Southeast University<\/h3>/);
  assert.match(html, /<p>BEng in Electrical Engineering and Automation<\/p>/);
  assert.doesNotMatch(html, /[\u3400-\u9fff]/);
});

test("groups both Alibaba organizations under one company heading", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /<section class="experience-group" aria-labelledby="alibaba-group-title">/,
  );
  assert.match(html, /<h3 id="alibaba-group-title">Alibaba<\/h3>/);
  assert.match(
    html,
    /<div class="experience-group-heading"><h3 id="alibaba-group-title">Alibaba<\/h3><p>AI Algorithm Engineer<\/p><\/div>/,
  );
  assert.match(
    html,
    /<article class="experience-subentry"><div class="experience-subentry-copy"><h4>International Digital Commerce Group<\/h4>/,
  );
  assert.match(
    html,
    /<article class="experience-subentry"><div class="experience-subentry-copy"><h4>Damo Academy<\/h4>/,
  );
  assert.ok(
    html.indexOf("International Digital Commerce Group")
      < html.indexOf("Damo Academy"),
  );
  assert.doesNotMatch(html, /Alibaba International Digital Commerce Group/);
  assert.doesNotMatch(html, /ORGANIZATION GROUP|02 UNITS|UNIT 0[12]/);
  assert.doesNotMatch(html, /PROCESS ACTIVE/);
  assert.doesNotMatch(
    html,
    /<div class="experience-subentry-copy"><h4>[^<]+<\/h4><p>AI Algorithm Engineer<\/p>/,
  );
});

test("orders foundations before research and omits toolchain number labels", async () => {
  const response = await render();
  const html = await response.text();
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.ok(html.indexOf('href="#foundations"') < html.indexOf('href="#research"'));
  assert.ok(
    html.indexOf('class="section foundations grid-surface"')
      < html.indexOf('class="section research grid-surface"'),
  );
  assert.match(html, /<b>02<\/b>\s*(?:<!-- -->)?\s*\/\/ FOUNDATION LAYER/);
  assert.match(html, /<b>03<\/b>\s*(?:<!-- -->)?\s*\/\/ RESEARCH LAYER/);
  assert.doesNotMatch(html, /class="toolchain-module"[^>]*data-index=/);
  assert.doesNotMatch(css, /content:\s*attr\(data-index\)/);
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
  assert.match(hero, /AI ALGORITHM ENGINEER · EXPERIENCE · RESEARCH/);
  assert.match(hero, /hero-processor-field-optimized\.webp/);
  assert.match(hero, /HeroSignalField/);
  assert.doesNotMatch(hero, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(hero, /Road|ResFi|Respiration/i);
  assert.doesNotMatch(page, /[\u3400-\u9fff]/);
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

test("keeps mobile visual anchors and menu motion layout-safe", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.hero-media \{ right: [^;]+; bottom: 126px; width: min\([^)]+\);/);
  assert.match(css, /\.education-item \{\s*position: relative;\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) 96px;/);
  assert.match(css, /\.education-crest \{\s*position: static;\s*grid-column: 2;\s*grid-row: 1 \/ span 3;/);
  assert.match(css, /\.education-item \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) 48px;/);
  assert.match(css, /\.education-crest \{\s*position: static;\s*grid-column: 2;\s*grid-row: 1;/);
  assert.match(css, /clip-path: inset\(0 0 100% 0\)/);
  assert.match(css, /max-height: calc\(100dvh - 82px\)/);
  assert.match(css, /visibility 0s linear \.54s/);
  assert.match(css, /--menu-open-delay: 0ms;/);
  assert.match(css, /--menu-close-delay: 150ms;/);
  assert.match(css, /opacity \.22s ease var\(--menu-close-delay\)/);
  assert.match(css, /opacity \.34s ease var\(--menu-open-delay\)/);
  assert.match(css, /\.site-header\.is-menu-open \.nav-scroll a \{/);
  assert.doesNotMatch(css, /transition:\s*max-height|max-height:\s*320px/);
  assert.match(css, /\.experience-copy h3 \{/);
  assert.match(css, /\.paper-copy h3 \{/);
  assert.match(css, /\.paper-copy h3 span \{ display: block; \}/);
  assert.doesNotMatch(css, /\.experience-copy h2|\.paper-copy h2/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test("keeps focusable sections out of hidden scroll containers", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sectionRule = css.match(/\.section \{[^}]+\}/)?.[0] ?? "";

  assert.match(sectionRule, /overflow:\s*clip;/);
  assert.doesNotMatch(sectionRule, /overflow:\s*hidden;/);
});
