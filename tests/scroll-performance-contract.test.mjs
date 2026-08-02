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

  assert.match(page, /className="terminal-button hero-cta" href="#about"/);
  assert.match(controller, /a\.hero-cta\[href\^=['"]#['"]\]/);
  assert.match(controller, /createHashNavigation/);
  assert.match(layout, /<HeroInteractionController \/>/);
  assert.doesNotMatch(page, /^"use client";/);
});

test("keeps the Context Ledger server-rendered without a particle or tab runtime", async () => {
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
  assert.match(page, /<ol className="about-loop-list" data-about-spotlight="">/);
  assert.match(page, /className="about-loop-step"/);
  assert.match(page, /className="about-context" aria-label="Current context"/);
  assert.equal((page.match(/label: "(?:FRAME|CONNECT|OBSERVE|VERIFY)"/g) ?? []).length, 4);
  assert.equal((page.match(/label: "(?:CURRENT THREADS|CORE BELIEF)"/g) ?? []).length, 2);
  assert.match(controller, /function useAboutSpotlight\(\)/);
  assert.match(controller, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(controller, /\(prefers-reduced-motion: reduce\)/);
  assert.match(controller, /list\.addEventListener\("pointermove"[\s\S]*?passive: true/);
  assert.match(controller, /requestAnimationFrame\(paintSpotlight\)/);
  assert.match(css, /\.about-loop-step\[data-spotlight-active="true"\]:hover::after/);
  assert.doesNotMatch(page, /about-loop-step[^\n]*tabIndex/);

  for (const component of ["AboutContextCompiler.tsx", "AboutParticleField.tsx"]) {
    await assert.rejects(
      readFile(new URL(`../app/components/${component}`, import.meta.url), "utf8"),
      { code: "ENOENT" },
    );
  }
});

test("keeps ambient motion compositor-friendly and cheap while offscreen", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const scrollCss = await readFile(
    new URL("../app/scroll-performance.css", import.meta.url),
    "utf8",
  );
  const progressFill = css.match(/\.hero-terminal-progress-fill \{[^}]*\}/s)?.[0] ?? "";
  const traceFill = css.match(/\.experience-scan-fill \{[^}]*\}/s)?.[0] ?? "";
  const traceCursor = css.match(/\.experience-scan-cursor \{[^}]*\}/s)?.[0] ?? "";

  // The terminal progress bar animates via transform (scaleX), never layout.
  assert.match(progressFill, /transform: scaleX\(var\(--progress/);
  assert.doesNotMatch(css, /\.hero-terminal-progress-fill \{[^}]*\bwidth:\s*\d/s);
  assert.doesNotMatch(
    css,
    /@keyframes hero-terminal-(?:spectrum|ready)|animation:\s*hero-terminal-(?:spectrum|ready)/,
  );
  assert.doesNotMatch(css, /\.hero-terminal-progress(?:-fill)?::after/);
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
    /\[data-hero-visible="false"\][\s\S]*?animation-play-state:\s*paused/s,
  );
  assert.match(
    scrollCss,
    /\[data-hero-visible="false"\][\s\S]*?transition-duration:\s*0s/s,
  );
  assert.match(
    scrollCss,
    /@media \(max-width: 1100px\)[\s\S]*?\.reveal\s*\{[^}]*animation:\s*none/s,
  );
  assert.doesNotMatch(css, /trace-out|outbound-packet|--packet-travel/);
});

test("drives one stable CLI sequence without per-frame progress work", async () => {
  const terminal = await readFile(
    new URL("../app/components/HeroTerminal.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const lineRule = css.match(/\.hero-terminal\[data-motion="running"\] \.hero-terminal-line \{[^}]*\}/s)?.[0] ?? "";
  const progressFill = css.match(/\.hero-terminal-progress-fill \{[^}]*\}/s)?.[0] ?? "";
  const progressAnimation = css.match(
    /@keyframes hero-terminal-progress\s*\{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  assert.match(terminal, /visibleStepCount/);
  assert.doesNotMatch(terminal, /requestAnimationFrame|cancelAnimationFrame|percentRef/);
  assert.match(lineRule, /visibility:\s*hidden/);
  assert.match(
    css,
    /\.hero-terminal-line\.is-visible\s*\{[^}]*visibility:\s*visible/s,
  );
  assert.match(
    progressFill,
    /linear-gradient\([^}]*var\(--color-accent\)[^}]*var\(--color-accent-signal\)[^}]*var\(--color-status-active\)[^}]*var\(--color-accent\)[^}]*\)/s,
  );
  assert.match(css, /--violet:\s*#8a72ff/);
  assert.match(progressAnimation, /from\s*\{[^}]*scaleX\(0\)/s);
  assert.match(progressAnimation, /to\s*\{[^}]*scaleX\(1\)/s);
  assert.doesNotMatch(progressAnimation, /\b(?:20|40|60|80)%/);
  assert.match(css, /@keyframes hero-terminal-reset\s*\{[\s\S]*?scaleX\(0\)/s);
  assert.match(css, /\.hero-activation-cell\.tone-2\.is-active\s*\{[^}]*var\(--color-accent-signal\)/s);
  assert.match(css, /\.hero-activation-cell\.tone-3\.is-active\s*\{[^}]*var\(--color-status-active\)/s);
  assert.match(css, /\.hero-activation-cell\.is-dormant\s*\{[^}]*opacity:\s*\.09/s);
  assert.match(css, /@keyframes hero-activation-breathe\s*\{[\s\S]*?scale\(\.74\)[\s\S]*?scale\(1\.14\)/s);
  assert.match(css, /\.hero-terminal\[data-motion="running"\] \.hero-activation-cell\.is-active\s*\{[^}]*animation:\s*hero-activation-breathe/s);
  assert.match(terminal, /FIELD_CELL_COUNT\s*=\s*50/);
  assert.match(terminal, /createActivationField/);
  assert.match(terminal, /setActivationField/);
  assert.match(terminal, /Math\.random\(\)/);
  assert.doesNotMatch(terminal, /setInterval/);
  assert.match(css, /\.hero-topology-signal\.is-current\s*\{[^}]*animation:\s*hero-topology-signal/s);
  assert.doesNotMatch(
    css,
    /\.hero-terminal-line[^,{]*:nth-child\([^)]+\)[^{]*\{[^}]*display:\s*none/s,
  );
});
