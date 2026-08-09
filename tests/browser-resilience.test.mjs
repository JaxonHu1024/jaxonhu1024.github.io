import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import {
  assertFeedbackFitsViewport,
  browser,
  createReleasePageSession,
  deferred,
  origin,
  setupReleaseHarness,
  teardownReleaseHarness,
  within,
} from "./browser-release-harness.mjs";
import {
  generatedCountryCodes,
  generatedTravelData,
} from "./generated-travel-contract.mjs";

before(setupReleaseHarness);
after(teardownReleaseHarness);

test("slow narrow loads show delayed feedback until assets finish", { timeout: 45_000 }, async () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
  ]) {
    const { context, page } = await createReleasePageSession(browser, { viewport });
    const feedbackScriptRequested = deferred();
    const releaseFeedbackScript = deferred();
    const fontRequested = deferred();
    const releaseFont = deferred();

    await context.route("**/assets/MobileLoadFeedback-*.js", async (route) => {
      feedbackScriptRequested.resolve();
      await releaseFeedbackScript.promise;
      await route.continue();
    });
    await context.route("**/assets/*.woff2", async (route) => {
      fontRequested.resolve();
      await releaseFont.promise;
      await route.continue();
    });
    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "domcontentloaded" });
      await within(
        feedbackScriptRequested.promise,
        `${viewport.width}x${viewport.height} loading-feedback script request`,
      );
      await within(
        fontRequested.promise,
        `${viewport.width}x${viewport.height} primary webfont request`,
      );

      const feedback = page.getByTestId("mobile-load-feedback");
      await page.evaluate(() => {
        const feedback = document.querySelector(
          '[data-testid="mobile-load-feedback"]',
        );
        window.__feedbackTransitions = [];
        window.__feedbackTransitionObserver = new MutationObserver(() => {
          window.__feedbackTransitions.push({
            at: performance.now(),
            state: feedback?.getAttribute("data-state"),
            visible: feedback?.getAttribute("data-visible"),
          });
        });
        window.__feedbackTransitionObserver.observe(feedback, {
          attributes: true,
          attributeFilter: ["data-state", "data-visible"],
        });
      });
      assert.equal(await feedback.getAttribute("data-state"), "loading");
      assert.equal(await feedback.getAttribute("data-visible"), "false");
      assert.equal(await feedback.getAttribute("aria-hidden"), "true");

      const revealStartedAt = await page.evaluate(() => performance.now());
      releaseFeedbackScript.resolve();
      await page.waitForTimeout(200);
      assert.equal(await feedback.getAttribute("data-visible"), "false");
      await page.waitForFunction(() => (
        document.querySelector('[data-testid="mobile-load-feedback"]')
          ?.getAttribute("data-visible") === "true"
      ), null, { timeout: 1_500 });

      const loadingRevealDelay = await page.evaluate((startedAt) => {
        const reveal = window.__feedbackTransitions.find(
          ({ state, visible }) => state === "loading" && visible === "true",
        );
        return reveal.at - startedAt;
      }, revealStartedAt);
      assert.ok(
        loadingRevealDelay >= 275,
        `loading feedback appeared after ${loadingRevealDelay.toFixed(1)}ms`,
      );
      assert.equal(await feedback.getAttribute("data-state"), "loading");
      assert.equal(await feedback.getAttribute("role"), "status");
      assert.equal(await feedback.getAttribute("aria-live"), "polite");
      assert.match(await feedback.textContent(), /Loading visual assets/i);
      await assertFeedbackFitsViewport(page, feedback);

      releaseFont.resolve();
      await page.waitForFunction(() => {
        const feedback = document.querySelector(
          '[data-testid="mobile-load-feedback"]',
        );
        return feedback?.getAttribute("data-state") === "complete"
          && feedback?.getAttribute("data-visible") === "true";
      }, null, { timeout: 3_000 });
      assert.match(await feedback.textContent(), /Interface ready/i);
      await assertFeedbackFitsViewport(page, feedback);
      await page.waitForFunction(() => (
        document.querySelector('[data-testid="mobile-load-feedback"]')
          ?.getAttribute("data-visible") === "false"
      ), null, { timeout: 2_000 });
      const completeVisibility = await page.evaluate(() => {
        const complete = window.__feedbackTransitions.find(
          ({ state, visible }) => state === "complete" && visible === "true",
        );
        const hidden = window.__feedbackTransitions.find(
          ({ at, visible }) => at > complete.at && visible === "false",
        );
        return hidden.at - complete.at;
      });
      assert.ok(
        completeVisibility >= 575,
        `completion feedback remained visible for ${completeVisibility.toFixed(1)}ms`,
      );
    } finally {
      releaseFeedbackScript.resolve();
      releaseFont.resolve();
      await context.close();
    }
  }
});
test("fast narrow loads never flash loading or completion feedback", async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    await page.addInitScript(() => {
      window.__feedbackVisibilityHistory = [];
      document.addEventListener("DOMContentLoaded", () => {
        const feedback = document.querySelector(
          '[data-testid="mobile-load-feedback"]',
        );
        if (!feedback) return;

        const record = () => {
          window.__feedbackVisibilityHistory.push({
            state: feedback.getAttribute("data-state"),
            visible: feedback.getAttribute("data-visible"),
          });
        };
        record();
        new MutationObserver(record).observe(feedback, {
          attributeFilter: ["data-state", "data-visible"],
          attributes: true,
        });
      }, { once: true });
    });
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.documentElement.dataset.pageActive === "true"
    ));
    await page.waitForTimeout(750);

    const feedback = page.getByTestId("mobile-load-feedback");
    assert.equal(await feedback.getAttribute("data-visible"), "false");
    assert.equal(await feedback.getAttribute("aria-hidden"), "true");
    assert.equal(await feedback.getAttribute("data-state"), "loading");
    assert.deepEqual(
      await page.evaluate(() => window.__feedbackVisibilityHistory),
      [{ state: "loading", visible: "false" }],
    );
  } finally {
    await context.close();
  }
});

