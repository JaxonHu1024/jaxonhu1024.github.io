import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { createReleasePageSession } from "./browser-release-harness.mjs";

const outputDirectory = resolve(fileURLToPath(new URL("../github-pages-dist/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);
const releaseLimits = {
  cls: 0.1,
  inp: 300,
  lcp: 2_500,
};

let browser;
let origin;
let server;

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveDeferred) => {
    resolvePromise = resolveDeferred;
  });

  return { promise, resolve: resolvePromise };
}

async function within(promise, label, timeoutMs = 3_000) {
  let timeout;

  try {
    return await Promise.race([
      promise,
      new Promise((_, rejectTimeout) => {
        timeout = setTimeout(
          () => rejectTimeout(new Error(`Timed out waiting for ${label}`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertFeedbackFitsViewport(page, feedback) {
  const [feedbackBox, headerBox, viewport] = await Promise.all([
    feedback.boundingBox(),
    page.locator(".site-header").boundingBox(),
    page.evaluate(() => ({ height: innerHeight, width: innerWidth })),
  ]);

  assert.ok(feedbackBox, "loading feedback has no rendered box");
  assert.ok(headerBox, "site header has no rendered box");
  assert.ok(feedbackBox.x >= 0, `feedback started at x=${feedbackBox.x}px`);
  assert.ok(feedbackBox.y >= 0, `feedback started at y=${feedbackBox.y}px`);
  assert.ok(
    feedbackBox.x + feedbackBox.width <= viewport.width,
    "loading feedback overflowed the viewport width",
  );
  assert.ok(
    feedbackBox.y + feedbackBox.height <= viewport.height,
    "loading feedback overflowed the viewport height",
  );
  assert.ok(
    feedbackBox.y >= headerBox.y + headerBox.height,
    "loading feedback overlapped the fixed header",
  );
}

function intersectionArea(left, right) {
  if (!left || !right) {
    return Number.POSITIVE_INFINITY;
  }

  const width = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const height = Math.max(
    0,
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
  );
  return width * height;
}

async function measurePageGeometry(page, selectors) {
  return page.evaluate((selectorMap) => {
    const boxes = Object.fromEntries(
      Object.entries(selectorMap).map(([name, selector]) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return [
          name,
          rect
            ? {
                bottom: rect.bottom,
                height: rect.height,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                width: rect.width,
              }
            : null,
        ];
      }),
    );

    return {
      boxes,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, selectors);
}

async function installPerformanceObservers(page) {
  await page.addInitScript(() => {
    const supportedEntryTypes = new Set(PerformanceObserver.supportedEntryTypes);
    const metrics = {
      cls: 0,
      interactions: {},
      lcp: 0,
      observers: [],
      supported: {
        cls: supportedEntryTypes.has("layout-shift"),
        event: supportedEntryTypes.has("event"),
        firstInput: supportedEntryTypes.has("first-input"),
        lcp: supportedEntryTypes.has("largest-contentful-paint"),
      },
    };
    window.__releaseVitals = metrics;

    if (metrics.supported.lcp) {
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          metrics.lcp = entry.startTime;
        }
      });
      lcpObserver.observe({ buffered: true, type: "largest-contentful-paint" });
      metrics.observers.push(lcpObserver);
    }

    if (metrics.supported.cls) {
      let sessionStart = 0;
      let sessionEnd = 0;
      let sessionValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.hadRecentInput) {
            continue;
          }

          const continuesSession = sessionValue > 0
            && entry.startTime - sessionEnd < 1_000
            && entry.startTime - sessionStart < 5_000;

          if (continuesSession) {
            sessionValue += entry.value;
          } else {
            sessionStart = entry.startTime;
            sessionValue = entry.value;
          }

          sessionEnd = entry.startTime;
          metrics.cls = Math.max(metrics.cls, sessionValue);
        }
      });
      clsObserver.observe({ buffered: true, type: "layout-shift" });
      metrics.observers.push(clsObserver);
    }

    const recordInteraction = (entry) => {
      const interactionId = entry.interactionId
        ? String(entry.interactionId)
        : entry.entryType === "first-input"
          ? `first-input-${entry.startTime}`
          : null;

      if (!interactionId) {
        return;
      }

      metrics.interactions[interactionId] = Math.max(
        metrics.interactions[interactionId] ?? 0,
        entry.duration,
      );
    };

    if (metrics.supported.event) {
      const eventObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach(recordInteraction);
      });
      eventObserver.observe({
        buffered: true,
        durationThreshold: 16,
        type: "event",
      });
      metrics.observers.push(eventObserver);
    }

    if (metrics.supported.firstInput) {
      const firstInputObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach(recordInteraction);
      });
      firstInputObserver.observe({ buffered: true, type: "first-input" });
      metrics.observers.push(firstInputObserver);
    }
  });
}

async function runPerformanceSample(sampleNumber) {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });
  const cdp = await context.newCDPSession(page);

  try {
    await installPerformanceObservers(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      connectionType: "cellular4g",
      downloadThroughput: 200_000,
      latency: 150,
      offline: false,
      uploadThroughput: 93_750,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.goto(origin, { timeout: 20_000, waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((image) => image.loading !== "lazy")
          .map((image) => {
            if (image.complete && image.naturalWidth > 0) {
              return Promise.resolve();
            }

            return new Promise((resolveImage, rejectImage) => {
              image.addEventListener("load", resolveImage, { once: true });
              image.addEventListener("error", rejectImage, { once: true });
            });
          }),
      );
    });
    await page.waitForFunction(() => (
      document.documentElement.dataset.pageActive === "true"
      && document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-visible") === "false"
    ), null, { timeout: 5_000 });

    const menuButton = page.locator('button[aria-controls="primary-navigation"]');
    await menuButton.click({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ), null, { timeout: 3_000 });
    await menuButton.click({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
    ), null, { timeout: 3_000 });
    await menuButton.click({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ), null, { timeout: 3_000 });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "false"
    ));
    await page.evaluate(() => new Promise((resolvePaint) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolvePaint, 100);
        });
      });
    }));

    const metrics = await page.evaluate(() => {
      const snapshot = window.__releaseVitals;
      const interactionDurations = Object.values(snapshot.interactions)
        .sort((left, right) => right - left);
      const outliersToIgnore = Math.floor(interactionDurations.length / 50);

      return {
        cls: snapshot.cls,
        inp: interactionDurations[outliersToIgnore] ?? 0,
        interactionCount: interactionDurations.length,
        lcp: snapshot.lcp,
        supported: snapshot.supported,
      };
    });

    console.log(
      `[release-performance] sample ${sampleNumber}: `
        + `LCP=${metrics.lcp.toFixed(1)}ms `
        + `INP=${metrics.inp.toFixed(1)}ms `
        + `CLS=${metrics.cls.toFixed(4)} `
        + `interactions=${metrics.interactionCount}`,
    );

    return metrics;
  } finally {
    await cdp.detach();
    await context.close();
  }
}

function assetPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = resolve(outputDirectory, relativePath);

  if (candidate !== outputDirectory && !candidate.startsWith(`${outputDirectory}${sep}`)) {
    return null;
  }

  return candidate;
}

