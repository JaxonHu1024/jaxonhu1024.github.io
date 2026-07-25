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
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport,
    });
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
    const page = await context.newPage();

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
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

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
  const context = await browser.newContext({
    serviceWorkers: "block",
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
    const page = await context.newPage();
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
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: "block",
      viewport,
    });
    const page = await context.newPage();

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });

      const state = await page.evaluate(() => {
        const navigation = document.querySelector("#primary-navigation");
        const terminal = document.querySelector(".hero-terminal");
        const feedback = document.querySelector('[data-testid="mobile-load-feedback"]');
        const coreSelectors = [
          "#hero-title",
          "#experience-title",
          "#foundations-title",
          "#research-title",
          "#contact-title",
          'a[href="mailto:jaxonhu01@gmail.com"]',
        ];

        return {
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
          terminal: terminal
            ? {
                phase: terminal.getAttribute("data-phase"),
                text: terminal.textContent,
                visible: getComputedStyle(terminal).visibility !== "hidden",
              }
            : null,
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
      assert.equal(state.terminal?.phase, "ready");
      assert.equal(state.terminal?.visible, true);
      assert.match(state.terminal?.text ?? "", /ai build --target production/);
      assert.doesNotMatch(state.terminal?.text ?? "", /jaxon/i);
      assert.match(state.terminal?.text ?? "", /AI pipeline ready/);

      await page.locator('a[href="#research"]').click();
      await page.waitForFunction(() => location.hash === "#research");
      assert.equal(await page.locator("#research-title").isVisible(), true);
    } finally {
      await context.close();
    }
  }
});

test("page background state pauses every ambient CSS loop", { timeout: 10_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

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
    await page.locator("#experience").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector("#experience")?.getAttribute("data-section-visible") === "true"
    ));

    const experienceRunning = await page.evaluate(() => ({
      scan: getComputedStyle(document.querySelector(".experience-scan-cursor")).animationPlayState,
      pulse: getComputedStyle(document.querySelector(".timeline-node"), "::before").animationPlayState,
    }));
    assert.deepEqual(experienceRunning, {
      scan: "running",
      pulse: "running",
    });

    await page.evaluate(() => window.__setDocumentHidden(true));
    await page.waitForFunction(() => document.documentElement.dataset.pageActive === "false");

    const paused = await page.evaluate(() => ({
      scan: getComputedStyle(document.querySelector(".experience-scan-cursor")).animationPlayState,
      pulse: getComputedStyle(document.querySelector(".timeline-node"), "::before").animationPlayState,
    }));
    assert.deepEqual(paused, {
      scan: "paused",
      pulse: "paused",
    });

    await page.evaluate(() => window.__setDocumentHidden(false));
    await page.waitForFunction(() => document.documentElement.dataset.pageActive === "true");
    const resumed = await page.evaluate(() => ({
      scan: getComputedStyle(document.querySelector(".experience-scan-cursor")).animationPlayState,
      pulse: getComputedStyle(document.querySelector(".timeline-node"), "::before").animationPlayState,
    }));
    assert.deepEqual(resumed, {
      scan: "running",
      pulse: "running",
    });

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

