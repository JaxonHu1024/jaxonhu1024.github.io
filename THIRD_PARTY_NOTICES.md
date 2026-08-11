# Third-Party Notices

## Aceternity UI — Existing component adaptations

The following site-specific adaptations predate the Research Spotlight optimization. No new Aceternity UI source code was copied as part of this change.

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

## React Bits — SpotlightCard

This site includes a modified, site-specific adaptation of SpotlightCard.

- Upstream source: https://github.com/DavidHDev/react-bits/tree/acd96622665c958ee63e0ee145250efedb74c1d6/src/ts-default/Components/SpotlightCard
- Copyright: Copyright (c) 2025 David Haz
- License: MIT + Commons Clause License Condition v1.0
- Source and license accessed: 2026-08-11
- Local modifications: rewritten for the research-section interaction, project design tokens, keyboard focus, coarse pointers, reduced motion, and requestAnimationFrame-coalesced pointer updates.

### License

MIT + Commons Clause License Condition v1.0

Copyright (c) 2025 David Haz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, and distribute the Software **as part of an application, website, or product**, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
## Commons Clause Restriction

You may use this Software, including for any commercial purpose, **so long as you do not sell, sublicense, or redistribute the components themselves-whether alone, in a bundle, or as a ported version.**
## No Warranty

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
