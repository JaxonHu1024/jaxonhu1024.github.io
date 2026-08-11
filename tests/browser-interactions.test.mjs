import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  browser,
  createReleasePageSession,
  intersectionArea,
  measurePageGeometry,
  origin,
  setupReleaseHarness,
  teardownReleaseHarness,
} from "./browser-release-harness.mjs";
import {
  generatedBidirectionalCorridors,
  generatedCountryCodes,
  generatedTravelData,
} from "./generated-travel-contract.mjs";

before(setupReleaseHarness);
after(teardownReleaseHarness);

async function waitForTracingBeamIdle(page, timeout = 2_500) {
  await page.waitForFunction(() => {
    const element = document.querySelector(".site-tracing-beam");
    return element?.getAttribute("data-trace-visibility") === "idle"
      && Number.parseFloat(getComputedStyle(element).opacity) <= 0.01;
  }, null, { timeout });
}

test("research canvas reports its viewport and page motion lifecycle", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.addInitScript(() => {
      let hidden = false;
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      window.__setDocumentHidden = (value) => {
        hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
    });
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".research-canvas")).every(
        (canvas) => canvas.getAttribute("data-motion") === "paused",
      )
    ), null, { timeout: 2_500 });

    await page.locator("#research").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".research-canvas")).every(
        (canvas) => canvas.getAttribute("data-motion") === "running",
      )
    ), null, { timeout: 2_500 });

    const partialIntersection = await page.locator(".research-canvas").first().evaluate(
      async (canvas) => {
        const visibleHeight = canvas.getBoundingClientRect().height * 0.02;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const currentRect = canvas.getBoundingClientRect();
          window.scrollBy(0, currentRect.top - (window.innerHeight - visibleHeight));
          await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        const rect = canvas.getBoundingClientRect();
        const intersectionHeight = Math.max(
          0,
          Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
        );
        return {
          bottom: rect.bottom,
          motion: canvas.getAttribute("data-motion"),
          ratio: intersectionHeight / rect.height,
          scrollY: window.scrollY,
          top: rect.top,
        };
      },
    );
    assert.ok(
      partialIntersection.ratio > 0 && partialIntersection.ratio < 0.05,
      `research threshold setup failed: ${JSON.stringify(partialIntersection)}`,
    );
    assert.equal(
      partialIntersection.motion,
      "paused",
      `research canvas ran below its visibility threshold: ${JSON.stringify(partialIntersection)}`,
    );

    await page.locator("#research").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".research-canvas")).every(
        (canvas) => canvas.getAttribute("data-motion") === "running",
      )
    ), null, { timeout: 2_500 });

    await page.evaluate(() => window.__setDocumentHidden(true));
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".research-canvas")).every(
        (canvas) => canvas.getAttribute("data-motion") === "paused",
      )
    ), null, { timeout: 2_500 });

    await page.evaluate(() => window.__setDocumentHidden(false));
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(".research-canvas")).every(
        (canvas) => canvas.getAttribute("data-motion") === "running",
      )
    ), null, { timeout: 2_500 });

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const offscreenState = await page.evaluate(() => (
      Array.from(document.querySelectorAll(".research-canvas")).map((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          motion: canvas.getAttribute("data-motion"),
          top: rect.top,
        };
      })
    ));
    assert.ok(
      offscreenState.every((canvas) => canvas.motion === "paused"),
      `offscreen research canvases kept running: ${JSON.stringify(offscreenState)}`,
    );
  } finally {
    await context.close();
  }
});

test("research cards stay halo-free while links retain focus feedback", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    deviceScaleFactor: 3,
    viewport: { width: 430, height: 932 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    const packet = page.locator(".research-packet").first();
    const paperLink = packet.locator(".paper-link");
    await packet.scrollIntoViewIfNeeded();

    const readHaloState = () => page.evaluate(() => ({
      packetBackgrounds: Array.from(document.querySelectorAll(".research-packet"))
        .map((element) => getComputedStyle(element, "::before").backgroundImage),
      packetModes: Array.from(document.querySelectorAll(".research-packet"))
        .map((element) => element.getAttribute("data-research-spotlight")),
      packetVariables: Array.from(document.querySelectorAll(".research-packet"))
        .map((element) => ({
          x: element.style.getPropertyValue("--research-spotlight-x"),
          y: element.style.getPropertyValue("--research-spotlight-y"),
        })),
      visualBackgrounds: Array.from(document.querySelectorAll(".paper-visual"))
        .map((element) => getComputedStyle(element).backgroundImage),
    }));
    const assertHaloFree = (state, label) => {
      assert.equal(
        [...state.packetBackgrounds, ...state.visualBackgrounds]
          .every((background) => !background.includes("radial-gradient")),
        true,
        `${label} retained a radial research halo: ${JSON.stringify(state)}`,
      );
      assert.deepEqual(state.packetModes, [null, null], `${label} set spotlight state`);
      assert.deepEqual(
        state.packetVariables,
        [{ x: "", y: "" }, { x: "", y: "" }],
        `${label} wrote spotlight coordinates`,
      );
    };

    assertHaloFree(await readHaloState(), "rest");

    const packetBox = await packet.boundingBox();
    assert.ok(packetBox, "the first research packet should have a rendered box");
    await page.mouse.move(
      packetBox.x + packetBox.width * .72,
      packetBox.y + packetBox.height * .36,
    );
    await page.waitForTimeout(50);
    assertHaloFree(await readHaloState(), "pointer move");

    await page.locator("#research").focus();
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => (
      document.querySelector(".paper-link")?.matches(":focus-visible")
      && new DOMMatrixReadOnly(
        getComputedStyle(document.querySelector(".paper-link"), "::before").transform,
      ).a > 0.95
    ), null, { timeout: 2_500 });
    const focusState = await paperLink.evaluate((element) => ({
      activeLink: document.activeElement === element,
      borderColor: getComputedStyle(element).borderTopColor,
      linkArrowTransform: getComputedStyle(
        element.querySelector(".paper-link-arrow"),
      ).transform,
      linkSignalScale: new DOMMatrixReadOnly(
        getComputedStyle(element, "::before").transform,
      ).a,
    }));
    assert.equal(focusState.activeLink, true);
    assert.ok(focusState.linkSignalScale > 0.95);
    assert.notEqual(focusState.linkArrowTransform, "none");
    assert.notEqual(focusState.borderColor, "rgba(0, 0, 0, 0)");
    assertHaloFree(await readHaloState(), "keyboard focus");
  } finally {
    await context.close();
  }
});

test("research animation clock excludes time spent paused", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.addInitScript(() => {
      let hidden = false;
      let timestampOffset = 0;
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      const nativeFillRect = CanvasRenderingContext2D.prototype.fillRect;

      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => hidden,
      });
      window.__setDocumentHidden = (value) => {
        hidden = value;
        document.dispatchEvent(new Event("visibilitychange"));
      };
      window.__advanceAnimationTimestamp = (milliseconds) => {
        timestampOffset += milliseconds;
      };
      window.__wavePacketFrames = [];
      window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame((timestamp) => {
        window.__currentAnimationTimestamp = timestamp + timestampOffset;
        callback(timestamp + timestampOffset);
      });
      CanvasRenderingContext2D.prototype.fillRect = function recordWavePacket(
        x,
        y,
        width,
        height,
      ) {
        if (
          this.canvas?.getAttribute("data-motion-layer") === "research-wave"
          && width === 6
          && height === 6
        ) {
          window.__wavePacketFrames.push({
            canvasWidth: this.canvas.getBoundingClientRect().width,
            timestamp: window.__currentAnimationTimestamp,
            x,
          });
        }
        return nativeFillRect.call(this, x, y, width, height);
      };
    });

    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.locator("#research").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector('[data-motion-layer="research-wave"]')
        ?.getAttribute("data-motion") === "running"
      && window.__wavePacketFrames.length >= 3
    ), null, { timeout: 2_500 });

    await page.evaluate(() => window.__setDocumentHidden(true));
    await page.waitForFunction(() => (
      document.querySelector('[data-motion-layer="research-wave"]')
        ?.getAttribute("data-motion") === "paused"
    ));
    const paused = await page.evaluate(() => ({
      count: window.__wavePacketFrames.length,
      packet: window.__wavePacketFrames.at(-1),
    }));

    await page.evaluate(() => window.__advanceAnimationTimestamp(10_000));
    await page.evaluate(() => window.__setDocumentHidden(false));
    await page.waitForFunction((pausedCount) => (
      window.__wavePacketFrames.length > pausedCount
    ), paused.count, { timeout: 2_500 });
    const resumed = await page.evaluate((pausedCount) => (
      window.__wavePacketFrames[pausedCount]
    ), paused.count);

    const progressBefore = (paused.packet.x + 3) / paused.packet.canvasWidth;
    const progressAfter = (resumed.x + 3) / resumed.canvasWidth;
    const rawProgressDelta = Math.abs(progressAfter - progressBefore);
    const circularProgressDelta = Math.min(rawProgressDelta, 1 - rawProgressDelta);
    assert.ok(
      circularProgressDelta < 0.05,
      `paused time advanced the research phase: ${JSON.stringify({
        circularProgressDelta,
        paused: paused.packet,
        resumed,
      })}`,
    );
  } finally {
    await context.close();
  }
});
test("hero pixel canvas distorts on pointer input, pauses offscreen, and remains terminal-free", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
    ), null, { timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-pixelated-ready") === "true"
    ), null, { timeout: 3_000 });

    assert.equal(await page.locator(".hero-terminal").count(), 0);
    assert.equal(await page.locator(".hero-pixel-canvas").count(), 1);
    assert.equal(await page.locator(".hero-portrait-fallback").count(), 1);

    const resting = await page.locator(".hero-pixel-canvas").evaluate((canvas) => ({
      interactive: canvas.getAttribute("data-interactive"),
      motion: canvas.getAttribute("data-motion"),
      ready: canvas.getAttribute("data-pixelated-ready"),
      snapshot: canvas.toDataURL(),
      visible: getComputedStyle(canvas).visibility !== "hidden",
    }));
    assert.equal(resting.visible, true);
    assert.equal(resting.interactive, "true");
    assert.equal(resting.motion, "idle");
    assert.equal(resting.ready, "true");

    const canvasBox = await page.locator(".hero-pixel-canvas").boundingBox();
    assert.ok(canvasBox);
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.62,
      canvasBox.y + canvasBox.height * 0.48,
    );
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion") === "running"
    ));
    await page.waitForFunction((snapshot) => (
      document.querySelector(".hero-pixel-canvas")?.toDataURL() !== snapshot
    ), resting.snapshot, { timeout: 1_500 });
    const distortedSnapshot = await page.locator(".hero-pixel-canvas").evaluate(
      (canvas) => canvas.toDataURL(),
    );
    assert.notEqual(distortedSnapshot, resting.snapshot);
    await page.mouse.move(0, 0);

    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "false"
    ), null, { timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion") === "paused"
    ));
    assert.equal(
      await page.locator(".hero-pixel-portrait").evaluate(
        (portrait) => getComputedStyle(portrait).pointerEvents,
      ),
      "none",
    );

    await page.locator("#hero").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
    ), null, { timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion") === "idle"
    ));
  } finally {
    await context.close();
  }
});

