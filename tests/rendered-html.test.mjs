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
  assert.match(html, /<meta name="theme-color" content="#030507"\/>/);
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
  assert.match(html, /rel="canonical" href="http:\/\/localhost:3000\/"/);
  assert.match(html, /property="og:url" content="http:\/\/localhost:3000"/);
  assert.match(html, /COMPILING INTELLIGENCE/);
  assert.match(html, /FOR THE REAL WORLD_/);
  assert.doesNotMatch(html, /hero-positioning/);
  assert.doesNotMatch(
    html,
    /SENIOR AI ENGINEER \/\/ AI AGENTS · LLMs \/ VLMs · AUTONOMOUS DRIVING/,
  );
  assert.doesNotMatch(html, /CURRENT ROLE|PREVIOUS ROLE|experience-status/);
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
  assert.match(html, /class="contact-marquee reveal"/);
  assert.match(html, /class="contact-marquee-window"/);
  assert.match(html, /class="contact-marquee-track" aria-hidden="true"/);
  assert.match(
    html,
    /For project collaborations, technical consulting, or career opportunities, feel free to reach out\./,
  );
  assert.doesNotMatch(html, /OPEN CHANNEL|SEND A|DIRECT CONTACT/);
  assert.match(html, /https:\/\/github\.com\/JaxonHu1024/);
  assert.match(html, /https:\/\/x\.com\/HuEnzo33232/);
  assert.match(html, /https:\/\/www\.linkedin\.com\/in\/jaxon-hu-10977a221/);
  assert.equal(
    (html.match(/class="endpoint-arrow" aria-hidden="true">→<\/span>/g) ?? []).length,
    4,
  );
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

test("renders the completed single-command CLI fallback and defers organization logos", async () => {
  const response = await render();
  const html = await response.text();

  // The hero terminal is pure DOM/text, so the LCP element falls back to the
  // large .hero-name heading; there is no prioritized hero raster to preload.
  assert.match(html, /class="hero-terminal"/);
  assert.match(html, /class="hero-terminal-identity"/);
  assert.match(html, /class="hero-terminal-environment"/);
  assert.doesNotMatch(html, /hero-terminal-window-control/);
  assert.match(html, /agentctl compile --prod/);
  const terminalStart = html.indexOf('<div class="hero-terminal"');
  const terminalEnd = html.indexOf("</section>", terminalStart);
  const terminalMarkup = html.slice(terminalStart, terminalEnd);
  assert.doesNotMatch(terminalMarkup, /jaxon/i);
  assert.match(terminalMarkup, /class="hero-topology-map"/);
  assert.match(terminalMarkup, /class="hero-signal-lane is-active"/);
  assert.equal(
    terminalMarkup.match(/class="hero-activation-cell/g)?.length,
    50,
  );
  const activeCellCount = terminalMarkup.match(
    /class="hero-activation-cell tone-[123] is-active"/g,
  )?.length ?? 0;
  assert.ok(activeCellCount >= 20 && activeCellCount <= 30);
  for (const tone of [1, 2, 3]) {
    assert.match(
      terminalMarkup,
      new RegExp(`class="hero-activation-cell tone-${tone} is-active"`),
    );
  }
  assert.match(terminalMarkup, /class="hero-activation-cell tone-1 is-dormant"/);
  assert.match(terminalMarkup, /d="M52 46C94 46 111 118 178 126"/);
  assert.match(terminalMarkup, /d="M52 94C98 94 116 58 178 62"/);
  assert.match(terminalMarkup, /d="M52 142C104 142 122 88 178 94"/);
  assert.match(terminalMarkup, /d="M386 84V104M386 94H404"/);
  for (const [label, status] of [
    ["runtime", "online"],
    ["models", "bound"],
    ["policy", "verified"],
    ["graph", "optimized"],
    ["artifact", "shipped"],
  ]) {
    assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, new RegExp(`>${status}<`));
  }
  for (const signalLabel of ["LANG", "VISION", "CONTEXT", "LATENT FIELD", "OUT"]) {
    assert.match(terminalMarkup, new RegExp(`>\\s*${signalLabel}\\s*<`));
  }
  assert.match(html, /BUILD READY/);
  assert.doesNotMatch(html, /hero-terminal-dots|sac:\/\/build|v1\.0\.0/);
  assert.doesNotMatch(html, /fetchPriority="high"/);
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

test("orders foundations before research and groups the technical profile clearly", async () => {
  const response = await render();
  const html = await response.text();

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
  assert.doesNotMatch(html, /class="toolchain-module"[^>]*data-index=/);
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
  assert.match(hero, /HeroTerminal/);
  assert.doesNotMatch(hero, /hero-processor-field-optimized\.webp/);
  assert.doesNotMatch(hero, /HeroSignalField/);
  assert.doesNotMatch(hero, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(hero, /Road|ResFi|Respiration/i);
  assert.doesNotMatch(page, /[\u3400-\u9fff]/);
});

test("defines semantic visual tokens and safe-area-aware dark theming", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const rootRule = css.match(/:root\s*\{[^}]+\}/s)?.[0] ?? "";
  const htmlRule = css.match(/html\s*\{[^}]+\}/s)?.[0] ?? "";
  const sectionRule = css.match(/\.section\s*\{[^}]+\}/s)?.[0] ?? "";
  const feedbackRule = css.match(/\.mobile-load-feedback\s*\{[^}]+\}/s)?.[0] ?? "";

  for (const token of [
    "--color-background",
    "--color-surface",
    "--color-foreground",
    "--color-foreground-secondary",
    "--color-foreground-muted",
    "--color-foreground-weak",
    "--color-muted",
    "--color-line",
    "--color-line-strong",
    "--color-line-medium",
    "--color-line-subtle",
    "--color-accent",
    "--color-accent-signal",
    "--color-status-active",
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
    "--duration-reveal",
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
  assert.match(sectionRule, /scroll-margin-top:\s*calc\(var\(--nav-height\) \+ 2rem \+ env\(safe-area-inset-top\)\)/);
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
    [".terminal-button", "--color-accent"],
    [".hero-terminal", "--surface-panel"],
    [".section-footer-index", "--color-foreground-weak"],
    [".contact-socials a", "--color-foreground"],
    [".mobile-load-feedback", "--surface-feedback"],
  ]) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, "s"))?.[0] ?? "";
    assert.match(rule, new RegExp(`var\\(${escapedToken}\\)`));
  }
});
