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

test("pauses offscreen hero work and removes expensive narrow-viewport scroll effects", async () => {
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const terminal = await readFile(
    new URL("../app/components/HeroTerminal.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/scroll-performance.css", import.meta.url), "utf8");
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(terminal, /closest<HTMLElement>\("\.hero-media"\)/);
  assert.match(terminal, /heroMedia\.dataset\.heroVisible/);
  assert.match(terminal, /IntersectionObserver/);
  assert.doesNotMatch(controller, /useHeroMediaVisibility|heroVisible/);
  assert.match(controller, /sectionVisible/);
  assert.match(
    css,
    /\[data-hero-visible="false"\][\s\S]*?animation-play-state:\s*paused/s,
  );
  assert.match(
    css,
    /\[data-hero-visible="false"\][\s\S]*?transition-duration:\s*0s/s,
  );
  assert.match(css, /\[data-hero-visible="true"\]/);
  assert.match(globals, /\[data-section-visible="false"\]/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /\.reveal\s*\{[^}]*animation:\s*none/s);
});

test("keeps remaining ambient motion compositor-friendly and omits the detached contact packet", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const progressFill = css.match(/\.hero-terminal-progress-fill \{[^}]*\}/s)?.[0] ?? "";
  const readyAnimation = css.match(
    /@keyframes hero-terminal-ready\s*\{[\s\S]*?\n\}/,
  )?.[0] ?? "";

  // The terminal progress bar animates via transform (scaleX), never layout.
  assert.match(progressFill, /transform: scaleX\(var\(--progress/);
  assert.doesNotMatch(css, /\.hero-terminal-progress-fill \{[^}]*\bwidth:\s*\d/s);
  assert.match(readyAnimation, /box-shadow:/);
  assert.doesNotMatch(readyAnimation, /filter:/);
  assert.doesNotMatch(css, /trace-out|outbound-packet|--packet-travel/);
});

test("resets terminal logs before applying reveal stagger", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const lineRule = css.match(/\.hero-terminal\[data-motion="running"\] \.hero-terminal-line \{[^}]*\}/s)?.[0] ?? "";

  assert.match(lineRule, /transition-delay:\s*0s/);
  assert.match(
    css,
    /\[data-phase="booting"\] \.hero-terminal-line\s*\{[^}]*transition-duration:\s*0s/s,
  );
  assert.match(
    css,
    /\[data-phase="compiling"\] \.hero-terminal-line\.is-compile[\s\S]*?transition-delay:\s*calc\(var\(--reveal-order,\s*0\) \* \.9s\)/s,
  );
  assert.match(
    css,
    /\[data-phase="linking"\] \.hero-terminal-line\.is-link[\s\S]*?transition-delay:\s*calc\(var\(--reveal-order,\s*0\) \* \.9s\)/s,
  );
  assert.match(css, /\[data-phase="idle"\]\s*\{\s*opacity:\s*0;\s*\}/);
});

test("reserves a stable responsive terminal slot", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const mediaRule = css.match(/\.hero-media \{[^}]*\}/s)?.[0] ?? "";
  const terminalRule = css.match(/\.hero-terminal \{[^}]*\}/s)?.[0] ?? "";

  assert.match(mediaRule, /--hero-terminal-height:\s*clamp\(/);
  assert.match(mediaRule, /height:\s*var\(--hero-terminal-height\)/);
  assert.match(mediaRule, /min-height:\s*var\(--hero-terminal-height\)/);
  assert.match(mediaRule, /max-height:\s*var\(--hero-terminal-height\)/);
  assert.match(mediaRule, /overflow:\s*clip/);
  assert.match(terminalRule, /height:\s*100%/);
});

test("fully disables terminal motion for reduced-motion users", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const reducedRule = css.match(
    /\.hero-terminal\[data-motion="reduced"\],[\s\S]*?\{[^}]*\}/s,
  )?.[0] ?? "";

  assert.match(reducedRule, /animation:\s*none\s*!important/);
  assert.match(reducedRule, /transition:\s*none\s*!important/);
});

test("keeps every header tier frosted and removes the hero guide frame", async () => {
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/scroll-performance.css", import.meta.url), "utf8");

  assert.match(css, /\.hero-frame\s*\{\s*display:\s*none;\s*\}/);
  assert.match(globals, /\.site-header\s*\{[^}]*backdrop-filter:\s*blur\(16px\)/s);
  assert.match(
    css,
    /@media \(max-width: 1100px\)\s*\{\s*\.site-header\s*\{[^}]*background:\s*rgba\(3,\s*5,\s*7,\s*\.68\);[^}]*backdrop-filter:\s*blur\(6px\)\s*saturate\(112%\)/s,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)\s*\{\s*\.site-header\s*\{[^}]*background:\s*rgba\(3,\s*5,\s*7,\s*\.54\);[^}]*backdrop-filter:\s*blur\(10px\)\s*saturate\(120%\)/s,
  );
  assert.doesNotMatch(css, /backdrop-filter:\s*none/);
});

test("keeps long-section navigation state deterministic", async () => {
  const navigation = await readFile(
    new URL("../app/components/Navigation.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(navigation, /setActive\(id\);/);
  assert.match(navigation, /const marker = window\.innerHeight \* 0\.3;/);
  assert.match(navigation, /rect\.top <= marker && rect\.bottom > marker/);
  assert.match(navigation, /window\.addEventListener\("resize", scheduleUpdate\)/);
  assert.match(navigation, /if \(navigationTargetRef\.current\) return;/);
  assert.match(navigation, /onSettled: \(result\) =>/);
  assert.match(navigation, /data-active-index=\{activeIndex\}/);
  assert.match(navigation, /className="nav-active-indicator"/);
  assert.match(css, /\.nav-active-indicator \{[^}]*translate3d\(var\(--nav-offset\), 0, 0\)/s);
  assert.doesNotMatch(navigation, /intersectionRatio/);
});