test("hero CTA border runs only while the Hero and page are active", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
    ), null, { timeout: 3_000 });

    const border = page.locator(".hero-cta-border-signal");
    assert.equal(await border.count(), 1);
    const activeState = await border.evaluate((element) => {
      const style = getComputedStyle(element);
      const container = element.closest(".hero-cta-border");
      const cta = element.closest(".hero-cta");
      const label = cta?.querySelector(".hero-cta-label");
      const ctaRect = cta?.getBoundingClientRect();
      const labelRect = label?.getBoundingClientRect();
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        animationPlayState: style.animationPlayState,
        arrowCount: cta?.querySelectorAll(".signal-button-arrow").length,
        containerHidden: container?.getAttribute("aria-hidden"),
        dashArray: style.strokeDasharray,
        justifyContent: cta ? getComputedStyle(cta).justifyContent : null,
        labelCenterDelta: ctaRect && labelRect
          ? Math.abs(
            labelRect.left + labelRect.width / 2
              - (ctaRect.left + ctaRect.width / 2),
          )
          : null,
        labelText: label?.textContent?.trim(),
        positioningText: document.querySelector(".hero-positioning")?.textContent?.trim(),
        svgFocusable: element.ownerSVGElement?.getAttribute("focusable"),
      };
    });
    const { labelCenterDelta, ...activeContract } = activeState;
    assert.deepEqual(activeContract, {
      animationDuration: "4.2s",
      animationName: "hero-cta-border-travel",
      animationPlayState: "running",
      arrowCount: 0,
      containerHidden: "true",
      dashArray: "17px, 83px",
      justifyContent: "center",
      labelText: "Explore context",
      positioningText: "AI systems, made inspectable.",
      svgFocusable: "false",
    });
    assert.ok(
      labelCenterDelta !== null && labelCenterDelta <= .75,
      `hero CTA label was not centered: delta=${labelCenterDelta}px`,
    );

    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "false"
      && getComputedStyle(document.querySelector(".hero-cta-border-signal"))
        .animationPlayState === "paused"
    ), null, { timeout: 3_000 });

    await page.locator("#hero").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
      && getComputedStyle(document.querySelector(".hero-cta-border-signal"))
        .animationPlayState === "running"
    ), null, { timeout: 3_000 });
  } finally {
    await context.close();
  }
});

test("mobile Hero keeps portrait scrolling separate from deliberate touch distortion", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 430, height: 932 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-pixelated-ready") === "true"
    ), null, { timeout: 3_000 });

    const layout = await page.evaluate(() => {
      const name = document.querySelector(".hero-name").getBoundingClientRect();
      const portrait = document.querySelector(".hero-pixel-portrait");
      const portraitRect = portrait.getBoundingClientRect();
      const cta = document.querySelector(".hero-cta").getBoundingClientRect();
      const canvas = portrait.querySelector(".hero-pixel-canvas");
      const frame = portrait.querySelector(".hero-portrait-frame");
      const portraitStyle = getComputedStyle(portrait);
      const touchHandle = portrait.querySelector(".hero-portrait-touch-handle");

      return {
        canvasCount: document.querySelectorAll(".hero-pixel-canvas").length,
        ctaTop: cta.top,
        frameOverlay: getComputedStyle(frame, "::before").backgroundImage,
        interactive: canvas.getAttribute("data-interactive"),
        topLabelDisplay: getComputedStyle(
          portrait.querySelector(".hero-portrait-label--top"),
        ).display,
        maskImage: portraitStyle.maskImage,
        nameBottom: name.bottom,
        opacity: portraitStyle.opacity,
        pointerEvents: portraitStyle.pointerEvents,
        portraitBottom: portraitRect.bottom,
        portraitTop: portraitRect.top,
        touchHandle: touchHandle ? {
          ariaPressed: touchHandle.getAttribute("aria-pressed"),
          display: getComputedStyle(touchHandle).display,
          ready: touchHandle.getAttribute("data-touch-ready"),
          touchAction: getComputedStyle(touchHandle).touchAction,
        } : null,
        touchAction: getComputedStyle(canvas).touchAction,
      };
    });

    assert.equal(layout.canvasCount, 1);
    assert.equal(layout.interactive, "true");
    assert.equal(layout.maskImage, "none");
    assert.equal(layout.opacity, "1");
    assert.equal(layout.pointerEvents, "auto");
    assert.equal(layout.touchAction, "pan-y pinch-zoom");
    assert.equal(layout.topLabelDisplay !== "none", true);
    assert.deepEqual(layout.touchHandle, {
      ariaPressed: "false",
      display: "flex",
      ready: "true",
      touchAction: "none",
    });
    assert.equal(layout.frameOverlay, "none");
    assert.ok(layout.nameBottom <= layout.portraitTop + 1);
    assert.ok(layout.portraitBottom <= layout.ctaTop + 1);

    const canvas = page.locator(".hero-pixel-canvas");
    const touchHandle = page.locator(".hero-portrait-touch-handle");
    const touchHandleBox = await touchHandle.boundingBox();
    assert.ok(touchHandleBox);
    assert.ok(touchHandleBox.width >= 44 && touchHandleBox.height >= 44);

    const cdp = await context.newCDPSession(page);
    const canvasBox = await canvas.boundingBox();
    assert.ok(canvasBox);
    const restingSnapshot = await canvas.evaluate((element) => element.toDataURL());
    const scrollStart = {
      x: canvasBox.x + canvasBox.width * 0.48,
      y: canvasBox.y + canvasBox.height * 0.72,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [scrollStart],
    });
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          x: scrollStart.x + step * 4,
          y: scrollStart.y - step * 18,
        }],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(120);
    assert.ok(await page.evaluate(() => scrollY) >= 48);
    assert.equal(await canvas.evaluate((element) => element.toDataURL()), restingSnapshot);
    assert.equal(await canvas.getAttribute("data-motion"), "idle");

    await page.waitForTimeout(240);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.scrollY === 0);
    await page.waitForTimeout(80);
    const distortionScrollStart = await page.evaluate(() => scrollY);
    const distortionStart = {
      x: touchHandleBox.x + touchHandleBox.width * 0.5,
      y: touchHandleBox.y + touchHandleBox.height * 0.5,
    };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [distortionStart],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: canvasBox.x + canvasBox.width * 0.38,
        y: canvasBox.y + canvasBox.height * 0.42,
      }],
    });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion") === "running"
    ));
    await page.waitForTimeout(120);
    assert.ok(
      Math.abs(await page.evaluate(() => scrollY) - distortionScrollStart) <= 1,
      "dragging the portrait touch handle scrolled the page",
    );
    assert.equal(await touchHandle.getAttribute("aria-pressed"), "true");
    assert.notEqual(
      await canvas.evaluate((element) => element.toDataURL()),
      restingSnapshot,
    );
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion") === "idle"
    ), null, { timeout: 2_000 });
    assert.equal(await touchHandle.getAttribute("aria-pressed"), "false");
    assert.equal(await canvas.evaluate((element) => getComputedStyle(element).touchAction), "pan-y pinch-zoom");
    await cdp.detach();
  } finally {
    await context.close();
  }
});

test("reduced-motion mobile keeps the portrait, Context path, and contact ticker complete but still", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
    ), null, { timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector(".hero-pixel-canvas")?.getAttribute("data-pixelated-ready") === "true"
    ), null, { timeout: 3_000 });

    const portrait = await page.locator(".hero-pixel-portrait").evaluate((element) => ({
      canvasCount: element.querySelectorAll(".hero-pixel-canvas").length,
      interactive: element.querySelector(".hero-pixel-canvas")?.getAttribute("data-interactive"),
      motion: element.querySelector(".hero-pixel-canvas")?.getAttribute("data-motion"),
      runningAnimations: element.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length,
      touchHandleDisabled: element.querySelector(".hero-portrait-touch-handle")?.disabled,
      touchHandleDisplay: getComputedStyle(
        element.querySelector(".hero-portrait-touch-handle"),
      ).display,
      touchHandleReady: element.querySelector(".hero-portrait-touch-handle")
        ?.getAttribute("data-touch-ready"),
      visible: getComputedStyle(element).visibility !== "hidden",
    }));
    assert.deepEqual(portrait, {
      canvasCount: 1,
      interactive: "false",
      motion: "reduced",
      runningAnimations: 0,
      touchHandleDisabled: true,
      touchHandleDisplay: "none",
      touchHandleReady: "false",
      visible: true,
    });
    assert.equal(await page.locator(".hero-terminal").count(), 0);
    const ctaBorder = await page.locator(".hero-cta-border-signal").evaluate((element) => ({
      animationName: getComputedStyle(element).animationName,
      runningAnimations: element.getAnimations()
        .filter((animation) => animation.playState === "running").length,
    }));
    assert.deepEqual(ctaBorder, {
      animationName: "none",
      runningAnimations: 0,
    });

    await page.locator("#about").scrollIntoViewIfNeeded();
    const about = await page.locator("#about").evaluate((section) => ({
      contextCount: section.querySelectorAll(".about-context").length,
      forbiddenCount: section.querySelectorAll(
        "canvas, [class*='about-particle'], [role='tab'], [role='tablist'], [role='tabpanel']",
      ).length,
      introductionText: section.querySelector(".about-introduction")
        ?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      runningAnimations: section.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length,
      steps: Array.from(section.querySelectorAll(".about-loop-step")).map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          label: element.querySelector(".about-loop-label")?.textContent?.trim() ?? "",
          visible: rect.width > 0
            && rect.height > 0
            && style.visibility !== "hidden"
            && Number.parseFloat(style.opacity) > 0,
        };
      }),
    }));
    assert.equal(about.forbiddenCount, 0);
    assert.equal(about.runningAnimations, 0);
    assert.deepEqual(
      about.steps.map(({ label }) => label),
      ["FRAME", "CONNECT", "OBSERVE", "VERIFY"],
    );
    assert.equal(about.steps.every(({ visible }) => visible), true);
    assert.equal(about.contextCount, 0);
    assert.equal(
      about.introductionText,
      "I'm Jaxon. I build agents and multimodal systems whose behavior can be observed, "
        + "tested, and improved.",
    );
    await page.locator("#contact").scrollIntoViewIfNeeded();
    const contact = await page.locator("#contact").evaluate((section) => {
      const marquee = section.querySelector(".contact-marquee");
      const marqueeWindow = section.querySelector(".contact-marquee-window");
      const summary = section.querySelector(".contact-marquee-summary");
      const track = section.querySelector(".contact-marquee-track");
      const marqueeRect = marquee?.getBoundingClientRect();
      const windowRect = marqueeWindow?.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect();
      const trackStyle = getComputedStyle(track);
      const summaryStyle = getComputedStyle(summary);

      return {
        animationName: trackStyle.animationName,
        runningAnimations: track.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
        summary: {
          contained: Boolean(
            marqueeRect
            && summaryRect
            && summaryRect.left >= marqueeRect.left - 1
            && summaryRect.right <= marqueeRect.right + 1
            && summaryRect.top >= marqueeRect.top - 1
            && summaryRect.bottom <= marqueeRect.bottom + 1
          ),
          scrollWidth: summary.scrollWidth,
          text: summary.textContent?.trim() ?? "",
          visible: Boolean(
            summaryRect
            && summaryRect.width > 10
            && summaryRect.height > 10
            && summaryStyle.visibility !== "hidden"
          ),
          width: summary.clientWidth,
        },
        transform: trackStyle.transform,
        willChange: trackStyle.willChange,
        windowVisible: Boolean(
          windowRect
          && windowRect.width > 10
          && windowRect.height > 10
          && getComputedStyle(marqueeWindow).display !== "none"
        ),
      };
    });
    assert.deepEqual(contact, {
      animationName: "none",
      runningAnimations: 0,
      summary: {
        contained: true,
        scrollWidth: contact.summary.width,
        text: "For project collaborations, technical consulting, or career opportunities, feel free to reach out.",
        visible: true,
        width: contact.summary.width,
      },
      transform: "none",
      willChange: "auto",
      windowVisible: false,
    });

    const menuButton = page.locator('button[aria-controls="primary-navigation"]');
    await menuButton.click();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ));
    const transitionDelays = await page.locator("#primary-navigation a").evaluateAll(
      (links) => links.flatMap((link) => (
        getComputedStyle(link).transitionDelay
          .split(",")
          .map((delay) => Number.parseFloat(delay) || 0)
      )),
    );
    assert.equal(
      transitionDelays.every((delay) => delay === 0),
      true,
      `reduced-motion menu retained stagger delays: ${transitionDelays.join(", ")}`,
    );
  } finally {
    await context.close();
  }
});

