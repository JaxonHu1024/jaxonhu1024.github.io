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

test("isolates the GPU-first About particle field and stops its frame work when inactive", async () => {
  const particleField = await readFile(
    new URL("../app/components/AboutParticleField.tsx", import.meta.url),
    "utf8",
  );
  const contextCompiler = await readFile(
    new URL("../app/components/AboutContextCompiler.tsx", import.meta.url),
    "utf8",
  );
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(particleField, /^"use client";/);
  assert.match(page, /<AboutContextCompiler \/>/);
  assert.doesNotMatch(page, /^"use client";/);
  assert.match(contextCompiler, /^"use client";/);
  assert.match(contextCompiler, /useState<AboutCompilerStage>\("frame"\)/);
  assert.match(contextCompiler, /aria-pressed=\{isActive\}/);
  assert.match(contextCompiler, /onPointerEnter=/);
  assert.match(contextCompiler, /window\.innerWidth <= 600/);
  assert.match(contextCompiler, /<AboutParticleField/);
  assert.match(particleField, /new IntersectionObserver/);
  assert.match(particleField, /currentVisibleRatio\(\) >= 0\.05/);
  assert.match(particleField, /new ResizeObserver/);
  assert.match(particleField, /document\.addEventListener\("visibilitychange"/);
  assert.match(
    particleField,
    /window\.addEventListener\("scroll", scheduleVisibilityReconciliation, \{ passive: true \}\)/,
  );
  assert.match(particleField, /window\.requestAnimationFrame/);
  assert.match(particleField, /window\.cancelAnimationFrame/);
  assert.match(particleField, /prefers-reduced-motion: reduce/);
  assert.match(particleField, /createWebGLParticleRenderer/);
  assert.match(particleField, /canvas\.getContext\("webgl2"/);
  assert.match(particleField, /powerPreference: "high-performance"/);
  assert.match(particleField, /gl\.drawArrays\(mode/);
  assert.match(particleField, /gl\.drawArraysInstanced\(mode/);
  assert.match(particleField, /gl\.bufferSubData\(/);
  assert.match(particleField, /configureVertexStream\(lineVertexArray, lineBuffer/);
  assert.match(particleField, /configureVertexStream\(pointVertexArray, pointBuffer/);
  assert.doesNotMatch(particleField, /vertices\.subarray\(0, floatCount\)/);
  assert.match(particleField, /Math\.min\(window\.devicePixelRatio \|\| 1, 2\)/);
  assert.match(particleField, /const MAX_PARTICLES = 2050/);
  assert.match(particleField, /const MAX_COMPACT_PARTICLES = 1125/);
  assert.match(particleField, /const COMPACT_POINT_INSTANCES = 4/);
  assert.match(particleField, /const FULL_POINT_INSTANCES = 5/);
  assert.match(particleField, /swiftshader\|llvmpipe\|software rasterizer/i);
  assert.match(particleField, /rendererQuality/);
  assert.match(particleField, /u_halo_pass/);
  assert.match(particleField, /data\.effectiveParticleCount|dataset\.effectiveParticleCount/);
  assert.match(particleField, /const TRAIL_STEPS = 7/);
  assert.match(particleField, /const RAIL_POSITIONS = \[0\.22, 0\.405, 0\.595, 0\.78\]/);
  assert.match(particleField, /flowTargetY/);
  assert.match(particleField, /STAGE_FOCUS_POSITIONS/);
  assert.match(particleField, /drawParticleVortex/);
  assert.match(particleField, /frameAccumulator \+= elapsedMs/);
  assert.match(particleField, /visualTime \+= advanceMs/);
  assert.doesNotMatch(particleField, /visualTime = time/);
  assert.match(particleField, /#8a72ff/);
  assert.match(particleField, /#ff6b57/);
  assert.doesNotMatch(particleField, /createRadialGradient|setLineDash/);
  assert.match(particleField, /Float32Array/);
  assert.match(particleField, /resizeObserver\.disconnect\(\)/);
  assert.match(particleField, /visibilityObserver\.disconnect\(\)/);
  assert.match(particleField, /removeEventListener\("pointermove"/);
  assert.match(particleField, /removeEventListener\("visibilitychange"/);
  assert.match(particleField, /removeEventListener\("scroll", scheduleVisibilityReconciliation\)/);
  assert.doesNotMatch(particleField, /\buseState\b|setInterval/);
  assert.match(css, /\.about-particle-field\s*\{[^}]*touch-action:\s*pan-y/s);
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
