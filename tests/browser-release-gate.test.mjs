import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
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
      document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-state") === "complete"
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

test("mobile users see loading feedback until primary assets finish", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const feedbackScriptRequested = deferred();
  const releaseFeedbackScript = deferred();
  const heroRequested = deferred();
  const releaseHero = deferred();

  await context.route("**/assets/MobileLoadFeedback-*.js", async (route) => {
    feedbackScriptRequested.resolve();
    await releaseFeedbackScript.promise;
    await route.continue();
  });
  await context.route("**/assets/hero-processor-field-optimized.webp", async (route) => {
    heroRequested.resolve();
    await releaseHero.promise;
    await route.continue();
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "domcontentloaded" });
    await within(feedbackScriptRequested.promise, "the loading-feedback script request");
    await within(heroRequested.promise, "the primary image request");

    const feedback = page.getByTestId("mobile-load-feedback");
    assert.equal(await feedback.getAttribute("data-state"), "loading");
    assert.equal(await feedback.getAttribute("data-visible"), "true");
    assert.equal(await feedback.getAttribute("aria-hidden"), "false");
    assert.equal(await feedback.getAttribute("role"), "status");
    assert.equal(await feedback.getAttribute("aria-live"), "polite");
    assert.match(await feedback.textContent(), /Loading visual assets/i);
    await assertFeedbackFitsViewport(page, feedback);

    releaseFeedbackScript.resolve();
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="mobile-load-feedback"]');
      return element?.getAttribute("data-state") === "loading"
        && element?.getAttribute("data-visible") === "true";
    }, null, { timeout: 3_000 });

    releaseHero.resolve();
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-state") === "complete"
    ), null, { timeout: 3_000 });
    assert.match(await feedback.textContent(), /Interface ready/i);
    await page.waitForFunction(() => (
      document.querySelector('[data-testid="mobile-load-feedback"]')
        ?.getAttribute("data-visible") === "false"
    ), null, { timeout: 3_000 });
  } finally {
    releaseFeedbackScript.resolve();
    releaseHero.resolve();
    await context.close();
  }
});

test("asset failures expose an accessible persistent error state", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });

  try {
    await context.route(
      "**/assets/hero-processor-field-optimized.webp",
      (route) => route.abort("failed"),
    );
    const page = await context.newPage();
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });

    const feedback = page.getByTestId("mobile-load-feedback");
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

test("profile titles, rails, and organization logos share one responsive alignment system", { timeout: 30_000 }, async () => {
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
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport,
    });

    try {
      const page = await context.newPage();
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
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
          const relativeX = Number.parseFloat(
            getComputedStyle(element, "::before").left,
          );

          return {
            absoluteX: round(box.x + relativeX),
            relativeX: round(relativeX),
          };
        };
        const logoMetrics = (selector) => {
          const element = document.querySelector(selector);
          const box = element.getBoundingClientRect();

          return {
            centerX: round(box.x + box.width / 2),
          };
        };
        const opticalLogoWeight = (selector) => {
          const image = document.querySelector(selector);
          const style = getComputedStyle(image);
          const slotWidth = Number.parseFloat(style.width);
          const slotHeight = Number.parseFloat(style.height);
          const matrix = style.transform === "none"
            ? new DOMMatrixReadOnly()
            : new DOMMatrixReadOnly(style.transform);
          const scale = Math.abs(matrix.a);
          const intrinsicRatio = image.naturalWidth / image.naturalHeight;
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(slotWidth);
          canvas.height = Math.round(slotHeight);
          let drawWidth = canvas.width;
          let drawHeight = canvas.height;

          if (intrinsicRatio > 1) {
            drawHeight = canvas.width / intrinsicRatio;
          } else {
            drawWidth = canvas.height * intrinsicRatio;
          }

          const context2d = canvas.getContext("2d");
          context2d.drawImage(
            image,
            (canvas.width - drawWidth) / 2,
            (canvas.height - drawHeight) / 2,
            drawWidth,
            drawHeight,
          );
          const pixels = context2d.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let alphaArea = 0;

          for (let index = 3; index < pixels.length; index += 4) {
            alphaArea += pixels[index] / 255;
          }

          return {
            slotHeight: round(slotHeight),
            slotWidth: round(slotWidth),
            weight: round(scale * alphaArea ** 0.15),
          };
        };

        const logoSelectors = [
          ".experience-brand-logo--bytedance",
          ".experience-brand-logo--alibaba",
          'img[src="/assets/logo-ntu.svg"]',
          'img[src="/assets/logo-seu-color.svg"]',
        ];

        return {
          logos: logoSelectors.map(logoMetrics),
          opticalLogos: logoSelectors.map(opticalLogoWeight),
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

      if (viewport.width <= 760) {
        const logoCenters = layout.logos.map(({ centerX }) => centerX);
        assert.ok(
          Math.max(...logoCenters) - Math.min(...logoCenters) <= 0.75,
          `${viewport.width}x${viewport.height} logo centers diverged: ${logoCenters.join(", ")}`,
        );
      }

      const expectedSlotSize = viewport.width <= 760 ? 48 : 96;
      for (const logo of layout.opticalLogos) {
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

      const opticalWeights = layout.opticalLogos.map(({ weight }) => weight);
      const meanOpticalWeight = (
        opticalWeights.reduce((total, weight) => total + weight, 0)
        / opticalWeights.length
      );
      const opticalWeightSpread = (
        Math.max(...opticalWeights) - Math.min(...opticalWeights)
      ) / meanOpticalWeight;
      assert.ok(
        opticalWeightSpread <= 0.015,
        `${viewport.width}x${viewport.height} optical logo weights diverged: ${opticalWeights.join(", ")}`,
      );
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