test("reduced-motion desktop keeps all content visible and ambient loops stopped", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
    ));

    const state = await page.evaluate(() => {
      const reveal = Array.from(document.querySelectorAll(".reveal")).map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          animationName: style.animationName,
          height: rect.height,
          opacity: style.opacity,
          transform: style.transform,
          visibility: style.visibility,
          width: rect.width,
        };
      });
      const runningAnimations = Array.from(
        document.querySelectorAll("[data-motion-layer], .hero-pixel-portrait"),
      ).flatMap((element) => (
        element.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running")
          .map((animation) => ({
            targetClass: animation.effect?.target?.className ?? null,
            type: animation.constructor.name,
          }))
      ));

      return {
        about: {
          contextCount: document.querySelectorAll("#about .about-context").length,
          forbiddenCount: document.querySelectorAll(
            "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
              + "#about [role='tablist'], #about [role='tabpanel']",
          ).length,
          introductionText: document.querySelector("#about .about-introduction")
            ?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          stepLabels: Array.from(document.querySelectorAll("#about .about-loop-label"))
            .map((element) => element.textContent?.trim() ?? ""),
          travelMap: {
            routeAnimationNames: [...new Set(Array.from(
              document.querySelectorAll(".travel-map-route-path"),
            ).map((element) => getComputedStyle(element).animationName))],
            routeCount: document.querySelectorAll(".travel-map-route").length,
            svgRole: document.querySelector(".travel-map-canvas")?.getAttribute("role"),
          },
        },
        contactMarquee: {
          animationName: getComputedStyle(
            document.querySelector(".contact-marquee-track"),
          ).animationName,
          transform: getComputedStyle(
            document.querySelector(".contact-marquee-track"),
          ).transform,
        },
        experienceGuide: {
          animationCount: document.querySelector(".experience-log")
            ?.getAnimations({ subtree: true }).length,
          nodeAnimation: getComputedStyle(
            document.querySelector(".timeline-node"),
            "::before",
          ).animationName,
          scanCount: document.querySelectorAll(".experience-scan-track").length,
          traceMotion: document.querySelector("#experience")?.getAttribute("data-trace-motion"),
          traceProgress: document.querySelector(".experience-log")
            ?.getAttribute("data-trace-progress"),
        },
        researchMotion: Array.from(
          document.querySelectorAll(".research-canvas"),
        ).map((canvas) => canvas.getAttribute("data-motion")),
        reveal,
        runningAnimations,
      };
    });

    for (const reveal of state.reveal) {
      assert.equal(reveal.animationName, "none");
      assert.equal(reveal.opacity, "1");
      assert.equal(reveal.transform, "none");
      assert.equal(reveal.visibility, "visible");
      assert.ok(reveal.width > 0 && reveal.height > 0);
    }
    assert.deepEqual(state.contactMarquee, {
      animationName: "none",
      transform: "none",
    });
    assert.deepEqual(state.experienceGuide, {
      animationCount: 0,
      nodeAnimation: "none",
      scanCount: 0,
      traceMotion: null,
      traceProgress: null,
    });
    assert.deepEqual(state.about, {
      contextCount: 0,
      forbiddenCount: 0,
      introductionText: "I'm Jaxon. I build agents and multimodal systems whose behavior can "
        + "be observed, tested, and improved.",
      stepLabels: ["FRAME", "CONNECT", "OBSERVE", "VERIFY"],
      travelMap: {
        routeAnimationNames: ["none"],
        routeCount: generatedTravelData.counts.routes,
        svgRole: "img",
      },
    });
    assert.deepEqual(state.researchMotion, ["reduced", "reduced"]);
    assert.deepEqual(
      state.runningAnimations,
      [],
      `reduced motion retained running animations: ${JSON.stringify(state.runningAnimations)}`,
    );

    await page.locator("#research").focus();
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => document.querySelector(".paper-link")?.matches(":focus-visible"));
    const reducedPacket = page.locator(".research-packet").first();
    await page.waitForFunction(() => (
      document.querySelector(".research-packet")
        ?.getAnimations({ subtree: true })
        .every((animation) => animation.playState !== "running")
    ));
    const beforePointer = await reducedPacket.evaluate((element) => ({
      focusVisible: element.querySelector(".paper-link")?.matches(":focus-visible") ?? false,
      haloBackground: getComputedStyle(element, "::before").backgroundImage,
      mode: element.getAttribute("data-research-spotlight"),
      runningAnimations: element.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length,
      x: element.style.getPropertyValue("--research-spotlight-x"),
      y: element.style.getPropertyValue("--research-spotlight-y"),
    }));
    const reducedBox = await reducedPacket.boundingBox();
    assert.ok(reducedBox, "the reduced-motion research packet should have a rendered box");
    await page.mouse.move(
      reducedBox.x + reducedBox.width * 0.8,
      reducedBox.y + reducedBox.height * 0.2,
    );
    await page.waitForTimeout(50);
    const afterPointer = await reducedPacket.evaluate((element) => ({
      haloBackground: getComputedStyle(element, "::before").backgroundImage,
      mode: element.getAttribute("data-research-spotlight"),
      x: element.style.getPropertyValue("--research-spotlight-x"),
      y: element.style.getPropertyValue("--research-spotlight-y"),
    }));
    assert.equal(beforePointer.focusVisible, true);
    assert.equal(beforePointer.haloBackground.includes("radial-gradient"), false);
    assert.equal(beforePointer.mode, null);
    assert.equal(beforePointer.runningAnimations, 0);
    assert.deepEqual(afterPointer, {
      haloBackground: beforePointer.haloBackground,
      mode: null,
      x: beforePointer.x,
      y: beforePointer.y,
    });
  } finally {
    await context.close();
  }
});

test("Context path exposes one complete static reading order", { timeout: 15_000 }, async () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    const { context, page } = await createReleasePageSession(browser, { viewport });

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.locator("#about").scrollIntoViewIfNeeded();

      const ledger = await page.locator("#about").evaluate((section) => {
        const visible = (element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0
            && rect.height > 0
            && style.display !== "none"
            && style.visibility !== "hidden"
            && Number.parseFloat(style.opacity) > 0;
        };

        const introductionElement = section.querySelector(".about-introduction");
        const travelMapElement = section.querySelector(".about-travel");
        const travelMapDock = section.querySelector(".travel-map-dock");
        const loopElement = section.querySelector(".about-working-loop");
        const routeKeys = Array.from(section.querySelectorAll(".travel-map-route"))
          .map((route) => route.getAttribute("data-route-key") ?? "");

        return {
          contextCount: section.querySelectorAll(".about-context").length,
          forbiddenCount: section.querySelectorAll(
            "canvas, [class*='about-particle'], [role='tab'], [role='tablist'], "
              + "[role='tabpanel'], [aria-selected], button:not(.travel-map-flag-button)",
          ).length,
          labelledBy: section.querySelector(".about-working-loop")
            ?.getAttribute("aria-labelledby"),
          loopTitle: section.querySelector("#about-loop-title")?.textContent?.trim() ?? "",
          introduction: introductionElement ? {
            text: introductionElement.textContent?.replace(/\s+/g, " ").trim() ?? "",
            visible: visible(introductionElement),
          } : null,
          readingOrder: Boolean(
            introductionElement
            && travelMapElement
            && loopElement
            && (introductionElement.compareDocumentPosition(travelMapElement)
              & Node.DOCUMENT_POSITION_FOLLOWING)
            && (travelMapElement.compareDocumentPosition(loopElement)
              & Node.DOCUMENT_POSITION_FOLLOWING)
          ),
          steps: Array.from(section.querySelectorAll(".about-loop-step")).map((step) => ({
            detail: step.querySelector(".about-loop-detail")?.textContent?.trim() ?? "",
            index: step.querySelector(".about-loop-index")?.textContent?.trim() ?? "",
            label: step.querySelector(".about-loop-label")?.textContent?.trim() ?? "",
            outcome: step.querySelector(".about-loop-outcome strong")?.textContent?.trim() ?? "",
            visible: visible(step),
          })),
          travelMap: travelMapElement ? {
            airportCount: travelMapElement.querySelectorAll(".travel-map-airport").length,
            bidirectionalRouteCount: travelMapElement.querySelectorAll(
              '.travel-map-route[data-route-direction="both"]',
            ).length,
            compactDock: Boolean(
              travelMapDock
              && travelMapDock.querySelector(".travel-map-dock-status")
              && travelMapDock.querySelector(".travel-map-flags-scroll")
            ),
            copy: travelMapElement.textContent?.replace(/\s+/g, " ").trim() ?? "",
            filterStatus: {
              label: travelMapElement.querySelector(".travel-map-filter-status span")
                ?.textContent?.trim() ?? "",
              value: travelMapElement.querySelector(".travel-map-filter-status strong")
                ?.textContent?.trim() ?? "",
            },
            flagButtons: Array.from(
              travelMapElement.querySelectorAll(".travel-map-flag-button"),
            ).map((button) => ({
              ariaControls: button.getAttribute("aria-controls"),
              ariaPressed: button.getAttribute("aria-pressed"),
              filterValue: button.closest("li")?.getAttribute("data-filter-value") ?? "",
              name: button.querySelector(".sr-only")?.textContent?.trim() ?? "",
              selected: button.closest("li")?.getAttribute("data-selected"),
              type: button.getAttribute("type"),
            })),
            flagCount: travelMapElement.querySelectorAll(".travel-map-flags > li").length,
            lineRoutesOnly: Array.from(
              travelMapElement.querySelectorAll(".travel-map-route-path"),
            ).every((route) => {
              const path = route.getAttribute("d") ?? "";
              return path.includes(" L ") && !path.includes(" Q ");
            }),
            routeCount: routeKeys.length,
            routesUnique: new Set(routeKeys).size === routeKeys.length,
            stats: Array.from(travelMapElement.querySelectorAll(".travel-map-stats > div"))
              .map((entry) => ({
                label: entry.querySelector("dt")?.textContent?.trim() ?? "",
                leadingZeroHidden: entry.querySelector(".travel-map-stat-leading-zero")
                  ?.getAttribute("aria-hidden") ?? null,
                value: entry.querySelector("dd")?.textContent?.trim() ?? "",
                visible: visible(entry),
              })),
            svgRole: travelMapElement.querySelector(".travel-map-canvas")?.getAttribute("role"),
            title: travelMapElement.querySelector("#travel-map-title")?.textContent?.trim() ?? "",
            visible: visible(travelMapElement),
          } : null,
        };
      });

      assert.equal(ledger.labelledBy, "about-loop-title");
      assert.equal(ledger.loopTitle, "How I work.");
      assert.equal(ledger.forbiddenCount, 0);
      assert.equal(ledger.contextCount, 0);
      assert.equal(ledger.readingOrder, true);
      assert.deepEqual(
        ledger.steps.map(({ index, label, outcome }) => ({ index, label, outcome })),
        [
          { index: "01", label: "FRAME", outcome: "BOUNDARY" },
          { index: "02", label: "CONNECT", outcome: "SYSTEM" },
          { index: "03", label: "OBSERVE", outcome: "CLARITY" },
          { index: "04", label: "VERIFY", outcome: "EVIDENCE" },
        ],
      );
      assert.equal(ledger.steps.every(({ detail, visible }) => detail.length > 0 && visible), true);
      assert.deepEqual(ledger.introduction, {
        text: "I'm Jaxon. I build agents and multimodal systems whose behavior can be observed, "
          + "tested, and improved.",
        visible: true,
      });
      assert.ok(ledger.travelMap);
      assert.equal(ledger.travelMap.title, "Places leave a signal.");
      assert.equal(ledger.travelMap.svgRole, "img");
      assert.equal(ledger.travelMap.visible, true);
      assert.equal(ledger.travelMap.airportCount, generatedTravelData.counts.airports);
      assert.equal(ledger.travelMap.bidirectionalRouteCount, generatedBidirectionalCorridors);
      assert.equal(ledger.travelMap.compactDock, true);
      assert.deepEqual(ledger.travelMap.filterStatus, {
        label: "Map filter",
        value: "All signals",
      });
      assert.equal(generatedTravelData.counts.countries, 9);
      assert.equal(ledger.travelMap.flagButtons.length, 9);
      assert.deepEqual(
        ledger.travelMap.flagButtons.map(({ filterValue }) => filterValue).sort(),
        generatedCountryCodes,
      );
      assert.deepEqual(
        ledger.travelMap.flagButtons
          .filter(({ ariaPressed, selected }) => ariaPressed === "true" || selected === "true")
          .map(({ filterValue }) => filterValue),
        [],
      );
      assert.equal(
        ledger.travelMap.flagButtons.every((button) => (
          button.ariaControls === "travel-map-canvas"
          && button.name.length > 0
          && button.type === "button"
        )),
        true,
      );
      assert.equal(ledger.travelMap.flagCount, 9);
      assert.equal(ledger.travelMap.lineRoutesOnly, true);
      assert.equal(ledger.travelMap.routeCount, generatedTravelData.counts.routes);
      assert.equal(ledger.travelMap.routesUnique, true);
      assert.deepEqual(ledger.travelMap.stats, [
        {
          label: "Countries / regions",
          leadingZeroHidden: generatedTravelData.counts.countries < 10 ? "true" : null,
          value: String(generatedTravelData.counts.countries).padStart(2, "0"),
          visible: true,
        },
      ]);
      assert.doesNotMatch(
        ledger.travelMap.copy,
        /Flight segments|Airports reached|Approximately [\d,]+ kilometers flown/i,
      );
      assert.doesNotMatch(ledger.travelMap.copy, /Trace window|DATA LAYER/i);
      assert.doesNotMatch(ledger.travelMap.copy, /Reset view/i);
    } finally {
      await context.close();
    }
  }
});

