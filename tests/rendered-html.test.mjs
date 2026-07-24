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
  assert.match(html, /<title>Jaxon \| AI Engineer<\/title>/);
  assert.match(
    html,
    /AI Engineer specializing in AI agents, AIGC, VLMs, LLMs, and autonomous driving\./,
  );
  assert.match(html, /property="og:title" content="Jaxon \| AI Engineer"/);
  assert.match(html, /name="twitter:title" content="Jaxon \| AI Engineer"/);
  assert.match(html, /property="og:image:alt" content="Jaxon \| AI Engineer"/);
  assert.match(html, /rel="canonical" href="http:\/\/localhost:3000\/"/);
  assert.match(html, /property="og:url" content="http:\/\/localhost:3000"/);
  assert.match(html, /COMPILING INTELLIGENCE/);
  assert.match(html, /FOR THE REAL WORLD_/);
  assert.doesNotMatch(html, /AI ALGORITHM ENGINEER · EXPERIENCE · RESEARCH/);
  assert.match(html, /ByteDance/);
  assert.match(html, /<h3 id="alibaba-group-title">Alibaba<\/h3>/);
  assert.match(html, /DAMO Academy/);
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
  assert.doesNotMatch(html, /trace-out|>➤</);
  assert.doesNotMatch(html, /hujiaxingseu@163\.com/);
  assert.match(html, /https:\/\/ieeexplore\.ieee\.org\/document\/9170807/);
  assert.match(html, /https:\/\/ieeexplore\.ieee\.org\/document\/9831898/);
  assert.match(html, /PUBLICATION\s*(?:<!-- -->)?\s*01/);
  assert.match(html, /PUBLICATION\s*(?:<!-- -->)?\s*02/);
  assert.doesNotMatch(html, /\bDOI\s+10\./i);
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

test("renders every organization logo with its measured intrinsic dimensions", async () => {
  const response = await render();
  const html = await response.text();

  for (const { src, width, height } of [
    { src: "logo-bytedance-color.svg", width: 16, height: 16 },
    { src: "logo-alibaba-color.svg", width: 16, height: 16 },
    { src: "logo-ntu.svg", width: 117, height: 150 },
    { src: "logo-seu-color.svg", width: 189, height: 189 },
  ]) {
    assert.match(
      html,
      new RegExp(
        `<img(?=[^>]*\\bsrc="/assets/${src.replaceAll(".", "\\.")}")`
          + `(?=[^>]*\\bwidth="${width}")(?=[^>]*\\bheight="${height}")[^>]*>`,
      ),
    );
  }
});

test("prioritizes the hero image and defers below-the-fold organization logos", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /<img(?=[^>]*\bsrc="\/assets\/hero-processor-field-optimized\.webp")(?=[^>]*\bfetchPriority="high")[^>]*>/,
  );
  for (const src of [
    "logo-bytedance-color.svg",
    "logo-alibaba-color.svg",
    "logo-ntu.svg",
    "logo-seu-color.svg",
  ]) {
    assert.match(
      html,
      new RegExp(
        `<img(?=[^>]*\\bsrc="/assets/${src.replaceAll(".", "\\.")}")`
          + "(?=[^>]*\\bloading=\"lazy\")[^>]*>",
      ),
    );
  }
  assert.doesNotMatch(html, /<link rel="preload" href="\/assets\/logo-/);
});

