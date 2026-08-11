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
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(page, /className="signal-button hero-cta" href="#about"/);
  assert.match(page, /className="hero-cta-label">Explore context<\/span>/);
  assert.match(
    page,
    /className="hero-positioning">AI systems, made inspectable\.<\/p>/,
  );
  assert.doesNotMatch(page, /signal-button-arrow|↘/);
  assert.doesNotMatch(css, /signal-button-arrow/);
  assert.match(page, /className="hero-cta-border" aria-hidden="true"/);
  assert.match(page, /className="hero-cta-border-signal"/);
  assert.match(controller, /a\.hero-cta\[href\^=['"]#['"]\]/);
  assert.match(controller, /createHashNavigation/);
  assert.match(layout, /<HeroInteractionController \/>/);
  assert.doesNotMatch(page, /^"use client";/);
  assert.match(css, /@keyframes\s+hero-cta-border-travel/);
  assert.match(
    css,
    /#hero\[data-section-visible="false"\] \.hero-cta-border-signal,[\s\S]*?html\[data-page-active="false"\] \.hero-cta-border-signal[\s\S]*?animation-play-state:\s*paused/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.hero-cta-border-signal\s*\{[\s\S]*?animation:\s*none !important/,
  );
  assert.doesNotMatch(packageJson, /["'](?:motion|framer-motion)["']/);
});

test("navigation can emit root-document links without intercepting them", async () => {
  const navigation = await readFile(
    new URL("../app/components/Navigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(navigation, /type NavigationProps = \{\s*homePath\?: "\/";\s*\}/);
  assert.match(navigation, /export function Navigation\(\{ homePath \}: NavigationProps = \{\}\)/);
  assert.match(navigation, /href=\{homePath \?\? "#hero"\}/);
  assert.match(navigation, /href=\{homePath \? `\$\{homePath\}#\$\{id\}` : `#\$\{id\}`\}/);
  assert.equal(
    (navigation.match(/onClick=\{homePath \? undefined : \(event\) => navigateToSection/g) ?? []).length,
    2,
  );
});

test("keeps the Context path static-first and progressively enhances travel filtering", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const travelMap = await readFile(
    new URL("../app/components/TravelMap.tsx", import.meta.url),
    "utf8",
  );
  const signalHeading = await readFile(
    new URL("../app/components/SignalHeading.tsx", import.meta.url),
    "utf8",
  );
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
  assert.match(page, /<TravelMap \/>/);
  assert.equal((page.match(/label: "(?:FRAME|CONNECT|OBSERVE|VERIFY)"/g) ?? []).length, 4);
  assert.match(
    page,
    /I&apos;m Jaxon\. I build agents and multimodal systems whose behavior[\s\S]*?can be observed, tested, and improved\./,
  );
  assert.doesNotMatch(page, /aboutFocus|about-context|label: "Focus"/);
  assert.doesNotMatch(page, /Current threads|Core belief|YIELDS/);
  assert.ok(
    page.indexOf('<header className="about-copy">') < page.indexOf("<TravelMap />")
      && page.indexOf("<TravelMap />")
        < page.indexOf('<section className="about-working-loop"'),
    "introduction, travel map, and working loop should retain their reading order",
  );
  assert.match(travelMap, /^"use client";/);
  assert.doesNotMatch(signalHeading, /^"use client";/);
  assert.match(signalHeading, /"signal-heading"/);
  assert.match(signalHeading, /className="signal-heading__label"/);
  assert.match(signalHeading, /className="signal-heading__rule" aria-hidden="true"/);
  assert.match(signalHeading, /className="signal-heading__end" aria-hidden="true"/);
  assert.doesNotMatch(signalHeading, /level|signal-heading--nested/);
  assert.match(page, /WORKING\.LOOP/);
  assert.doesNotMatch(
    `${page}\n${css}`,
    /signal-heading--nested|section-kicker--compact|kicker-rule|label-rule|square-end/,
  );
  assert.match(travelMap, /role="img"/);
  assert.match(travelMap, /href="\/assets\/travel-world-solid\.svg"/);
  assert.match(travelMap, /preserveAspectRatio="xMidYMid meet"/);
  assert.match(travelMap, /MOBILE_MAP_ASPECT_RATIO = 6 \/ 5/);
  assert.match(travelMap, /createFocusedViewBox\(travelData\.airports\)/);
  assert.match(travelMap, /data-map-view=/);
  assert.match(travelMap, /Math\.abs\(horizontalDistance\) <= MAP_WIDTH \/ 2/);
  assert.match(travelMap, /travelData\.routes\.map\(\(route\) =>/);
  assert.match(travelMap, /data-route-key=\{routeKey\}/);
  assert.match(travelMap, /data-route-direction=\{route\.bidirectional \? "both" : "one-way"\}/);
  assert.match(travelMap, /className="travel-map-dock"/);
  assert.match(travelMap, /className="travel-map-flags"/);
  assert.match(travelMap, /aria-label="Filter flight footprint by country or region"/);
  assert.match(travelMap, /data-country-code=\{country\.code\}/);
  assert.match(travelMap, /className="travel-map-flag-button"/);
  assert.match(travelMap, /aria-pressed=\{isSelected\}/);
  assert.match(travelMap, /aria-controls="travel-map-canvas"/);
  assert.match(travelMap, /data-emphasis=/);
  assert.match(travelMap, /className="travel-map-flag-icon"/);
  assert.match(travelMap, /className="travel-map-flag-tooltip"/);
  assert.doesNotMatch(travelMap, /Flight segments|Airports reached|travel-map-distance|formatDistance/);
  assert.doesNotMatch(css, /\.travel-map-distance/);
  assert.match(
    css,
    /\.travel-map-flag-icon\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/,
  );
  assert.doesNotMatch(travelMap, /routeIndex|--travel-route-delay/);
  assert.doesNotMatch(travelMap, /createCurvedPath|selectRepresentativeRoutes|markerStart|markerEnd/);
  assert.doesNotMatch(travelMap, /Trace window|DATA LAYER/i);
  assert.doesNotMatch(travelMap, /<canvas\b|motion\/react|dotted-map|next-themes/);
  assert.doesNotMatch(controller, /useAboutSpotlight|data-about-spotlight/);
  assert.doesNotMatch(css, /@keyframes\s+travel-route-acquire|--travel-route-delay/);
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

test("travel filter affordances stay inert until their buttons are enabled", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.travel-map-flags button:not\(:disabled\)\s*\{[^}]*cursor:\s*pointer/s,
  );
  assert.match(css, /\.travel-map-flags button:not\(:disabled\):active\s*\{/);
  assert.match(
    css,
    /\.travel-map-flags li:has\(> button:not\(:disabled\)\):hover\s*\{/,
  );
  assert.match(
    css,
    /\.travel-map-flags button:disabled\s*\{[^}]*cursor:\s*default;[^}]*opacity:\s*1;/s,
  );
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

test("research motion honors its intersection-ratio visibility threshold", async () => {
  const component = await readFile(
    new URL("../app/components/ResearchVisual.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /const RESEARCH_VISIBILITY_THRESHOLD = 0\.05/);
  assert.match(
    component,
    /visible = entry\.isIntersecting\s*&&\s*entry\.intersectionRatio >= RESEARCH_VISIBILITY_THRESHOLD/,
  );
  assert.match(component, /threshold:\s*\[0, RESEARCH_VISIBILITY_THRESHOLD\]/);
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

test("pixel portrait image callbacks cannot mutate an unmounted canvas", async () => {
  const pixelCanvas = await readFile(
    new URL("../app/components/usePixelatedCanvas.ts", import.meta.url),
    "utf8",
  );

  assert.match(pixelCanvas, /image\.onerror = \(\) => \{\s*if \(cancelled\) return;/);
  assert.match(
    pixelCanvas,
    /return \(\) => \{\s*cancelled = true;\s*image\.onload = null;\s*image\.onerror = null;/,
  );
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
  assert.match(portrait, /width="840"/);
  assert.match(portrait, /height="840"/);
  assert.match(portrait, /fetchPriority="high"/);
  assert.match(portrait, /maxFps=\{60\}/);
  assert.match(page, /<HeroPixelPortrait \/>/);
  assert.ok(
    page.indexOf('className="hero-name"')
      < page.indexOf('className="hero-positioning"')
      && page.indexOf('className="hero-positioning"')
        < page.indexOf("<HeroPixelPortrait />")
      && page.indexOf("<HeroPixelPortrait />")
        < page.indexOf('className="hero-actions"'),
    "positioning line and portrait should lead into the CTA in source order",
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