before(async () => {
  server = createServer(async (request, response) => {
    const candidate = assetPath(request.url ?? "/");

    if (!candidate) {
      response.writeHead(400).end("Bad request");
      return;
    }

    try {
      const body = await readFile(candidate);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentTypes.get(extname(candidate)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
});

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

test("asset failures expose an accessible persistent error state", { timeout: 15_000 }, async () => {
  const { context, page } = await createReleasePageSession(browser, {
    viewport: { width: 390, height: 844 },
  });

  try {
    // No eager hero raster exists anymore, so exercise the error path the way
    // it now surfaces in production: a deferred asset that fails after the
    // initial fonts.ready gate still trips the capture-phase image error guard.
    await context.route(
      "**/assets/logo-ntu.svg",
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
      const broken = document.createElement("img");
      broken.src = "/assets/logo-ntu.svg";
      broken.alt = "";
      document.body.appendChild(broken);
    });

    await page.waitForFunction(() => (
      document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-state") === "error"
    ), null, { timeout: 3_000 });
    assert.equal(await feedback.getAttribute("data-visible"), "true");
    assert.equal(await feedback.getAttribute("role"), "alert");
    assert.equal(await feedback.getAttribute("aria-live"), "assertive");
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
          "#about-loop-title",
          "#experience-title",
          "#foundations-title",
          "#research-title",
          "#contact-title",
          'a[href="mailto:jaxonhu01@gmail.com"]',
        ];

        return {
          about: {
            contextLabels: Array.from(
              document.querySelectorAll("#about .about-context dt"),
            ).map((element) => element.textContent?.trim() ?? ""),
            forbiddenCount: document.querySelectorAll(
              "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
                + "#about [role='tablist'], #about [role='tabpanel']",
            ).length,
            loopSteps: Array.from(
              document.querySelectorAll("#about .about-loop-step"),
            ).map((element) => ({
              label: element.querySelector(".about-loop-label")?.textContent?.trim() ?? "",
              text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
              visible: getComputedStyle(element).visibility !== "hidden"
                && element.getBoundingClientRect().width > 0
                && element.getBoundingClientRect().height > 0,
            })),
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
      assert.deepEqual(
        state.about.contextLabels,
        ["Focus"],
      );
      assert.deepEqual(
        state.about.loopSteps.map(({ label }) => label),
        ["FRAME", "CONNECT", "OBSERVE", "VERIFY"],
      );
      assert.equal(state.about.loopSteps.every(({ text, visible }) => (
        visible && text.length > 0
      )), true);
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
      const marqueeWindow = section.querySelector(".contact-marquee-window");
      const summary = section.querySelector(".contact-marquee-summary");
      const track = section.querySelector(".contact-marquee-track");
      const windowRect = marqueeWindow?.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect();
      const trackStyle = getComputedStyle(track);

      return {
        animationName: trackStyle.animationName,
        runningAnimations: track.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running").length,
        summaryVisible: Boolean(summaryRect && summaryRect.width > 10 && summaryRect.height > 10),
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
      summaryVisible: false,
      transform: "none",
      willChange: "auto",
      windowVisible: true,
    });
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

test("left-side tracing beam follows whole-document scroll and stays static for reduced motion", { timeout: 20_000 }, async () => {
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
      pointerEvents: getComputedStyle(element).pointerEvents,
      progress: Number(element.getAttribute("data-trace-progress")),
      rightGap: innerWidth - element.getBoundingClientRect().right,
    }));
    assert.deepEqual({
      ariaHidden: initial.ariaHidden,
      count: initial.count,
      pointerEvents: initial.pointerEvents,
      progress: initial.progress,
    }, {
      ariaHidden: "true",
      count: 1,
      pointerEvents: "none",
      progress: 0,
    });
    assert.ok(initial.leftGap <= 24, `tracing beam left gap was ${initial.leftGap}px`);
    assert.ok(initial.leftGap < initial.rightGap, "tracing beam remained on the right side");

    await page.evaluate(() => {
      const maxScroll = document.documentElement.scrollHeight - innerHeight;
      window.scrollTo(0, maxScroll * 0.55);
    });
    await page.waitForFunction(() => (
      Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress"))
        >= 0.5
    ));
    const middleProgress = Number(await beam.getAttribute("data-trace-progress"));
    assert.ok(middleProgress >= 0.5 && middleProgress < 0.8);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => (
      Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress"))
        >= 0.995
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
    }));
    assert.deepEqual(reducedState, {
      headDisplay: "none",
      progressDisplay: "none",
      runningAnimations: 0,
      trackVisibility: "visible",
    });
    await reducedSession.page.evaluate(() => (
      window.scrollTo(0, document.documentElement.scrollHeight)
    ));
    await reducedSession.page.waitForFunction(() => (
      Number(document.querySelector(".site-tracing-beam")?.getAttribute("data-trace-progress"))
        >= 0.995
    ));
  } finally {
    await reducedSession.context.close();
  }
});

