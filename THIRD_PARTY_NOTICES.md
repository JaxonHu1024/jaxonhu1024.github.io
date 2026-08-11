# Third-Party Notices

## Aceternity UI — Existing component adaptations

The site includes the following pre-existing component adaptations. Their upstream provenance is recorded here.

### Pixelated Canvas

- Official source: https://ui.aceternity.com/components/pixelated-canvas
- Local implementation: `app/components/usePixelatedCanvas.ts`
- Upstream version: not recorded in the pre-existing adaptation
- Local modifications: responsive sizing, bounded frame rate, offscreen and page-hidden pausing, idle shutdown, touch controls, and reduced-motion behavior.

### Tracing Beam

- Official source: https://ui.aceternity.com/components/tracing-beam
- Local implementation: `app/components/SiteTracingBeam.tsx`
- Upstream version: not recorded in the pre-existing adaptation
- Local modifications: dependency-free SVG rendering, requestAnimationFrame-coalesced scrolling, idle shutdown, page-hidden pausing, and reduced-motion behavior.

- Licence reviewed: https://ui.aceternity.com/licence on 2026-08-11
- Status: the public-source redistribution permission for these pre-existing adaptations remains unresolved and requires confirmation from Aceternity UI.