test("research canvas reports its viewport and page motion lifecycle", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

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

test("hero motion pauses offscreen and resumes from a clean boot", { timeout: 20_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-motion") === "running"
      && document.querySelector(".hero-media")?.getAttribute("data-hero-visible") === "true"
    ), null, { timeout: 3_000 });

    await page.locator("#contact").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector(".hero-media")?.getAttribute("data-hero-visible") === "false"
    ), null, { timeout: 3_000 });
    await page.waitForTimeout(100);

    const pausedBefore = await page.evaluate(() => {
      const terminal = document.querySelector(".hero-terminal");
      const percent = document.querySelector(".hero-terminal-percent");
      const caret = document.querySelector(".hero-terminal-caret");
      const progress = document.querySelector(".hero-terminal-progress-fill");
      const animations = terminal.getAnimations({ subtree: true });

      return {
        animationDetails: animations.map((animation) => ({
          animationName: animation.animationName ?? null,
          playState: animation.playState,
          targetClass: animation.effect?.target?.className ?? null,
          transitionProperty: animation.transitionProperty ?? null,
          type: animation.constructor.name,
        })),
        caretPlayState: getComputedStyle(caret).animationPlayState,
        percent: percent.textContent,
        phase: terminal.dataset.phase,
        progressTransitionDuration: getComputedStyle(progress).transitionDuration,
      };
    });
    await page.waitForTimeout(1_000);
    const pausedAfter = await page.evaluate(() => ({
      percent: document.querySelector(".hero-terminal-percent").textContent,
      phase: document.querySelector(".hero-terminal").dataset.phase,
    }));

    assert.equal(pausedBefore.caretPlayState, "paused");
    assert.equal(pausedBefore.progressTransitionDuration, "0s");
    assert.equal(
      pausedBefore.animationDetails.some(({ playState }) => playState === "running"),
      false,
      `offscreen animations were ${JSON.stringify(pausedBefore.animationDetails)}`,
    );
    assert.deepEqual(pausedAfter, {
      percent: pausedBefore.percent,
      phase: pausedBefore.phase,
    });

    await page.locator("#hero").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      document.querySelector(".hero-media")?.getAttribute("data-hero-visible") === "true"
      && document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "typing"
    ), null, { timeout: 3_000 });
  } finally {
    await context.close();
  }
});