test("decorative image failures do not interrupt core content", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    await page.addInitScript(() => {
      window.__failedImageSources = [];
      window.addEventListener("error", (event) => {
        if (event.target instanceof HTMLImageElement) {
          window.__failedImageSources.push(event.target.currentSrc || event.target.src);
        }
      }, true);
    });
    await context.route(
      "**/assets/logo-ntu.svg*",
      (route) => route.abort("failed"),
    );
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });

    const feedback = page.getByTestId("mobile-load-feedback");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.documentElement.dataset.pageActive === "true"
      && document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-visible") === "false"
    ));
    await page.evaluate(() => {
      const decorativeImage = document.createElement("img");
      decorativeImage.alt = "";
      decorativeImage.height = 1;
      decorativeImage.loading = "lazy";
      decorativeImage.src = "/assets/logo-ntu.svg?decorative-failure-test";
      decorativeImage.width = 1;
      document.body.prepend(decorativeImage);
    });
    await page.waitForFunction(() => (
      window.__failedImageSources.some((source) => source.includes("decorative-failure-test"))
    ), null, { timeout: 3_000 });
    await page.waitForTimeout(350);

    assert.notEqual(await feedback.getAttribute("data-state"), "error");
    assert.equal(await feedback.getAttribute("data-visible"), "false");
    assert.equal(await feedback.getAttribute("role"), "status");
    assert.equal(await feedback.getAttribute("aria-live"), "polite");
    assert.equal(await page.locator("#hero-title").isVisible(), true);
  } finally {
    await context.close();
  }
});

test("critical portrait failures expose an accessible persistent error state", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    await context.route(
      "**/assets/jaxon-sea-portrait.webp",
      (route) => route.abort("failed"),
    );
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });

    const feedback = page.getByTestId("mobile-load-feedback");
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-state") === "error"
    ), null, { timeout: 3_000 });
    assert.equal(await feedback.getAttribute("data-visible"), "true");
    assert.equal(await feedback.getAttribute("role"), "alert");
    assert.equal(await feedback.getAttribute("aria-live"), "assertive");
    assert.match(await feedback.textContent(), /Some visuals failed/i);
    assert.match(await feedback.textContent(), /Content remains available/i);
    await assertFeedbackFitsViewport(page, feedback);

    const retry = page.getByRole("button", { name: "Retry loading page" });
    const retryBox = await retry.boundingBox();
    assert.ok(retryBox);
    assert.ok(retryBox.width >= 44, `retry width was ${retryBox.width}px`);
    assert.ok(retryBox.height >= 44, `retry height was ${retryBox.height}px`);
  } finally {
    await context.close();
  }
});

