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

    await page.locator("#about").scrollIntoViewIfNeeded();
    const about = await page.locator("#about").evaluate((section) => ({
      contextLabels: Array.from(section.querySelectorAll(".about-context dt"))
        .map((element) => element.textContent?.trim() ?? ""),
      forbiddenCount: section.querySelectorAll(
        "canvas, [class*='about-particle'], [role='tab'], [role='tablist'], [role='tabpanel']",
      ).length,
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
    assert.deepEqual(about.contextLabels, ["Focus"]);
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
          contextLabels: Array.from(document.querySelectorAll("#about .about-context dt"))
            .map((element) => element.textContent?.trim() ?? ""),
          forbiddenCount: document.querySelectorAll(
            "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
              + "#about [role='tablist'], #about [role='tabpanel']",
          ).length,
          stepLabels: Array.from(document.querySelectorAll("#about .about-loop-label"))
            .map((element) => element.textContent?.trim() ?? ""),
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
      contextLabels: ["Focus"],
      forbiddenCount: 0,
      stepLabels: ["FRAME", "CONNECT", "OBSERVE", "VERIFY"],
    });
    assert.deepEqual(state.researchMotion, ["reduced", "reduced"]);
    assert.deepEqual(
      state.runningAnimations,
      [],
      `reduced motion retained running animations: ${JSON.stringify(state.runningAnimations)}`,
    );
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

        return {
          context: Array.from(section.querySelectorAll(".about-context > div")).map((entry) => ({
            label: entry.querySelector("dt")?.textContent?.trim() ?? "",
            text: entry.querySelector("dd")?.textContent?.trim() ?? "",
            visible: visible(entry),
          })),
          forbiddenCount: section.querySelectorAll(
            "canvas, [class*='about-particle'], [role='tab'], [role='tablist'], "
              + "[role='tabpanel'], [aria-selected], button",
          ).length,
          labelledBy: section.querySelector(".about-working-loop")
            ?.getAttribute("aria-labelledby"),
          loopTitle: section.querySelector("#about-loop-title")?.textContent?.trim() ?? "",
          steps: Array.from(section.querySelectorAll(".about-loop-step")).map((step) => ({
            detail: step.querySelector(".about-loop-detail")?.textContent?.trim() ?? "",
            index: step.querySelector(".about-loop-index")?.textContent?.trim() ?? "",
            label: step.querySelector(".about-loop-label")?.textContent?.trim() ?? "",
            outcome: step.querySelector(".about-loop-outcome strong")?.textContent?.trim() ?? "",
            visible: visible(step),
          })),
        };
      });

      assert.equal(ledger.labelledBy, "about-loop-title");
      assert.equal(ledger.loopTitle, "How I work.");
      assert.equal(ledger.forbiddenCount, 0);
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
      assert.deepEqual(
        ledger.context.map(({ label }) => label),
        ["Focus"],
      );
      assert.equal(ledger.context.every(({ text, visible }) => text.length > 0 && visible), true);
    } finally {
      await context.close();
    }
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
    ));

    const menuButton = page.locator('button[aria-controls="primary-navigation"]');
    const aboutLink = page.locator('#primary-navigation a[href="#about"]');

    await menuButton.tap();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ));
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

    await menuButton.tap();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
    ));

    await menuButton.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
      && document.activeElement?.getAttribute("href") === "#about"
    ));
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
    ));
  } finally {
    await context.close();
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

  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".rsc")) {
      rscRequests.push(pathname);
    }
  });

  try {
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
    await page.locator("#hero").waitFor({ state: "visible", timeout: 5_000 });
  } finally {
    await context.close();
  }
});
