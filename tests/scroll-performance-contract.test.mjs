import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires the hero CTA to About through cancellable navigation without client-rendering the page", async () => {
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /className="signal-button hero-cta" href="#about"/);
  assert.match(controller, /a\.hero-cta\[href\^=['"]#['"]\]/);
  assert.match(controller, /createHashNavigation/);
  assert.match(layout, /<HeroInteractionController \/>/);
  assert.doesNotMatch(page, /^"use client";/);
});

test("keeps the Context path server-rendered and prioritizes current context", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(page, /^"use client";/);
  assert.doesNotMatch(page, /AboutContextCompiler|AboutParticleField|about-particle|<canvas\b/);
  assert.match(page, /<div className="about-layout reveal">/);
  assert.match(page, /<header className="about-copy">/);
  assert.match(page, /<section className="about-working-loop" aria-labelledby="about-loop-title">/);
  assert.match(page, /<ol className="about-loop-list">/);
  assert.match(page, /className="about-loop-step"/);
  assert.match(page, /className="about-context" aria-label="Current context"/);
  assert.equal((page.match(/label: "(?:FRAME|CONNECT|OBSERVE|VERIFY)"/g) ?? []).length, 4);
  assert.equal((page.match(/label: "(?:Current threads|Core belief)"/g) ?? []).length, 2);
  assert.ok(
    page.indexOf('<dl className="about-context"')
      < page.indexOf('<section className="about-working-loop"'),
    "current context should precede the working loop in reading order",
  );
  assert.doesNotMatch(controller, /useAboutSpotlight|data-about-spotlight/);
  assert.match(css, /\.about-loop-list::before\s*\{/);
  assert.match(css, /\.about-experience-bridge\s*\{/);
  assert.doesNotMatch(page, /about-loop-step[^\n]*tabIndex/);

  for (const component of ["AboutContextCompiler.tsx", "AboutParticleField.tsx"]) {
    await assert.rejects(
      readFile(new URL(`../app/components/${component}`, import.meta.url), "utf8"),
      { code: "ENOENT" },
    );
  }
});

test("keeps signal and experience motion compositor-friendly and cheap while offscreen", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const scrollCss = await readFile(
    new URL("../app/scroll-performance.css", import.meta.url),
    "utf8",
  );
  const signalGraphic = css.match(/\.hero-signal-graphic \{[^}]*\}/s)?.[0] ?? "";
  const traceFill = css.match(/\.experience-scan-fill \{[^}]*\}/s)?.[0] ?? "";
  const traceCursor = css.match(/\.experience-scan-cursor \{[^}]*\}/s)?.[0] ?? "";

  assert.match(signalGraphic, /pointer-events:\s*none/);
  assert.doesNotMatch(css, /hero-terminal|agentctl|@keyframes\s+hero-terminal/);
  assert.match(traceFill, /transform: scaleY\(var\(--experience-trace-progress\)\)/);
  assert.match(traceFill, /transform-origin: top/);
  assert.match(traceCursor, /transform: translate3d\(0, var\(--experience-trace-y\), 0\)/);
  assert.doesNotMatch(css, /@keyframes timeline-scan/);
  assert.match(css, /\.experience-scan-track\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(controller, /function useExperienceTrace\(\)/);
  assert.match(controller, /new ResizeObserver\(syncGeometry\)/);
  assert.match(controller, /window\.addEventListener\("scroll", scheduleTrace, \{ passive: true \}\)/);
  assert.match(controller, /requestAnimationFrame\(updateTrace\)/);
  assert.match(controller, /section\.dataset\.sectionVisible/);
  assert.match(controller, /window\.removeEventListener\("scroll", scheduleTrace\)/);
  assert.match(
    scrollCss,
    /#hero\[data-section-visible="false"\][\s\S]*?animation-play-state:\s*paused/s,
  );
  assert.match(
    scrollCss,
    /@media \(max-width: 1100px\)[\s\S]*?\.reveal\s*\{[^}]*animation:\s*none/s,
  );
  assert.doesNotMatch(css, /trace-out|outbound-packet|--packet-travel/);
});

test("renders a dependency-free signal graphic and removes the CLI implementation", async () => {
  const signal = await readFile(
    new URL("../app/components/HeroSignalGraphic.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.doesNotMatch(signal, /^"use client";/);
  assert.match(signal, /<svg/);
  assert.match(signal, /className="hero-signal-path hero-signal-path--main"/);
  assert.match(signal, /className="hero-signal-path hero-signal-path--branch"/);
  assert.match(signal, /hero-signal-node--coral/);
  assert.doesNotMatch(signal, /useEffect|requestAnimationFrame|setInterval|<animate/);
  assert.match(page, /<HeroSignalGraphic \/>/);
  assert.doesNotMatch(page, /HeroTerminal|hero-terminal|agentctl|CLI/);
  assert.match(css, /--violet:\s*#8a72ff/);
  assert.match(css, /--mint:\s*#4ff7d5/);
  assert.match(css, /--coral:\s*#ff6b57/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-signal-graphic/s);
  await assert.rejects(
    readFile(new URL("../app/components/HeroTerminal.tsx", import.meta.url), "utf8"),
    { code: "ENOENT" },
  );
});