test("core content and mobile navigation remain usable without JavaScript", { timeout: 30_000 }, async () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const { context, page } = await createReleasePageSession(browser, {
      javaScriptEnabled: false,
      viewport,
    });

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });

      const state = await page.evaluate(() => {
        const navigation = document.querySelector("#primary-navigation");
        const portrait = document.querySelector(".hero-pixel-portrait");
        const feedback = document.querySelector('[data-testid="mobile-load-feedback"]');
        const coreSelectors = [
          "#hero-title",
          "#about-title",
          "#travel-map-title",
          "#about-loop-title",
          "#experience-title",
          "#foundations-title",
          "#research-title",
          "#contact-title",
          'a[href="mailto:jaxonhu01@gmail.com"]',
        ];

        return {
          about: {
            contextCount: document.querySelectorAll("#about .about-context").length,
            forbiddenCount: document.querySelectorAll(
              "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
                + "#about [role='tablist'], #about [role='tabpanel']",
            ).length,
            introductionText: document.querySelector("#about .about-introduction")
              ?.textContent?.replace(/\s+/g, " ").trim() ?? "",
            loopSteps: Array.from(
              document.querySelectorAll("#about .about-loop-step"),
            ).map((element) => ({
              label: element.querySelector(".about-loop-label")?.textContent?.trim() ?? "",
              text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
              visible: getComputedStyle(element).visibility !== "hidden"
                && element.getBoundingClientRect().width > 0
                && element.getBoundingClientRect().height > 0,
            })),
            travelMap: (() => {
              const element = document.querySelector("#about .about-travel");
              const routeKeys = Array.from(
                element?.querySelectorAll(".travel-map-route") ?? [],
              ).map((route) => route.getAttribute("data-route-key"));
              const rect = element?.getBoundingClientRect();

              return element && rect ? {
                airportCount: element.querySelectorAll(".travel-map-airport").length,
                copy: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
                flagCount: element.querySelectorAll(".travel-map-flags > li").length,
                flagCountryCodes: Array.from(
                  element.querySelectorAll(".travel-map-flags > li"),
                ).map((flag) => flag.getAttribute("data-country-code") ?? "").sort(),
                flagListTagName: element.querySelector(".travel-map-flags")?.tagName ?? null,
                flagsHaveDockStructure: Array.from(
                  element.querySelectorAll(".travel-map-flags > li"),
                ).every((flag) => (
                  Boolean(flag.getAttribute("data-country-code"))
                  && Boolean(flag.querySelector(".travel-map-flag-icon"))
                  && Boolean(flag.querySelector(".travel-map-flag-tooltip"))
                )),
                routeCount: routeKeys.length,
                routesUnique: routeKeys.every(Boolean) && new Set(routeKeys).size === routeKeys.length,
                stats: Array.from(element.querySelectorAll(".travel-map-stats dd"))
                  .map((entry) => entry.textContent?.trim() ?? ""),
                svgRole: element.querySelector(".travel-map-canvas")?.getAttribute("role"),
                visible: rect.width > 0
                  && rect.height > 0
                  && getComputedStyle(element).visibility !== "hidden",
              } : null;
            })(),
          },
          coreContent: coreSelectors.map((selector) => {
            const element = document.querySelector(selector);
            const box = element?.getBoundingClientRect();

            return {
              selector,
              text: element?.textContent?.trim() ?? "",
              visible: Boolean(
                element
                && box
                && box.width > 0
                && box.height > 0
                && getComputedStyle(element).visibility !== "hidden"
              ),
            };
          }),
          documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          feedbackDisplay: feedback ? getComputedStyle(feedback).display : "missing",
          navigation: navigation
            ? {
                clipPath: getComputedStyle(navigation).clipPath,
                clientWidth: navigation.clientWidth,
                opacity: getComputedStyle(navigation).opacity,
                pointerEvents: getComputedStyle(navigation).pointerEvents,
                scrollWidth: navigation.scrollWidth,
                targets: Array.from(navigation.querySelectorAll("a")).map((link) => {
                  const rect = link.getBoundingClientRect();
                  return {
                    height: rect.height,
                    href: link.getAttribute("href"),
                    left: rect.left,
                    right: rect.right,
                    width: rect.width,
                  };
                }),
                visibility: getComputedStyle(navigation).visibility,
              }
            : null,
          portrait: portrait
            ? {
                canvasCount: portrait.querySelectorAll(".hero-pixel-canvas").length,
                fallback: (() => {
                  const image = portrait.querySelector(".hero-portrait-fallback");
                  return image ? {
                    complete: image.complete,
                    height: image.getAttribute("height"),
                    naturalWidth: image.naturalWidth,
                    src: image.getAttribute("src"),
                    width: image.getAttribute("width"),
                  } : null;
                })(),
                visible: getComputedStyle(portrait).visibility !== "hidden",
              }
            : null,
          terminalCount: document.querySelectorAll(".hero-terminal").length,
        };
      });

      for (const item of state.coreContent) {
        assert.equal(
          item.visible,
          true,
          `${viewport.width}x${viewport.height} ${item.selector} was hidden without JavaScript`,
        );
        assert.ok(
          item.text.length > 0,
          `${viewport.width}x${viewport.height} ${item.selector} lost its text without JavaScript`,
        );
      }
      assert.equal(state.documentOverflow, 0);
      assert.equal(state.feedbackDisplay, "none");
      assert.equal(state.about.forbiddenCount, 0);
      assert.equal(state.about.contextCount, 0);
      assert.equal(
        state.about.introductionText,
        "I'm Jaxon. I build inspectable systems where models, tools, and decisions meet the "
          + "real world—with a focus on agents, multimodal systems, and autonomous intelligence.",
      );
      assert.deepEqual(
        state.about.loopSteps.map(({ label }) => label),
        ["FRAME", "CONNECT", "OBSERVE", "VERIFY"],
      );
      assert.equal(state.about.loopSteps.every(({ text, visible }) => (
        visible && text.length > 0
      )), true);
      assert.ok(state.about.travelMap);
      assert.equal(state.about.travelMap.visible, true);
      assert.equal(state.about.travelMap.svgRole, "img");
      assert.equal(state.about.travelMap.airportCount, generatedTravelData.counts.airports);
      assert.equal(state.about.travelMap.flagCount, generatedTravelData.counts.countries);
      assert.deepEqual(state.about.travelMap.flagCountryCodes, generatedCountryCodes);
      assert.equal(state.about.travelMap.flagListTagName, "UL");
      assert.equal(state.about.travelMap.flagsHaveDockStructure, true);
      assert.equal(state.about.travelMap.routeCount, generatedTravelData.counts.routes);
      assert.equal(state.about.travelMap.routesUnique, true);
      assert.deepEqual(state.about.travelMap.stats, [
        String(generatedTravelData.counts.countries),
      ]);
      assert.doesNotMatch(
        state.about.travelMap.copy,
        /Flight segments|Airports reached|Approximately [\d,]+ kilometers flown/i,
      );
      assert.doesNotMatch(state.about.travelMap.copy, /Trace window|DATA LAYER/i);
      assert.ok(state.navigation);
      assert.equal(state.navigation.clipPath, "none");
      assert.equal(state.navigation.opacity, "1");
      assert.equal(state.navigation.pointerEvents, "auto");
      assert.equal(state.navigation.visibility, "visible");
      assert.ok(
        state.navigation.scrollWidth <= state.navigation.clientWidth,
        `${viewport.width}x${viewport.height} no-JS navigation overflowed horizontally`,
      );
      for (const target of state.navigation.targets) {
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${viewport.width}x${viewport.height} ${target.href} was ${target.width}x${target.height}`,
        );
        assert.ok(
          target.left >= 0 && target.right <= viewport.width,
          `${viewport.width}x${viewport.height} ${target.href} was clipped`,
        );
      }
      assert.equal(state.portrait?.visible, true);
      assert.equal(state.portrait?.canvasCount, 1);
      assert.deepEqual(state.portrait?.fallback, {
        complete: true,
        height: "1200",
        naturalWidth: 1200,
        src: "/assets/jaxon-sea-portrait.webp",
        width: "1200",
      });
      assert.equal(state.terminalCount, 0);

      const researchNavigationLink = page.locator(
        '#primary-navigation a[href="#research"]',
      );
      assert.equal(await researchNavigationLink.count(), 1);
      await researchNavigationLink.click();
      await page.waitForFunction(() => location.hash === "#research");
      assert.equal(await page.locator("#research-title").isVisible(), true);
    } finally {
      await context.close();
    }
  }
});

test("mobile navigation stays usable when its enhancement never hydrates", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });
  page.setDefaultTimeout(3_000);
  let stalledNavigationRequests = 0;

  try {
    await context.route("**/assets/Navigation-*.js", (route) => {
      stalledNavigationRequests += 1;
      return route.fulfill({
        body: "await new Promise(() => {}); export function Navigation() { return null; }",
        contentType: "text/javascript; charset=utf-8",
        status: 200,
      });
    });
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForTimeout(350);

    const fallback = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      if (!header) {
        return {
          bodyText: document.body?.textContent?.trim() ?? "",
          href: location.href,
          missing: true,
          readyState: document.readyState,
        };
      }
      const navigation = header.querySelector("#primary-navigation");
      const menuButton = header.querySelector('[aria-controls="primary-navigation"]');
      const navigationStyle = getComputedStyle(navigation);

      return {
        enhanced: header.dataset.navigationReady === "true",
        menuButtonDisplay: getComputedStyle(menuButton).display,
        navigation: {
          clipPath: navigationStyle.clipPath,
          opacity: navigationStyle.opacity,
          pointerEvents: navigationStyle.pointerEvents,
          visibility: navigationStyle.visibility,
        },
        targets: Array.from(navigation.querySelectorAll("a")).map((link) => {
          const rect = link.getBoundingClientRect();
          return {
            height: rect.height,
            href: link.getAttribute("href"),
            width: rect.width,
          };
        }),
      };
    });

    assert.ok(stalledNavigationRequests > 0, "Navigation enhancement chunk was not requested");
    assert.equal(fallback.missing, undefined, `static navigation disappeared: ${JSON.stringify(fallback)}`);
    assert.equal(fallback.enhanced, false);
    assert.equal(fallback.menuButtonDisplay, "none");
    assert.deepEqual(fallback.navigation, {
      clipPath: "none",
      opacity: "1",
      pointerEvents: "auto",
      visibility: "visible",
    });
    assert.deepEqual(
      fallback.targets.map(({ href }) => href),
      ["#about", "#experience", "#foundations", "#research", "#contact"],
    );
    assert.equal(
      fallback.targets.every(({ height, width }) => height >= 44 && width >= 44),
      true,
    );

    await page.locator('#primary-navigation a[href="#research"]').click();
    await page.waitForFunction(() => location.hash === "#research");
    assert.equal(await page.locator("#research-title").isVisible(), true);
  } finally {
    await context.close();
  }
});

test("skip link transfers keyboard focus to main content", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(() => document.activeElement?.classList.contains("skip-link")),
      true,
    );
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (
      location.hash === "#content"
      && document.activeElement === document.querySelector("main#content")
    ));
  } finally {
    await context.close();
  }
});

test("mobile internal guides share one static vertical axis", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 430, height: 932 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const state = await page.evaluate(() => {
      const guideMetrics = (selector) => {
        const host = document.querySelector(selector);
        const hostRect = host.getBoundingClientRect();
        const guide = getComputedStyle(host, "::before");
        const width = Number.parseFloat(guide.width);

        return {
          animationName: guide.animationName,
          backgroundImage: guide.backgroundImage,
          centerX: hostRect.left + Number.parseFloat(guide.left) + width / 2,
          height: Number.parseFloat(guide.height),
          transitionDuration: guide.transitionDuration,
          width,
        };
      };
      const nodeCenter = (selector, pseudo = null) => {
        const node = document.querySelector(selector);
        const rect = node.getBoundingClientRect();
        if (pseudo === null) return rect.left + rect.width / 2;

        const marker = getComputedStyle(node, pseudo);
        return (
          rect.left
          + Number.parseFloat(marker.left)
          + Number.parseFloat(marker.width) / 2
        );
      };

      return {
        experience: {
          nodeAnimation: getComputedStyle(
            document.querySelector(".timeline-node"),
            "::before",
          ).animationName,
          scanCount: document.querySelectorAll(".experience-scan-track").length,
          traceMotion: document.querySelector("#experience")?.getAttribute("data-trace-motion"),
          traceProgress: document.querySelector(".experience-log")
            ?.getAttribute("data-trace-progress"),
        },
        guides: [
          guideMetrics(".about-loop-list"),
          guideMetrics(".experience-log"),
          guideMetrics(".education-timeline"),
          guideMetrics(".toolchain-list"),
        ],
        nodeCenters: [
          nodeCenter(".about-loop-node"),
          nodeCenter(".timeline-node"),
          nodeCenter(".education-node"),
          nodeCenter(".toolchain-module", "::after"),
        ],
      };
    });

    for (const guide of state.guides) {
      assert.ok(guide.width <= 1.25, `mobile guide width was ${guide.width}px`);
      assert.ok(guide.height >= 48, `mobile guide height was ${guide.height}px`);
      assert.equal(guide.animationName, "none");
      assert.equal(guide.transitionDuration, "0s");
      assert.notEqual(guide.backgroundImage, "none");
    }

    const guideCenters = state.guides.map(({ centerX }) => centerX);
    assert.equal(new Set(state.guides.map(({ backgroundImage }) => backgroundImage)).size, 1);
    assert.ok(
      Math.max(...guideCenters) - Math.min(...guideCenters) <= 0.75,
      `mobile guide centers diverged: ${guideCenters.join(", ")}`,
    );
    state.nodeCenters.forEach((centerX, index) => {
      assert.ok(
        Math.abs(centerX - guideCenters[index]) <= 0.75,
        `mobile guide ${index + 1} node=${centerX}px missed rail=${guideCenters[index]}px`,
      );
    });
    assert.deepEqual(state.experience, {
      nodeAnimation: "none",
      scanCount: 0,
      traceMotion: null,
      traceProgress: null,
    });
  } finally {
    await context.close();
  }
});

test("page background state pauses remaining ambient loops", { timeout: 10_000 }, async () => {
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
    await page.waitForFunction(() => document.documentElement.dataset.pageActive === "true");
    await page.locator("#contact").evaluate((element) => {
      element.scrollIntoView({ block: "center" });
    });
    await page.waitForFunction(() => (
      document.querySelector("#contact")?.getAttribute("data-section-visible") === "true"
    ));
    assert.equal(
      await page.locator(".contact-marquee-track").evaluate(
        (element) => getComputedStyle(element).animationPlayState,
      ),
      "running",
    );

    await page.evaluate(() => window.__setDocumentHidden(true));
    await page.waitForFunction(() => document.documentElement.dataset.pageActive === "false");
    assert.equal(
      await page.locator(".contact-marquee-track").evaluate(
        (element) => getComputedStyle(element).animationPlayState,
      ),
      "paused",
    );

    await page.evaluate(() => window.__setDocumentHidden(false));
    await page.waitForFunction(() => document.documentElement.dataset.pageActive === "true");
    assert.equal(
      await page.locator(".contact-marquee-track").evaluate(
        (element) => getComputedStyle(element).animationPlayState,
      ),
      "running",
    );
  } finally {
    await context.close();
  }
});

test("experience guide stays static while keyboard focus remains responsive", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 1440, height: 900 },
  });

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    await page.locator("#experience").evaluate((element) => {
      element.scrollIntoView({ block: "start" });
    });

    const measureGuide = () => page.locator(".experience-log").evaluate((element) => {
      const rail = getComputedStyle(element, "::before");
      const node = element.querySelector(".timeline-node");
      const elementRect = element.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const railCenterX = (
        elementRect.left
        + Number.parseFloat(rail.left)
        + Number.parseFloat(rail.width) / 2
      );

      return {
        axisDelta: Math.abs(railCenterX - (nodeRect.left + nodeRect.width / 2)),
        backgroundImage: rail.backgroundImage,
        centerX: railCenterX,
        hasRevealAnimation: element.classList.contains("reveal"),
        nodeAnimation: getComputedStyle(node, "::before").animationName,
        runningAnimations: element.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
        scanCount: element.querySelectorAll(".experience-scan-track").length,
        traceMotion: document.querySelector("#experience")?.getAttribute("data-trace-motion"),
        traceProgress: element.getAttribute("data-trace-progress"),
      };
    });

    const guideBefore = await measureGuide();
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.evaluate(() => new Promise((resolveFrame) => {
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame));
    }));
    const guideAfter = await measureGuide();
    assert.deepEqual(guideAfter, guideBefore);
    assert.ok(guideBefore.axisDelta <= 0.75);
    assert.notEqual(guideBefore.backgroundImage, "none");
    assert.deepEqual(
      {
        hasRevealAnimation: guideBefore.hasRevealAnimation,
        nodeAnimation: guideBefore.nodeAnimation,
        runningAnimations: guideBefore.runningAnimations,
        scanCount: guideBefore.scanCount,
        traceMotion: guideBefore.traceMotion,
        traceProgress: guideBefore.traceProgress,
      },
      {
        hasRevealAnimation: false,
        nodeAnimation: "none",
        runningAnimations: 0,
        scanCount: 0,
        traceMotion: null,
        traceProgress: null,
      },
    );

    const contact = page.locator("#contact");
    await contact.scrollIntoViewIfNeeded();
    await contact.focus();
    await page.keyboard.press("Tab");
    const email = page.locator(".contact-socials a").first();
    await page.waitForFunction(() => {
      const link = document.querySelector(".contact-socials a");
      return document.activeElement === link
        && Number.parseFloat(getComputedStyle(link, "::before").opacity) > 0.5;
    });
    await email.evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    const focusState = await email.evaluate((element) => ({
      afterOpacity: Number.parseFloat(getComputedStyle(element, "::after").opacity),
      arrowX: new DOMMatrixReadOnly(
        getComputedStyle(element.querySelector(".endpoint-arrow")).transform,
      ).e,
      beforeOpacity: Number.parseFloat(getComputedStyle(element, "::before").opacity),
      iconColor: getComputedStyle(element.querySelector(".endpoint-icon")).color,
      iconY: new DOMMatrixReadOnly(
        getComputedStyle(element.querySelector(".endpoint-icon")).transform,
      ).f,
      linkColor: getComputedStyle(element).color,
      outlineStyle: getComputedStyle(element).outlineStyle,
      outlineWidth: getComputedStyle(element).outlineWidth,
      pointerEventsAfter: getComputedStyle(element, "::after").pointerEvents,
      pointerEventsBefore: getComputedStyle(element, "::before").pointerEvents,
    }));
    assert.ok(focusState.beforeOpacity > 0.5 && focusState.afterOpacity > 0.5);
    assert.deepEqual(
      [focusState.pointerEventsBefore, focusState.pointerEventsAfter],
      ["none", "none"],
    );
    assert.deepEqual(
      [focusState.outlineStyle, focusState.outlineWidth],
      ["solid", "2px"],
    );
    assert.equal(focusState.iconColor, focusState.linkColor);
    assert.ok(Math.abs(focusState.iconY + 1) <= 0.1);
    assert.ok(Math.abs(focusState.arrowX - 3) <= 0.1);

    await email.evaluate((element) => element.blur());
    await email.hover();
    await email.evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
      element.addEventListener("click", (event) => event.preventDefault(), { once: true });
    });
    const hoverState = await email.evaluate((element) => ({
      arrowX: new DOMMatrixReadOnly(
        getComputedStyle(element.querySelector(".endpoint-arrow")).transform,
      ).e,
      background: getComputedStyle(element).backgroundColor,
    }));
    await page.mouse.down();
    await page.waitForFunction(() => document.querySelector(".contact-socials a")?.matches(":active"));
    await email.evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map((animation) => animation.finished),
      );
    });
    const pressedState = await email.evaluate((element) => ({
      arrowX: new DOMMatrixReadOnly(
        getComputedStyle(element.querySelector(".endpoint-arrow")).transform,
      ).e,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.ok(Math.abs(hoverState.arrowX - 3) <= 0.1);
    assert.ok(Math.abs(pressedState.arrowX - 1) <= 0.1);
    assert.notEqual(pressedState.background, hoverState.background);
    await page.mouse.up();
  } finally {
    await context.close();
  }
});