test("desktop travel region rail magnifies by proximity without shifting layout", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1440, height: 900 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    const rail = page.locator(".travel-map-flags-scroll");
    const flags = page.locator(".travel-map-flag-button");
    assert.equal(await flags.count(), 9);
    assert.deepEqual(
      (await flags.evaluateAll((items) => (
        items.map((button) => (
          button.closest("li")?.getAttribute("data-filter-value") ?? ""
        )).sort()
      ))),
      generatedCountryCodes,
    );
    assert.equal(
      await flags.evaluateAll((items) => (
        items.every((button) => button.getAttribute("aria-pressed") === "false")
      )),
      true,
    );
    assert.equal(await page.locator(".travel-map-flag-tooltip").count(), 0);

    const flag = page.getByRole("button", { exact: true, name: "Singapore" });
    assert.equal(await flag.getAttribute("aria-pressed"), "false");
    await flag.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);

    const readDockState = () => rail.evaluate((element) => {
      const rectSnapshot = (rect) => rect ? {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      } : null;
      const entries = Object.fromEntries(
        ["SG", "TH", "PH"].map((code) => {
          const item = element.querySelector(`li[data-country-code="${code}"]`);
          const button = item?.querySelector("button");
          const icon = item?.querySelector(".travel-map-flag-icon");
          const countryName = item?.querySelector(".travel-map-country-name");
          const countryNameRect = countryName?.getBoundingClientRect();
          const countryNameStyle = countryName ? getComputedStyle(countryName) : null;

          return [code, {
            buttonSize: button ? {
              height: button.getBoundingClientRect().height,
              width: button.getBoundingClientRect().width,
            } : null,
            countryName: countryName && countryNameRect && countryNameStyle ? {
              display: countryNameStyle.display,
              height: countryNameRect.height,
              text: countryName.textContent?.trim() ?? "",
              width: countryNameRect.width,
            } : null,
            iconRect: rectSnapshot(icon?.getBoundingClientRect()),
            influence: Number.parseFloat(
              item ? getComputedStyle(item).getPropertyValue("--travel-dock-influence") : "0",
            ) || 0,
            itemRect: rectSnapshot(item?.getBoundingClientRect()),
          }];
        }),
      );

      return {
        dockRect: rectSnapshot(element.closest(".travel-map-dock")?.getBoundingClientRect()),
        entries,
        focusedCode: document.activeElement?.closest("li")
          ?.getAttribute("data-country-code") ?? null,
        itemLayout: Array.from(element.querySelectorAll(".travel-map-flags > li"))
          .map((item) => ({
            buttonSize: (() => {
              const rect = item.querySelector("button")?.getBoundingClientRect();
              return rect ? { height: rect.height, width: rect.width } : null;
            })(),
            filterValue: item.getAttribute("data-filter-value"),
            itemRect: rectSnapshot(item.getBoundingClientRect()),
          })),
        proximity: element.getAttribute("data-dock-proximity"),
      };
    });
    const assertLayoutStable = (before, after, label) => {
      assert.ok(before.dockRect && after.dockRect, `${label} missed dock geometry`);
      for (const key of ["height", "left", "top", "width"]) {
        assert.ok(
          Math.abs(after.dockRect[key] - before.dockRect[key]) <= .75,
          `${label} moved dock.${key}: before=${JSON.stringify(before.dockRect)}, `
            + `after=${JSON.stringify(after.dockRect)}`,
        );
      }
      assert.equal(after.itemLayout.length, before.itemLayout.length);
      before.itemLayout.forEach((beforeItem, index) => {
        const afterItem = after.itemLayout[index];
        assert.equal(afterItem.filterValue, beforeItem.filterValue);
        assert.ok(beforeItem.itemRect && afterItem.itemRect, `${label} missed item geometry`);
        for (const key of ["height", "left", "top", "width"]) {
          assert.ok(
            Math.abs(afterItem.itemRect[key] - beforeItem.itemRect[key]) <= .75,
            `${label} moved ${beforeItem.filterValue}.${key}: `
              + `before=${JSON.stringify(beforeItem)}, after=${JSON.stringify(afterItem)}`,
          );
        }
        assert.ok(beforeItem.buttonSize && afterItem.buttonSize, `${label} missed button size`);
        assert.ok(
          Math.abs(afterItem.buttonSize.width - beforeItem.buttonSize.width) <= .75
            && Math.abs(afterItem.buttonSize.height - beforeItem.buttonSize.height) <= .75,
          `${label} resized ${beforeItem.filterValue}: `
            + `before=${JSON.stringify(beforeItem)}, after=${JSON.stringify(afterItem)}`,
        );
      });
    };

    const resting = await readDockState();
    assert.equal(resting.proximity, "idle");
    assert.equal(resting.focusedCode, null);
    assert.equal(resting.itemLayout.length, 9);
    assert.equal(
      new Set(resting.itemLayout.map(({ itemRect }) => itemRect.left.toFixed(1))).size,
      1,
    );
    assert.equal(
      new Set(resting.itemLayout.map(({ itemRect }) => itemRect.top.toFixed(1))).size,
      9,
    );
    assert.ok(
      resting.entries.SG.countryName
        && resting.entries.SG.countryName.display !== "none"
        && resting.entries.SG.countryName.text === "Singapore"
        && resting.entries.SG.countryName.width > 0
        && resting.entries.SG.countryName.height > 0,
      `desktop rail did not expose its persistent country name: ${JSON.stringify(resting)}`,
    );
    assert.deepEqual(
      [resting.entries.SG, resting.entries.TH, resting.entries.PH]
        .map(({ influence }) => influence),
      [0, 0, 0],
    );

    await flag.hover();
    await page.waitForFunction(() => (
      document.querySelector(".travel-map-flags-scroll")
        ?.getAttribute("data-dock-proximity") === "active"
    ));
    await page.waitForTimeout(250);
    const hovered = await readDockState();
    assertLayoutStable(resting, hovered, "hover");
    assert.equal(hovered.proximity, "active");
    assert.ok(
      hovered.entries.SG.influence > hovered.entries.TH.influence
        && hovered.entries.TH.influence > hovered.entries.PH.influence,
      `dock influence did not decay target > adjacent > far: ${JSON.stringify(hovered.entries)}`,
    );
    assert.ok(
      hovered.entries.SG.iconRect.height > hovered.entries.TH.iconRect.height + 1
        && hovered.entries.TH.iconRect.height > hovered.entries.PH.iconRect.height + 1,
      `flag magnification did not decay target > adjacent > far: ${JSON.stringify(hovered.entries)}`,
    );

    await page.mouse.move(0, 0);
    await page.waitForFunction(() => (
      document.querySelector(".travel-map-flags-scroll")
        ?.getAttribute("data-dock-proximity") === "idle"
    ));
    await page.waitForTimeout(300);
    const restored = await readDockState();
    assertLayoutStable(resting, restored, "pointer exit");
    assert.deepEqual(
      [restored.entries.SG, restored.entries.TH, restored.entries.PH]
        .map(({ influence }) => influence),
      [0, 0, 0],
    );
    for (const code of ["SG", "TH", "PH"]) {
      assert.ok(
        Math.abs(restored.entries[code].iconRect.height - resting.entries[code].iconRect.height)
          <= .75,
        `pointer exit did not restore ${code}: resting=${JSON.stringify(resting.entries[code])}, `
          + `restored=${JSON.stringify(restored.entries[code])}`,
      );
    }

    await flag.focus();
    await page.waitForTimeout(250);
    const focused = await readDockState();
    assert.equal(focused.focusedCode, "SG");
    assertLayoutStable(resting, focused, "focus");
    assert.equal(focused.entries.SG.countryName?.text, "Singapore");

    await flag.evaluate((button) => button.blur());
    await page.waitForTimeout(250);
    const blurred = await readDockState();
    assert.equal(blurred.focusedCode, null);
    assertLayoutStable(resting, blurred, "blur");
  } finally {
    await context.close();
  }
});

test("820px travel region rail renders one nine-column row", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 820, height: 1180 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    const rail = page.locator(".travel-map-flags-scroll");
    await rail.scrollIntoViewIfNeeded();

    const geometry = await rail.evaluate((element) => {
      const items = Array.from(element.querySelectorAll(".travel-map-flags > li"));
      const itemRects = items.map((item) => item.getBoundingClientRect());
      const coordinateCount = (values) => new Set(
        values.map((value) => value.toFixed(1)),
      ).size;

      return {
        buttonTargetsValid: items.every((item) => {
          const rect = item.querySelector("button")?.getBoundingClientRect();
          return rect && rect.width >= 44 && rect.height >= 44;
        }),
        columnCount: coordinateCount(itemRects.map(({ left }) => left)),
        filterValues: items.map((item) => item.getAttribute("data-filter-value")).sort(),
        itemCount: items.length,
        pageClientWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        pressedCount: items.filter((item) => (
          item.querySelector("button")?.getAttribute("aria-pressed") === "true"
        )).length,
        rowCount: coordinateCount(itemRects.map(({ top }) => top)),
        scrollClientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        selectedCount: items.filter((item) => item.getAttribute("data-selected") === "true").length,
      };
    });
    assert.equal(geometry.itemCount, 9);
    assert.equal(geometry.columnCount, 9);
    assert.equal(geometry.rowCount, 1);
    assert.deepEqual(geometry.filterValues, generatedCountryCodes);
    assert.equal(geometry.pressedCount, 0);
    assert.equal(geometry.selectedCount, 0);
    assert.equal(geometry.buttonTargetsValid, true);
    assert.ok(
      geometry.scrollWidth <= geometry.scrollClientWidth + 1,
      `tablet rail unexpectedly scrolled horizontally: ${JSON.stringify(geometry)}`,
    );
    assert.ok(
      geometry.pageScrollWidth <= geometry.pageClientWidth + 1,
      `tablet rail leaked into page overflow: ${JSON.stringify(geometry)}`,
    );
  } finally {
    await context.close();
  }
});

