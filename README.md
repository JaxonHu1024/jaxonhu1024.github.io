# JAXON — Signal Typography Portfolio

**English** · [简体中文](./README_zh.md)

> Turning model capability into real-world systems.

Source for [jaxonhu1024.github.io](https://jaxonhu1024.github.io) — a single-page,
signal-driven personal portfolio. The site is server-rendered, exported to a
fully static bundle, and deployed to GitHub Pages by CI. Generated artifacts are
intentionally never committed; everything ships from source.

## Tech stack

| Layer        | Choice                                              |
| ------------ | --------------------------------------------------- |
| UI           | React 19 + TypeScript                               |
| Framework    | Next.js 16 App Router, compiled through **vinext**  |
| Build        | Vite 8 on the Cloudflare Workers runtime (Wrangler) |
| Styling      | Tailwind CSS 4 + hand-authored component CSS        |
| Type         | Oxanium Variable · Geist Variable · IBM Plex Mono   |
| Deploy       | Static export → GitHub Actions → GitHub Pages       |

## Highlights

- **Static by default.** The page is server-rendered through a Cloudflare Worker
  entry, then exported to plain HTML — content needs no client JavaScript to read.
- **Accessible motion.** Ambient hero and research animations pause off-screen via
  `IntersectionObserver` and fully disable under `prefers-reduced-motion`.
- **Cancellable scrolling.** In-page navigation uses a smooth scroll that any user
  input (wheel / touch / key) instantly cancels, with active-section tracking.
- **Considered a11y.** Skip link, focusable landmark sections, and ARIA labelling
  throughout.
- **Static release metadata.** Canonical, Open Graph, Twitter Card, robots, and
  sitemap output are deterministic for the GitHub Pages origin.
- **Privacy-safe travel footprint.** A build-time Flighty import publishes only
  aggregate airport and corridor data; raw itinerary details remain local.

## Prerequisites

- Node.js `>=22.13.0`

## Local development

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## npm scripts

| Script                          | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `npm run dev`                   | Start the local dev server at `http://localhost:3000`.        |
| `npm run build`                 | Produce a production build.                                   |
| `npm run start`                 | Serve the production build locally.                           |
| `npm run typecheck`             | Run the repository-wide TypeScript contract.                  |
| `npm run lint`                  | Run ESLint across the source.                                 |
| `npm test`                      | Build, then run source, SSR, navigation, and motion tests.    |
| `npm run export:github-pages`   | Build and export the static Pages bundle to `github-pages-dist/`. |
| `npm run test:export`           | Check the exported bundle's integrity.                        |
| `npm run test:browser`          | Run browser, eight-viewport, and Web Vitals release checks.   |
| `npm run test:travel`           | Validate Flighty parsing, privacy, and deterministic output.  |
| `npm run travel:sync -- <csv>`  | Refresh the checked-in travel aggregate from a Flighty CSV.   |
| `npm run optimize:svg`          | Re-run deterministic SVGO compression for organization marks. |
| `npm run verify`                | Full gate: typecheck → lint → tests → export → browser checks. |

## Verification

```bash
npm run verify
```

This runs TypeScript and lint checks, a production build, server-rendered HTML
checks, a static GitHub Pages export, eight exact viewport checks, and mobile
Core Web Vitals validation. To create only the deployable artifact:

```bash
npm run export:github-pages
```

## Refreshing the travel map

Flighty exports may contain exact dates, booking references, seats, gates, and
stable identifiers. Keep the raw file outside public source and refresh only the
privacy-safe aggregate:

```bash
npm run travel:sync -- /path/to/FlightyExport.csv
npm run verify
```

The importer merges repeated and reverse-direction flight segments into one
corridor, marks a corridor as bidirectional only when both directions occur, and
writes `app/data/travel.generated.json`. Flights dated after the sync date are
excluded, and ordinary builds never read the private CSV. Airport metadata comes
from the public-domain [OurAirports data set](https://ourairports.com/data/), and
the solid base map is derived from public-domain [Natural Earth data](https://www.naturalearthdata.com/).
See [`data/private/README.md`](./data/private/README.md) for the local update flow.

## Deployment

Every push to `main` runs [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml). The workflow:

1. installs the locked dependencies (`npm ci`);
2. runs the full verification suite (`npm run verify`);
3. uploads `github-pages-dist/` as a Pages artifact;
4. deploys it to the `github-pages` environment.

## Project structure

```
app/                  Page source, React components, and styling
├─ components/        Navigation, pixel portrait, and research visuals
├─ data/              Privacy-safe generated travel aggregate
├─ lib/               Cancellable-scroll and motion helpers
├─ layout.tsx         Root layout + static release metadata
├─ page.tsx           Single-page portfolio content
└─ globals.css        Dark signal design system
public/               Source-controlled images and metadata assets
data/private/          Gitignored raw travel-import staging area
scripts/              Deterministic static-export tooling
tests/                Rendered-output and export-integrity tests
worker/               vinext / Cloudflare Worker build entry point
.github/workflows/    Automated GitHub Pages deployment
```
