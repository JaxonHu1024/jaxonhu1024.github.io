# JAXON — Neo-Terminal Portfolio

This repository contains the complete, editable source for
[jaxonhu1024.github.io](https://jaxonhu1024.github.io).

The site is built with React, Next.js-compatible routing through vinext, and
Vite. GitHub Actions verifies the source, exports a static artifact, and deploys
that artifact to GitHub Pages. Generated files are intentionally not committed.

## Prerequisites

- Node.js `>=22.13.0`

## Local development

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Verification

```bash
npm run verify
```

This runs linting, a production build, server-rendered HTML checks, a static
GitHub Pages export, and export integrity checks. To create only the deployable
artifact, run:

```bash
npm run export:github-pages
```

## Deployment

Every push to `main` runs `.github/workflows/deploy-pages.yml`. The workflow:

1. installs the locked dependencies;
2. runs the full verification suite;
3. uploads `github-pages-dist/` as a Pages artifact;
4. deploys it to the `github-pages` environment.

## Project structure

- `app/` — page source, components, and styling
- `public/` — source-controlled images and metadata assets
- `scripts/` — deterministic static export tooling
- `tests/` — rendered output and export integrity tests
- `worker/` — vinext build entry point
- `.github/workflows/` — automated GitHub Pages deployment