test("fresh export passes the complete eight-viewport release matrix", { timeout: 90_000 }, async () => {
  const viewports = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1280, height: 800 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    const { context, page } = await createReleasePageSession(browser, { viewport });

    try {
      const browserErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") {
          browserErrors.push(`console: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        browserErrors.push(`pageerror: ${error.message}`);
      });
      page.on("requestfailed", (request) => {
        browserErrors.push(
          `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`,
        );
      });
      page.on("response", (response) => {
        if (response.status() >= 400) {
          browserErrors.push(`response: ${response.status()} ${response.url()}`);
        }
      });

      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const effectiveViewport = await page.locator('meta[name="viewport"]').evaluateAll(
        (elements) => elements.at(-1)?.getAttribute("content") ?? "",
      );
      assert.equal(
        effectiveViewport,
        "width=device-width, initial-scale=1, viewport-fit=cover",
        `${viewport.width}x${viewport.height} did not use the safe-area viewport override`,
      );
      await page.waitForFunction(() => (
        document.documentElement.dataset.pageActive === "true"
        && document.querySelector('[data-testid="mobile-load-feedback"]')
          ?.getAttribute("data-visible") === "false"
      ), null, { timeout: 5_000 });
      await page.waitForFunction(() => (
        document.querySelector("#hero")?.getAttribute("data-section-visible") === "true"
      ), null, { timeout: 3_000 });
      await page.waitForFunction(() => (
        document.querySelector(".hero-pixel-canvas")?.getAttribute("data-pixelated-ready") === "true"
      ), null, { timeout: 3_000 });

      const geometry = await measurePageGeometry(page, {
        beam: ".site-tracing-beam",
        header: ".site-header",
        heroCta: ".hero-cta",
        heroName: ".hero-name",
        heroPortrait: ".hero-pixel-portrait",
      });
      const {
        beam,
        header,
        heroCta,
        heroName,
        heroPortrait,
      } = geometry.boxes;
      const initialLayout = {
        beam,
        clientWidth: geometry.clientWidth,
        header,
        hero: {
          ctaHeight: heroCta?.height ?? 0,
          namePortraitIntersection: intersectionArea(heroName, heroPortrait),
          portraitCtaIntersection: intersectionArea(heroPortrait, heroCta),
        },
        heroCta,
        heroName,
        heroPortrait,
        scrollWidth: geometry.scrollWidth,
      };
      const beamPresentation = await page.locator(".site-tracing-beam").evaluate((element) => ({
        count: document.querySelectorAll(".site-tracing-beam").length,
        headDisplay: getComputedStyle(
          element.querySelector(".site-tracing-beam__head"),
        ).display,
        pointerEvents: getComputedStyle(element).pointerEvents,
        position: getComputedStyle(element).position,
        progress: Number(element.getAttribute("data-trace-progress")),
        trackVisibility: getComputedStyle(
          element.querySelector(".site-tracing-beam__track"),
        ).visibility,
      }));
      const portraitLayout = await page.locator(".hero-pixel-portrait").evaluate((portrait) => {
        const canvas = portrait.querySelector(".hero-pixel-canvas");
        const bounds = canvas?.getBoundingClientRect();
        const context = canvas?.getContext("2d");
        const cellSize = Number.parseFloat(canvas?.dataset.cellSize ?? "0");
        let backgroundCenters = 0;
        let sampledCenters = 0;

        if (canvas && bounds && context && cellSize > 0) {
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const scaleX = canvas.width / bounds.width;
          const scaleY = canvas.height / bounds.height;
          for (let y = cellSize / 2; y < bounds.height; y += cellSize) {
            for (let x = cellSize / 2; x < bounds.width; x += cellSize) {
              const sampleX = Math.min(canvas.width - 1, Math.floor(x * scaleX));
              const sampleY = Math.min(canvas.height - 1, Math.floor(y * scaleY));
              const offset = (sampleY * canvas.width + sampleX) * 4;
              sampledCenters += 1;
              if (
                pixels[offset] === 5
                && pixels[offset + 1] === 7
                && pixels[offset + 2] === 11
              ) {
                backgroundCenters += 1;
              }
            }
          }
        }

        return {
          canvasCount: portrait.querySelectorAll(".hero-pixel-canvas").length,
          cellSize: canvas?.dataset.cellSize,
          fallbackCount: portrait.querySelectorAll(".hero-portrait-fallback").length,
          fallbackHeight: portrait.querySelector(".hero-portrait-fallback")?.getAttribute("height"),
          fallbackSource: portrait.querySelector(".hero-portrait-fallback")?.getAttribute("src"),
          fallbackWidth: portrait.querySelector(".hero-portrait-fallback")?.getAttribute("width"),
          idleBackgroundCenterRatio: sampledCenters > 0
            ? backgroundCenters / sampledCenters
            : null,
          maxFps: canvas?.dataset.maxFps,
          interactive: canvas?.dataset.interactive,
          maskImage: getComputedStyle(portrait).maskImage,
          opacity: getComputedStyle(portrait).opacity,
          pointerEvents: getComputedStyle(portrait).pointerEvents,
          ready: canvas?.dataset.pixelatedReady,
          terminalButtonCount: document.querySelectorAll(".terminal-button").length,
          terminalCount: document.querySelectorAll(".hero-terminal").length,
          touchAction: canvas ? getComputedStyle(canvas).touchAction : null,
          visible: getComputedStyle(portrait).visibility !== "hidden",
        };
      });
      const heroFlow = await page.evaluate(() => {
        const cta = document.querySelector(".hero-cta");
        const ctaLabel = cta?.querySelector(":scope > span:first-child");
        const ctaRange = document.createRange();
        if (ctaLabel) ctaRange.selectNodeContents(ctaLabel);

        return {
          ctaLineCount: ctaLabel ? ctaRange.getClientRects().length : 0,
        };
      });
      const contactPresentation = await page.evaluate(() => {
        const contact = document.querySelector("#contact");
        const directory = document.querySelector("#contact .contact-directory");
        const footer = document.querySelector("#contact .site-footer");
        const marqueeWindow = document.querySelector(".contact-marquee-window");
        const summary = document.querySelector(".contact-marquee-summary");
        const isVisible = (element) => {
          if (!element) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            style.display !== "none"
            && style.visibility !== "hidden"
            && Number.parseFloat(style.opacity) > 0
            && rect.width > 10
            && rect.height > 10
          );
        };

        return {
          directoryFooterGap: directory && footer
            ? footer.getBoundingClientRect().top - directory.getBoundingClientRect().bottom
            : null,
          footerBottomGap: contact && footer
            ? contact.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom
            : null,
          marqueeAnimationName: marqueeWindow
            ? getComputedStyle(marqueeWindow.querySelector(".contact-marquee-track")).animationName
            : null,
          marqueeWindowVisible: isVisible(marqueeWindow),
          summaryText: summary?.textContent?.replace(/\s+/g, " ").trim() ?? "",
          summaryVisible: isVisible(summary),
        };
      });
      const sectionRhythm = await page.evaluate(() => {
        const educationColumn = document.querySelector(".education-column");
        const toolchainColumn = document.querySelector(".toolchain-column");
        const educationRect = educationColumn?.getBoundingClientRect();
        const toolchainRect = toolchainColumn?.getBoundingClientRect();
        const aboutSectionRect = document.querySelector("#about")?.getBoundingClientRect();
        const aboutShellRect = document.querySelector(".about-layout")?.getBoundingClientRect();
        const aboutLoopRect = document.querySelector(".about-working-loop")?.getBoundingClientRect();
        const aboutStatementRect = document.querySelector(".about-statement")?.getBoundingClientRect();
        const aboutIntroductionRect = document.querySelector(".about-introduction")?.getBoundingClientRect();
        const aboutContextRects = Array.from(
          document.querySelectorAll(".about-context > div"),
        ).map((element) => element.getBoundingClientRect());
        const aboutStepElements = Array.from(document.querySelectorAll(".about-loop-step"));
        const aboutStepRects = aboutStepElements.map((element) => element.getBoundingClientRect());
        const shellSelectors = [
          ".site-header",
          ".hero-layout",
          ".about-layout",
          ".experience > .section-kicker",
          ".experience-log",
          ".experience > .section-footer",
          ".foundations > .section-kicker",
          ".foundations-grid",
          ".foundations > .section-footer",
          ".research > .section-kicker",
          ".research-frame",
          ".research > .section-footer",
          ".contact-inner",
        ];
        const alignmentShells = shellSelectors.map((selector) => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect ? {
            center: rect.left + rect.width / 2,
            left: rect.left,
            right: rect.right,
            selector,
          } : null;
        }).filter((metric) => metric !== null);
        const splitMetric = (selector) => {
          const element = document.querySelector(selector);
          const rect = element?.getBoundingClientRect();
          if (!element || !rect) return null;
          const style = getComputedStyle(element);
          const columns = style.gridTemplateColumns
            .split(/\s+/)
            .map((value) => Number.parseFloat(value));
          const parsedGap = Number.parseFloat(style.columnGap);
          const gap = Number.isFinite(parsedGap) ? parsedGap : 0;
          const contentLeft = Number.parseFloat(style.borderLeftWidth)
            + Number.parseFloat(style.paddingLeft);
          return {
            center: rect.left + rect.width / 2,
            columns,
            gap,
            seam: columns.length === 2
              ? rect.left + contentLeft + columns[0] + gap / 2
              : null,
            selector,
          };
        };

        return {
          alignmentShells,
          aboutPresentation: aboutShellRect && aboutLoopRect
            ? {
                context: aboutContextRects.map((rect) => ({
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  width: rect.width,
                })),
                forbiddenCount: document.querySelectorAll(
                  "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
                    + "#about [role='tablist'], #about [role='tabpanel']",
                ).length,
                introductionWidth: aboutIntroductionRect?.width ?? 0,
                loopLeftDelta: aboutLoopRect.left - aboutShellRect.left,
                loopRightDelta: aboutShellRect.right - aboutLoopRect.right,
                loopWidth: aboutLoopRect.width,
                sectionHeight: aboutSectionRect?.height ?? 0,
                shellWidth: aboutShellRect.width,
                statementWidth: aboutStatementRect?.width ?? 0,
                steps: aboutStepRects.map((rect, index) => ({
                  contentClipped: Array.from(
                    aboutStepElements[index].querySelectorAll(
                      ".about-loop-index, .about-loop-label, .about-loop-detail, .about-loop-outcome",
                    ),
                  ).some((element) => (
                    element.scrollWidth > element.clientWidth + 1
                    || element.scrollHeight > element.clientHeight + 1
                  )),
                  height: rect.height,
                  left: rect.left,
                  right: rect.right,
                  top: rect.top,
                  width: rect.width,
                })),
              }
            : null,
          centerSplits: [
            window.innerWidth > 1100 ? splitMetric(".foundations-grid") : null,
            window.innerWidth > 760 ? splitMetric(".research-packet") : null,
          ].filter((metric) => metric !== null),
          experienceLogoMetrics: Array.from(
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
          }).filter((metric) => metric !== null),
          educationAxisOffsets: (() => {
            const timeline = document.querySelector(".education-timeline");
            const timelineRect = timeline?.getBoundingClientRect();
            const railStyle = timeline ? getComputedStyle(timeline, "::before") : null;
            const railCenter = timelineRect && railStyle
              ? timelineRect.left
                + Number.parseFloat(railStyle.left)
                + Number.parseFloat(railStyle.width) / 2
              : null;
            return railCenter === null ? [] : Array.from(
              document.querySelectorAll(".education-node"),
            ).map((node) => {
              const rect = node.getBoundingClientRect();
              return Math.abs(rect.left + rect.width / 2 - railCenter);
            });
          })(),
          foundationsColumnGap: educationRect && toolchainRect
            ? toolchainRect.top - educationRect.bottom
            : null,
        };
      });

      assert.equal(
        initialLayout.scrollWidth,
        initialLayout.clientWidth,
        `${viewport.width}x${viewport.height} had horizontal overflow`,
      );
      assert.ok(initialLayout.header, `${viewport.width}x${viewport.height} header was missing`);
      assert.ok(
        initialLayout.header.left >= -0.5
          && initialLayout.header.right <= viewport.width + 0.5
          && initialLayout.header.top >= -0.5,
        `${viewport.width}x${viewport.height} header escaped the viewport: ${JSON.stringify(initialLayout.header)}`,
      );
      assert.ok(initialLayout.beam, `${viewport.width}x${viewport.height} tracing beam was missing`);
      assert.ok(
        initialLayout.beam.left >= -0.5
          && initialLayout.beam.right <= viewport.width + 0.5
          && initialLayout.beam.top >= initialLayout.header.bottom
          && initialLayout.beam.bottom <= viewport.height + 0.5
          && initialLayout.beam.left <= 24
          && initialLayout.beam.right <= initialLayout.header.left - 3.5,
        `${viewport.width}x${viewport.height} tracing beam escaped its left rail: `
          + `${JSON.stringify(initialLayout.beam)}`,
      );
      assert.deepEqual(beamPresentation, {
        count: 1,
        headDisplay: "grid",
        pointerEvents: "none",
        position: "fixed",
        progress: 0,
        trackVisibility: "visible",
      });
      assert.equal(
        sectionRhythm.alignmentShells.length,
        13,
        `${viewport.width}x${viewport.height} did not render every alignment shell`,
      );
      for (const edge of ["left", "center", "right"]) {
        const positions = sectionRhythm.alignmentShells.map((metric) => metric[edge]);
        assert.ok(
          Math.max(...positions) - Math.min(...positions) <= 0.75,
          `${viewport.width}x${viewport.height} ${edge} alignment diverged: `
            + sectionRhythm.alignmentShells
              .map((metric) => `${metric.selector}=${metric[edge].toFixed(2)}`)
              .join(", "),
        );
      }
      for (const split of sectionRhythm.centerSplits) {
        assert.equal(
          split.columns.length,
          2,
          `${viewport.width}x${viewport.height} ${split.selector} did not render two columns`,
        );
        assert.ok(
          Math.abs(split.columns[0] - split.columns[1]) <= 0.75,
          `${viewport.width}x${viewport.height} ${split.selector} columns diverged: `
            + `${split.columns.join(", ")}`,
        );
        assert.ok(
          split.seam !== null && Math.abs(split.seam - split.center) <= 0.75,
          `${viewport.width}x${viewport.height} ${split.selector} center seam=`
            + `${split.seam}px, shell center=${split.center}px`,
        );
      }
      assert.ok(
        sectionRhythm.aboutPresentation,
        `${viewport.width}x${viewport.height} About presentation was missing`,
      );
      assert.equal(sectionRhythm.aboutPresentation.forbiddenCount, 0);
      assert.ok(
        Math.abs(sectionRhythm.aboutPresentation.loopLeftDelta) <= 0.75
          && Math.abs(sectionRhythm.aboutPresentation.loopRightDelta) <= 0.75
          && Math.abs(
            sectionRhythm.aboutPresentation.loopWidth
              - sectionRhythm.aboutPresentation.shellWidth,
          ) <= 1,
        `${viewport.width}x${viewport.height} About working loop did not span its shell: `
          + JSON.stringify(sectionRhythm.aboutPresentation),
      );
      assert.equal(sectionRhythm.aboutPresentation.context.length, 1);
      assert.equal(sectionRhythm.aboutPresentation.steps.length, 4);
      if (viewport.width <= 430) {
        assert.ok(
          sectionRhythm.aboutPresentation.sectionHeight >= 680
            && sectionRhythm.aboutPresentation.sectionHeight <= 940,
          `${viewport.width}x${viewport.height} About height=`
            + `${sectionRhythm.aboutPresentation.sectionHeight}px; expected 680-940px`,
        );
      }
      assert.equal(
        sectionRhythm.aboutPresentation.steps.every(({ contentClipped }) => !contentClipped),
        true,
        `${viewport.width}x${viewport.height} clipped Context path content: `
          + JSON.stringify(sectionRhythm.aboutPresentation.steps),
      );
      if (viewport.width >= 1280) {
        assert.ok(
          sectionRhythm.aboutPresentation.statementWidth
            > sectionRhythm.aboutPresentation.introductionWidth,
          `${viewport.width}x${viewport.height} About lost its editorial title hierarchy`,
        );
        const [step0, step1, step2, step3] = sectionRhythm.aboutPresentation.steps;
        assert.ok(Math.max(step0.top, step1.top, step2.top, step3.top)
          - Math.min(step0.top, step1.top, step2.top, step3.top) <= 1);
        assert.ok(Math.max(step0.width, step1.width, step2.width, step3.width)
          - Math.min(step0.width, step1.width, step2.width, step3.width) <= 1);
        assert.ok(step0.left < step1.left && step1.left < step2.left && step2.left < step3.left);
      } else {
        const steps = sectionRhythm.aboutPresentation.steps;
        assert.ok(Math.max(...steps.map(({ left }) => left))
          - Math.min(...steps.map(({ left }) => left)) <= 1);
        assert.ok(Math.max(...steps.map(({ width }) => width))
          - Math.min(...steps.map(({ width }) => width)) <= 1);
        for (let index = 1; index < steps.length; index += 1) {
          assert.ok(steps[index].top >= steps[index - 1].top + steps[index - 1].height - 1);
        }
      }
      const [contextEntry] = sectionRhythm.aboutPresentation.context;
      assert.ok(contextEntry.width > 0 && contextEntry.height > 0);
      assert.equal(
        await page.locator(".hero-positioning").count(),
        0,
        `${viewport.width}x${viewport.height} retained the removed hero positioning line`,
      );
      assert.ok(heroPortrait.width > 0 && heroPortrait.height > 0);
      if (viewport.width <= 900) {
        assert.ok(
          heroName.bottom <= heroPortrait.top + 1
            && heroPortrait.bottom <= heroCta.top + 1,
          `${viewport.width}x${viewport.height} mobile Hero order was not `
            + `JAXON → portrait → CTA: ${JSON.stringify({ heroCta, heroName, heroPortrait })}`,
        );
      }
      assert.ok(
        initialLayout.hero.ctaHeight >= 44,
        `${viewport.width}x${viewport.height} hero CTA height=${initialLayout.hero.ctaHeight}px`,
      );
      assert.equal(
        heroFlow.ctaLineCount,
        1,
        `${viewport.width}x${viewport.height} wrapped the hero CTA across `
          + `${heroFlow.ctaLineCount} lines`,
      );
      assert.equal(
        contactPresentation.summaryVisible,
        false,
        `${viewport.width}x${viewport.height} exposed the screen-reader contact summary`,
      );
      assert.equal(
        contactPresentation.marqueeWindowVisible,
        true,
        `${viewport.width}x${viewport.height} hid the contact marquee`,
      );
      assert.equal(
        contactPresentation.marqueeAnimationName,
        "contact-marquee",
        `${viewport.width}x${viewport.height} removed the contact marquee animation`,
      );
      assert.equal(
        contactPresentation.summaryText,
        "For project collaborations, technical consulting, or career opportunities, feel free to reach out.",
        `${viewport.width}x${viewport.height} changed the contact message`,
      );
      assert.ok(
        contactPresentation.directoryFooterGap >= 36
          && contactPresentation.directoryFooterGap <= 96,
        `${viewport.width}x${viewport.height} contact directory/footer gap=`
          + `${contactPresentation.directoryFooterGap}px`,
      );
      assert.ok(
        contactPresentation.footerBottomGap >= 72
          && contactPresentation.footerBottomGap <= 128,
        `${viewport.width}x${viewport.height} contact footer bottom gap=`
          + `${contactPresentation.footerBottomGap}px`,
      );
      if (viewport.width <= 760) {
        assert.ok(
          sectionRhythm.foundationsColumnGap >= 48
            && sectionRhythm.foundationsColumnGap <= 72,
          `${viewport.width}x${viewport.height} foundations column gap=`
            + `${sectionRhythm.foundationsColumnGap}px`,
        );
      }
      if (viewport.width >= 1101) {
        const logoRightEdges = sectionRhythm.experienceLogoMetrics.map(({ right }) => right);
        assert.ok(
          Math.max(...logoRightEdges) - Math.min(...logoRightEdges) <= 0.75,
          `${viewport.width}x${viewport.height} experience logo right edges diverged: `
            + `${logoRightEdges.join(", ")}`,
        );
        for (const { gap } of sectionRhythm.experienceLogoMetrics) {
          assert.ok(
            gap >= 12,
            `${viewport.width}x${viewport.height} experience copy/logo gap=${gap}px`,
          );
        }
        for (const { rightInset } of sectionRhythm.experienceLogoMetrics) {
          assert.ok(
            rightInset !== null && Math.abs(rightInset) <= 0.75,
            `${viewport.width}x${viewport.height} experience logo right inset=${rightInset}px`,
          );
        }
      }
      for (const offset of sectionRhythm.educationAxisOffsets) {
        assert.ok(
          offset <= 0.25,
          `${viewport.width}x${viewport.height} education node/rail offset=${offset}px`,
        );
      }
      assert.ok(initialLayout.heroPortrait?.width > 0 && initialLayout.heroPortrait?.height > 0);
      assert.deepEqual(portraitLayout, {
        canvasCount: 1,
        cellSize: "5",
        fallbackCount: 1,
        fallbackHeight: "1200",
        fallbackSource: "/assets/jaxon-sea-portrait.webp",
        fallbackWidth: "1200",
        idleBackgroundCenterRatio: 0,
        interactive: "true",
        maskImage: "none",
        maxFps: "60",
        opacity: "1",
        pointerEvents: "auto",
        ready: "true",
        terminalButtonCount: 0,
        terminalCount: 0,
        touchAction: "pan-y pinch-zoom",
        visible: true,
      });
      for (const [pair, area] of Object.entries(initialLayout.hero)) {
        if (pair === "ctaHeight") continue;
        assert.ok(
          area <= 1,
          `${viewport.width}x${viewport.height} hero ${pair}=${area.toFixed(2)}px²`,
        );
      }

      const menuButton = page.locator('button[aria-controls="primary-navigation"]');
      const navigation = page.locator("#primary-navigation");
      const openMobileNavigation = async () => {
        await menuButton.click();
        try {
          await page.waitForFunction(() => (
            document.querySelector('[aria-controls="primary-navigation"]')
              ?.getAttribute("aria-expanded") === "true"
            && getComputedStyle(document.querySelector("#primary-navigation")).visibility === "visible"
            && Array.from(document.querySelectorAll("#primary-navigation a")).every((link) => {
              const rect = link.getBoundingClientRect();
              return (
                rect.width >= 44
                && rect.height >= 44
                && Number.parseFloat(getComputedStyle(link).opacity) >= 0.99
              );
            })
          ), null, { timeout: 2_000 });
        } catch (error) {
          const state = await page.evaluate(() => {
            const menu = document.querySelector("#primary-navigation");
            return {
              expanded: document.querySelector('[aria-controls="primary-navigation"]')
                ?.getAttribute("aria-expanded"),
              hash: location.hash,
              links: Array.from(menu?.querySelectorAll("a") ?? []).map((link) => {
                const rect = link.getBoundingClientRect();
                return {
                  height: rect.height,
                  opacity: getComputedStyle(link).opacity,
                  width: rect.width,
                };
              }),
              menuVisibility: menu ? getComputedStyle(menu).visibility : "missing",
              scrollY,
            };
          });
          throw new Error(
            `Mobile navigation did not open at ${viewport.width}x${viewport.height}: `
              + `${JSON.stringify(state)}; ${String(error)}`,
          );
        }
      };
      if (viewport.width <= 900) {
        const menuButtonBox = await menuButton.boundingBox();
        assert.ok(menuButtonBox);
        assert.ok(
          menuButtonBox.width >= 44 && menuButtonBox.height >= 44,
          `${viewport.width}x${viewport.height} menu target was ${menuButtonBox.width}x${menuButtonBox.height}`,
        );
        assert.equal(await menuButton.getAttribute("aria-expanded"), "false");
        assert.equal(await navigation.evaluate((element) => getComputedStyle(element).visibility), "hidden");

        await openMobileNavigation();
        const menuTargets = await navigation.locator("a").evaluateAll((links) => (
          links.map((link) => {
            const rect = link.getBoundingClientRect();
            return { height: rect.height, width: rect.width };
          })
        ));
        for (const target of menuTargets) {
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${viewport.width}x${viewport.height} menu link was ${target.width}x${target.height}`,
          );
        }
        await page.keyboard.press("Escape");
        await page.waitForFunction(() => (
          document.querySelector('[aria-controls="primary-navigation"]')
            ?.getAttribute("aria-expanded") === "false"
          && getComputedStyle(document.querySelector("#primary-navigation")).visibility === "hidden"
        ));
      } else {
        assert.equal(await menuButton.isVisible(), false);
        const desktopTargets = await navigation.locator("a").evaluateAll((links) => (
          links.map((link) => {
            const rect = link.getBoundingClientRect();
            return {
              height: rect.height,
              visibility: getComputedStyle(link).visibility,
              width: rect.width,
            };
          })
        ));
        for (const target of desktopTargets) {
          assert.equal(target.visibility, "visible");
          assert.ok(
            target.width >= 44 && target.height >= 44,
            `${viewport.width}x${viewport.height} desktop nav link was ${target.width}x${target.height}`,
          );
        }
      }

      if (viewport.width <= 900) {
        await page.locator('a.hero-cta[href="#about"]').click();
        await page.waitForFunction(() => (
          location.hash === "#about"
          && document.activeElement?.id === "about"
          && Math.abs(document.querySelector("#about")?.getBoundingClientRect().top ?? Infinity) <= 1
        ));
        const aboutLanding = await page.evaluate(() => ({
          headerBottom: document.querySelector(".site-header")?.getBoundingClientRect().bottom
            ?? Infinity,
          kickerTop: document.querySelector("#about .about-kicker")?.getBoundingClientRect().top
            ?? -Infinity,
        }));
        assert.ok(
          aboutLanding.kickerTop >= aboutLanding.headerBottom,
          `${viewport.width}x${viewport.height} CTA landing placed About kicker at `
            + `${aboutLanding.kickerTop}px under header bottom ${aboutLanding.headerBottom}px`,
        );

        await page.locator('a.wordmark[href="#hero"]').click();
        await page.waitForFunction(() => (
          location.hash === "#hero"
          && document.activeElement?.id === "hero"
          && scrollY <= 1
        ));
      }

      for (const id of ["about", "experience", "foundations", "research", "contact"]) {
        const link = page.locator(`#primary-navigation a[href="#${id}"]`);
        if (viewport.width <= 900) {
          await openMobileNavigation();
        }
        await link.click();
        await page.waitForFunction((sectionId) => (
          location.hash === `#${sectionId}`
          && document.activeElement?.id === sectionId
          && document.querySelector(`a[href="#${sectionId}"]`)
            ?.getAttribute("aria-current") === "location"
        ), id);
        try {
          await page.waitForFunction((sectionId) => {
            const targetTop = document.getElementById(sectionId)?.getBoundingClientRect().top
              ?? Number.POSITIVE_INFINITY;
            const maxScrollY = document.documentElement.scrollHeight - innerHeight;
            return (
              Math.abs(targetTop) <= 1
              || Math.abs(scrollY - maxScrollY) <= 1
            );
          }, id, { timeout: 2_000 });
        } catch (error) {
          const state = await page.evaluate((sectionId) => ({
            id: sectionId,
            maxScrollY: document.documentElement.scrollHeight - innerHeight,
            scrollY,
            targetTop: document.getElementById(sectionId)?.getBoundingClientRect().top,
          }), id);
          throw new Error(
            `${viewport.width}x${viewport.height} navigation scroll did not settle: `
            + `${JSON.stringify(state)}; ${String(error)}`,
          );
        }
        try {
          await page.waitForFunction((sectionId) => {
            const section = document.getElementById(sectionId);
            const reveal = section?.querySelector(
              sectionId === "about" ? ".about-layout.reveal" : ".section-kicker.reveal",
            );
            if (!section || !reveal || section.dataset.sectionVisible !== "true") {
              return false;
            }

            const revealStyle = getComputedStyle(reveal);
            const revealTransform = new DOMMatrixReadOnly(revealStyle.transform);
            const revealSettled = Number.parseFloat(revealStyle.opacity) >= 0.99
              && Math.abs(revealTransform.m42) <= 0.5;
            if (!revealSettled) return false;

            if (sectionId === "about") {
              const steps = Array.from(section.querySelectorAll(".about-loop-step"));
              return steps.length === 4
                && steps.every((step) => {
                  const rect = step.getBoundingClientRect();
                  const style = getComputedStyle(step);
                  return rect.width > 0
                    && rect.height > 0
                    && style.visibility !== "hidden"
                    && Number.parseFloat(style.opacity) > 0;
                })
                && section.querySelectorAll(
                  "canvas, [class*='about-particle'], [role='tab'], "
                    + "[role='tablist'], [role='tabpanel']",
                ).length === 0;
            }
            if (sectionId === "experience") {
              const log = section.querySelector(".experience-log");
              const node = section.querySelector(".timeline-node");
              return (
                log
                && !log.classList.contains("reveal")
                && section.querySelectorAll(".experience-scan-track").length === 0
                && !section.hasAttribute("data-trace-motion")
                && !log.hasAttribute("data-trace-progress")
                && getComputedStyle(log, "::before").backgroundImage !== "none"
                && getComputedStyle(node, "::before").animationName === "none"
              );
            }
            if (sectionId === "research") {
              const canvases = Array.from(section.querySelectorAll(".research-canvas"));
              const statesMatchVisibility = canvases.every((canvas) => {
                const rect = canvas.getBoundingClientRect();
                const visibleHeight = Math.max(
                  0,
                  Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0),
                );
                const visibleRatio = rect.height > 0 ? visibleHeight / rect.height : 0;
                const expectedMotion = visibleRatio >= 0.05 ? "running" : "paused";
                return canvas.getAttribute("data-motion") === expectedMotion;
              });
              return statesMatchVisibility
                && canvases.some((canvas) => canvas.getAttribute("data-motion") === "running");
            }
            if (sectionId === "contact") {
              return getComputedStyle(
                section.querySelector(".contact-marquee-track"),
              ).animationPlayState === "running";
            }
            return true;
          }, id, { timeout: 2_500 });
        } catch (error) {
          const state = await page.evaluate((sectionId) => {
            const section = document.getElementById(sectionId);
            const reveal = section?.querySelector(
              sectionId === "about" ? ".about-layout.reveal" : ".section-kicker.reveal",
            );
            const revealStyle = reveal ? getComputedStyle(reveal) : null;
            const revealTransform = revealStyle
              ? new DOMMatrixReadOnly(revealStyle.transform)
              : null;
            return {
              aboutLedger: sectionId === "about"
                ? {
                    contextCount: section.querySelectorAll(".about-context > div").length,
                    forbiddenCount: section.querySelectorAll(
                      "canvas, [class*='about-particle'], [role='tab'], "
                        + "[role='tablist'], [role='tabpanel']",
                    ).length,
                    stepCount: section.querySelectorAll(".about-loop-step").length,
                  }
                : null,
              canvasMotion: Array.from(
                section?.querySelectorAll(".research-canvas") ?? [],
              ).map((canvas) => {
                const rect = canvas.getBoundingClientRect();
                return {
                  bottom: rect.bottom,
                  motion: canvas.getAttribute("data-motion"),
                  top: rect.top,
                };
              }),
              marquee: section?.querySelector(".contact-marquee-track")
                ? getComputedStyle(
                    section.querySelector(".contact-marquee-track"),
                  ).animationPlayState
                : null,
              marqueeWindowDisplay: section?.querySelector(".contact-marquee-window")
                ? getComputedStyle(
                    section.querySelector(".contact-marquee-window"),
                  ).display
                : null,
              revealOpacity: revealStyle?.opacity ?? null,
              revealTranslateY: revealTransform?.m42 ?? null,
              guide: section?.querySelector(".experience-log")
                ? {
                    nodeAnimation: getComputedStyle(
                      section.querySelector(".timeline-node"),
                      "::before",
                    ).animationName,
                    scanCount: section.querySelectorAll(".experience-scan-track").length,
                    traceMotion: section.getAttribute("data-trace-motion"),
                    traceProgress: section.querySelector(".experience-log")
                      ?.getAttribute("data-trace-progress"),
                  }
                : null,
              sectionVisible: section?.dataset.sectionVisible ?? null,
              summary: section?.querySelector(".contact-marquee-summary")
                ? (() => {
                    const summary = section.querySelector(".contact-marquee-summary");
                    const rect = summary.getBoundingClientRect();
                    return {
                      height: rect.height,
                      visibility: getComputedStyle(summary).visibility,
                      width: rect.width,
                    };
                  })()
                : null,
              scrollY,
            };
          }, id);
          throw new Error(
            `${viewport.width}x${viewport.height} ${id} lifecycle did not settle: `
              + `${JSON.stringify(state)}; ${String(error)}`,
          );
        }
      }

      const sectionChecks = await page.evaluate(() => {
        const definitions = [
          {
            id: "hero",
            selectors: [
              ".hero-name",
              ".hero-pixel-portrait",
              ".hero-cta",
            ],
          },
          {
            id: "about",
            selectors: [
              "#about-title",
              ".about-kicker",
              ".about-statement",
              ".about-introduction",
              "#about-loop-title",
              ".about-loop-list",
              ".about-loop-step",
              ".about-loop-detail",
              ".about-loop-outcome",
              ".about-context > div",
            ],
          },
          {
            id: "experience",
            selectors: [
              "#experience-title",
              ".experience-entry-copy h3",
              ".experience-group-heading h3",
              ".experience-brand-logo--bytedance",
              ".experience-brand-logo--alibaba",
            ],
          },
          {
            id: "foundations",
            selectors: [
              "#foundations-title",
              ".education-item:nth-child(1) h3",
              ".education-item:nth-child(2) h3",
              ".toolchain-module:first-child",
              ".toolchain-module:last-child",
            ],
          },
          {
            id: "research",
            selectors: [
              "#research-title",
              ".research-packet:first-child h3",
              ".research-packet:last-child h3",
              ".research-packet:first-child .paper-link",
              ".research-packet:last-child .paper-link",
              ".paper-visual.is-wave",
              ".paper-visual.is-road",
            ],
          },
          {
            id: "contact",
            selectors: [
              "#contact-title",
              ".contact-marquee",
              ".contact-socials a",
              ".site-footer",
            ],
          },
        ];

        return definitions.flatMap(({ id, selectors }) => {
          const section = document.getElementById(id);
          const sectionRect = section.getBoundingClientRect();

          return selectors.flatMap((selector) => (
            Array.from(section.querySelectorAll(selector)).map((element) => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                clippedHorizontally: (
                  rect.left < sectionRect.left - 1
                  || rect.right > sectionRect.right + 1
                  || rect.left < -1
                  || rect.right > innerWidth + 1
                ),
                clippedVertically: (
                  rect.top < sectionRect.top - 1
                  || rect.bottom > sectionRect.bottom + 1
                ),
                height: rect.height,
                id,
                opacity: Number.parseFloat(style.opacity),
                selector,
                visibility: style.visibility,
                width: rect.width,
              };
            })
          ));
        });
      });

      for (const check of sectionChecks) {
        assert.ok(
          check.width > 0 && check.height > 0,
          `${viewport.width}x${viewport.height} ${check.id} ${check.selector} had no box`,
        );
        assert.equal(
          check.visibility,
          "visible",
          `${viewport.width}x${viewport.height} ${check.id} ${check.selector} was hidden`,
        );
        assert.ok(
          check.opacity > 0,
          `${viewport.width}x${viewport.height} ${check.id} ${check.selector} was transparent`,
        );
        assert.equal(
          check.clippedHorizontally,
          false,
          `${viewport.width}x${viewport.height} ${check.id} ${check.selector} was horizontally clipped`,
        );
        assert.equal(
          check.clippedVertically,
          false,
          `${viewport.width}x${viewport.height} ${check.id} ${check.selector} escaped its section`,
        );
      }

      const actionTargets = await page.evaluate(() => {
        const selectors = [
          ".hero-cta",
          ".paper-link",
          ".contact-socials a",
          ".mobile-load-feedback__retry",
        ];
        return selectors.flatMap((selector) => (
          Array.from(document.querySelectorAll(selector)).flatMap((element) => {
            const style = getComputedStyle(element);
            if (
              style.display === "none"
              || style.visibility === "hidden"
              || Number.parseFloat(style.opacity) === 0
            ) {
              return [];
            }
            const rect = element.getBoundingClientRect();
            return [{ height: rect.height, selector, width: rect.width }];
          })
        ));
      });
      for (const target of actionTargets) {
        assert.ok(
          target.width >= 44 && target.height >= 44,
          `${viewport.width}x${viewport.height} ${target.selector} target was ${target.width}x${target.height}`,
        );
      }

      await page.locator("#foundations").scrollIntoViewIfNeeded();
      await page.waitForFunction(() => (
        Array.from(document.querySelectorAll(
          ".experience-brand-logo, .education-crest",
        )).every((image) => image.complete && image.naturalWidth > 0)
      ), null, { timeout: 3_000 });

      const layout = await page.evaluate(() => {
        const round = (value) => Math.round(value * 100) / 100;
        const titleMetrics = (selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          return {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            lineHeight: style.lineHeight,
            x: round(box.x),
          };
        };
        const railMetrics = (selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          const guide = getComputedStyle(element, "::before");
          const relativeX = Number.parseFloat(guide.left);
          const width = Number.parseFloat(guide.width);

          return {
            absoluteCenterX: round(box.x + relativeX + width / 2),
            absoluteX: round(box.x + relativeX),
            backgroundImage: guide.backgroundImage,
            height: round(Number.parseFloat(guide.height)),
            relativeX: round(relativeX),
            width: round(width),
          };
        };
        const logoMetrics = (selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);

          return {
            centerX: round(box.x + box.width / 2),
            renderedHeight: round(box.height),
            renderedWidth: round(box.width),
            slotHeight: round(Number.parseFloat(style.height)),
            slotWidth: round(Number.parseFloat(style.width)),
          };
        };

        const logoSelectors = [
          ".experience-brand-logo--bytedance",
          ".experience-brand-logo--alibaba",
          'img[src="/assets/logo-ntu.svg"]',
          'img[src="/assets/logo-seu-color.svg"]',
        ];

        return {
          aboutRail: railMetrics(".about-loop-list"),
          logos: logoSelectors.map(logoMetrics),
          rails: [
            railMetrics(".experience-log"),
            railMetrics(".education-timeline"),
            railMetrics(".toolchain-list"),
          ],
          titles: [
            titleMetrics(".experience-entry-copy h3"),
            titleMetrics(".experience-group-heading h3"),
            titleMetrics(".education-item:nth-child(1) h3"),
            titleMetrics(".education-item:nth-child(2) h3"),
          ],
        };
      });

      const [referenceTitle, ...otherTitles] = layout.titles;
      for (const title of otherTitles) {
        assert.deepEqual(
          {
            fontFamily: title.fontFamily,
            fontSize: title.fontSize,
            fontWeight: title.fontWeight,
            letterSpacing: title.letterSpacing,
            lineHeight: title.lineHeight,
          },
          {
            fontFamily: referenceTitle.fontFamily,
            fontSize: referenceTitle.fontSize,
            fontWeight: referenceTitle.fontWeight,
            letterSpacing: referenceTitle.letterSpacing,
            lineHeight: referenceTitle.lineHeight,
          },
          `${viewport.width}x${viewport.height} title typography diverged`,
        );
        assert.ok(
          Math.abs(title.x - referenceTitle.x) <= 0.75,
          `${viewport.width}x${viewport.height} title x=${title.x}px did not align with ${referenceTitle.x}px`,
        );
      }

      const railOffsets = layout.rails.map(({ relativeX }) => relativeX);
      assert.ok(
        Math.max(...railOffsets) - Math.min(...railOffsets) <= 0.75,
        `${viewport.width}x${viewport.height} rail offsets diverged: ${railOffsets.join(", ")}`,
      );

      if (viewport.width <= 1100) {
        const railPositions = layout.rails.map(({ absoluteX }) => absoluteX);
        assert.ok(
          Math.max(...railPositions) - Math.min(...railPositions) <= 0.75,
          `${viewport.width}x${viewport.height} stacked rail positions diverged: ${railPositions.join(", ")}`,
        );
      }

      if (viewport.width <= 900) {
        const mobileRails = [layout.aboutRail, ...layout.rails];
        const railPositions = mobileRails.map(({ absoluteCenterX }) => absoluteCenterX);
        assert.ok(
          Math.max(...railPositions) - Math.min(...railPositions) <= 0.75,
          `${viewport.width}x${viewport.height} internal guide centers diverged: ${railPositions.join(", ")}`,
        );
        for (const rail of mobileRails) {
          assert.ok(rail.width <= 1.25, `${viewport.width}x${viewport.height} guide was ${rail.width}px wide`);
          assert.ok(rail.height >= 48, `${viewport.width}x${viewport.height} guide was ${rail.height}px tall`);
          assert.notEqual(rail.backgroundImage, "none");
        }
      } else if (viewport.width >= 1280) {
        assert.ok(layout.aboutRail.height <= 1.25);
        assert.ok(layout.aboutRail.width >= 100);
        assert.notEqual(layout.aboutRail.backgroundImage, "none");
      }

      if (viewport.width <= 760) {
        const logoCenters = layout.logos.map(({ centerX }) => centerX);
        assert.ok(
          Math.max(...logoCenters) - Math.min(...logoCenters) <= 0.75,
          `${viewport.width}x${viewport.height} logo centers diverged: ${logoCenters.join(", ")}`,
        );
        const mirroredRails = [
          layout.rails[0],
          layout.rails[0],
          layout.rails[1],
          layout.rails[1],
        ];
        logoCenters.forEach((centerX, index) => {
          assert.ok(
            Math.abs(centerX + mirroredRails[index].absoluteX - (viewport.width - 4)) <= 0.75,
            `${viewport.width}x${viewport.height} logo ${index + 1} is not 4px left of its mirrored guide position: rail=${mirroredRails[index].absoluteX}px logo=${centerX}px`,
          );
        });
      }

      const expectedSlotSize = viewport.width <= 760
        ? 48
        : viewport.width >= 1101
          ? 86
          : 96;
      for (const logo of layout.logos) {
        assert.equal(
          logo.slotWidth,
          expectedSlotSize,
          `${viewport.width}x${viewport.height} logo slot width=${logo.slotWidth}px`,
        );
        assert.equal(
          logo.slotHeight,
          expectedSlotSize,
          `${viewport.width}x${viewport.height} logo slot height=${logo.slotHeight}px`,
        );
      }

      const renderedEdges = layout.logos.map(
        ({ renderedHeight, renderedWidth }) => Math.max(renderedHeight, renderedWidth),
      );
      const meanRenderedEdge = (
        renderedEdges.reduce((total, edge) => total + edge, 0)
        / renderedEdges.length
      );
      const renderedEdgeSpread = (
        Math.max(...renderedEdges) - Math.min(...renderedEdges)
      ) / meanRenderedEdge;
      assert.ok(
        renderedEdgeSpread <= 0.1,
        `${viewport.width}x${viewport.height} rendered logo sizes diverged: ${renderedEdges.join(", ")}`,
      );
      assert.deepEqual(
        browserErrors,
        [],
        `${viewport.width}x${viewport.height} browser errors: ${browserErrors.join(" | ")}`,
      );
      console.log(`[release-viewport] ${viewport.width}x${viewport.height}: PASS`);
    } finally {
      await context.close();
    }
  }
});