test("430px fine-pointer rail keeps fixed items and swaps ISO codes for names", { timeout: 20_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 430, height: 932 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".about-travel")?.getAttribute("data-map-ready") === "true"
      && document.querySelector(".travel-map-canvas")?.getAttribute("data-map-view") === "focus"
    ));

    const pointerMedia = await page.evaluate(() => ({
      fine: matchMedia("(pointer: fine)").matches,
      hover: matchMedia("(hover: hover)").matches,
    }));
    assert.deepEqual(pointerMedia, { fine: true, hover: true });

    const dock = page.locator(".travel-map-dock");
    const rail = page.locator(".travel-map-flags-scroll");
    const china = page.getByRole("button", { exact: true, name: "China" });
    await dock.scrollIntoViewIfNeeded();
    await china.scrollIntoViewIfNeeded();

    const fixedGeometry = await rail.evaluate((element) => (
      Array.from(element.querySelectorAll(".travel-map-flags > li")).map((item) => {
        const itemRect = item.getBoundingClientRect();
        const buttonRect = item.querySelector("button")?.getBoundingClientRect();
        return {
          button: buttonRect ? { height: buttonRect.height, width: buttonRect.width } : null,
          filterValue: item.getAttribute("data-filter-value"),
          item: {
            height: itemRect.height,
            left: itemRect.left,
            top: itemRect.top,
            width: itemRect.width,
          },
        };
      })
    ));
    assert.equal(fixedGeometry.length, 9);
    assert.equal(new Set(fixedGeometry.map(({ item }) => item.left.toFixed(1))).size, 9);
    assert.equal(new Set(fixedGeometry.map(({ item }) => item.top.toFixed(1))).size, 1);
    assert.equal(
      fixedGeometry.every(({ button, item }) => (
        button
        && Math.abs(button.width - 64) <= .75
        && Math.abs(button.height - 52) <= .75
        && Math.abs(item.width - 64) <= .75
        && Math.abs(item.height - 52) <= .75
      )),
      true,
      `fine-pointer rail changed its 64x52 footprint: ${JSON.stringify(fixedGeometry)}`,
    );
    const dividerClearance = await rail.evaluate((element) => {
      const railRect = element.getBoundingClientRect();
      const itemRects = Array.from(element.querySelectorAll(".travel-map-flags > li"))
        .map((item) => item.getBoundingClientRect());

      return {
        bottom: railRect.bottom - Math.max(...itemRects.map((rect) => rect.bottom)),
        top: Math.min(...itemRects.map((rect) => rect.top)) - railRect.top,
      };
    });
    assert.ok(
      dividerClearance.top >= 12 && dividerClearance.bottom >= 12,
      `flag controls were squeezed by their divider lines: ${JSON.stringify(dividerClearance)}`,
    );

    const readChinaState = () => china.evaluate((button) => {
      const item = button.closest("li");
      const itemRect = item?.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const countryName = button.querySelector(".travel-map-country-name");
      const regionCode = button.querySelector(".travel-map-region-code");
      const countryNameStyle = countryName ? getComputedStyle(countryName) : null;
      const regionCodeStyle = regionCode ? getComputedStyle(regionCode) : null;

      return {
        buttonSize: { height: buttonRect.height, width: buttonRect.width },
        countryName: countryName && countryNameStyle ? {
          display: countryNameStyle.display,
          opacity: Number.parseFloat(countryNameStyle.opacity),
          text: countryName.textContent?.trim() ?? "",
        } : null,
        focusVisible: button.matches(":focus-visible"),
        focused: document.activeElement === button,
        influence: Number.parseFloat(
          item ? getComputedStyle(item).getPropertyValue("--travel-dock-influence") : "0",
        ) || 0,
        itemSize: itemRect ? { height: itemRect.height, width: itemRect.width } : null,
        proximity: button.closest(".travel-map-flags-scroll")
          ?.getAttribute("data-dock-proximity"),
        regionCode: regionCode && regionCodeStyle ? {
          opacity: Number.parseFloat(regionCodeStyle.opacity),
          text: regionCode.textContent?.trim() ?? "",
        } : null,
      };
    });
    const assertFixedChina = (state, label) => {
      assert.ok(state.itemSize, `${label} missed item geometry`);
      assert.ok(
        Math.abs(state.itemSize.width - 64) <= .75
          && Math.abs(state.itemSize.height - 52) <= .75
          && Math.abs(state.buttonSize.width - 64) <= .75
          && Math.abs(state.buttonSize.height - 52) <= .75,
        `${label} changed the 64x52 footprint: ${JSON.stringify(state)}`,
      );
    };
    const assertNameHidden = (state, label) => {
      assert.equal(state.countryName?.display, "block");
      assert.equal(state.countryName?.text, "China");
      assert.ok(
        state.countryName.opacity <= .05 && state.regionCode?.opacity >= .95,
        `${label} did not restore the ISO label: ${JSON.stringify(state)}`,
      );
      assert.equal(state.regionCode?.text, "CN");
    };
    const assertNameVisible = (state, label) => {
      assert.ok(
        state.countryName?.opacity >= .95 && state.regionCode?.opacity <= .05,
        `${label} did not replace ISO with the country name: ${JSON.stringify(state)}`,
      );
      assert.equal(state.countryName?.text, "China");
      assert.equal(state.regionCode?.text, "CN");
    };

    const resting = await readChinaState();
    assert.equal(resting.proximity, "idle");
    assertNameHidden(resting, "rest");
    assertFixedChina(resting, "rest");

    await china.hover();
    await page.waitForFunction(() => (
      document.querySelector(".travel-map-flags-scroll")
        ?.getAttribute("data-dock-proximity") === "active"
    ));
    await page.waitForTimeout(250);
    const hovered = await readChinaState();
    assert.equal(hovered.proximity, "active");
    assert.ok(hovered.influence >= .95, `hover missed China: ${JSON.stringify(hovered)}`);
    assertNameVisible(hovered, "hover");
    assertFixedChina(hovered, "hover");

    await page.mouse.move(0, 0);
    await page.waitForFunction(() => (
      document.querySelector(".travel-map-flags-scroll")
        ?.getAttribute("data-dock-proximity") === "idle"
    ));
    await page.waitForTimeout(250);
    const restored = await readChinaState();
    assertNameHidden(restored, "pointer exit");
    assertFixedChina(restored, "pointer exit");

    await china.focus();
    if (!await china.evaluate((button) => button.matches(":focus-visible"))) {
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
    }
    await page.waitForTimeout(250);
    const focused = await readChinaState();
    assert.equal(focused.focused, true);
    assert.equal(focused.focusVisible, true);
    assert.equal(focused.proximity, "idle");
    assert.ok(focused.influence >= .95, `focus missed China: ${JSON.stringify(focused)}`);
    assertNameVisible(focused, "focus");
    assertFixedChina(focused, "focus");

    await china.evaluate((button) => button.blur());
    await page.waitForTimeout(250);
    const blurred = await readChinaState();
    assert.equal(blurred.focused, false);
    assertNameHidden(blurred, "blur");
    assertFixedChina(blurred, "blur");
  } finally {
    await context.close();
  }
});

test("430px touch travel map rests on native rail scrolling without moving the focus view", { timeout: 30_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    viewport: { width: 430, height: 932 },
  });
  const airportByIata = new Map(
    generatedTravelData.airports.map((airport) => [airport.iata, airport]),
  );
  const expectedEmphasis = (countryCode) => {
    const activeAirports = generatedTravelData.airports.filter(
      (airport) => airport.countryCode === countryCode,
    ).length;
    const activeRoutes = generatedTravelData.routes.filter((route) => (
      airportByIata.get(route.from)?.countryCode === countryCode
      || airportByIata.get(route.to)?.countryCode === countryCode
    )).length;

    return {
      airports: {
        active: activeAirports,
        idle: 0,
        muted: generatedTravelData.counts.airports - activeAirports,
      },
      routes: {
        active: activeRoutes,
        idle: 0,
        muted: generatedTravelData.counts.routes - activeRoutes,
      },
    };
  };

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".about-travel")?.getAttribute("data-map-ready") === "true"
      && document.querySelector(".travel-map-canvas")?.getAttribute("data-map-view") === "focus"
      && Number.parseFloat(getComputedStyle(
        document.querySelector(".travel-map-canvas"),
      ).opacity) >= 0.99
      && getComputedStyle(document.querySelector(".travel-map-loading")).display === "none"
    ));

    const dock = page.locator(".travel-map-dock");
    const flagScroll = page.locator(".travel-map-flags-scroll");
    const flagButtons = page.locator(".travel-map-flag-button");
    const china = page.getByRole("button", { exact: true, name: "China" });
    const australia = page.getByRole("button", { exact: true, name: "Australia" });
    await dock.scrollIntoViewIfNeeded();

    assert.equal(await flagButtons.count(), 9);
    assert.equal(await china.count(), 1);
    assert.equal(await australia.count(), 1);

    const mobileGeometry = await page.evaluate(() => {
      const dockElement = document.querySelector(".travel-map-dock");
      const scrollElement = document.querySelector(".travel-map-flags-scroll");
      const scrollStyle = scrollElement ? getComputedStyle(scrollElement) : null;
      const dockRect = dockElement?.getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll(".travel-map-flag-button"));
      const items = Array.from(document.querySelectorAll(".travel-map-flags > li"));
      const itemRects = items.map((item) => {
        const rect = item.getBoundingClientRect();
        return { left: rect.left, top: rect.top };
      });
      const coordinateCount = (values) => new Set(
        values.map((value) => value.toFixed(1)),
      ).size;

      return {
        buttonSizes: buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
        columnCount: coordinateCount(itemRects.map(({ left }) => left)),
        dockContained: Boolean(
          dockRect
          && dockRect.left >= -1
          && dockRect.right <= innerWidth + 1
        ),
        dockProximity: scrollElement?.getAttribute("data-dock-proximity") ?? null,
        itemCount: itemRects.length,
        pageClientWidth: document.documentElement.clientWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
        rowCount: coordinateCount(itemRects.map(({ top }) => top)),
        scrollClientWidth: scrollElement?.clientWidth ?? 0,
        scrollMaskImage: scrollStyle?.maskImage ?? null,
        scrollOverflowX: scrollStyle?.overflowX ?? null,
        scrollPointerEvents: scrollStyle?.pointerEvents ?? null,
        scrollTouchAction: scrollStyle?.touchAction ?? null,
        scrollWebkitMaskImage: scrollStyle?.webkitMaskImage ?? null,
        scrollWidth: scrollElement?.scrollWidth ?? 0,
        windowScrollX: scrollX,
      };
    });
    assert.equal(mobileGeometry.dockContained, true);
    assert.equal(mobileGeometry.itemCount, 9);
    assert.equal(mobileGeometry.columnCount, 9);
    assert.equal(mobileGeometry.rowCount, 1);
    assert.equal(mobileGeometry.dockProximity, "idle");
    assert.equal(mobileGeometry.scrollOverflowX, "auto");
    assert.notEqual(mobileGeometry.scrollPointerEvents, "none");
    assert.match(mobileGeometry.scrollTouchAction, /^(auto|manipulation|.*\bpan-x\b.*)$/);
    assert.equal(mobileGeometry.scrollMaskImage, "none");
    assert.equal(mobileGeometry.scrollWebkitMaskImage, "none");
    assert.ok(
      mobileGeometry.scrollWidth > mobileGeometry.scrollClientWidth,
      `signal rail did not create internal horizontal overflow: ${JSON.stringify(mobileGeometry)}`,
    );
    assert.equal(
      mobileGeometry.buttonSizes.every(({ height, width }) => height >= 44 && width >= 44),
      true,
      `flag buttons missed the 44px touch target: ${JSON.stringify(mobileGeometry.buttonSizes)}`,
    );
    assert.ok(
      mobileGeometry.pageScrollWidth <= mobileGeometry.pageClientWidth + 1,
      `flag dock leaked into page overflow: ${JSON.stringify(mobileGeometry)}`,
    );
    assert.equal(mobileGeometry.windowScrollX, 0);

    const readRailMotion = () => flagScroll.evaluate((element) => ({
      motion: element.getAttribute("data-rail-motion"),
      proximity: element.getAttribute("data-dock-proximity"),
      scrollLeft: element.scrollLeft,
    }));
    await page.waitForFunction(() => (
      document.querySelector(".travel-map-flags-scroll")
        ?.getAttribute("data-rail-motion") === "manual"
    ), null, { timeout: 2_500 });
    const restingStart = await readRailMotion();
    await page.waitForTimeout(750);
    const restingEnd = await readRailMotion();
    assert.deepEqual(restingEnd, restingStart, "touch rail moved without user input");

    const manualScrollLeft = await flagScroll.evaluate((element) => {
      element.scrollLeft = Math.min(96, element.scrollWidth - element.clientWidth);
      return element.scrollLeft;
    });
    assert.ok(
      manualScrollLeft > restingEnd.scrollLeft,
      `native rail did not accept horizontal scrolling: ${manualScrollLeft}`,
    );
    await flagScroll.evaluate((element) => { element.scrollLeft = 0; });
    assert.deepEqual(await readRailMotion(), {
      motion: "manual",
      proximity: "idle",
      scrollLeft: 0,
    });

    const readMapState = () => page.locator(".about-travel").evaluate((figure) => {
      const countEmphasis = (selector) => ({
        active: figure.querySelectorAll(`${selector}[data-emphasis="active"]`).length,
        idle: figure.querySelectorAll(`${selector}[data-emphasis="idle"]`).length,
        muted: figure.querySelectorAll(`${selector}[data-emphasis="muted"]`).length,
      });
      const activeElement = document.activeElement;

      return {
        airports: countEmphasis(".travel-map-airport"),
        buttonStates: Array.from(figure.querySelectorAll(".travel-map-flag-button"))
          .map((button) => ({
            ariaControls: button.getAttribute("aria-controls"),
            ariaPressed: button.getAttribute("aria-pressed"),
            filterValue: button.closest("li")?.getAttribute("data-filter-value") ?? "",
            name: button.querySelector(".sr-only")?.textContent?.trim() ?? "",
            type: button.getAttribute("type"),
          })),
        filterActive: figure.getAttribute("data-filter-active"),
        filterStatus: figure.querySelector(".travel-map-filter-status strong")
          ?.textContent?.trim() ?? "",
        focusedFilterValue: activeElement?.closest("li")
          ?.getAttribute("data-filter-value") ?? null,
        loadingDisplay: getComputedStyle(
          figure.querySelector(".travel-map-loading"),
        ).display,
        mapCanvasOpacity: Number.parseFloat(getComputedStyle(
          figure.querySelector(".travel-map-canvas"),
        ).opacity),
        mapReady: figure.getAttribute("data-map-ready"),
        mapView: figure.querySelector(".travel-map-canvas")?.getAttribute("data-map-view"),
        routes: countEmphasis(".travel-map-route"),
        selectedValues: Array.from(figure.querySelectorAll('.travel-map-flags li[data-selected="true"]'))
          .map((item) => item.getAttribute("data-filter-value") ?? ""),
        viewBox: figure.querySelector(".travel-map-canvas")?.getAttribute("viewBox"),
      };
    });
    const initial = await readMapState();
    assert.equal(initial.filterActive, "false");
    assert.equal(initial.filterStatus, "All signals");
    assert.equal(initial.loadingDisplay, "none");
    assert.equal(initial.mapCanvasOpacity, 1);
    assert.equal(initial.mapReady, "true");
    assert.equal(initial.mapView, "focus");
    assert.notEqual(initial.viewBox, "0 0 800 400");
    assert.deepEqual(initial.selectedValues, []);
    assert.deepEqual(initial.airports, {
      active: 0,
      idle: generatedTravelData.counts.airports,
      muted: 0,
    });
    assert.deepEqual(initial.routes, {
      active: 0,
      idle: generatedTravelData.counts.routes,
      muted: 0,
    });
    assert.deepEqual(
      initial.buttonStates.map(({ filterValue }) => filterValue).sort(),
      generatedCountryCodes,
    );
    assert.equal(
      initial.buttonStates.every((button) => (
        button.ariaControls === "travel-map-canvas"
        && button.name.length > 0
        && button.type === "button"
      )),
      true,
    );
    assert.deepEqual(
      initial.buttonStates
        .filter(({ ariaPressed }) => ariaPressed === "true")
        .map(({ filterValue }) => filterValue),
      [],
    );

    const assertSelectedCountry = (state, countryCode, countryName) => {
      const expected = expectedEmphasis(countryCode);
      assert.equal(state.filterActive, "true");
      assert.equal(state.filterStatus, countryName);
      assert.equal(state.mapView, "focus");
      assert.equal(state.viewBox, initial.viewBox);
      assert.deepEqual(state.selectedValues, [countryCode]);
      assert.deepEqual(
        state.buttonStates.filter(({ ariaPressed }) => ariaPressed === "true")
          .map(({ filterValue }) => filterValue),
        [countryCode],
      );
      assert.deepEqual(state.airports, expected.airports);
      assert.deepEqual(state.routes, expected.routes);
    };
    const assertCleared = (state) => {
      assert.equal(state.filterActive, "false");
      assert.equal(state.filterStatus, "All signals");
      assert.equal(state.mapView, "focus");
      assert.equal(state.viewBox, initial.viewBox);
      assert.deepEqual(state.selectedValues, []);
      assert.deepEqual(
        state.buttonStates.filter(({ ariaPressed }) => ariaPressed === "true")
          .map(({ filterValue }) => filterValue),
        [],
      );
      assert.deepEqual(state.airports, initial.airports);
      assert.deepEqual(state.routes, initial.routes);
    };

    await china.tap();
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="CN"] button')
        ?.getAttribute("aria-pressed") === "true"
    ));
    assertSelectedCountry(await readMapState(), "CN", "China");

    await china.tap();
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="CN"] button')
        ?.getAttribute("aria-pressed") === "false"
    ));
    assertCleared(await readMapState());

    await australia.scrollIntoViewIfNeeded();
    await australia.tap();
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="AU"] button')
        ?.getAttribute("aria-pressed") === "true"
    ));
    assertSelectedCountry(await readMapState(), "AU", "Australia");

    await australia.tap();
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="AU"] button')
        ?.getAttribute("aria-pressed") === "false"
    ));
    assertCleared(await readMapState());

    await china.scrollIntoViewIfNeeded();
    await china.tap();
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="CN"] button')
        ?.getAttribute("aria-pressed") === "true"
    ));
    await china.press("Escape");
    await page.waitForFunction(() => (
      document.querySelector('.travel-map-flags li[data-country-code="CN"] button')
        ?.getAttribute("aria-pressed") === "false"
    ));
    const escaped = await readMapState();
    assertCleared(escaped);
    assert.equal(escaped.focusedFilterValue, "CN");
  } finally {
    await context.close();
  }
});

