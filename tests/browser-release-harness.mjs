import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export async function createReleasePageSession(browserInstance, options) {
  const context = await browserInstance.newContext({
    serviceWorkers: "block",
    ...options,
  });
  const page = await context.newPage();

  return { context, page };
}


const outputDirectory = resolve(fileURLToPath(new URL("../github-pages-dist/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);
export const releaseLimits = {
  cls: 0.1,
  inp: 300,
  lcp: 2_500,
};
export const releaseViewports = Object.freeze([
  Object.freeze({ width: 360, height: 800 }),
  Object.freeze({ width: 390, height: 844 }),
  Object.freeze({ width: 430, height: 932 }),
  Object.freeze({ width: 768, height: 1024 }),
  Object.freeze({ width: 820, height: 1180 }),
  Object.freeze({ width: 1280, height: 800 }),
  Object.freeze({ width: 1440, height: 900 }),
  Object.freeze({ width: 1920, height: 1080 }),
]);

export let browser;
export let origin;
let server;

export async function runReleaseViewportMatrix(checks, options = {}) {
  const viewports = options.viewports ?? releaseViewports;
  const reportFailure = options.reportFailure ?? ((label, error) => {
    console.error(`[release-viewport] ${label}: FAIL`);
    console.error(error.stack ?? error.message);
  });
  const failures = [];

  for (const viewport of viewports) {
    for (const check of checks) {
      const label = `${check.name} ${viewport.width}x${viewport.height}`;

      try {
        await check.run(viewport);
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        reportFailure(label, error);
        failures.push(new Error(`${label}: ${error.message}`, { cause: error }));
      }
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `${failures.length} release viewport checks failed`,
    );
  }
}

export function monitorBrowserErrors(page) {
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

  return browserErrors;
}

export function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveDeferred) => {
    resolvePromise = resolveDeferred;
  });

  return { promise, resolve: resolvePromise };
}

export async function within(promise, label, timeoutMs = 3_000) {
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

export async function assertFeedbackFitsViewport(page, feedback) {
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

export function intersectionArea(left, right) {
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

export async function measurePageGeometry(page, selectors) {
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

export async function runPerformanceSample(sampleNumber) {
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
    const chinaFilter = page.getByRole("button", { exact: true, name: "China" });
    await chinaFilter.click({ timeout: 3_000 });
    await page.waitForFunction(() => (
      document.querySelector('[data-country-code="CN"] .travel-map-flag-button')
        ?.getAttribute("aria-pressed") === "true"
    ), null, { timeout: 3_000 });
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

export async function setupReleaseHarness() {
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
}

export async function teardownReleaseHarness() {
  await browser?.close();
  if (server?.listening) {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose());
    });
  }
}
