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
  const css = await readFile(new URL("../app/scroll-performance.css", import.meta.url), "utf8");
  const globals = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(controller, /IntersectionObserver/);
  assert.match(controller, /heroVisible/);
  assert.match(controller, /sectionVisible/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.match(css, /\[data-hero-visible="true"\]/);
  assert.match(globals, /\[data-section-visible="false"\]/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /\.reveal\s*\{[^}]*animation:\s*none/s);
});

test("keeps remaining ambient motion compositor-friendly and omits the detached contact packet", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const processor = css.match(/@keyframes processor-breathe\s*\{[^}]*\}[^}]*\}/s)?.[0] ?? "";

  assert.match(processor, /opacity:/);
  assert.doesNotMatch(processor, /filter:/);
  assert.doesNotMatch(css, /trace-out|outbound-packet|--packet-travel/);
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