test("touch-only users return to the resting control style after tapping", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 440, height: 956 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const touchMedia = await page.evaluate(() => ({
      coarsePointer: matchMedia("(pointer: coarse)").matches,
      fineHover: matchMedia("(hover: hover) and (pointer: fine)").matches,
    }));
    assert.equal(touchMedia.coarsePointer, true);
    assert.equal(touchMedia.fineHover, false);

    const activeHoverSelectors = await page.evaluate(() => {
      const matched = [];
      const targetSelectors = [
        ".signal-button:hover",
        ".paper-link:hover",
        ".contact-socials a:hover",
      ];
      const walk = (rules, active) => {
        for (const rule of rules) {
          const conditionActive = rule.type === CSSRule.MEDIA_RULE
            ? active && matchMedia(rule.conditionText).matches
            : active;

          if (
            conditionActive
            && typeof rule.selectorText === "string"
            && targetSelectors.some((selector) => rule.selectorText.includes(selector))
          ) {
            matched.push(rule.selectorText);
          }

          if (rule.cssRules) {
            walk(rule.cssRules, conditionActive);
          }
        }
      };

      for (const sheet of document.styleSheets) {
        walk(sheet.cssRules, true);
      }

      return matched;
    });
    assert.deepEqual(
      activeHoverSelectors,
      [],
      `touch-only viewport activated hover rules: ${activeHoverSelectors.join(", ")}`,
    );

    await page.evaluate(() => {
      document.addEventListener("click", (event) => {
        if (
          event.target instanceof Element
          && event.target.closest(
            '.hero-cta, a[href="https://ieeexplore.ieee.org/document/9831898"], a[href="mailto:jaxonhu01@gmail.com"]',
          )
        ) {
          event.preventDefault();
        }
      }, true);
    });

    const controlSelectors = [
      'a.hero-cta[href="#about"]',
      'a[href="https://ieeexplore.ieee.org/document/9831898"]',
      'a[href="mailto:jaxonhu01@gmail.com"]',
    ];
    for (const selector of controlSelectors) {
      const control = page.locator(selector);
      assert.equal(await control.count(), 1, `${selector} was not unique`);
      await control.scrollIntoViewIfNeeded();
      const restingStyle = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        const transform = new DOMMatrixReadOnly(style.transform);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = 1;
        canvas.height = 1;
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);

        return {
          backgroundColor: style.backgroundColor,
          backgroundPixel: Array.from(context.getImageData(0, 0, 1, 1).data),
          boxShadow: style.boxShadow,
          color: style.color,
          transform: {
            a: transform.a,
            b: transform.b,
            c: transform.c,
            d: transform.d,
            e: transform.e,
            f: transform.f,
          },
        };
      });

      await control.tap();
      await page.waitForFunction(
        (targetSelector) => {
          const element = document.querySelector(targetSelector);
          return element instanceof Element && !element.matches(":active");
        },
        selector,
        { polling: "raf", timeout: 1_000 },
      );
      await control.evaluate(async (element) => {
        const nextFrame = () => new Promise((resolveFrame) => {
          requestAnimationFrame(resolveFrame);
        });

        // A fixed delay can sample the outgoing :active transition mid-frame
        // on a busy CI runner. Once :active has actually cleared, wait for the
        // browser's release transition and allow the settled style to paint.
        await nextFrame();
        await Promise.allSettled(
          element.getAnimations({ subtree: true })
            .filter((animation) => Number.isFinite(animation.effect?.getTiming().iterations ?? 1))
            .map((animation) => animation.finished),
        );
        await nextFrame();
      });

      const releasedStyle = await control.evaluate((element) => {
        const style = getComputedStyle(element);
        const transform = new DOMMatrixReadOnly(style.transform);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = 1;
        canvas.height = 1;
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);

        return {
          backgroundColor: style.backgroundColor,
          backgroundPixel: Array.from(context.getImageData(0, 0, 1, 1).data),
          boxShadow: style.boxShadow,
          color: style.color,
          transform: {
            a: transform.a,
            b: transform.b,
            c: transform.c,
            d: transform.d,
            e: transform.e,
            f: transform.f,
          },
        };
      });
      assert.deepEqual(
        {
          boxShadow: releasedStyle.boxShadow,
          color: releasedStyle.color,
        },
        {
          boxShadow: restingStyle.boxShadow,
          color: restingStyle.color,
        },
        `${selector} kept a highlighted style after touch release`,
      );
      releasedStyle.backgroundPixel.forEach((channel, index) => {
        assert.ok(
          Math.abs(channel - restingStyle.backgroundPixel[index]) <= 1,
          `${selector} kept a highlighted background after touch release: `
            + `${releasedStyle.backgroundColor} vs ${restingStyle.backgroundColor}`,
        );
      });
      for (const component of ["a", "b", "c", "d", "e", "f"]) {
        assert.ok(
          Math.abs(
            releasedStyle.transform[component] - restingStyle.transform[component],
          ) <= 0.001,
          `${selector} kept a transformed state after touch release: ${JSON.stringify(releasedStyle.transform)}`,
        );
      }
    }
  } finally {
    await context.close();
  }
});

test("mobile navigation separates pointer focus from keyboard focus", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    hasTouch: true,
    isMobile: true,
    viewport: { width: 440, height: 956 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
    ), null, { timeout: 2_500 });

    const menuButton = page.locator('button[aria-controls="primary-navigation"]');
    const aboutLink = page.locator('#primary-navigation a[href="#about"]');

    await menuButton.tap({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ), null, { timeout: 2_500 });
    assert.equal(
      await page.locator("#primary-navigation a:focus").count(),
      0,
      "pointer-open moved focus into the navigation",
    );
    assert.equal(
      await page.locator("#primary-navigation a:focus-visible").count(),
      0,
      "pointer-open exposed a navigation focus ring",
    );

    await menuButton.tap({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
    ), null, { timeout: 2_500 });

    await menuButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
      && document.activeElement?.getAttribute("href") === "#about"
    ), null, { timeout: 2_500 });
    const keyboardFocus = await aboutLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        boxShadow: style.boxShadow,
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
      };
    });
    assert.equal(keyboardFocus.focusVisible, true, "keyboard-open did not focus the first link visibly");
    assert.equal(keyboardFocus.outlineStyle, "none", "mobile link kept the clipped external outline");
    assert.match(
      keyboardFocus.boxShadow,
      /rgb\(79, 247, 213\).*0px 0px 0px 2px inset/,
      "mobile link did not receive the inset focus ring",
    );

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
      && document.activeElement?.getAttribute("aria-controls") === "primary-navigation"
    ), null, { timeout: 2_500 });

    await menuButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
      && document.activeElement?.getAttribute("href") === "#about"
    ), null, { timeout: 2_500 });
    await page.keyboard.press("PageDown");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
      && document.activeElement?.getAttribute("aria-controls") === "primary-navigation"
    ), null, { timeout: 2_500 });
  } finally {
    await context.close();
  }
});

test("mobile menu state does not survive a desktop breakpoint round trip", { timeout: 10_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 900, height: 800 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
    ));

    const menuButton = page.locator('button[aria-controls="primary-navigation"]');
    await menuButton.click();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ));

    await page.setViewportSize({ width: 901, height: 800 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
      && !document.querySelector(".site-header")?.classList.contains("is-menu-open")
    ), null, { timeout: 2_500 });

    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector('[aria-controls="primary-navigation"]')).display !== "none"
    ));
    assert.equal(await menuButton.getAttribute("aria-expanded"), "false");
  } finally {
    await context.close();
  }
});