test("renders all public portfolio copy in English", async () => {
  const response = await render();
  const html = await response.text();
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(html, /<html lang="en">/);
  assert.match(html, /VIEW EXPERIENCE/);
  assert.match(html, /<h3>ByteDance<\/h3>/);
  assert.match(html, /<p>Senior AI Engineer<\/p>/);
  assert.match(
    html,
    /class="experience-brand-logo experience-brand-logo--bytedance" src="\/assets\/logo-bytedance-color\.svg" alt="" width="16" height="16" loading="lazy" aria-hidden="true"/,
  );
  assert.match(html, /<p>Machine Learning Engineer<\/p>/);
  assert.match(
    html,
    /class="experience-brand-logo experience-brand-logo--alibaba" src="\/assets\/logo-alibaba-color\.svg" alt="" width="16" height="16" loading="lazy" aria-hidden="true"/,
  );
  assert.doesNotMatch(page, /<p>AI Algorithm Engineer<\/p>/);
  assert.doesNotMatch(html, /experience-status|>CURRENT</);
  assert.match(html, /<h3>Nanyang Technological University<\/h3>/);
  assert.match(html, /<p>MSc in Computer Control and Automation<\/p>/);
  assert.match(html, /<h3>Southeast University<\/h3>/);
  assert.match(html, /<p>BEng in Electrical Engineering and Automation<\/p>/);
  assert.doesNotMatch(
    html,
    /2025\.02–PRESENT|2023\.07–2025\.01|2022\.06–2023\.06|2020\.12–2022\.03|2016\.09–2020\.06/,
  );
  assert.doesNotMatch(page, /experience-date|dateTime:\s*"202[235]-|dateTime="(?:2020|2016)-/);
  assert.match(
    html,
    /For project collaborations, technical consulting, or career opportunities, feel free to reach out\./,
  );
  assert.doesNotMatch(html, /For research discussion or technical collaboration/);
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
    /<div class="experience-group-heading"><div class="experience-entry-copy"><h3 id="alibaba-group-title">Alibaba<\/h3><p>Machine Learning Engineer<\/p><\/div><img class="experience-brand-logo experience-brand-logo--alibaba" src="\/assets\/logo-alibaba-color\.svg" alt="" width="16" height="16" loading="lazy" aria-hidden="true"\/><\/div>/,
  );
  assert.match(
    html,
    /<article class="experience-subentry"><div class="experience-subentry-copy"><h4>International Digital Commerce Group<\/h4>/,
  );
  assert.match(
    html,
    /<article class="experience-subentry"><div class="experience-subentry-copy"><h4>DAMO Academy<\/h4>/,
  );
  assert.ok(
    html.indexOf("International Digital Commerce Group")
      < html.indexOf("DAMO Academy"),
  );
  assert.doesNotMatch(html, />Damo Academy</);
  assert.doesNotMatch(html, /Alibaba International Digital Commerce Group/);
  assert.doesNotMatch(html, /ORGANIZATION GROUP|02 UNITS|UNIT 0[12]/);
  assert.doesNotMatch(html, /PROCESS ACTIVE/);
  assert.doesNotMatch(
    html,
    /<div class="experience-subentry-copy"><h4>[^<]+<\/h4><p>/,
  );
});

test("uses one experience type scale and contrast—not opacity—for historical roles", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sharedCompanyRule = css.match(
    /\.experience-copy h3,\s*\.experience-group-heading h3\s*\{[^}]+\}/s,
  )?.[0] ?? "";
  const historicalCompanyRule = [
    ...css.matchAll(/\.experience-group-heading h3\s*\{[^}]+\}/gs),
  ].map(([rule]) => rule).find((rule) => rule.includes("rgba(233,255,249,.82)")) ?? "";

  assert.match(sharedCompanyRule, /font-size:\s*clamp\(30px,\s*2\.6vw,\s*42px\)/);
  assert.match(sharedCompanyRule, /line-height:\s*1\.08/);
  assert.match(historicalCompanyRule, /color:\s*rgba\(233,255,249,\.82\)/);
  assert.doesNotMatch(css, /\.experience-date|\.education-item time/);
  assert.doesNotMatch(css, /\.experience-group\s*\{[^}]*opacity:/s);
});

test("styles company logos with the same responsive treatment as education crests", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const logoRule = css.match(/\.experience-brand-logo\s*\{[^}]+\}/s)?.[0] ?? "";

  assert.match(logoRule, /grid-column:\s*5/);
  assert.match(logoRule, /grid-row:\s*1/);
  assert.match(logoRule, /width:\s*var\(--experience-logo-size\)/);
  assert.match(logoRule, /height:\s*var\(--experience-logo-size\)/);
  assert.match(logoRule, /opacity:\s*\.5/);
  assert.match(logoRule, /filter:\s*saturate\(\.85\)\s*drop-shadow/);
  assert.match(css, /\.experience-brand-logo--alibaba\s*\{\s*transform:\s*scale\(1\.12\);\s*\}/);
  assert.match(
    css,
    /\.experience-log\s*\{[^}]*--experience-logo-size:\s*96px;[^}]*--experience-logo-gap:\s*clamp\(18px,\s*1\.8vw,\s*28px\);/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*?\.experience-log\s*\{[^}]*--experience-logo-size:\s*48px;[^}]*--experience-logo-gap:\s*8px;/,
  );
  assert.match(
    css,
    /@media \(min-width:\s*1101px\)[\s\S]*?\.experience-row,\s*\.experience-group-header\s*\{[^}]*minmax\(0,\s*1fr\)\s*var\(--experience-logo-gap\)\s*var\(--experience-logo-size\);[^}]*\}[\s\S]*?\.experience-brand-logo\s*\{\s*grid-column:\s*6;\s*\}/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)[\s\S]*?\.experience-copy p\s*\{[^}]*font-size:\s*13px;[^}]*letter-spacing:\s*\.01em;[^}]*\}[\s\S]*?\.experience-group-heading p\s*\{[^}]*font-size:\s*13px;[^}]*letter-spacing:\s*\.01em;/,
  );
});

