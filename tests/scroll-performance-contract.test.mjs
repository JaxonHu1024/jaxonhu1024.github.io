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

  assert.match(controller, /IntersectionObserver/);
  assert.match(controller, /heroVisible/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.match(css, /\[data-hero-visible="true"\]/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /backdrop-filter:\s*none/);
  assert.match(css, /\.reveal\s*\{[^}]*animation:\s*none/s);
});

test("keeps the narrow header frosted and removes the hero guide frame", async () => {
  const css = await readFile(new URL("../app/scroll-performance.css", import.meta.url), "utf8");

  assert.match(css, /\.hero-frame\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /background:\s*rgba\(3,\s*5,\s*7,\s*\.64\)/);
  assert.match(css, /backdrop-filter:\s*blur\(10px\)\s*saturate\(120%\)/);
});