test("mobile menu reveals links with progressive transition delays", { timeout: 10_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
    ));

    await page.locator('button[aria-controls="primary-navigation"]').click();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ));
    const delays = await page.locator("#primary-navigation a").evaluateAll((links) => (
      links.map((link) => Math.max(
        ...getComputedStyle(link).transitionDelay
          .split(",")
          .map((delay) => Number.parseFloat(delay) || 0),
      ))
    ));

    assert.deepEqual(delays, [0, 0.12, 0.24, 0.36, 0.48]);
  } finally {
    await context.close();
  }
});

test("direct hash load keeps the native landing position through hydration", { timeout: 10_000 }, async () => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    const { context, page } = await createReleasePageSession(browser, { viewport });

    try {
      await page.addInitScript(() => {
        window.__hashLandingScrollSamples = [];
        window.addEventListener("scroll", () => {
          window.__hashLandingScrollSamples.push(window.scrollY);
        }, { passive: true });
      });

      await page.goto(`${origin}/#about`, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => (
        document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
        && document.activeElement?.id === "about"
      ));
      await page.waitForTimeout(100);

      const landing = await page.evaluate(() => {
        const target = document.querySelector("#about");
        const positiveSamples = window.__hashLandingScrollSamples.filter((sample) => sample > 1);
        return {
          finalScrollY: window.scrollY,
          finalTargetTop: target?.getBoundingClientRect().top ?? null,
          headerBottom: document.querySelector(".site-header")
            ?.getBoundingClientRect().bottom ?? null,
          heroCtaBottom: document.querySelector(".hero-cta")
            ?.getBoundingClientRect().bottom ?? null,
          positiveSamples,
          scrollMarginTop: target
            ? Number.parseFloat(getComputedStyle(target).scrollMarginTop)
            : null,
        };
      });

      assert.ok(
        landing.finalScrollY > 1,
        `${viewport.width}px browser did not land on the requested hash target`,
      );
      assert.ok(
        landing.scrollMarginTop > 0,
        `${viewport.width}px native landing had no reserved header offset`,
      );
      if (landing.positiveSamples.length > 1) {
        assert.ok(
          Math.max(...landing.positiveSamples) - Math.min(...landing.positiveSamples) <= 1,
          `${viewport.width}px hydration moved the native hash landing: ${JSON.stringify(landing)}`,
        );
      }
      assert.ok(
        Math.abs(landing.finalTargetTop - landing.scrollMarginTop) <= 1,
        `${viewport.width}px hydrated hash target ignored its scroll margin: ${JSON.stringify(landing)}`,
      );
      if (viewport.width <= 900) {
        assert.ok(
          Math.abs(landing.finalTargetTop - landing.headerBottom) <= 1,
          `${viewport.width}px hash target left previous-section content above the mobile header: `
            + JSON.stringify(landing),
        );
        assert.ok(
          landing.heroCtaBottom <= 0.5,
          `${viewport.width}px hash landing left the previous Hero CTA visible at the viewport top: `
            + JSON.stringify(landing),
        );
      }
    } finally {
      await context.close();
    }
  }
});

test("keyboard section navigation keeps logical focus without a full-width landmark outline", { timeout: 10_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const heroCta = page.locator(".hero-cta");
    await heroCta.focus();
    const triggerFocus = await heroCta.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      };
    });
    assert.equal(triggerFocus.focusVisible, true, "keyboard CTA focus was not visible");
    assert.equal(triggerFocus.outlineStyle, "solid", "interactive focus ring was removed");
    assert.equal(triggerFocus.outlineWidth, "2px", "interactive focus ring changed width");

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (
      location.hash === "#about"
      && document.activeElement?.id === "about"
    ));

    const sectionFocus = await page.locator("#about").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        focusVisible: element.matches(":focus-visible"),
        outlineStyle: style.outlineStyle,
      };
    });
    assert.equal(sectionFocus.focusVisible, true, "section lost its logical keyboard focus");
    assert.equal(sectionFocus.outlineStyle, "none", "section retained the full-width focus line");
  } finally {
    await context.close();
  }
});

test("browser history restores section state and sequential focus", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });
  const rscResponses = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.endsWith(".rsc")) {
      rscResponses.push({
        status: response.status(),
        url: response.url(),
      });
    }
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.__historyTraversalSentinel = "mounted";
    });

    const waitForNavigationState = async (hash, activeId) => {
      try {
        await page.waitForFunction(
          ({ expectedHash, expectedId }) => (
            location.hash === expectedHash
            && document.activeElement?.id === expectedId
            && (
              expectedId === "hero"
                ? (
                    scrollY === 0
                    && !document.querySelector("[aria-current='location']")
                  )
                : document.querySelector(`a[href="#${expectedId}"]`)
                  ?.getAttribute("aria-current") === "location"
            )
          ),
          { expectedHash: hash, expectedId: activeId },
          { timeout: 2_500 },
        );
      } catch (error) {
        const state = await page.evaluate(() => ({
          activeElementId: document.activeElement?.id ?? "",
          ariaCurrentHref: document.querySelector("[aria-current='location']")
            ?.getAttribute("href") ?? "",
          hash: location.hash,
          historyTraversalSentinel: window.__historyTraversalSentinel ?? "",
          scrollY,
        }));
        throw new Error(
          `Navigation did not settle at ${hash || "<root>"}/${activeId}: `
            + `${JSON.stringify({ ...state, rscResponses })}; ${String(error)}`,
        );
      }
    };

    const experienceLink = page.locator('a[href="#experience"]').first();
    const researchLink = page.locator('a[href="#research"]').first();

    await experienceLink.click();
    await waitForNavigationState("#experience", "experience");

    await researchLink.click();
    await waitForNavigationState("#research", "research");

    await page.evaluate(() => history.back());
    await waitForNavigationState("#experience", "experience");

    await page.evaluate(() => history.forward());
    await waitForNavigationState("#research", "research");

    await page.evaluate(() => history.back());
    await waitForNavigationState("#experience", "experience");

    await page.evaluate(() => history.back());
    await waitForNavigationState("", "hero");
    assert.equal(
      await page.evaluate(() => window.__historyTraversalSentinel),
      "mounted",
      "same-document history traversal reloaded the page",
    );
    assert.deepEqual(
      rscResponses,
      [],
      `same-document history traversal requested RSC payloads: ${JSON.stringify(rscResponses)}`,
    );

    await page.evaluate(() => {
      history.pushState(null, "", "#%E0%A4%A");
      window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    });
    await page.waitForFunction(() => (
      location.hash === "#%E0%A4%A"
      && scrollY === 0
      && document.activeElement?.id === "hero"
      && !document.querySelector("[aria-current='location']")
    ));
    assert.deepEqual(
      rscResponses,
      [],
      `malformed hash traversal requested RSC payloads: ${JSON.stringify(rscResponses)}`,
    );

    await page.evaluate(() => history.back());
    await waitForNavigationState("", "hero");
  } finally {
    await context.close();
  }
});

test("responsive boundary pairs stay usable and continuous", { timeout: 45_000 }, async () => {
  const boundaryViewports = [
    { width: 760, height: 1024 },
    { width: 761, height: 1024 },
    { width: 900, height: 800 },
    { width: 901, height: 800 },
    { width: 1100, height: 800 },
    { width: 1101, height: 800 },
    { width: 1279, height: 800 },
    { width: 1280, height: 800 },
  ];
  const samples = new Map();

  for (const viewport of boundaryViewports) {
    const { context, page } = await createReleasePageSession(browser, { viewport });

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => (
        document.documentElement.dataset.pageActive === "true"
        && document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
      ));

      const geometry = await measurePageGeometry(page, {
        cta: ".hero-cta",
        name: ".hero-name",
        portrait: ".hero-pixel-portrait",
      });
      const responsiveDetails = await page.evaluate(() => {
        const ctaLabel = document.querySelector(".hero-cta > span:first-child");
        const contact = document.querySelector(".contact-socials");
        const contactMarquee = document.querySelector(".contact-marquee-window");
        const contactSummary = document.querySelector(".contact-marquee-summary");
        const ctaRange = document.createRange();
        if (ctaLabel) ctaRange.selectNodeContents(ctaLabel);
        const educationColumn = document.querySelector(".education-column");
        const toolchainColumn = document.querySelector(".toolchain-column");
        const clippedContactLabels = Array.from(
          document.querySelectorAll(".endpoint-copy b, .endpoint-copy small"),
        ).filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent?.trim() ?? "");
        const clippedNavigationLabels = innerWidth > 900 ? Array.from(
          document.querySelectorAll("#primary-navigation a"),
        ).filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent?.trim() ?? "") : [];
        const experienceLogoMetrics = Array.from(
          document.querySelectorAll(".experience-entry-heading, .experience-group-heading"),
        ).map((heading) => {
          const textRects = Array.from(heading.querySelectorAll("h3, p")).map((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return range.getBoundingClientRect();
          });
          const logoRect = heading.querySelector(".experience-brand-logo")?.getBoundingClientRect();
          const rowRect = heading.closest(
            ".experience-row, .experience-group-header",
          )?.getBoundingClientRect();
          const textRight = Math.max(...textRects.map((rect) => rect.right));
          return textRects.length && logoRect ? {
            gap: logoRect.left - textRight,
            right: logoRect.right,
            rightInset: rowRect ? rowRect.right - logoRect.right : null,
          } : null;
        }).filter((metric) => metric !== null);
        const educationTimeline = document.querySelector(".education-timeline");
        const educationTimelineRect = educationTimeline?.getBoundingClientRect();
        const educationRailStyle = educationTimeline
          ? getComputedStyle(educationTimeline, "::before")
          : null;
        const educationRailCenter = educationTimelineRect && educationRailStyle
          ? educationTimelineRect.left
            + Number.parseFloat(educationRailStyle.left)
            + Number.parseFloat(educationRailStyle.width) / 2
          : null;
        const educationAxisOffsets = educationRailCenter === null ? [] : Array.from(
          document.querySelectorAll(".education-node"),
        ).map((node) => {
          const rect = node.getBoundingClientRect();
          return Math.abs(rect.left + rect.width / 2 - educationRailCenter);
        });
        const educationRect = educationColumn?.getBoundingClientRect();
        const toolchainRect = toolchainColumn?.getBoundingClientRect();
        const navCursorGeometry = innerWidth > 900 ? (() => {
          const link = document.querySelector('#primary-navigation a[href="#foundations"]');
          const label = link?.querySelector(".nav-link-label");
          const cursors = link?.querySelectorAll(".nav-link-cursor") ?? [];
          if (!link || !label || cursors.length !== 2) return null;
          const linkRect = link.getBoundingClientRect();
          const labelRect = label.getBoundingClientRect();
          const leftRect = cursors[0].getBoundingClientRect();
          const rightRect = cursors[1].getBoundingClientRect();
          return {
            contained: leftRect.left >= linkRect.left - 0.5
              && rightRect.right <= linkRect.right + 0.5,
            leftGap: labelRect.left - leftRect.right,
            rightGap: rightRect.left - labelRect.right,
          };
        })() : null;

        return {
          clippedContactLabels,
          clippedNavigationLabels,
          contactMarqueeVisible: (() => {
            const rect = contactMarquee?.getBoundingClientRect();
            return Boolean(
              rect
              && rect.width > 10
              && rect.height > 10
              && getComputedStyle(contactMarquee).display !== "none"
            );
          })(),
          contactSummaryVisible: (() => {
            const rect = contactSummary?.getBoundingClientRect();
            return Boolean(rect && rect.width > 10 && rect.height > 10);
          })(),
          contactColumnCount: getComputedStyle(contact)
            .gridTemplateColumns
            .split(" ")
            .filter(Boolean)
            .length,
          educationAxisOffsets,
          experienceLogoMetrics,
          foundationsColumnGap: educationRect && toolchainRect
            ? toolchainRect.top - educationRect.bottom
            : null,
          heroCtaLineCount: ctaLabel ? ctaRange.getClientRects().length : 0,
          navCursorGeometry,
          portraitCanvasCount: document.querySelectorAll(".hero-pixel-canvas").length,
          portraitFallbackCount: document.querySelectorAll(".hero-portrait-fallback").length,
          terminalCount: document.querySelectorAll(".hero-terminal").length,
        };
      });
      const {
        cta,
        name,
        portrait,
      } = geometry.boxes;
      const metrics = {
        clientWidth: geometry.clientWidth,
        ...responsiveDetails,
        intersections: {
          ctaPortrait: intersectionArea(cta, portrait),
          namePortrait: intersectionArea(name, portrait),
        },
        cta,
        name,
        scrollWidth: geometry.scrollWidth,
        portrait,
      };

      assert.equal(
        metrics.scrollWidth,
        metrics.clientWidth,
        `${viewport.width}px had horizontal overflow`,
      );
      assert.deepEqual(
        metrics.clippedContactLabels,
        [],
        `${viewport.width}px clipped contact labels: ${metrics.clippedContactLabels.join(", ")}`,
      );
      assert.deepEqual(
        metrics.clippedNavigationLabels,
        [],
        `${viewport.width}px clipped navigation labels: ${metrics.clippedNavigationLabels.join(", ")}`,
      );
      if (metrics.navCursorGeometry) {
        assert.equal(metrics.navCursorGeometry.contained, true);
        assert.ok(
          metrics.navCursorGeometry.leftGap >= 2
            && metrics.navCursorGeometry.rightGap >= 2,
          `${viewport.width}px navigation cursor gaps were `
            + `${JSON.stringify(metrics.navCursorGeometry)}`,
        );
      }
      assert.equal(
        metrics.contactMarqueeVisible,
        true,
        `${viewport.width}px hid the contact marquee at a responsive boundary`,
      );
      assert.equal(
        metrics.contactSummaryVisible,
        false,
        `${viewport.width}px exposed the accessible contact summary at a responsive boundary`,
      );
      assert.equal(
        metrics.contactColumnCount,
        viewport.width <= 760 ? 1 : viewport.width < 1280 ? 2 : 4,
        `${viewport.width}px used ${metrics.contactColumnCount} contact columns`,
      );
      assert.equal(metrics.portraitCanvasCount, 1);
      assert.equal(metrics.portraitFallbackCount, 1);
      assert.equal(metrics.terminalCount, 0);
      assert.ok(metrics.portrait.width > 0 && metrics.portrait.height > 0);
      assert.equal(
        metrics.heroCtaLineCount,
        1,
        `${viewport.width}px wrapped the hero CTA across ${metrics.heroCtaLineCount} lines`,
      );
      if (viewport.width <= 900) {
        assert.ok(
          metrics.name.bottom <= metrics.portrait.top + 1
            && metrics.portrait.bottom <= metrics.cta.top + 1,
          `${viewport.width}px mobile Hero order was not JAXON → portrait → CTA: `
            + `${JSON.stringify({ cta: metrics.cta, name: metrics.name, portrait: metrics.portrait })}`,
        );
      }
      if (viewport.width <= 760) {
        assert.ok(
          metrics.foundationsColumnGap >= 48 && metrics.foundationsColumnGap <= 72,
          `${viewport.width}px foundations column gap=${metrics.foundationsColumnGap}px`,
        );
      }
      if (viewport.width >= 1101) {
        const logoRightEdges = metrics.experienceLogoMetrics.map(({ right }) => right);
        assert.ok(
          Math.max(...logoRightEdges) - Math.min(...logoRightEdges) <= 0.75,
          `${viewport.width}px experience logo right edges diverged: ${logoRightEdges.join(", ")}`,
        );
        for (const { gap } of metrics.experienceLogoMetrics) {
          assert.ok(
            gap >= 12,
            `${viewport.width}px experience copy/logo gap=${gap}px`,
          );
        }
        for (const { rightInset } of metrics.experienceLogoMetrics) {
          assert.ok(
            rightInset !== null && Math.abs(rightInset) <= 0.75,
            `${viewport.width}px experience logo right inset=${rightInset}px`,
          );
        }
      }
      for (const offset of metrics.educationAxisOffsets) {
        assert.ok(
          offset <= 0.25,
          `${viewport.width}px education node/rail offset=${offset}px`,
        );
      }
      for (const [pair, area] of Object.entries(metrics.intersections)) {
        assert.ok(
          area <= 1,
          `${viewport.width}px hero ${pair} intersection=${area.toFixed(2)}px²`,
        );
      }
      samples.set(viewport.width, metrics);
    } finally {
      await context.close();
    }
  }

  for (const [leftWidth, rightWidth] of [[760, 761], [1100, 1101]]) {
    const left = samples.get(leftWidth);
    const right = samples.get(rightWidth);

    for (const element of ["name", "portrait"]) {
      for (const metric of ["top", "width", "height"]) {
        assert.ok(
          Math.abs(left[element][metric] - right[element][metric]) <= 4,
          `${leftWidth}/${rightWidth}px ${element}.${metric} jumped from `
            + `${left[element][metric]} to ${right[element][metric]}`,
        );
      }
    }
    assert.equal(left.portraitCanvasCount, right.portraitCanvasCount);
    assert.equal(left.portraitFallbackCount, right.portraitFallbackCount);
  }
});

