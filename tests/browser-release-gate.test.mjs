import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { webkit } from "playwright";

import {
  browser,
  createReleasePageSession,
  intersectionArea,
  measurePageGeometry,
  monitorBrowserErrors,
  origin,
  releaseLimits,
  runPerformanceSample,
  runReleaseViewportMatrix,
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

function assertBoxWithinDocument(box, name, viewport, documentGeometry) {
  assert.ok(box, `${viewport.width}x${viewport.height} ${name} has no rendered box`);
  assert.ok(
    box.left >= -0.5,
    `${viewport.width}x${viewport.height} ${name} starts at x=${box.left}px`,
  );
  assert.ok(
    box.right <= documentGeometry.clientWidth + 0.5,
    `${viewport.width}x${viewport.height} ${name} ends at x=${box.right}px`,
  );
  assert.ok(
    box.top >= -0.5,
    `${viewport.width}x${viewport.height} ${name} starts at y=${box.top}px`,
  );
  assert.ok(
    box.bottom <= documentGeometry.scrollHeight + 0.5,
    `${viewport.width}x${viewport.height} ${name} ends below the document`,
  );
}

async function validateNotFoundViewport(viewport) {
  const { context, page } = await createReleasePageSession(browser, { viewport });

  try {
    const browserErrors = monitorBrowserErrors(page);
    await page.goto(`${origin}/404.html`, { timeout: 5_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const [effectiveViewport, geometry, documentGeometry] = await Promise.all([
      page.locator('meta[name="viewport"]').evaluateAll(
        (elements) => elements.at(-1)?.getAttribute("content") ?? "",
      ),
      measurePageGeometry(page, {
        code: ".not-found-code",
        copy: ".not-found-copy",
        heading: ".not-found-panel h1",
        link: ".not-found-link",
        main: ".not-found",
        panel: ".not-found-panel",
        signature: ".not-found-signature",
      }),
      page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
      })),
    ]);
    assert.equal(
      effectiveViewport,
      "width=device-width, initial-scale=1, viewport-fit=cover",
      `${viewport.width}x${viewport.height} 404 did not use the safe-area viewport override`,
    );
    assert.equal(
      geometry.scrollWidth,
      geometry.clientWidth,
      `${viewport.width}x${viewport.height} 404 overflowed horizontally`,
    );

    for (const [name, box] of Object.entries(geometry.boxes)) {
      assertBoxWithinDocument(box, `404 ${name}`, viewport, documentGeometry);
    }

    const { code, copy, heading, link, main, panel, signature } = geometry.boxes;
    assert.ok(main.height >= viewport.height, "404 main did not fill the viewport height");
    for (const [name, box] of Object.entries({ code, copy, heading, link })) {
      assert.ok(
        box.left >= panel.left - 0.5 && box.right <= panel.right + 0.5,
        `${viewport.width}x${viewport.height} 404 ${name} escaped the panel`,
      );
    }
    assert.ok(code.bottom <= heading.top, "404 code overlapped the heading");
    assert.ok(heading.bottom <= copy.top, "404 heading overlapped the copy");
    assert.ok(copy.bottom <= link.top, "404 copy overlapped the return link");
    assert.ok(panel.bottom <= signature.top, "404 panel overlapped the signature");
    assert.ok(link.width >= 44, "404 return link is narrower than 44px");
    assert.ok(link.height >= 44, "404 return link is shorter than 44px");

    assert.equal(await page.locator(".site-header .wordmark").getAttribute("href"), "/");
    const expectedNavigationLinks = [
      { href: "/#about", label: "ABOUT" },
      { href: "/#experience", label: "EXPERIENCE" },
      { href: "/#foundations", label: "FOUNDATIONS" },
      { href: "/#research", label: "RESEARCH" },
      { href: "/#contact", label: "CONTACT" },
    ];
    const readNavigationLinks = () => page.locator("#primary-navigation a").evaluateAll(
      (links) => links.map((link) => ({
        href: link.getAttribute("href"),
        label: link.querySelector(".nav-link-label")?.textContent?.trim() ?? "",
      })),
    );
    assert.deepEqual(await readNavigationLinks(), expectedNavigationLinks);

    if (viewport.width <= 900) {
      const menuButton = page.locator('button[aria-controls="primary-navigation"]');
      assert.equal(await menuButton.getAttribute("aria-label"), "Open navigation menu");
      await menuButton.click();
      assert.equal(await menuButton.getAttribute("aria-expanded"), "true");
      assert.equal(await menuButton.getAttribute("aria-label"), "Close navigation menu");
      assert.deepEqual(await readNavigationLinks(), expectedNavigationLinks);
      await page.waitForFunction(() => (
        getComputedStyle(document.querySelector("#primary-navigation")).visibility === "visible"
        && Array.from(document.querySelectorAll("#primary-navigation a"))
          .every((link) => Number.parseFloat(getComputedStyle(link).opacity) >= 0.99)
      ));

      const openMenuGeometry = await measurePageGeometry(page, {
        navigation: "#primary-navigation",
        panel: ".not-found-panel",
      });
      assert.equal(
        intersectionArea(
          openMenuGeometry.boxes.navigation,
          openMenuGeometry.boxes.panel,
        ),
        0,
        `${viewport.width}x${viewport.height} open 404 navigation overlapped the recovery panel`,
      );

      await menuButton.click();
      assert.equal(await menuButton.getAttribute("aria-expanded"), "false");
      assert.equal(await menuButton.getAttribute("aria-label"), "Open navigation menu");
      await page.waitForFunction(() => (
        getComputedStyle(document.querySelector("#primary-navigation")).visibility === "hidden"
      ));
    }

    const returnHome = page.getByRole("link", { name: "RETURN HOME" });
    await returnHome.focus();
    assert.equal(
      await returnHome.evaluate((element) => document.activeElement === element),
      true,
      `${viewport.width}x${viewport.height} 404 return link could not receive keyboard focus`,
    );
    assert.equal(await returnHome.getAttribute("href"), "/");
    await Promise.all([
      page.waitForURL(`${origin}/`, { timeout: 5_000, waitUntil: "load" }),
      returnHome.click(),
    ]);
    assert.equal(page.url(), `${origin}/`);
    assert.deepEqual(
      browserErrors,
      [],
      `${viewport.width}x${viewport.height} 404 browser errors: ${browserErrors.join(" | ")}`,
    );
    console.log(`[release-viewport] 404 ${viewport.width}x${viewport.height}: PASS`);
  } finally {
    await context.close();
  }
}

