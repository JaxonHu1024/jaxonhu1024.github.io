import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("wires the hero CTA into cancellable navigation without client-rendering the page", async () => {
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /className="terminal-button hero-cta" href="#experience"/);
  assert.match(controller, /a\.hero-cta\[href\^=['"]#['"]\]/);
  assert.match(controller, /createHashNavigation/);
  assert.match(layout, /<HeroInteractionController \/>/);
  assert.doesNotMatch(page, /^"use client";/);
});

test("keeps ambient motion compositor-friendly and cheap while offscreen", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const scrollCss = await readFile(
    new URL("../app/scroll-performance.css", import.meta.url),
    "utf8",
  );
  const progressFill = css.match(/\.hero-terminal-progress-fill \{[^}]*\}/s)?.[0] ?? "";
  const timelineScan = css.match(
    /@keyframes timeline-scan\s*\{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  // The terminal progress bar animates via transform (scaleX), never layout.
  assert.match(progressFill, /transform: scaleX\(var\(--progress/);
  assert.doesNotMatch(css, /\.hero-terminal-progress-fill \{[^}]*\bwidth:\s*\d/s);
  assert.doesNotMatch(
    css,
    /@keyframes hero-terminal-(?:spectrum|ready)|animation:\s*hero-terminal-(?:spectrum|ready)/,
  );
  assert.doesNotMatch(css, /\.hero-terminal-progress(?:-fill)?::after/);
  assert.match(timelineScan, /translate3d/);
  assert.doesNotMatch(timelineScan, /\b(?:top|left|width|height|margin):/);
  assert.match(css, /\.experience-scan-track\s*\{[^}]*overflow:\s*hidden/s);
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