test("aligns each experience marker, company title, and logo on one title row", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const experienceGrid = css.match(/\.experience-row\s*\{[^}]+\}/s)?.[0] ?? "";
  const timelineCell = css.match(/\.timeline-cell\s*\{[^}]+\}/s)?.[0] ?? "";
  const groupBranch = css.match(/\.experience-group-branch\s*\{[^}]+\}/s)?.[0] ?? "";
  const entryCopy = css.match(/\.experience-entry-copy\s*\{[^}]+\}/s)?.[0] ?? "";

  assert.match(experienceGrid, /grid-template-rows:\s*auto/);
  assert.match(experienceGrid, /align-content:\s*center/);
  assert.match(experienceGrid, /min-height:\s*160px/);
  assert.match(
    css,
    /\.experience-copy,\s*\.experience-entry-heading,\s*\.experience-group-heading\s*\{\s*display:\s*contents;\s*\}/s,
  );
  assert.match(entryCopy, /grid-column:\s*3/);
  assert.match(entryCopy, /grid-row:\s*1/);
  assert.match(entryCopy, /align-self:\s*center/);
  assert.match(timelineCell, /grid-column:\s*1/);
  assert.match(timelineCell, /grid-row:\s*1/);
  assert.match(groupBranch, /grid-column:\s*1 \/ 3/);
  assert.match(groupBranch, /grid-row:\s*1/);
  assert.match(
    css,
    /\.experience-copy p,\s*\.experience-group-heading p\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100% \+ var\(--experience-role-gap\)\);/s,
  );
  assert.match(css, /\.experience-group-header\s*\{[^}]*min-height:\s*160px;/s);
  assert.match(
    css,
    /@media \(max-width:\s*760px\)[\s\S]*?\.experience-row,\s*\.experience-row\.is-current\s*\{\s*min-height:\s*128px;[^}]*\}[\s\S]*?\.experience-group-header\s*\{\s*min-height:\s*128px;/s,
  );
  assert.doesNotMatch(css, /\.timeline-cell\s*\{[^}]*grid-row:\s*1 \/ 3;/s);
});

test("uses one symmetric page-boundary rhythm at each responsive scale", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    css,
    /:root\s*\{[^}]*--section-block-space:\s*clamp\(104px,\s*7vw,\s*112px\);[^}]*--section-content-gap:\s*clamp\(48px,\s*4vw,\s*64px\);[^}]*--section-footer-gap:\s*clamp\(44px,\s*4vw,\s*64px\);/s,
  );
  assert.match(css, /\.hero-copy\s*\{[^}]*bottom:\s*var\(--section-block-space\);/s);
  assert.match(css, /\.experience\s*\{[^}]*min-height:\s*auto;[^}]*padding:\s*var\(--section-block-space\)\s+4\.7vw;/s);
  assert.match(css, /\.foundations\s*\{[^}]*min-height:\s*auto;[^}]*padding:\s*var\(--section-block-space\)\s+4\.7vw;/s);
  assert.match(css, /\.research\s*\{[^}]*min-height:\s*auto;[^}]*padding:\s*var\(--section-block-space\)\s+2\.8vw;/s);
  assert.match(css, /\.contact\s*\{[^}]*padding:\s*var\(--section-block-space\)\s+4\.7vw;/s);
  assert.match(css, /\.section-footer\s*\{[^}]*margin:\s*var\(--section-footer-gap\)\s+auto\s+0;/s);
  assert.match(
    css,
    /@media \(max-width:\s*900px\)\s*\{\s*:root\s*\{[^}]*--section-block-space:\s*88px;[^}]*--section-content-gap:\s*44px;[^}]*--section-footer-gap:\s*44px;/s,
  );
  assert.match(
    css,
    /@supports \(animation-timeline:\s*view\(\)\)[\s\S]*?\.section-kicker\.reveal,\s*\.section-footer\.reveal\s*\{[^}]*animation:\s*none;[^}]*transform:\s*none;/s,
  );
  assert.doesNotMatch(css, /\.experience > \.section-footer[\s\S]*?margin-top:\s*auto/);
});

