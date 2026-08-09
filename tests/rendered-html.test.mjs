import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generatedCountryCodes } from "./generated-travel-contract.mjs";

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
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title" content="Jaxon \| AI Engineer"/);
  assert.match(html, /property="og:image" content="https:\/\/jaxonhu1024\.github\.io\/assets\/jaxon-signal-og\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/jaxonhu1024\.github\.io\/assets\/jaxon-signal-og\.png"/);
  assert.match(html, /<meta name="theme-color" content="#05070B"\/>/);
  assert.match(
    html,
    /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"\/>/,
  );
  assert.deepEqual(
    html.match(/<meta name="viewport" content="[^"]+"\/>/g),
    [
      '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>',
    ],
    "Vinext's default viewport must be followed by the documented viewport-fit compatibility override",
  );
  assert.match(html, /rel="canonical" href="https:\/\/jaxonhu1024\.github\.io\/"/);
  assert.match(html, /property="og:url" content="https:\/\/jaxonhu1024\.github\.io"/);
  assert.doesNotMatch(
    html,
    /AI ALGORITHM ENGINEER|The body achieves what the mind believes|Turning model capability|Models, tools, and decisions connected|View research/,
  );
  assert.equal((html.match(/class="site-tracing-beam"/g) ?? []).length, 1);
  assert.match(
    html,
    /<aside(?=[^>]*class="site-tracing-beam")(?=[^>]*aria-hidden="true")(?=[^>]*data-trace-progress="0\.0000")(?=[^>]*data-trace-visibility="idle")[^>]*>/,
  );
  assert.match(
    html,
    /<main(?=[^>]*class="site-canvas")(?=[^>]*id="content")(?=[^>]*tabindex="-1")[^>]*>/,
  );
  assert.doesNotMatch(html, /hero-terminal|agentctl compile|BUILD READY/);
  assert.doesNotMatch(html, /terminal-button|class="button-arrow"/);
  assert.equal((html.match(/class="paper-link"/g) ?? []).length, 2);
  assert.match(
    html,
    /<p class="hero-positioning">AI systems, made inspectable\.<\/p>/,
  );
  assert.doesNotMatch(
    html,
    /SENIOR AI ENGINEER \/\/ AI AGENTS · LLMs \/ VLMs · AUTONOMOUS DRIVING/,
  );
  assert.doesNotMatch(html, /CURRENT ROLE|PREVIOUS ROLE|experience-status/);
  assert.doesNotMatch(html, /AI ALGORITHM ENGINEER · EXPERIENCE · RESEARCH/);
  assert.match(html, /ByteDance/);
  assert.match(html, /class="experience-log"/);
  assert.doesNotMatch(html, /class="experience-log reveal"|experience-scan-(?:track|fill|cursor)/);
  assert.match(html, /<h3 id="alibaba-group-title">Alibaba<\/h3>/);
  assert.match(html, /DAMO Academy/);
  assert.match(html, /FOUNDATIONS/);
  assert.match(html, /FOUNDATIONS\.INDEX/);
  assert.equal((html.match(/class="signal-heading(?:\s|\")/g) ?? []).length, 9);
  assert.equal((html.match(/class="signal-heading__label"/g) ?? []).length, 9);
  assert.equal((html.match(/class="signal-heading__rule" aria-hidden="true"/g) ?? []).length, 9);
  assert.equal((html.match(/class="signal-heading__end" aria-hidden="true"/g) ?? []).length, 9);
  assert.doesNotMatch(
    html,
    /signal-heading--nested|section-kicker--compact|kicker-rule|label-rule|square-end/,
  );
  assert.doesNotMatch(html, /section-footer|EXPERIENCE LAYER|FOUNDATION LAYER|RESEARCH LAYER/);
  for (const id of ["hero", "about", "experience", "research", "foundations", "contact"]) {
    assert.match(
      html,
      new RegExp(`<section(?=[^>]*\\bid="${id}")(?=[^>]*\\btabindex="-1")[^>]*>`),
    );
  }
  assert.doesNotMatch(html, /class="foundations-title/);
  assert.doesNotMatch(html, /foundation-spine/);
  assert.match(html, /mailto:jaxonhu01@gmail\.com/);
  assert.match(html, /class="contact-marquee reveal"/);
  assert.match(html, /class="contact-marquee-window"/);
  assert.match(html, /class="contact-marquee-track" aria-hidden="true"/);
  assert.match(
    html,
    /For project collaborations, technical consulting, or career opportunities, feel free to reach out\./,
  );
  assert.doesNotMatch(html, /OPEN CHANNEL|SEND A|DIRECT CONTACT/);
  assert.match(html, new RegExp(`JAXON \/ (?:<!-- -->)?${new Date().getUTCFullYear()}`));
  assert.match(html, /https:\/\/github\.com\/JaxonHu1024/);
  assert.match(html, /https:\/\/x\.com\/HuEnzo33232/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/in\/jaxon-hu-10977a221/);
  assert.equal(
    (html.match(/class="endpoint-arrow" aria-hidden="true">→<\/span>/g) ?? []).length,
    4,
  );
  assert.doesNotMatch(html, /trace-out|>➤</);
  assert.doesNotMatch(html, /hujiaxingseu@163\.com/);
  assert.doesNotMatch(
    html,
    /AboutContextCompiler|about-particle|<canvas\b[^>]*class="[^"]*about-|\brole="tab(?:list|panel)?"/,
  );
  assert.doesNotMatch(
    html,
    /about-data-weave\.webp|about-weave|about-intelligence-field|about-signal-|about-fingerprint/,
  );
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
  assert.match(
    html,
    /<a(?=[^>]*\bhref="\/")(?=[^>]*\bclass="not-found-link")[^>]*><span>RETURN HOME<\/span>/,
  );
  assert.doesNotMatch(html, /terminal-button|class="button-arrow"/);
  assert.doesNotMatch(html, /EXPERIENCE\.LOG|PUBLICATION 01/);
});

test("renders an exportable 404 route with dedicated metadata", async () => {
  const response = await render("/404");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>404 - Signal Lost \| JAXON<\/title>/);
  assert.match(html, /<meta name="description" content="The requested route could not be found on JAXON\."\/>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow"\/>/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /property="og:/);
  assert.doesNotMatch(html, /name="twitter:/);
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

test("renders a distinct public-safe About system before Experience", async () => {
  const response = await render();
  const html = await response.text();
  const travelData = JSON.parse(await readFile(
    new URL("../app/data/travel.generated.json", import.meta.url),
    "utf8",
  ));
  const bidirectionalCorridors = travelData.routes
    .filter(({ bidirectional }) => bidirectional).length;
  const aboutStart = html.indexOf('id="about"');
  const experienceStart = html.indexOf('id="experience"');

  assert.ok(aboutStart >= 0 && experienceStart > aboutStart);
  assert.match(
    html,
    /href="#about"[^>]*>[\s\S]*?<span class="hero-cta-label">Explore context<\/span>/,
  );
  assert.doesNotMatch(html, /signal-button-arrow|>↘</);
  assert.match(html, /<span class="hero-cta-border" aria-hidden="true">/);
  assert.match(html, /<rect class="hero-cta-border-signal"/);
  assert.ok(html.indexOf('href="#about"') < html.indexOf('href="#experience"'));

  const about = html.slice(aboutStart, experienceStart);
  assert.match(about, /JAXON\.CONTEXT/);
  assert.match(about, /<div class="about-layout reveal">/);
  assert.match(about, /<header class="about-copy">/);
  assert.match(
    about,
    /<p class="signal-heading about-kicker">[\s\S]*?<span class="signal-heading__label">JAXON\.CONTEXT<\/span>/,
  );
  assert.match(
    about,
    /<h2(?=[^>]*\bclass="about-statement")(?=[^>]*\bid="about-title")[^>]*>/,
  );
  assert.match(about, /From model capability/);
  assert.match(about, /to system behavior\./);
  assert.match(
    about,
    /I(?:&#x27;|')m Jaxon\. I build agents and multimodal systems whose behavior can be observed, tested, and improved\./,
  );
  assert.match(
    about,
    /<section(?=[^>]*\bclass="about-working-loop")(?=[^>]*\baria-labelledby="about-loop-title")[^>]*>/,
  );
  assert.match(
    about,
    /<p class="signal-heading about-loop-kicker">[\s\S]*?<span class="signal-heading__label">WORKING\.LOOP<\/span>/,
  );
  assert.match(about, /<h3 id="about-loop-title">How I work\.<\/h3>/);
  assert.match(
    about,
    /<ol class="about-loop-list">/,
  );
  for (const [index, label, detail, outcome] of [
    ["01", "FRAME", "Define scope.", "BOUNDARY"],
    ["02", "CONNECT", "Join models and tools.", "SYSTEM"],
    ["03", "OBSERVE", "Expose state and failures.", "CLARITY"],
    ["04", "VERIFY", "Make claims reproducible.", "EVIDENCE"],
  ]) {
    assert.match(
      about,
      new RegExp(
        `<li class="about-loop-step">[\\s\\S]*?`
          + `<span class="about-loop-index">${index}<\\/span>[\\s\\S]*?`
          + `<span class="about-loop-label">${label}<\\/span>[\\s\\S]*?`
          + `<p class="about-loop-detail">${detail.replaceAll(".", "\\.")}<\\/p>[\\s\\S]*?`
          + `<strong>${outcome}<\\/strong>[\\s\\S]*?<\\/li>`,
      ),
    );
  }
  assert.equal((about.match(/class="about-loop-step"/g) ?? []).length, 4);
  assert.equal((about.match(/class="about-loop-index"/g) ?? []).length, 4);
  assert.equal((about.match(/class="about-loop-label"/g) ?? []).length, 4);
  assert.equal((about.match(/class="about-loop-detail"/g) ?? []).length, 4);
  assert.equal((about.match(/class="about-loop-outcome"/g) ?? []).length, 4);
  assert.ok(
    about.indexOf('class="about-copy"') < about.indexOf('class="about-travel"')
      && about.indexOf('class="about-travel"') < about.indexOf('class="about-working-loop"'),
    "introduction, travel footprint, and working loop should keep their reading order",
  );
  assert.doesNotMatch(about, /about-context|<dt>Focus<\/dt>|Current context/);
  assert.match(
    about,
    /<figure(?=[^>]*\bclass="about-travel")(?=[^>]*\baria-labelledby="travel-map-title")(?=[^>]*\bdata-filter-active="false")[^>]*>/,
  );
  assert.match(
    about,
    /<p class="signal-heading travel-map-kicker">[\s\S]*?<span class="signal-heading__label">FLIGHT\.FOOTPRINT<\/span>/,
  );
  assert.match(about, /<h3 id="travel-map-title">Places leave a signal\.<\/h3>/);
  assert.match(
    about,
    /Routes I(?:&#x27;|')ve flown—and the places that keep widening how I see,[\s\S]*?learn, and build\./,
  );
  assert.match(
    about,
    /<dl class="travel-map-stats" aria-label="Visited countries and regions summary">/,
  );
  assert.match(
    about,
    /<div class="travel-map-dock"><div class="travel-map-dock-status">/,
  );
  assert.match(
    about,
    new RegExp(
      `<dt>Countries \\/ regions<\\/dt><dd>${travelData.counts.countries < 10
        ? '<span class="travel-map-stat-leading-zero" aria-hidden="true">0<\\/span>(?:<!-- -->)?'
        : ""}${travelData.counts.countries}<\\/dd>`,
    ),
  );
  assert.match(
    about,
    /<p class="travel-map-filter-status" aria-live="polite" aria-atomic="true"><span>Map filter<\/span><strong>All signals<\/strong><\/p>/,
  );
  assert.match(about, /<div class="travel-map-flags-scroll">/);
  assert.doesNotMatch(about, /Flight segments|Airports reached|travel-map-distance/);
  assert.doesNotMatch(about, /Trace window|DATA LAYER/i);
  assert.match(
    about,
    /<svg(?=[^>]*\bclass="travel-map-canvas")(?=[^>]*\bdata-map-view="world")(?=[^>]*\bid="travel-map-canvas")(?=[^>]*\bviewBox="0 0 800 400")(?=[^>]*\bpreserveAspectRatio="xMidYMid meet")(?=[^>]*\brole="img")[^>]*>/,
  );
  assert.match(
    about,
    /<image(?=[^>]*\bclass="travel-map-land")(?=[^>]*\bhref="\/assets\/travel-world-solid\.svg")(?=[^>]*\bwidth="800")(?=[^>]*\bheight="400")[^>]*>/,
  );
  const renderedRouteKeys = [...about.matchAll(/data-route-key="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(renderedRouteKeys.length, travelData.counts.routes);
  assert.equal(new Set(renderedRouteKeys).size, renderedRouteKeys.length);
  assert.equal(
    (about.match(/<g(?=[^>]*\bclass="travel-map-route")(?=[^>]*\bdata-emphasis="idle")[^>]*>/g) ?? []).length,
    travelData.counts.routes,
  );
  assert.equal(
    (about.match(/data-route-direction="both"/g) ?? []).length,
    bidirectionalCorridors,
  );
  assert.match(
    about,
    new RegExp(`${travelData.counts.routes} unique flight corridors connect `
      + `${travelData.counts.airports} airports`),
  );
  assert.match(
    about,
    new RegExp(`${bidirectionalCorridors} corridors include completed flights in both directions`),
  );
  const renderedRoutePaths = [...about.matchAll(/<path class="travel-map-route-path" d="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.ok(renderedRoutePaths.length >= renderedRouteKeys.length);
  assert.equal(renderedRoutePaths.every((path) => path.includes(" L ") && !path.includes(" Q ")), true);
  assert.equal(
    (about.match(/<g(?=[^>]*\bclass="travel-map-airport")(?=[^>]*\bdata-emphasis="idle")[^>]*>/g) ?? []).length,
    travelData.counts.airports,
  );
  assert.match(
    about,
    /<ul class="travel-map-flags" aria-label="Filter flight footprint by country or region">/,
  );
  const renderedFlagCodes = [...about.matchAll(/<li[^>]*data-country-code="([^"]+)"[^>]*>/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(renderedFlagCodes, generatedCountryCodes);
  assert.equal(
    (about.match(/<li(?=[^>]*\bdata-country-code="[^"]+")(?=[^>]*\bdata-selected="false")[^>]*>/g) ?? []).length,
    travelData.counts.countries,
  );
  assert.equal(
    (about.match(/<button(?=[^>]*\bclass="travel-map-flag-button")(?=[^>]*\btype="button")(?=[^>]*\baria-controls="travel-map-canvas")(?=[^>]*\baria-pressed="false")[^>]*>/g) ?? []).length,
    travelData.counts.countries,
  );
  assert.equal(
    (about.match(/class="travel-map-flag-icon"/g) ?? []).length,
    travelData.counts.countries,
  );
  assert.equal(
    (about.match(/class="travel-map-flag-tooltip"/g) ?? []).length,
    travelData.counts.countries,
  );
  assert.doesNotMatch(about, /Approximately [\d,]+ kilometers flown/);
  assert.doesNotMatch(about, /travel-map-frame|travel-map-place-index|travel-map-caption/);
  assert.doesNotMatch(
    about,
    /\bPNR\b|Tail Number|Flight Flighty ID|Airport Flighty ID|Gate Departure|Seat Type|Cabin Class|\b20\d{2}-\d{2}-\d{2}\b/,
  );
  assert.doesNotMatch(about, /YIELDS|Current threads|Core belief/);
  assert.doesNotMatch(about, /about-experience-bridge/);
  assert.doesNotMatch(about, /section-kicker|OPERATING CONTEXT/);
  assert.doesNotMatch(html, /grid-surface/);
  assert.doesNotMatch(
    about,
    /AboutContextCompiler|about-particle|<canvas\b|\brole="tab(?:list|panel)?"|about-stage-|aria-selected=/,
  );
  assert.doesNotMatch(about, /ByteDance|Alibaba|Senior|Jaxon Hu|Hu Jiaxing|Nanyang|Southeast/i);
  assert.doesNotMatch(html, /VIEW EXPERIENCE/);
});

test("renders a terminal-free pixel portrait hero and defers organization logos", async () => {
  const response = await render();
  const html = await response.text();
  const heroStart = html.indexOf('id="hero"');
  const aboutStart = html.indexOf('id="about"');
  const hero = html.slice(heroStart, aboutStart);

  assert.match(hero, /class="hero-pixel-portrait"/);
  assert.match(hero, /class="hero-portrait-frame"/);
  assert.match(
    hero,
    /<img(?=[^>]*class="hero-portrait-fallback")(?=[^>]*src="\/assets\/jaxon-sea-portrait\.webp")(?=[^>]*width="840")(?=[^>]*height="840")(?=[^>]*fetchPriority="high")[^>]*>/,
  );
  assert.match(
    hero,
    /<canvas(?=[^>]*class="hero-pixel-canvas")(?=[^>]*aria-label="Pixelated portrait of Jaxon facing the sea at dusk")(?=[^>]*role="img")[^>]*>/,
  );
  assert.doesNotMatch(hero, /hero-terminal|agentctl|BUILD READY|<animate\b/i);
  assert.doesNotMatch(hero, /hero-signal-(?:graphic|path|node|svg)/);
  assert.doesNotMatch(html, /hero-processor-field-optimized\.webp/);

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
  assert.match(html, /Explore context/);
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

test("orders About, Experience, Foundations, and Research with distinct section rhythms", async () => {
  const response = await render();
  const html = await response.text();

  assert.ok(html.indexOf('href="#about"') < html.indexOf('href="#experience"'));
  assert.ok(html.indexOf('href="#experience"') < html.indexOf('href="#foundations"'));
  assert.ok(html.indexOf('href="#foundations"') < html.indexOf('href="#research"'));
  assert.ok(
    html.indexOf('class="section about"')
      < html.indexOf('class="section experience"'),
  );
  assert.ok(
    html.indexOf('class="section foundations"')
      < html.indexOf('class="section research"'),
  );
  assert.doesNotMatch(html, /OPERATING CONTEXT/);
  for (const id of ["experience", "foundations", "research", "contact"]) {
    assert.match(
      html,
      new RegExp(`<h2 class="signal-heading section-kicker reveal" id="${id}-title">`),
    );
  }
  assert.equal(
    (html.match(/class="signal-heading column-label"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(
    html,
    /signal-heading--nested|section-kicker--compact|kicker-rule|label-rule|square-end/,
  );
  assert.doesNotMatch(html, /section-footer|EXPERIENCE LAYER|FOUNDATION LAYER|RESEARCH LAYER/);
  for (const group of ["AI SPECIALTIES", "LANGUAGES", "PLATFORM"]) {
    assert.match(html, new RegExp(`<dt>${group.replace("/", "\\/")}<\\/dt>`));
  }
  for (const skill of ["Python", "C++", "SQL", "AI Agents", "AIGC", "LLMs", "VLMs", "Autonomous Driving", "Linux", "Docker"]) {
    assert.ok(html.includes(`<span>${skill}</span>`), `missing toolchain skill: ${skill}`);
  }
  assert.ok(html.indexOf("<dt>AI SPECIALTIES</dt>") < html.indexOf("<dt>LANGUAGES</dt>"));
  assert.ok(html.indexOf("<dt>LANGUAGES</dt>") < html.indexOf("<dt>PLATFORM</dt>"));
  assert.doesNotMatch(html, /AI FOCUS|ML FRAMEWORK|PLATFORM \/ DATA|<span>PyTorch<\/span>|<span>MySQL<\/span>/);
  assert.doesNotMatch(html, /class="toolchain-module"[^>]*data-index=/);
});

test("keeps the hero private, English-only, and decoupled from paper topics", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const heroStart = page.indexOf('<section className="section hero');
  const heroEnd = page.indexOf('<section\n          className="section about');
  assert.ok(heroStart >= 0 && heroEnd > heroStart);

  const hero = page.slice(heroStart, heroEnd);
  assert.match(hero, /JAXON/);
  assert.match(
    hero,
    /<p className="hero-positioning">AI systems, made inspectable\.<\/p>/,
  );
  assert.doesNotMatch(
    hero,
    /AI ALGORITHM ENGINEER|The body achieves what the mind believes|Turning model capability|Models, tools, and decisions connected|View research|TextType/,
  );
  assert.match(hero, /HeroPixelPortrait/);
  assert.ok(
    hero.indexOf('className="hero-name"')
      < hero.indexOf('className="hero-positioning"')
      && hero.indexOf('className="hero-positioning"')
        < hero.indexOf("<HeroPixelPortrait />")
      && hero.indexOf("<HeroPixelPortrait />")
        < hero.indexOf('className="hero-actions"'),
    "mobile source order should remain JAXON, positioning, portrait, then CTA",
  );
  assert.doesNotMatch(hero, /HeroTerminal|hero-terminal|agentctl|CLI/);
  assert.doesNotMatch(hero, /HeroSignalGraphic|hero-signal-/);
  assert.doesNotMatch(hero, /hero-processor-field-optimized\.webp/);
  assert.doesNotMatch(hero, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(hero, /Road|ResFi|Respiration/i);
  assert.doesNotMatch(page, /[\u3400-\u9fff]/);
});

test("defines semantic visual tokens and safe-area-aware dark theming", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rootRule = css.match(/:root\s*\{[^}]+\}/s)?.[0] ?? "";
  const htmlRule = css.match(/html\s*\{[^}]+\}/s)?.[0] ?? "";
  const mainRule = css.match(/main\s*\{[^}]+\}/s)?.[0] ?? "";
  const siteCanvasRule = css.match(/\.site-canvas\s*\{[^}]+\}/s)?.[0] ?? "";
  const sectionRule = css.match(/\.section\s*\{[^}]+\}/s)?.[0] ?? "";
  const feedbackRule = css.match(/\.mobile-load-feedback\s*\{[^}]+\}/s)?.[0] ?? "";

  for (const token of [
    "--background",
    "--text",
    "--mint",
    "--violet",
    "--coral",
    "--color-background",
    "--color-foreground",
    "--color-foreground-secondary",
    "--color-foreground-muted",
    "--color-foreground-weak",
    "--color-line",
    "--color-line-strong",
    "--color-line-medium",
    "--color-line-subtle",
    "--color-accent",
    "--color-accent-signal",
    "--color-sequence-verify",
    "--color-trace-terminal",
    "--color-danger",
    "--surface-header",
    "--surface-panel",
    "--surface-feedback",
    "--shadow-panel",
    "--shadow-feedback",
    "--ease-out",
    "--ease-emphasized",
    "--ease-spring",
    "--duration-instant",
    "--duration-fast",
    "--duration-normal",
    "--layout-max-width",
    "--layout-gutter",
    "--layout-inline-start",
    "--layout-inline-end",
    "--layout-center-gap",
    "--z-feedback",
    "--z-header",
    "--z-skip-link",
  ]) {
    assert.match(rootRule, new RegExp(`${token}:`), `missing semantic token ${token}`);
  }
  assert.match(htmlRule, /color-scheme:\s*dark/);
  assert.match(htmlRule, /background:\s*var\(--color-background\)/);
  assert.match(mainRule, /background-color:\s*var\(--color-background\)/);
  assert.doesNotMatch(mainRule, /background-image|background-size|linear-gradient/);
  assert.match(siteCanvasRule, /background-image:/);
  assert.ok(
    (siteCanvasRule.match(/radial-gradient\(/g) ?? []).length >= 2,
    "the home page should own one continuous multi-source ambient field",
  );
  assert.match(siteCanvasRule, /rgb\(138 114 255 \/ /);
  assert.match(siteCanvasRule, /rgb\(79 247 213 \/ /);
  assert.match(siteCanvasRule, /background-repeat:\s*no-repeat/);
  assert.doesNotMatch(siteCanvasRule, /linear-gradient|repeating-|url\(|background-attachment/);
  assert.match(sectionRule, /background:\s*transparent/);
  assert.doesNotMatch(sectionRule, /radial-gradient|--ambient-/);
  assert.doesNotMatch(css, /--ambient-/);
  assert.match(sectionRule, /scroll-margin-top:\s*calc\(var\(--nav-height\) \+ 2rem \+ env\(safe-area-inset-top\)\)/);
  assert.doesNotMatch(
    rootRule,
    /--(?:void|background-base|experience|research|foundations|about):/,
  );
  assert.match(
    rootRule,
    /--layout-inline-start:\s*max\([^;]*env\(safe-area-inset-left,\s*0px\)[^;]*\);/s,
  );
  assert.match(
    rootRule,
    /--layout-inline-end:\s*max\([^;]*env\(safe-area-inset-right,\s*0px\)[^;]*\);/s,
  );
  assert.match(
    css,
    /\.site-header\s*\{[^}]*top:\s*max\(14px,\s*env\(safe-area-inset-top\)\);[^}]*right:\s*var\(--layout-inline-end\);[^}]*left:\s*var\(--layout-inline-start\);/s,
  );
  assert.match(
    css,
    /\.skip-link\s*\{[^}]*top:\s*max\(8px,\s*env\(safe-area-inset-top\)\);[^}]*left:\s*max\(8px,\s*env\(safe-area-inset-left\)\);/s,
  );
  assert.match(
    feedbackRule,
    /top:\s*calc\(\s*var\(--nav-height\)\s*\+\s*max\(1rem,\s*env\(safe-area-inset-top\)\)\s*\+\s*\.5rem\s*\)/s,
  );
  assert.match(feedbackRule, /right:\s*max\(\.75rem,\s*env\(safe-area-inset-right\)\)/);
  assert.match(feedbackRule, /left:\s*max\(\.75rem,\s*env\(safe-area-inset-left\)\)/);

  for (const [selector, token] of [
    [".site-header", "--surface-header"],
    [".paper-link", "--color-accent"],
    [".hero-portrait-frame", "--color-background"],
    [".contact-socials a", "--color-foreground"],
    [".mobile-load-feedback", "--surface-feedback"],
  ]) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? "";
    assert.match(rule, new RegExp(`var\\(${escapedToken}\\)`));
  }
});