test("terminal loop runs one CLI command, holds ready, and resets cleanly", { timeout: 20_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "typing"
    ), null, { timeout: 3_000 });
    const typing = await page.locator(".hero-terminal").evaluate((terminal) => ({
      command: terminal.querySelector(".hero-terminal-command-text")?.textContent,
      percent: terminal.querySelector(".hero-terminal-percent")?.textContent,
      pathPresent: Boolean(terminal.querySelector(".hero-terminal-path")),
      readyVisible: terminal.querySelector(".hero-terminal-ready")
        ?.classList.contains("is-visible") ?? false,
      visibleSteps: terminal.querySelectorAll(".hero-terminal-line.is-visible").length,
      windowControls: terminal.querySelectorAll(".hero-terminal-window-control").length,
    }));
    assert.deepEqual(typing, {
      command: "ai build --target production",
      percent: "0",
      pathPresent: false,
      readyVisible: false,
      visibleSteps: 0,
      windowControls: 3,
    });

    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "running"
      && document.querySelector(".hero-terminal-percent")?.textContent === "11"
    ), null, { timeout: 2_000 });
    assert.equal(
      await page.locator(".hero-terminal-line.is-visible").count(),
      1,
      "the first progress update did not reveal exactly one CLI line",
    );
    await page.waitForFunction(() => {
      const line = document.querySelector(".hero-terminal-line.is-visible");
      if (!line) return false;
      const style = getComputedStyle(line);
      return style.visibility === "visible" && Number(style.opacity) > 0.9;
    }, null, { timeout: 800 });
    const progressBefore = await page.locator(".hero-terminal-progress-fill").evaluate((fill) => {
      const style = getComputedStyle(fill);
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        animationTimingFunction: style.animationTimingFunction,
        scale: new DOMMatrixReadOnly(style.transform).a,
        visibleSteps: fill.closest(".hero-terminal")?.getAttribute("data-visible-steps"),
      };
    });
    await page.waitForTimeout(160);
    const progressAfter = await page.locator(".hero-terminal-progress-fill").evaluate((fill) => {
      const style = getComputedStyle(fill);
      return {
        scale: new DOMMatrixReadOnly(style.transform).a,
        visibleSteps: fill.closest(".hero-terminal")?.getAttribute("data-visible-steps"),
      };
    });
    assert.equal(progressBefore.animationName, "hero-terminal-progress");
    assert.equal(progressBefore.animationDuration, "4.5s");
    assert.notEqual(progressBefore.animationTimingFunction, "linear");
    assert.equal(progressBefore.visibleSteps, "1");
    assert.equal(progressAfter.visibleSteps, "1");
    assert.ok(
      progressAfter.scale > progressBefore.scale,
      `progress did not advance continuously (${progressBefore.scale} -> ${progressAfter.scale})`,
    );

    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "ready"
      && document.querySelector(".hero-terminal-percent")?.textContent === "100"
    ), null, { timeout: 7_000 });
    await page.waitForFunction(() => {
      const terminal = document.querySelector(".hero-terminal");
      const readyLine = terminal?.querySelector(".hero-terminal-ready");
      const lines = terminal?.querySelectorAll(".hero-terminal-line") ?? [];
      if (!readyLine || lines.length !== 5) return false;
      const readyStyle = getComputedStyle(readyLine);
      return readyStyle.visibility === "visible"
        && Number(readyStyle.opacity) > 0.9
        && Array.from(lines).every((line) => {
          const style = getComputedStyle(line);
          return style.visibility === "visible" && Number(style.opacity) > 0.9;
        });
    }, null, { timeout: 1_000 });
    const ready = await page.locator(".hero-terminal").evaluate((terminal) => {
      const readyLine = terminal.querySelector(".hero-terminal-ready");
      const progressFill = terminal.querySelector(".hero-terminal-progress-fill");
      return {
        backgroundImage: getComputedStyle(progressFill).backgroundImage,
        readyText: readyLine?.textContent?.trim() ?? "",
        readyVisible: readyLine?.classList.contains("is-visible") ?? false,
        visibleSteps: terminal.querySelectorAll(".hero-terminal-line.is-visible").length,
      };
    });
    assert.equal(ready.visibleSteps, 5);
    assert.equal(ready.readyText, "✓ AI pipeline ready");
    assert.equal(ready.readyVisible, true);
    assert.match(ready.backgroundImage, /linear-gradient/i);

    await page.waitForTimeout(2_100);
    assert.equal(
      await page.locator(".hero-terminal").getAttribute("data-phase"),
      "ready",
      "the completed CLI did not remain still for at least two seconds",
    );

    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "resetting"
    ), null, { timeout: 2_000 });
    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-phase") === "typing"
      && document.querySelectorAll(".hero-terminal-line.is-visible").length === 0
      && document.querySelector(".hero-terminal-percent")?.textContent === "0"
    ), null, { timeout: 1_500 });
  } finally {
    await context.close();
  }
});

test("reduced-motion mobile terminal exposes every completed log", { timeout: 10_000 }, async () => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-motion") === "reduced"
    ), null, { timeout: 3_000 });

    const terminal = await page.locator(".hero-terminal").evaluate((element) => ({
      clientHeight: element.clientHeight,
      displays: Array.from(element.querySelectorAll(".hero-terminal-line"))
        .map((line) => getComputedStyle(line).display),
      percent: element.querySelector(".hero-terminal-percent")?.textContent,
      readyText: element.querySelector(".hero-terminal-ready")?.textContent?.trim() ?? "",
      readyVisible: element.querySelector(".hero-terminal-ready")
        ?.classList.contains("is-visible") ?? false,
      runningAnimations: element.getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running")
        .map((animation) => ({
          targetClass: animation.effect?.target?.className ?? null,
          transitionProperty: animation.transitionProperty ?? null,
          type: animation.constructor.name,
        })),
      scrollHeight: element.scrollHeight,
    }));

    assert.equal(terminal.displays.length, 5);
    assert.equal(terminal.displays.every((display) => display !== "none"), true);
    assert.equal(terminal.percent, "100");
    assert.equal(terminal.readyText, "✓ AI pipeline ready");
    assert.equal(terminal.readyVisible, true);
    assert.deepEqual(
      terminal.runningAnimations,
      [],
      `reduced terminal retained motion: ${JSON.stringify(terminal.runningAnimations)}`,
    );
    assert.ok(
      terminal.scrollHeight <= terminal.clientHeight + 1,
      `reduced terminal content was clipped: ${terminal.scrollHeight}px > ${terminal.clientHeight}px`,
    );
  } finally {
    await context.close();
  }
});

