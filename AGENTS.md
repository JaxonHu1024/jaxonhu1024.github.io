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
- stable alignment, spacing, wrapping, and section rhythm;
- fixed-header and navigation-menu closed/open states;
- section navigation and interactive controls remain usable;
- animation opening, closing, and end states are visually coherent;
- `prefers-reduced-motion` remains supported when motion behavior changes.

## Completion standard

- Record pass/fail results for all eight viewports in the final handoff for
  rendered-output changes.
- Do not report a UI task as complete while any required viewport has an
  unexplained failure.
- For changes proven to be non-rendering-only, `npm run verify` is sufficient.
  When uncertain whether rendered output can change, run the full viewport
  matrix.
