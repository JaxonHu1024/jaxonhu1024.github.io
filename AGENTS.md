# Repository Agent Instructions

These instructions apply to the entire repository. A more specific `AGENTS.md`
in a subdirectory may add narrower requirements for files in that subtree.

## Required verification

- Run `npm run verify` after every code, configuration, test, build, or asset
  change. This is the baseline project gate.
- For every change that can affect rendered output, responsive behavior,
  layout, styling, navigation, animation, or browser interaction, validate the
  freshly built/exported site at every viewport in the matrix below.
- Treat the dimensions as CSS viewport pixels. Use the exact width and height;
  do not substitute a nearby device preset.
- Validate a fresh local build or `github-pages-dist/` export. Do not use a
  stale preview or the currently deployed site as proof of the local change.
- Do not edit generated files in `github-pages-dist/` by hand. Regenerate them
  through the project scripts.

## Responsive implementation requirements

- Avoid traditional fixed layouts. Use adaptive, fluid layouts that respond to
  the available viewport and container space.
- Prefer Flexbox and Grid so elements can size, wrap, and distribute available
  space automatically.
- Use relative or responsive units such as `%`, `rem`, `em`, `fr`, `minmax()`,
  and `clamp()` wherever practical. Reserve fixed pixel values for cases where
  a fixed physical target or fine detail is intentional.
- Content, imagery, controls, and navigation must not overlap, be clipped, or
  disappear at any supported viewport or interaction state.
- On mobile, use at least `44px × 44px` CSS pixels as the standard touch target
  size. If a visible control is smaller, enlarge its interactive hit area
  without causing adjacent targets to overlap.

## Performance and loading release standards

- A release must meet these Core Web Vitals thresholds: LCP <= 2.5 seconds,
  INP <= 300 milliseconds, and CLS <= 0.1.
- Every image must declare intrinsic `width` and `height` attributes or have a
  stable CSS `aspect-ratio` so its layout space is reserved before it loads.
- Initial page load must not introduce visible layout jumps. Reserve space for
  deferred content, media, fonts, and asynchronous UI before they render.
- Under mobile-network conditions, users must receive visible loading feedback
  whenever primary content, navigation, or an interaction cannot respond
  immediately.

## Responsive test matrix

| Category | Width | Height |
| --- | ---: | ---: |
| Mobile | 360 | 800 |
| Mobile | 390 | 844 |
| Mobile | 430 | 932 |
| Tablet | 768 | 1024 |
| Tablet | 820 | 1180 |
| Desktop | 1280 | 800 |
| Desktop | 1440 | 900 |
| Desktop | 1920 | 1080 |

## Viewport checks

At each required viewport, verify all applicable items:

- no unexpected horizontal scrolling or viewport overflow;
- no clipped primary imagery, headings, logos, text, buttons, or controls;
- no overlapping or missing content in initial, loading, or interactive states;
- stable alignment, spacing, wrapping, and section rhythm;
- mobile touch targets meet the `44px × 44px` standard and do not overlap;
- fixed-header and navigation-menu closed/open states;
- section navigation and interactive controls remain usable;
- animation opening, closing, and end states are visually coherent;
- image space is reserved and page load has no visible layout jump;
- loading feedback remains visible and coherent under mobile-network throttling;
- `prefers-reduced-motion` remains supported when motion behavior changes.

## Completion standard

- Record pass/fail results for all eight viewports in the final handoff for
  rendered-output changes.
- Do not report a UI task as complete while any required viewport has an
  unexplained failure.
- Do not report a release as complete unless the LCP, INP, and CLS thresholds
  above pass in the release-performance validation.
- For changes proven to be non-rendering-only, `npm run verify` is sufficient.
  When uncertain whether rendered output can change, run the full viewport
  matrix.