test("fresh export passes the homepage and 404 eight-viewport release matrix", { timeout: 120_000 }, async () => {
  await runReleaseViewportMatrix([
    {
      name: "homepage",
      async run(viewport) {
    const { context, page } = await createReleasePageSession(browser, { viewport });

    try {
      const browserErrors = monitorBrowserErrors(page);

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
      await page.waitForFunction((expectedView) => (
        document.querySelector(".about-travel")?.getAttribute("data-map-ready") === "true"
        && document.querySelector(".travel-map-canvas")?.getAttribute("data-map-view") === expectedView
        && Number.parseFloat(getComputedStyle(
          document.querySelector(".travel-map-canvas"),
        ).opacity) === 1
        && getComputedStyle(document.querySelector(".travel-map-loading")).display === "none"
      ), viewport.width <= 600 ? "focus" : "world", { timeout: 3_000 });

      const geometry = await measurePageGeometry(page, {
        beam: ".site-tracing-beam",
        header: ".site-header",
        heroCta: ".hero-cta",
        heroName: ".hero-name",
        heroPortrait: ".hero-pixel-portrait",
        heroPositioning: ".hero-positioning",
      });
      const {
        beam,
        header,
        heroCta,
        heroName,
        heroPortrait,
        heroPositioning,
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
        heroPositioning,
        scrollWidth: geometry.scrollWidth,
      };
      const beamPresentation = await page.locator(".site-tracing-beam").evaluate((element) => ({
        count: document.querySelectorAll(".site-tracing-beam").length,
        headDisplay: getComputedStyle(
          element.querySelector(".site-tracing-beam__head"),
        ).display,
        opacity: Number.parseFloat(getComputedStyle(element).opacity),
        pointerEvents: getComputedStyle(element).pointerEvents,
        position: getComputedStyle(element).position,
        progress: Number(element.getAttribute("data-trace-progress")),
        trackVisibility: getComputedStyle(
          element.querySelector(".site-tracing-beam__track"),
        ).visibility,
        visibility: element.getAttribute("data-trace-visibility"),
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
        const ctaRect = cta?.getBoundingClientRect();
        const ctaLabelRect = ctaLabel?.getBoundingClientRect();

        return {
          ctaLabelContained: Boolean(ctaRect && ctaLabelRect)
            && ctaLabelRect.left >= ctaRect.left - .5
            && ctaLabelRect.right <= ctaRect.right + .5
            && ctaLabelRect.top >= ctaRect.top - .5
            && ctaLabelRect.bottom <= ctaRect.bottom + .5,
          ctaLineCount: ctaLabel ? ctaRange.getClientRects().length : 0,
          ctaText: ctaLabel?.textContent?.trim() ?? "",
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
        const travelMapElement = document.querySelector(".about-travel");
        const travelMapRect = travelMapElement?.getBoundingClientRect();
        const travelMapViewportRect = document.querySelector(".travel-map-viewport")?.getBoundingClientRect();
        const aboutStepElements = Array.from(document.querySelectorAll(".about-loop-step"));
        const aboutStepRects = aboutStepElements.map((element) => element.getBoundingClientRect());
        const shellSelectors = [
          ".site-header",
          ".hero-layout",
          ".about-layout",
          ".experience > .section-kicker",
          ".experience-log",
          ".foundations > .section-kicker",
          ".foundations-grid",
          ".research > .section-kicker",
          ".research-frame",
          ".contact-inner",
          ".contact-inner > .section-kicker",
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
        const signalHeadingDefinitions = [
          {
            contentSelector: ".about-statement",
            gapProperty: "marginTop",
            gapSelector: ".about-statement",
            name: "JAXON.CONTEXT",
            selector: ".about-kicker",
          },
          {
            contentSelector: ".travel-map-header h3",
            gapProperty: "marginTop",
            gapSelector: ".travel-map-header h3",
            name: "FLIGHT.FOOTPRINT",
            selector: ".travel-map-kicker",
          },
          {
            contentSelector: ".about-loop-header h3",
            gapProperty: "rowGap",
            gapSelector: ".about-loop-header",
            name: "WORKING.LOOP",
            selector: ".about-loop-kicker",
          },
          {
            contentSelector: ".experience-log",
            gapProperty: "marginTop",
            gapSelector: ".experience-log",
            name: "EXPERIENCE.LOG",
            selector: "#experience-title",
          },
          {
            contentSelector: ".foundations-grid",
            gapProperty: "marginTop",
            gapSelector: ".foundations-grid",
            name: "FOUNDATIONS.INDEX",
            selector: "#foundations-title",
          },
          {
            contentSelector: ".education-timeline",
            gapProperty: "marginTop",
            gapSelector: ".education-timeline",
            name: "EDUCATION",
            selector: ".education-column > .column-label",
          },
          {
            contentSelector: ".toolchain-list",
            gapProperty: "marginTop",
            gapSelector: ".toolchain-list",
            name: "TOOLCHAIN",
            selector: ".toolchain-column > .column-label",
          },
          {
            contentSelector: ".research-frame",
            gapProperty: "marginBottom",
            gapSelector: "#research-title",
            name: "RESEARCH.INDEX",
            selector: "#research-title",
          },
          {
            contentSelector: ".contact-marquee",
            gapProperty: "marginTop",
            gapSelector: ".contact-marquee",
            name: "CONTACT.CHANNEL",
            selector: "#contact-title",
          },
        ];
        const signalHeadings = signalHeadingDefinitions.map((definition) => {
          const element = document.querySelector(definition.selector);
          const content = document.querySelector(definition.contentSelector);
          const gapElement = document.querySelector(definition.gapSelector);
          if (!element || !content || !gapElement) return null;
          const rect = element.getBoundingClientRect();
          const label = element.querySelector(".signal-heading__label");
          const labelRect = label?.getBoundingClientRect();
          const rule = element.querySelector(".signal-heading__rule");
          const end = element.querySelector(".signal-heading__end");
          const ruleRect = rule?.getBoundingClientRect();
          const endRect = end?.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            clipped: !labelRect
              || labelRect.left < rect.left - .5
              || labelRect.right > rect.right + .5
              || labelRect.top < rect.top - .5
              || labelRect.bottom > rect.bottom + .5,
            contentGap: Number.parseFloat(
              getComputedStyle(gapElement)[definition.gapProperty],
            ),
            display: style.display,
            endHeight: endRect?.height ?? 0,
            endWidth: endRect?.width ?? 0,
            fontFamily: style.fontFamily,
            fontSize: Number.parseFloat(style.fontSize),
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
            left: rect.left,
            lineHeight: style.lineHeight,
            parts: {
              end: element.querySelectorAll(":scope > .signal-heading__end").length,
              label: element.querySelectorAll(":scope > .signal-heading__label").length,
              rule: element.querySelectorAll(":scope > .signal-heading__rule").length,
            },
            ruleHeight: ruleRect?.height ?? 0,
            right: rect.right,
            text: label?.textContent?.replace(/\s+/g, " ").trim() ?? "",
            textTransform: style.textTransform,
          };
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
          signalHeadings,
          aboutPresentation: aboutShellRect && aboutLoopRect
            ? {
                contextCount: document.querySelectorAll(".about-context").length,
                forbiddenCount: document.querySelectorAll(
                  "#about canvas, #about [class*='about-particle'], #about [role='tab'], "
                    + "#about [role='tablist'], #about [role='tabpanel']",
                ).length,
                introductionText: document.querySelector(".about-introduction")
                  ?.textContent?.replace(/\s+/g, " ").trim() ?? "",
                introductionWidth: aboutIntroductionRect?.width ?? 0,
                loopLeftDelta: aboutLoopRect.left - aboutShellRect.left,
                loopRightDelta: aboutShellRect.right - aboutLoopRect.right,
                loopWidth: aboutLoopRect.width,
                sectionHeight: aboutSectionRect?.height ?? 0,
                shellLeft: aboutShellRect.left,
                shellRight: aboutShellRect.right,
                shellWidth: aboutShellRect.width,
                statementWidth: aboutStatementRect?.width ?? 0,
                travelMap: travelMapRect && travelMapViewportRect
                  ? {
                      airportCount: travelMapElement.querySelectorAll(".travel-map-airport").length,
                      bidirectionalRouteCount: travelMapElement.querySelectorAll(
                        '.travel-map-route[data-route-direction="both"]',
                      ).length,
                      descriptionLength: travelMapElement.querySelector(".travel-map-canvas desc")
                        ?.textContent?.trim().length ?? 0,
                      distancePresent: Boolean(
                        travelMapElement.querySelector(".travel-map-distance"),
                      ),
                      flagCount: travelMapElement.querySelectorAll(".travel-map-flags > li").length,
                      flagCountryCodes: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-flags > li"),
                      ).map((flag) => flag.getAttribute("data-country-code") ?? "").sort(),
                      flagListTagName: travelMapElement.querySelector(".travel-map-flags")
                        ?.tagName ?? null,
                      flagButtonCount: travelMapElement.querySelectorAll(
                        ".travel-map-flag-button",
                      ).length,
                      flagButtonsValid: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-flag-button"),
                      ).every((button) => (
                        button.tagName === "BUTTON"
                        && button.getAttribute("type") === "button"
                        && button.getAttribute("aria-controls") === "travel-map-canvas"
                        && button.getAttribute("aria-pressed") === "false"
                        && Boolean(button.querySelector(".sr-only")?.textContent?.trim())
                      )),
                      flagButtonTargets: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-flag-button"),
                      ).map((button) => {
                        const rect = button.getBoundingClientRect();
                        return { height: rect.height, width: rect.width };
                      }),
                      flagsHaveDockStructure: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-flags > li"),
                      ).every((flag) => (
                        Boolean(flag.getAttribute("data-country-code"))
                        && flag.getAttribute("data-selected") === "false"
                        && Boolean(flag.querySelector(".travel-map-flag-button"))
                        && Boolean(flag.querySelector(".travel-map-flag-icon"))
                        && Boolean(flag.querySelector(".travel-map-flag-tooltip"))
                      )),
                      flagIconsHaveNoBackdrop: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-flag-icon"),
                      ).every((icon) => {
                        const style = getComputedStyle(icon);
                        return style.backgroundColor === "rgba(0, 0, 0, 0)"
                          && style.backgroundImage === "none"
                          && style.borderTopWidth === "0px"
                          && style.boxShadow === "none";
                      }),
                      flagScroll: (() => {
                        const scroll = travelMapElement.querySelector(".travel-map-flags-scroll");
                        const items = Array.from(
                          travelMapElement.querySelectorAll(".travel-map-flags > li"),
                        );
                        if (!scroll || items.length === 0) return null;
                        const originalScrollLeft = scroll.scrollLeft;
                        scroll.scrollLeft = 0;
                        const scrollRect = scroll.getBoundingClientRect();
                        const firstRect = items[0].getBoundingClientRect();
                        const firstReachable = firstRect.left >= scrollRect.left - 1
                          && firstRect.right <= scrollRect.right + 1;
                        scroll.scrollLeft = scroll.scrollWidth;
                        const lastRect = items.at(-1).getBoundingClientRect();
                        const lastReachable = lastRect.left >= scrollRect.left - 1
                          && lastRect.right <= scrollRect.right + 1;
                        scroll.scrollLeft = originalScrollLeft;
                        return {
                          clientWidth: scroll.clientWidth,
                          firstReachable,
                          hasInternalOverflow: scroll.scrollWidth > scroll.clientWidth + 1,
                          lastReachable,
                          listWidth: scroll.querySelector(".travel-map-flags")
                            ?.getBoundingClientRect().width ?? 0,
                          scrollWidth: scroll.scrollWidth,
                        };
                      })(),
                      imageCount: travelMapElement.querySelectorAll(
                        'image[href="/assets/travel-world-solid.svg"]',
                      ).length,
                      initialAirportEmphasis: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-airport"),
                      ).map((airport) => airport.getAttribute("data-emphasis")),
                      initialRouteEmphasis: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-route"),
                      ).map((route) => route.getAttribute("data-emphasis")),
                      leftDelta: travelMapRect.left - aboutShellRect.left,
                      lineRoutesOnly: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-route-path"),
                      ).every((route) => {
                        const path = route.getAttribute("d") ?? "";
                        return path.includes(" L ") && !path.includes(" Q ");
                      }),
                      routePresentation: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-route-path"),
                      ).map((route) => {
                        const style = getComputedStyle(route);
                        return {
                          animationName: style.animationName,
                          strokeDasharray: style.strokeDasharray,
                          strokeDashoffset: Number.parseFloat(style.strokeDashoffset),
                        };
                      }),
                      rightDelta: aboutShellRect.right - travelMapRect.right,
                      routeCount: travelMapElement.querySelectorAll(".travel-map-route").length,
                      routesUnique: (() => {
                        const keys = Array.from(
                          travelMapElement.querySelectorAll(".travel-map-route"),
                        ).map((route) => route.getAttribute("data-route-key"));
                        return keys.every(Boolean) && new Set(keys).size === keys.length;
                      })(),
                      role: travelMapElement.querySelector(".travel-map-canvas")
                        ?.getAttribute("role"),
                      mapView: travelMapElement.querySelector(".travel-map-canvas")
                        ?.getAttribute("data-map-view") ?? null,
                      viewBox: travelMapElement.querySelector(".travel-map-canvas")
                        ?.getAttribute("viewBox") ?? null,
                      airportViewportCoverage: (() => {
                        const centers = Array.from(
                          travelMapElement.querySelectorAll(".travel-map-airport-point"),
                        ).map((point) => {
                          const rect = point.getBoundingClientRect();
                          return {
                            x: rect.left + rect.width / 2,
                            y: rect.top + rect.height / 2,
                          };
                        });
                        if (centers.length === 0) return null;
                        const xs = centers.map(({ x }) => x);
                        const ys = centers.map(({ y }) => y);
                        return {
                          allCentersSafe: centers.every(({ x, y }) => (
                            x >= travelMapViewportRect.left + 6
                            && x <= travelMapViewportRect.right - 6
                            && y >= travelMapViewportRect.top + 6
                            && y <= travelMapViewportRect.bottom - 6
                          )),
                          heightRatio: (Math.max(...ys) - Math.min(...ys))
                            / travelMapViewportRect.height,
                          widthRatio: (Math.max(...xs) - Math.min(...xs))
                            / travelMapViewportRect.width,
                        };
                      })(),
                      statsClipped: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-stats > div"),
                      ).some((element) => (
                        element.scrollWidth > element.clientWidth + 1
                        || element.scrollHeight > element.clientHeight + 1
                      )),
                      statValues: Array.from(
                        travelMapElement.querySelectorAll(".travel-map-stats dd"),
                      ).map((element) => element.textContent?.trim() ?? ""),
                      viewportHeight: travelMapViewportRect.height,
                      viewportWidth: travelMapViewportRect.width,
                      width: travelMapRect.width,
                    }
                  : null,
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
        opacity: 0,
        pointerEvents: "none",
        position: "fixed",
        progress: 0,
        trackVisibility: "visible",
        visibility: "idle",
      });
      assert.equal(
        sectionRhythm.alignmentShells.length,
        11,
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
      assert.equal(
        sectionRhythm.signalHeadings.length,
        9,
        `${viewport.width}x${viewport.height} did not render every shared signal heading`,
      );
      assert.deepEqual(
        sectionRhythm.signalHeadings.map(({ text }) => text),
        [
          "JAXON.CONTEXT",
          "FLIGHT.FOOTPRINT",
          "WORKING.LOOP",
          "EXPERIENCE.LOG",
          "FOUNDATIONS.INDEX",
          "EDUCATION",
          "TOOLCHAIN",
          "RESEARCH.INDEX",
          "CONTACT.CHANNEL",
        ],
      );
      const headingTypography = sectionRhythm.signalHeadings.map((heading) => ({
        fontFamily: heading.fontFamily,
        fontSize: heading.fontSize,
        fontWeight: heading.fontWeight,
        letterSpacing: heading.letterSpacing,
        lineHeight: heading.lineHeight,
        textTransform: heading.textTransform,
      }));
      for (const [index, heading] of sectionRhythm.signalHeadings.entries()) {
        assert.deepEqual(
          headingTypography[index],
          headingTypography[0],
          `${viewport.width}x${viewport.height} ${heading.text} typography diverged`,
        );
        assert.equal(heading.display, "grid");
        assert.equal(heading.clipped, false);
        assert.deepEqual(heading.parts, { end: 1, label: 1, rule: 1 });
        assert.ok(
          Math.abs(heading.ruleHeight - 1) <= .5
            && Math.abs(heading.endWidth - 9) <= .5
            && Math.abs(heading.endHeight - 9) <= .5,
          `${viewport.width}x${viewport.height} ${heading.text} signal geometry diverged`,
        );
      }
      const signalHeadingGaps = sectionRhythm.signalHeadings.map(({ contentGap }) => contentGap);
      assert.ok(
        Math.max(...signalHeadingGaps) - Math.min(...signalHeadingGaps) <= 1,
        `${viewport.width}x${viewport.height} heading gaps diverged: `
          + signalHeadingGaps.join(", "),
      );
      assert.ok(
        sectionRhythm.aboutPresentation,
        `${viewport.width}x${viewport.height} About presentation was missing`,
      );
      for (const heading of sectionRhythm.signalHeadings.slice(0, 3)) {
        assert.ok(
          Math.abs(heading.left - sectionRhythm.aboutPresentation.shellLeft) <= .75
            && Math.abs(heading.right - sectionRhythm.aboutPresentation.shellRight) <= .75,
          `${viewport.width}x${viewport.height} ${heading.text} did not span the About shell`,
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
      assert.equal(sectionRhythm.aboutPresentation.contextCount, 0);
      assert.equal(
        sectionRhythm.aboutPresentation.introductionText,
        "I'm Jaxon. I build agents and multimodal systems whose behavior can be observed, "
          + "tested, and improved.",
      );
      assert.equal(sectionRhythm.aboutPresentation.steps.length, 4);
      assert.ok(
        sectionRhythm.aboutPresentation.travelMap,
        `${viewport.width}x${viewport.height} travel map was missing`,
      );
      const travelMap = sectionRhythm.aboutPresentation.travelMap;
      assert.ok(
        Math.abs(travelMap.leftDelta) <= 0.75
          && Math.abs(travelMap.rightDelta) <= 0.75
          && Math.abs(travelMap.width - sectionRhythm.aboutPresentation.shellWidth) <= 1,
        `${viewport.width}x${viewport.height} travel map did not span the About shell: `
          + JSON.stringify(travelMap),
      );
      assert.equal(travelMap.airportCount, generatedTravelData.counts.airports);
      assert.equal(travelMap.bidirectionalRouteCount, generatedBidirectionalCorridors);
      assert.equal(travelMap.routeCount, generatedTravelData.counts.routes);
      assert.equal(travelMap.routesUnique, true);
      assert.equal(travelMap.lineRoutesOnly, true);
      assert.equal(travelMap.flagCount, generatedTravelData.counts.countries);
      assert.deepEqual(travelMap.flagCountryCodes, generatedCountryCodes);
      assert.equal(travelMap.flagListTagName, "UL");
      assert.equal(travelMap.flagButtonCount, generatedTravelData.counts.countries);
      assert.equal(travelMap.flagButtonsValid, true);
      assert.equal(
        travelMap.flagButtonTargets.every(({ height, width }) => height >= 44 && width >= 44),
        true,
        `${viewport.width}x${viewport.height} flag buttons missed the 44px target: `
          + JSON.stringify(travelMap.flagButtonTargets),
      );
      assert.equal(travelMap.flagsHaveDockStructure, true);
      assert.equal(travelMap.flagIconsHaveNoBackdrop, true);
      assert.ok(travelMap.flagScroll);
      assert.equal(travelMap.flagScroll.firstReachable, true);
      assert.equal(travelMap.flagScroll.lastReachable, true);
      assert.equal(
        travelMap.flagScroll.hasInternalOverflow,
        viewport.width <= 600,
        `${viewport.width}x${viewport.height} flag scroller state was `
          + JSON.stringify(travelMap.flagScroll),
      );
      assert.equal(travelMap.imageCount, 1);
      assert.equal(travelMap.role, "img");
      assert.equal(
        travelMap.initialAirportEmphasis.every((value) => value === "idle"),
        true,
      );
      assert.equal(
        travelMap.initialRouteEmphasis.every((value) => value === "idle"),
        true,
      );
      assert.equal(travelMap.statsClipped, false);
      assert.ok(
        travelMap.routePresentation.length >= generatedTravelData.counts.routes,
        `${viewport.width}x${viewport.height} omitted rendered route paths`,
      );
      assert.equal(
        travelMap.routePresentation.every((route) => (
          route.animationName === "none"
          && route.strokeDasharray === "none"
          && route.strokeDashoffset === 0
        )),
        true,
        `${viewport.width}x${viewport.height} rendered an incomplete flight corridor: `
          + JSON.stringify(travelMap.routePresentation),
      );
      assert.deepEqual(travelMap.statValues, [
        String(generatedTravelData.counts.countries).padStart(2, "0"),
      ]);
      assert.equal(travelMap.distancePresent, false);
      assert.ok(travelMap.descriptionLength >= 120 && travelMap.descriptionLength <= 240);
      assert.equal(travelMap.mapView, viewport.width <= 600 ? "focus" : "world");
      assert.equal(
        travelMap.viewBox === "0 0 800 400",
        viewport.width > 600,
        `${viewport.width}x${viewport.height} rendered the wrong map camera ${travelMap.viewBox}`,
      );
      assert.ok(travelMap.airportViewportCoverage?.allCentersSafe);
      if (viewport.width <= 600) {
        assert.ok(
          travelMap.airportViewportCoverage.widthRatio >= .3
            && travelMap.airportViewportCoverage.heightRatio >= .45,
          `${viewport.width}x${viewport.height} focused map underused its viewport: `
            + JSON.stringify(travelMap.airportViewportCoverage),
        );
      }
      const expectedMapRatio = viewport.width <= 600 ? 6 / 5 : 2;
      assert.ok(
        Math.abs(travelMap.viewportWidth / travelMap.viewportHeight - expectedMapRatio) <= 0.02,
        `${viewport.width}x${viewport.height} travel map ratio was `
          + `${travelMap.viewportWidth / travelMap.viewportHeight}; expected ${expectedMapRatio}`,
      );
      if (viewport.width <= 430) {
        assert.ok(
          sectionRhythm.aboutPresentation.sectionHeight >= 1_200
            && sectionRhythm.aboutPresentation.sectionHeight <= 1_850,
          `${viewport.width}x${viewport.height} About height=`
            + `${sectionRhythm.aboutPresentation.sectionHeight}px; expected 1200-1850px`,
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
      assert.equal(
        await page.locator(".hero-positioning").count(),
        1,
        `${viewport.width}x${viewport.height} did not render one hero positioning line`,
      );
      assert.equal(
        await page.locator(".hero-positioning").textContent(),
        "AI systems, made inspectable.",
      );
      assert.ok(heroPortrait.width > 0 && heroPortrait.height > 0);
      if (viewport.width <= 900) {
        assert.ok(
          heroName.bottom <= heroPositioning.top + 1
            && heroPositioning.bottom <= heroPortrait.top + 1
            && heroPortrait.bottom <= heroCta.top + 1,
          `${viewport.width}x${viewport.height} mobile Hero order was not `
            + `JAXON → positioning → portrait → CTA: `
            + JSON.stringify({ heroCta, heroName, heroPortrait, heroPositioning }),
        );
      }
      assert.ok(
        initialLayout.hero.ctaHeight >= 44,
        `${viewport.width}x${viewport.height} hero CTA height=${initialLayout.hero.ctaHeight}px`,
      );
      if (viewport.width <= 600) {
        assert.ok(
          heroCta.width >= 187.5 && heroCta.width <= 208.5,
          `${viewport.width}x${viewport.height} hero CTA width=${heroCta.width}px`,
        );
      }
      assert.equal(heroFlow.ctaText, "Explore context");
      assert.equal(
        heroFlow.ctaLabelContained,
        true,
        `${viewport.width}x${viewport.height} clipped the hero CTA label`,
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
          && contactPresentation.footerBottomGap <= viewport.height * 0.38,
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
        fallbackHeight: "840",
        fallbackSource: "/assets/jaxon-sea-portrait.webp",
        fallbackWidth: "840",
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
        await page.waitForFunction(() => (
          document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
          && document.querySelector('[aria-controls="primary-navigation"]')
            ?.getAttribute("aria-expanded") === "false"
          && getComputedStyle(document.querySelector("#primary-navigation")).visibility === "hidden"
        ));
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
                    contextCount: section.querySelectorAll(".about-context").length,
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
              ".hero-positioning",
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
          ".travel-map-flag-button",
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
      console.log(`[release-viewport] homepage ${viewport.width}x${viewport.height}: PASS`);
    } finally {
      await context.close();
    }
      },
    },
    {
      name: "404",
      run: validateNotFoundViewport,
    },
  ]);
});

test("WebKit smoke covers navigation, viewport CSS, canvases, and 404 recovery", { timeout: 30_000 }, async () => {
  const webkitBrowser = await webkit.launch({ headless: true });
  const { context, page } = await createReleasePageSession(webkitBrowser, {
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });

  try {
    const browserErrors = monitorBrowserErrors(page);
    await page.goto(origin, { timeout: 8_000, waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => (
      document.documentElement.dataset.pageActive === "true"
      && document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
      && document.querySelector(".about-travel")?.getAttribute("data-map-ready") === "true"
      && Number.parseFloat(getComputedStyle(
        document.querySelector(".travel-map-canvas"),
      ).opacity) >= 0.99
    ), null, { timeout: 5_000 });

    const platformContracts = await page.evaluate(() => {
      const heroCanvas = document.querySelector(".hero-pixel-canvas");
      const researchCanvases = [...document.querySelectorAll(".research-canvas")];
      const travelMap = document.querySelector(".travel-map-canvas");
      const viewportMeta = [...document.querySelectorAll('meta[name="viewport"]')]
        .at(-1)?.getAttribute("content") ?? "";

      return {
        dvh: CSS.supports("min-height", "100dvh"),
        heroCanvas: heroCanvas instanceof HTMLCanvasElement
          && heroCanvas.getBoundingClientRect().width > 0
          && heroCanvas.getBoundingClientRect().height > 0,
        researchCanvases: researchCanvases.length > 0
          && researchCanvases.every((canvas) => (
            canvas instanceof HTMLCanvasElement
            && canvas.width > 0
            && canvas.height > 0
            && canvas.getAttribute("data-motion") === "reduced"
          )),
        safeArea: CSS.supports("padding-top", "env(safe-area-inset-top)"),
        travelMap: {
          canvasVisible: travelMap instanceof SVGSVGElement
            && travelMap.getBoundingClientRect().width > 0
            && travelMap.getBoundingClientRect().height > 0
            && Number.parseFloat(getComputedStyle(travelMap).opacity) >= 0.99,
          loadingDisplay: getComputedStyle(
            document.querySelector(".travel-map-loading"),
          ).display,
          mapReady: document.querySelector(".about-travel")
            ?.getAttribute("data-map-ready") ?? null,
          mapView: travelMap?.getAttribute("data-map-view") ?? null,
        },
        viewportMeta,
      };
    });
    assert.equal(platformContracts.dvh, true);
    assert.equal(platformContracts.heroCanvas, true);
    assert.equal(platformContracts.researchCanvases, true);
    assert.equal(platformContracts.safeArea, true);
    assert.deepEqual(platformContracts.travelMap, {
      canvasVisible: true,
      loadingDisplay: "none",
      mapReady: "true",
      mapView: "focus",
    });
    assert.equal(
      platformContracts.viewportMeta,
      "width=device-width, initial-scale=1, viewport-fit=cover",
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
      true,
      "WebKit homepage overflowed horizontally",
    );

    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    await menuButton.click();
    await page.waitForFunction(() => (
      document.querySelector('[aria-controls="primary-navigation"]')
        ?.getAttribute("aria-expanded") === "true"
    ));
    await page.getByRole("link", { name: "ABOUT" }).click();
    await page.waitForFunction(() => location.hash === "#about", null, { timeout: 5_000 });

    await page.goto(`${origin}/404.html`, { timeout: 8_000, waitUntil: "load" });
    await page.waitForFunction(() => (
      document.querySelector(".site-header")?.getAttribute("data-navigation-ready") === "true"
    ));
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth),
      true,
      "WebKit 404 overflowed horizontally",
    );
    const notFoundMenuButton = page.locator('button[aria-controls="primary-navigation"]');
    assert.equal(await notFoundMenuButton.getAttribute("aria-label"), "Open navigation menu");
    await notFoundMenuButton.click();
    assert.equal(await notFoundMenuButton.getAttribute("aria-label"), "Close navigation menu");
    await page.waitForFunction(() => (
      getComputedStyle(document.querySelector("#primary-navigation")).visibility === "visible"
      && Array.from(document.querySelectorAll("#primary-navigation a"))
        .every((link) => Number.parseFloat(getComputedStyle(link).opacity) >= 0.99)
    ));
    const notFoundOpenGeometry = await measurePageGeometry(page, {
      navigation: "#primary-navigation",
      panel: ".not-found-panel",
    });
    assert.equal(
      intersectionArea(
        notFoundOpenGeometry.boxes.navigation,
        notFoundOpenGeometry.boxes.panel,
      ),
      0,
      "WebKit open 404 navigation overlapped the recovery panel",
    );
    await notFoundMenuButton.click();
    assert.equal(await notFoundMenuButton.getAttribute("aria-label"), "Open navigation menu");
    await Promise.all([
      page.waitForURL(`${origin}/`, { timeout: 5_000, waitUntil: "load" }),
      page.getByRole("link", { name: "RETURN HOME" }).click(),
    ]);
    assert.deepEqual(browserErrors, [], `WebKit browser errors: ${browserErrors.join(" | ")}`);
  } finally {
    await context.close();
    await webkitBrowser.close();
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
