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
  assert.match(page, /label: "Focus"/);
  assert.doesNotMatch(page, /Current threads|Core belief|YIELDS/);
  assert.ok(
    page.indexOf('<dl className="about-context"')
      < page.indexOf('<section className="about-working-loop"'),
    "current context should precede the working loop in reading order",
  );
  assert.doesNotMatch(controller, /useAboutSpotlight|data-about-spotlight/);
  assert.match(css, /\.about-loop-list::before\s*\{/);
  assert.doesNotMatch(`${page}\n${css}`, /about-experience-bridge/);
  assert.doesNotMatch(page, /about-loop-step[^\n]*tabIndex/);

  for (const component of ["AboutContextCompiler.tsx", "AboutParticleField.tsx"]) {
    await assert.rejects(
      readFile(new URL(`../app/components/${component}`, import.meta.url), "utf8"),
      { code: "ENOENT" },
    );
  }
});

test("keeps the site tracing beam responsive, pausable, and dependency-light", async () => {
  const component = await readFile(
    new URL("../app/components/SiteTracingBeam.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const beamCss = css.match(/\.site-tracing-beam\s*\{[^}]*\}/s)?.[0] ?? "";
  const activeBeamCss = css.match(
    /\.site-tracing-beam\[data-trace-visibility="active"\]\s*\{[^}]*\}/s,
  )?.[0] ?? "";

  assert.match(layout, /<SiteTracingBeam \/>/);
  assert.match(component, /^"use client";/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /const TRACE_IDLE_DELAY_MS = 900/);
  assert.match(component, /data-trace-visibility="idle"/);
  assert.match(component, /beam\.dataset\.traceVisibility = "active"/);
  assert.match(component, /window\.setTimeout\(settleIdle, TRACE_IDLE_DELAY_MS\)/);
  assert.match(component, /window\.addEventListener\("scroll", handleScroll, \{ passive: true \}\)/);
  assert.match(component, /window\.requestAnimationFrame\(animate\)/);
  assert.match(component, /new ResizeObserver\(\(entries\) =>/);
  assert.match(component, /resizeObserver\.observe\(document\.body\)/);
  assert.match(component, /resizeObserver\.observe\(beam\)/);
  assert.match(component, /beamEntry\.contentRect/);
  assert.match(component, /pointOnSiteTrace\(normalizedProgress\)/);
  assert.match(component, /headRef\.current\.style\.transform/);
  assert.doesNotMatch(component, /style\.setProperty\("--site-trace-progress"/);
  assert.doesNotMatch(css, /--site-trace-progress/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /visibilitychange/);
  assert.match(component, /window\.clearTimeout\(idleTimer\)/);
  assert.match(component, /window\.removeEventListener\("scroll", handleScroll\)/);
  assert.match(beamCss, /position:\s*fixed/);
  assert.match(beamCss, /left:\s*calc\(env\(safe-area-inset-left, 0px\) \+ var\(--site-trace-edge-gap\)\)/);
  assert.match(beamCss, /right:\s*auto/);
  assert.match(beamCss, /pointer-events:\s*none/);
  assert.match(beamCss, /opacity:\s*0/);
  assert.match(beamCss, /transform:\s*translate3d\(-2px, 0, 0\)/);
  assert.match(beamCss, /opacity 300ms var\(--ease-out\)/);
  assert.match(beamCss, /transform 300ms var\(--ease-out\)/);
  assert.doesNotMatch(beamCss, /transition:\s*all/);
  assert.match(activeBeamCss, /opacity:\s*1/);
  assert.match(activeBeamCss, /transition-duration:\s*150ms/);
  assert.match(css, /--site-trace-lane-width:\s*calc\(/);
  assert.match(css, /--site-trace-edge-gap:\s*4px/);
  assert.match(css, /--site-trace-width:\s*12px/);
  assert.match(component, /import \{ SITE_TRACE_PATH, pointOnSiteTrace \}/);
  assert.equal((component.match(/d=\{SITE_TRACE_PATH\}/g) ?? []).length, 2);
  assert.match(component, /gradientUnits="userSpaceOnUse"/);
  assert.match(component, /gradientCenter - 16/);
  assert.match(component, /gradientCenter \+ 12/);
  assert.match(component, /gradientRef\.current\?\.setAttribute\("y1"/);
  assert.match(component, /stopColor="var\(--color-accent\)" stopOpacity="0"/);
  assert.match(component, /stopColor="var\(--color-accent-signal\)"/);
  assert.match(component, /stopColor="var\(--color-trace-terminal\)" stopOpacity="0"/);
  assert.match(css, /\.site-tracing-beam__track\s*\{[\s\S]*?stroke-opacity:\s*\.09/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.site-tracing-beam\s*\{[\s\S]*?transition:\s*none !important/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.site-tracing-beam__progress/);
  assert.doesNotMatch(packageJson, /["'](?:motion|framer-motion)["']/);
  await assert.rejects(
    readFile(new URL("../app/components/TextType.tsx", import.meta.url), "utf8"),
    { code: "ENOENT" },
  );
});

test("keeps portrait motion cheap and the Experience guide fully static", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const pixelCanvas = await readFile(
    new URL("../app/components/PixelatedCanvas.tsx", import.meta.url),
    "utf8",
  );
  const pixelCanvasRuntime = await readFile(
    new URL("../app/components/usePixelatedCanvas.ts", import.meta.url),
    "utf8",
  );
  const pixelCanvasRenderer = await readFile(
    new URL("../app/components/pixelated-canvas-renderer.ts", import.meta.url),
    "utf8",
  );
  const controller = await readFile(
    new URL("../app/components/HeroInteractionController.tsx", import.meta.url),
    "utf8",
  );
  const scrollCss = await readFile(
    new URL("../app/scroll-performance.css", import.meta.url),
    "utf8",
  );
  const portraitCanvas = css.match(
    /\.hero-pixel-canvas\s*\{[^}]*touch-action:\s*pan-y pinch-zoom[^}]*\}/s,
  )?.[0] ?? "";

  assert.match(portraitCanvas, /touch-action:\s*pan-y pinch-zoom/);
  assert.doesNotMatch(css, /hero-terminal|agentctl|@keyframes\s+hero-terminal/);
  assert.match(pixelCanvas, /usePixelatedCanvas\(\{ \.\.\.props, canvasRef \}\)/);
  assert.match(pixelCanvasRuntime, /new IntersectionObserver/);
  assert.match(pixelCanvasRuntime, /document\.addEventListener\("visibilitychange"/);
  assert.match(pixelCanvasRuntime, /event\.pointerType === "touch" && touchHandle !== null/);
  assert.match(pixelCanvasRuntime, /touchHandle\?\.setPointerCapture\(event\.pointerId\)/);
  assert.match(pixelCanvasRuntime, /touchHandle\?\.addEventListener\("pointercancel"/);
  assert.match(pixelCanvasRuntime, /touchHandle\?\.addEventListener\("lostpointercapture"/);
  assert.match(pixelCanvasRuntime, /touchHandle\?\.removeEventListener\("pointercancel"/);
  assert.match(pixelCanvasRuntime, /touchHandle\?\.removeEventListener\("lostpointercapture"/);
  assert.match(css, /\.hero-portrait-touch-handle\s*\{[^}]*min-height:\s*44px[^}]*touch-action:\s*none/s);
  assert.match(pixelCanvasRuntime, /new ResizeObserver/);
  assert.match(pixelCanvasRuntime, /function timeAdjustedFactor/);
  assert.match(pixelCanvasRuntime, /createPixelatedCanvasRenderer\(\{/);
  assert.match(pixelCanvasRenderer, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
  assert.match(pixelCanvasRenderer, /const nextBaseLayer = document\.createElement\("canvas"\)/);
  assert.match(pixelCanvasRenderer, /context\.drawImage\(\s*baseLayer/s);
  assert.match(pixelCanvasRenderer, /sample\.drop \? 1 - influence : 1/);
  assert.doesNotMatch(pixelCanvasRenderer, /if \(sample\.drop \|\| sample\.a <= 0\)/);
  assert.match(page, /<div className="experience-log">/);
  assert.doesNotMatch(`${page}\n${css}\n${controller}`, /experience-scan-(?:track|fill|cursor)/);
  assert.doesNotMatch(
    `${css}\n${controller}`,
    /--experience-trace-|#experience[^\n{]*\[data-trace-|\.experience-[^\n{]*\[data-trace-/,
  );
  assert.doesNotMatch(controller, /useExperienceTrace|scheduleTrace|updateTrace/);
  assert.doesNotMatch(css, /active-node-pulse|timeline-node::before/);
  assert.match(css, /\.experience-log::before\s*\{[^}]*background:\s*var\(--guide-rail-vertical\)/s);
  assert.match(css, /\.experience-row\.is-current \.timeline-node\s*\{[^}]*--guide-node-tone:\s*var\(--color-accent\)/s);
  assert.match(
    scrollCss,
    /#hero\[data-section-visible="false"\][\s\S]*?pointer-events:\s*none/s,
  );
  assert.match(
    scrollCss,
    /@media \(max-width: 1100px\)[\s\S]*?\.reveal\s*\{[^}]*animation:\s*none/s,
  );
  assert.doesNotMatch(css, /trace-out|outbound-packet|--packet-travel/);
});

test("renders the Aceternity pixel portrait and removes the signal and CLI implementations", async () => {
  const pixelCanvas = await readFile(
    new URL("../app/components/PixelatedCanvas.tsx", import.meta.url),
    "utf8",
  );
  const pixelCanvasRuntime = await readFile(
    new URL("../app/components/usePixelatedCanvas.ts", import.meta.url),
    "utf8",
  );
  const portrait = await readFile(
    new URL("../app/components/HeroPixelPortrait.tsx", import.meta.url),
    "utf8",
  );
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(pixelCanvas, /^"use client";/);
  assert.match(pixelCanvas, /export function PixelatedCanvas/);
  assert.match(pixelCanvasRuntime, /requestAnimationFrame/);
  assert.match(pixelCanvasRuntime, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(pixelCanvasRuntime, /setInterval|<animate/);
  assert.match(portrait, /\/assets\/jaxon-sea-portrait\.webp/);
  assert.match(portrait, /<PixelatedCanvas/);
  assert.match(portrait, /width="1200"/);
  assert.match(portrait, /height="1200"/);
  assert.match(portrait, /fetchPriority="high"/);
  assert.match(portrait, /maxFps=\{60\}/);
  assert.match(page, /<HeroPixelPortrait \/>/);
  assert.ok(
    page.indexOf('className="hero-name"')
      < page.indexOf("<HeroPixelPortrait />")
      && page.indexOf("<HeroPixelPortrait />")
        < page.indexOf('className="hero-actions"'),
    "portrait should be between the name and CTA in source order",
  );
  assert.doesNotMatch(page, /HeroSignalGraphic|hero-signal-graphic/);
  assert.doesNotMatch(page, /HeroTerminal|hero-terminal|agentctl|CLI/);
  assert.match(css, /--background:\s*#05070b/);
  assert.match(css, /--text:\s*#e9fff9/);
  assert.match(css, /--mint:\s*#4ff7d5/);
  assert.match(css, /--violet:\s*#8a72ff/);
  assert.match(css, /--coral:\s*#ff6b57/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-pixel-canvas/s);
  for (const removedComponent of ["HeroSignalGraphic.tsx", "HeroTerminal.tsx"]) {
    await assert.rejects(
      readFile(new URL(`../app/components/${removedComponent}`, import.meta.url), "utf8"),
      { code: "ENOENT" },
    );
  }
});

test("keeps public links free of the removed terminal visual grammar", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const notFound = await readFile(new URL("../app/not-found.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(`${page}\n${notFound}`, /terminal-button|className="button-arrow"/);
  assert.doesNotMatch(css, /--terminal|\.terminal-button/);
  assert.match(page, /className="paper-link"[^>]*target="_blank"/);
  assert.match(notFound, /className="not-found-link" href="\/"/);
});