test("reduced-motion desktop keeps all content visible and ambient loops stopped", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    serviceWorkers: "block",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.querySelector(".hero-terminal")?.getAttribute("data-motion") === "reduced"
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
        document.querySelectorAll("[data-motion-layer]"),
      ).flatMap((element) => (
        element.getAnimations({ subtree: true })
          .filter((animation) => animation.playState === "running")
          .map((animation) => ({
            targetClass: animation.effect?.target?.className ?? null,
            type: animation.constructor.name,
          }))
      ));

      return {
        contactMarquee: {
          animationName: getComputedStyle(
            document.querySelector(".contact-marquee-track"),
          ).animationName,
          transform: getComputedStyle(
            document.querySelector(".contact-marquee-track"),
          ).transform,
        },
        pulseAnimation: getComputedStyle(
          document.querySelector(".timeline-node"),
          "::before",
        ).animationName,
        researchMotion: Array.from(
          document.querySelectorAll(".research-canvas"),
        ).map((canvas) => canvas.getAttribute("data-motion")),
        reveal,
        runningAnimations,
        scanAnimation: getComputedStyle(
          document.querySelector(".experience-scan-cursor"),
        ).animationName,
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
    assert.equal(state.scanAnimation, "none");
    assert.equal(state.pulseAnimation, "none");
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

test("touch-only users return to the resting control style after tapping", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    serviceWorkers: "block",
    viewport: { width: 440, height: 956 },
  });
  const page = await context.newPage();

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
        ".terminal-button:hover",
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
      'a.hero-cta[href="#experience"]',
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

test("browser history restores section state and sequential focus", { timeout: 15_000 }, async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
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
    { width: 1150, height: 800 },
    { width: 1200, height: 800 },
    { width: 1275, height: 800 },
    { width: 1279, height: 800 },
    { width: 1280, height: 800 },
  ];
  const samples = new Map();

  for (const viewport of boundaryViewports) {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport,
    });
    const page = await context.newPage();

    try {
      await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => (
        document.documentElement.dataset.pageActive === "true"
        && document.querySelector(".hero-terminal")?.getAttribute("data-motion") === "running"
      ));

      const geometry = await measurePageGeometry(page, {
        cta: ".hero-cta",
        message: ".hero-message",
        name: ".hero-name",
        terminal: ".hero-media",
      });
      const responsiveDetails = await page.evaluate(() => {
        const contact = document.querySelector(".contact-socials");
        const clippedContactLabels = Array.from(
          document.querySelectorAll(".endpoint-copy b, .endpoint-copy small"),
        ).filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent?.trim() ?? "");
        const terminalVisibleLogCount = Array.from(
          document.querySelectorAll(".hero-terminal-line"),
        ).filter((line) => getComputedStyle(line).display !== "none").length;
        const terminalStepCount = document.querySelectorAll(".hero-terminal-line").length;
        const clippedTerminalLabels = Array.from(
          document.querySelectorAll(".hero-terminal-text"),
        ).filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent?.trim() ?? "");

        return {
          clippedContactLabels,
          clippedTerminalLabels,
          contactColumnCount: getComputedStyle(contact)
            .gridTemplateColumns
            .split(" ")
            .filter(Boolean)
            .length,
          terminalStepCount,
          terminalVisibleLogCount,
        };
      });
      const {
        cta,
        message,
        name,
        terminal,
      } = geometry.boxes;
      const metrics = {
        clientWidth: geometry.clientWidth,
        ...responsiveDetails,
        intersections: {
          nameMessage: intersectionArea(name, message),
          nameTerminal: intersectionArea(name, terminal),
          messageTerminal: intersectionArea(message, terminal),
          terminalCta: intersectionArea(terminal, cta),
        },
        name,
        scrollWidth: geometry.scrollWidth,
        terminal,
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
      assert.equal(
        metrics.contactColumnCount,
        viewport.width <= 760 ? 1 : viewport.width < 1280 ? 2 : 4,
        `${viewport.width}px used ${metrics.contactColumnCount} contact columns`,
      );
      assert.equal(
        metrics.terminalStepCount,
        5,
        `${viewport.width}px rendered ${metrics.terminalStepCount} CLI steps`,
      );
      assert.equal(
        metrics.terminalVisibleLogCount,
        5,
        `${viewport.width}px hid CLI output rows`,
      );
      assert.deepEqual(
        metrics.clippedTerminalLabels,
        [],
        `${viewport.width}px clipped CLI output: ${metrics.clippedTerminalLabels.join(", ")}`,
      );
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

    for (const element of ["name", "terminal"]) {
      for (const metric of ["top", "width", "height"]) {
        assert.ok(
          Math.abs(left[element][metric] - right[element][metric]) <= 4,
          `${leftWidth}/${rightWidth}px ${element}.${metric} jumped from `
            + `${left[element][metric]} to ${right[element][metric]}`,
        );
      }
    }
    assert.equal(
      left.terminalVisibleLogCount,
      right.terminalVisibleLogCount,
      `${leftWidth}/${rightWidth}px terminal log count jumped from `
        + `${left.terminalVisibleLogCount} to ${right.terminalVisibleLogCount}`,
    );
  }
});