test("desktop active navigation brackets hug the label without changing its name", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1024, height: 768 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    const foundationsLink = page.getByRole("link", { name: "FOUNDATIONS", exact: true });
    assert.equal(await foundationsLink.count(), 1);
    await foundationsLink.click();
    await page.waitForFunction(() => (
      document.querySelector('#primary-navigation a[href="#foundations"]')
        ?.getAttribute("aria-current") === "location"
    ));

    const geometry = await foundationsLink.evaluate((link) => {
      const label = link.querySelector(".nav-link-label");
      const cursors = link.querySelectorAll(".nav-link-cursor");
      const linkRect = link.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      const leftRect = cursors[0].getBoundingClientRect();
      const rightRect = cursors[1].getBoundingClientRect();
      return {
        cursorVisibility: Array.from(cursors).map((cursor) => (
          getComputedStyle(cursor).visibility
        )),
        leftGap: labelRect.left - leftRect.right,
        leftInside: leftRect.left >= linkRect.left - 0.5,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rightGap: rightRect.left - labelRect.right,
        rightInside: rightRect.right <= linkRect.right + 0.5,
      };
    });

    assert.deepEqual(geometry.cursorVisibility, ["visible", "visible"]);
    assert.ok(geometry.leftGap >= 2 && geometry.rightGap >= 2);
    assert.equal(geometry.leftInside, true);
    assert.equal(geometry.rightInside, true);
    assert.equal(geometry.overflow, 0);
  } finally {
    await context.close();
  }
});

test("left-side tracing beam wakes while scrolling, rests when idle, and stays static for reduced motion", { timeout: 25_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1280, height: 800 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-motion") !== "pending"
    ));

    const beam = page.locator(".site-tracing-beam");
    const initial = await beam.evaluate((element) => ({
      ariaHidden: element.getAttribute("aria-hidden"),
      count: document.querySelectorAll(".site-tracing-beam").length,
      leftGap: element.getBoundingClientRect().left,
      opacity: Number.parseFloat(getComputedStyle(element).opacity),
      pointerEvents: getComputedStyle(element).pointerEvents,
      progress: Number(element.getAttribute("data-trace-progress")),
      rightGap: innerWidth - element.getBoundingClientRect().right,
      visibility: element.getAttribute("data-trace-visibility"),
    }));
    assert.deepEqual({
      ariaHidden: initial.ariaHidden,
      count: initial.count,
      opacity: initial.opacity,
      pointerEvents: initial.pointerEvents,
      progress: initial.progress,
      visibility: initial.visibility,
    }, {
      ariaHidden: "true",
      count: 1,
      opacity: 0,
      pointerEvents: "none",
      progress: 0,
      visibility: "idle",
    });
    assert.ok(initial.leftGap <= 24, `tracing beam left gap was ${initial.leftGap}px`);
    assert.ok(initial.leftGap < initial.rightGap, "tracing beam remained on the right side");

    await page.evaluate(() => {
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo(0, maxScroll * 0.55);
    });
    await page.waitForFunction(() => (
      document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-visibility") === "active"
      && Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress")) >= 0.5
      && Number.parseFloat(getComputedStyle(document.querySelector(".site-tracing-beam")).opacity) >= 0.99
    ));
    const middleProgress = Number(await beam.getAttribute("data-trace-progress"));
    assert.ok(middleProgress >= 0.5 && middleProgress < 0.8);
    const activeHeadBounds = await beam.locator(".site-tracing-beam__head").boundingBox();
    assert.ok(activeHeadBounds, "active tracing head was missing");
    assert.ok(
      activeHeadBounds.x >= 0
        && activeHeadBounds.x + activeHeadBounds.width <= 1280,
      `active tracing head escaped the viewport: ${JSON.stringify(activeHeadBounds)}`,
    );
    await waitForTracingBeamIdle(page);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => (
      document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-visibility") === "active"
      && Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress")) >= 0.995
    ));
    assert.ok(Number(await beam.getAttribute("data-trace-progress")) >= 0.995);
  } finally {
    await context.close();
  }

  const reducedSession = await createReleasePageSession(browser, {
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  try {
    await reducedSession.page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await reducedSession.page.waitForFunction(() => (
      document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-motion") === "reduced"
      && document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-visibility") === "idle"
    ));
    const reducedBeam = reducedSession.page.locator(".site-tracing-beam");
    const reducedState = await reducedBeam.evaluate((element) => ({
      headDisplay: getComputedStyle(
        element.querySelector(".site-tracing-beam__head"),
      ).display,
      progressDisplay: getComputedStyle(
        element.querySelector(".site-tracing-beam__progress"),
      ).display,
      runningAnimations: element.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running").length,
      trackVisibility: getComputedStyle(
        element.querySelector(".site-tracing-beam__track"),
      ).visibility,
      opacity: Number.parseFloat(getComputedStyle(element).opacity),
    }));
    assert.deepEqual(reducedState, {
      headDisplay: "none",
      opacity: 0,
      progressDisplay: "none",
      runningAnimations: 0,
      trackVisibility: "visible",
    });
    await reducedSession.page.evaluate(() => (
      window.scrollTo(0, document.documentElement.scrollHeight)
    ));
    await reducedSession.page.waitForFunction(() => (
      document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-visibility") === "active"
      && Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress")) >= 0.995
    ));
    assert.equal(
      await reducedBeam.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
      1,
    );
    await waitForTracingBeamIdle(reducedSession.page, 2_000);
  } finally {
    await reducedSession.context.close();
  }
});

test("static 404 returns home without requesting an unavailable RSC route", { timeout: 10_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });
  const rscRequests = [];
  const pageErrors = [];

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".rsc")) {
      rscRequests.push(pathname);
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${origin}/404.html`, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
    ));
    assert.deepEqual(
      await page.locator(".site-header").evaluate((header) => ({
        navigation: Array.from(header.querySelectorAll("#primary-navigation a"))
          .map((link) => link.getAttribute("href")),
        wordmark: header.querySelector(".wordmark")?.getAttribute("href"),
      })),
      {
        navigation: [
          "/#about",
          "/#experience",
          "/#foundations",
          "/#research",
          "/#contact",
        ],
        wordmark: "/",
      },
    );

    await Promise.all([
      page.waitForURL(`${origin}/#about`, { timeout: 5_000 }),
      page.evaluate(() => {
        document.querySelector('#primary-navigation a[href="/#about"]')?.click();
      }),
    ]);
    await page.waitForLoadState("load");
    await page.locator("#about").waitFor({ state: "visible", timeout: 5_000 });

    await page.goto(`${origin}/404.html`, { timeout: 5_000, waitUntil: "load" });
    await Promise.all([
      page.waitForURL(`${origin}/`, { timeout: 5_000 }),
      page.getByRole("link", { name: "RETURN HOME" }).click(),
    ]);
    await page.waitForLoadState("load");

    assert.deepEqual(
      rscRequests,
      [],
      `static 404 navigation requested unavailable RSC routes: ${rscRequests.join(", ")}`,
    );
    assert.deepEqual(pageErrors, [], `static 404 navigation raised errors: ${pageErrors.join(", ")}`);
    await page.locator("#hero").waitFor({ state: "visible", timeout: 5_000 });
  } finally {
    await context.close();
  }
});