test("keeps the experience scan cursor inside the timeline guide", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const timelineScanStart = css.indexOf("@keyframes timeline-scan");
  const timelineScanEnd = css.indexOf("@keyframes active-node-pulse", timelineScanStart);
  const timelineScan = css.slice(timelineScanStart, timelineScanEnd);

  assert.match(
    css,
    /\.experience-log\s*\{[^}]*--experience-guide-start:\s*36px;[^}]*--experience-guide-end:\s*22px;[^}]*--experience-scan-height:\s*42px;/s,
  );
  assert.match(
    css,
    /\.experience-log::before\s*\{[^}]*top:\s*var\(--experience-guide-start\);[^}]*bottom:\s*var\(--experience-guide-end\);/s,
  );
  assert.match(
    css,
    /\.experience-log::after\s*\{[^}]*top:\s*var\(--experience-guide-start\);[^}]*height:\s*var\(--experience-scan-height\);/s,
  );
  assert.match(
    timelineScan,
    /0%\s*\{\s*top:\s*var\(--experience-guide-start\);/,
  );
  assert.match(
    timelineScan,
    /100%\s*\{\s*top:\s*calc\(100% - var\(--experience-guide-end\) - var\(--experience-scan-height\)\);/,
  );
  assert.match(
    css,
    /@media \(max-width:\s*900px\)[\s\S]*?\.experience-log\s*\{[^}]*--experience-guide-start:\s*42px;[^}]*--experience-guide-end:\s*45px;/,
  );
  assert.doesNotMatch(css, /translateY\(calc\(100% \+ \d+px\)\)/);
});

test("orders foundations before research and groups the technical profile clearly", async () => {
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
  for (const group of ["AI SPECIALTIES", "LANGUAGES", "PLATFORM"]) {
    assert.match(html, new RegExp(`<dt>${group.replace("/", "\\/")}<\\/dt>`));
  }
  for (const skill of ["Python", "C++", "SQL", "AI Agents", "AIGC", "LLMs", "VLMs", "Autonomous Driving", "Linux", "Docker"]) {
    assert.ok(html.includes(`<span>${skill}</span>`), `missing toolchain skill: ${skill}`);
  }
  assert.ok(html.indexOf("<dt>AI SPECIALTIES</dt>") < html.indexOf("<dt>LANGUAGES</dt>"));
  assert.ok(html.indexOf("<dt>LANGUAGES</dt>") < html.indexOf("<dt>PLATFORM</dt>"));
  assert.doesNotMatch(html, /AI FOCUS|ML FRAMEWORK|PLATFORM \/ DATA|<span>PyTorch<\/span>|<span>MySQL<\/span>/);
  assert.match(css, /@media \(min-width: 1101px\)[\s\S]*?\.toolchain-list \{ margin-top: 58px; \}/);
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
  assert.doesNotMatch(hero, /AI ALGORITHM ENGINEER · EXPERIENCE · RESEARCH|hero-role/);
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
  assert.match(css, /\.education-node \{\s*position: relative;\s*grid-column: 1;\s*grid-row: 1;\s*align-self: center;/);
  assert.match(css, /\.education-crest \{\s*position: static;\s*grid-column: 2;\s*grid-row: 1;/);
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
  assert.match(css, /\.nav-scroll a\.is-active::before \{[^}]*display: block;/s);
  assert.doesNotMatch(css, /transition:\s*max-height|max-height:\s*320px/);
  assert.match(css, /\.experience-copy h3,\s*\.experience-group-heading h3 \{/s);
  assert.match(css, /\.paper-copy h3 \{/);
  assert.match(css, /\.paper-copy h3 span \{ display: block; \}/);
  assert.doesNotMatch(css, /\.experience-copy h2|\.paper-copy h2/);
  assert.match(css, /@media \(min-width: 761px\) and \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test("scales the desktop hero against both viewport axes", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /font-size: clamp\(104px, min\(15vw, 24dvh\), 246px\)/);
  assert.match(css, /font-size: clamp\(23px, min\(2\.25vw, 3\.6dvh\), 37px\)/);
  assert.match(css, /width: min\(56vw, 89\.6dvh, 900px\)/);
  assert.match(css, /\.hero-cta \{[^}]*width: clamp\(280px, min\(22\.22vw, 35\.56dvh\), 320px\)/s);
});

test("keeps focusable sections out of hidden scroll containers", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const sectionRule = css.match(/\.section \{[^}]+\}/)?.[0] ?? "";

  assert.match(sectionRule, /overflow:\s*clip;/);
  assert.doesNotMatch(sectionRule, /overflow:\s*hidden;/);
});