test("desktop hero keeps the terminal inset and organization logos compact", async () => {
  const context = await browser.newContext({
    serviceWorkers: "block",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(origin, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#foundations").scrollIntoViewIfNeeded();
    await page.waitForFunction(() => (
      Array.from(document.querySelectorAll(
        ".experience-brand-logo, .education-crest",
      )).every((image) => image.complete && image.naturalWidth > 0)
    ), null, { timeout: 3_000 });

    const layout = await page.evaluate(() => {
      const terminal = document.querySelector(".hero-media").getBoundingClientRect();
      const logoSizes = Array.from(document.querySelectorAll(
        ".experience-brand-logo, .education-crest",
      )).map((logo) => Number.parseFloat(getComputedStyle(logo).width));

      return {
        logoSizes,
        positioningCount: document.querySelectorAll(".hero-positioning").length,
        terminalRightGap: innerWidth - terminal.right,
      };
    });

    assert.equal(layout.positioningCount, 0);
    assert.ok(layout.terminalRightGap >= 44);
    assert.deepEqual(layout.logoSizes, [86, 86, 86, 86]);
  } finally {
    await context.close();
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
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport,
    });

    try {
      const page = await context.newPage();
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
        && document.querySelector(".hero-media")?.getAttribute("data-hero-visible") === "true"
        && document.querySelector(".hero-terminal")?.getAttribute("data-motion") === "running"
      ), null, { timeout: 3_000 });

      const geometry = await measurePageGeometry(page, {
        header: ".site-header",
        heroCta: ".hero-cta",
        heroMedia: ".hero-media",
        heroName: ".hero-name",
        heroStatement: ".hero-statement",
      });
      const {
        header,
        heroCta,
        heroMedia,
        heroName,
        heroStatement,
      } = geometry.boxes;
      const initialLayout = {
        clientWidth: geometry.clientWidth,
        header,
        hero: {
          ctaHeight: heroCta?.height ?? 0,
          mediaCtaIntersection: intersectionArea(heroMedia, heroCta),
          mediaNameIntersection: intersectionArea(heroMedia, heroName),
          mediaStatementIntersection: intersectionArea(heroMedia, heroStatement),
        },
        scrollWidth: geometry.scrollWidth,
      };
      const terminalLayout = await page.locator(".hero-terminal").evaluate((terminal) => ({
        clientHeight: terminal.clientHeight,
        clippedLabels: Array.from(terminal.querySelectorAll(".hero-terminal-text"))
          .filter((label) => label.scrollWidth > label.clientWidth + 1)
          .map((label) => label.textContent?.trim() ?? ""),
        hiddenSteps: Array.from(terminal.querySelectorAll(".hero-terminal-line"))
          .filter((line) => getComputedStyle(line).display === "none")
          .length,
        scrollHeight: terminal.scrollHeight,
        stepCount: terminal.querySelectorAll(".hero-terminal-line").length,
      }));

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
      assert.equal(
        await page.locator(".hero-positioning").count(),
        0,
        `${viewport.width}x${viewport.height} retained the removed hero positioning line`,
      );
      if (viewport.width >= 1280) {
        const terminalRightGap = viewport.width - heroMedia.right;
        assert.ok(
          terminalRightGap >= 44,
          `${viewport.width}x${viewport.height} terminal right gap=${terminalRightGap}px`,
        );
      }
      assert.ok(
        initialLayout.hero.ctaHeight >= 44,
        `${viewport.width}x${viewport.height} hero CTA height=${initialLayout.hero.ctaHeight}px`,
      );
      assert.equal(
        terminalLayout.stepCount,
        5,
        `${viewport.width}x${viewport.height} rendered ${terminalLayout.stepCount} CLI steps`,
      );
      assert.equal(
        terminalLayout.hiddenSteps,
        0,
        `${viewport.width}x${viewport.height} hid CLI output rows`,
      );
      assert.deepEqual(
        terminalLayout.clippedLabels,
        [],
        `${viewport.width}x${viewport.height} clipped CLI output: ${terminalLayout.clippedLabels.join(", ")}`,
      );
      assert.ok(
        terminalLayout.scrollHeight <= terminalLayout.clientHeight + 1,
        `${viewport.width}x${viewport.height} terminal content was clipped: `
          + `${terminalLayout.scrollHeight}px > ${terminalLayout.clientHeight}px`,
      );
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

      for (const id of ["experience", "foundations", "research", "contact"]) {
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
            const reveal = section?.querySelector(".section-kicker.reveal");
            if (!section || !reveal || section.dataset.sectionVisible !== "true") {
              return false;
            }

            const revealStyle = getComputedStyle(reveal);
            const revealTransform = new DOMMatrixReadOnly(revealStyle.transform);
            const revealSettled = Number.parseFloat(revealStyle.opacity) >= 0.99
              && Math.abs(revealTransform.m42) <= 0.5;
            if (!revealSettled) return false;

            if (sectionId === "experience") {
              return (
                getComputedStyle(
                  section.querySelector(".experience-scan-cursor"),
                ).animationPlayState === "running"
                && getComputedStyle(
                  section.querySelector(".timeline-node"),
                  "::before",
                ).animationPlayState === "running"
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
            const reveal = section?.querySelector(".section-kicker.reveal");
            const revealStyle = reveal ? getComputedStyle(reveal) : null;
            const revealTransform = revealStyle
              ? new DOMMatrixReadOnly(revealStyle.transform)
              : null;
            return {
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
              revealOpacity: revealStyle?.opacity ?? null,
              revealTranslateY: revealTransform?.m42 ?? null,
              scan: section?.querySelector(".experience-scan-cursor")
                ? getComputedStyle(
                    section.querySelector(".experience-scan-cursor"),
                  ).animationPlayState
                : null,
              sectionVisible: section?.dataset.sectionVisible ?? null,
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
              ".hero-statement",
              ".hero-cta",
              ".hero-terminal",
            ],
          },
          {
            id: "experience",
            selectors: [
              "#experience-title",
              ".experience-status",
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