test("release build meets mobile Core Web Vitals thresholds with executable INP", { timeout: 60_000 }, async () => {
  for (let sampleNumber = 1; sampleNumber <= 3; sampleNumber += 1) {
    const metrics = await runPerformanceSample(sampleNumber);

    assert.equal(metrics.supported.lcp, true, "LCP PerformanceObserver is unavailable");
    assert.equal(metrics.supported.cls, true, "CLS PerformanceObserver is unavailable");
    assert.equal(metrics.supported.event, true, "Event Timing API is unavailable");
    assert.equal(metrics.supported.firstInput, true, "First Input Timing API is unavailable");
    assert.ok(metrics.lcp > 0, `sample ${sampleNumber} did not produce an LCP sample`);
    assert.ok(
      metrics.lcp <= releaseLimits.lcp,
      `sample ${sampleNumber} LCP ${metrics.lcp.toFixed(1)}ms exceeded ${releaseLimits.lcp}ms`,
    );
    assert.ok(
      metrics.cls <= releaseLimits.cls,
      `sample ${sampleNumber} CLS ${metrics.cls.toFixed(4)} exceeded ${releaseLimits.cls}`,
    );
    assert.ok(
      metrics.interactionCount > 0 && metrics.inp > 0,
      `sample ${sampleNumber} did not produce an executable INP sample`,
    );
    assert.ok(
      metrics.inp <= releaseLimits.inp,
      `sample ${sampleNumber} INP ${metrics.inp.toFixed(1)}ms exceeded ${releaseLimits.inp}ms`,
    );
  }
});
