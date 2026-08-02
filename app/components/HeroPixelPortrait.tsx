import { PixelatedCanvas } from "./PixelatedCanvas";

const portraitSource = "/assets/jaxon-sea-portrait.webp";
const portraitCanvasId = "hero-pixel-canvas";
const portraitTouchHandleId = "hero-portrait-touch-handle";

export function HeroPixelPortrait() {
  return (
    <figure className="hero-pixel-portrait">
      <div className="hero-portrait-frame">
        {/* A plain image remains visible before hydration and when canvas is unavailable. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="hero-portrait-fallback"
          src={portraitSource}
          width="1200"
          height="1200"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchPriority="high"
        />
        <PixelatedCanvas
          id={portraitCanvasId}
          className="hero-pixel-canvas"
          src={portraitSource}
          width={560}
          height={560}
          cellSize={5}
          dotScale={0.9}
          shape="square"
          backgroundColor="#05070b"
          dropoutStrength={0.12}
          interactive
          distortionStrength={13}
          distortionRadius={118}
          distortionMode="swirl"
          followSpeed={0.2}
          sampleAverage
          tintColor="#e9fff9"
          tintStrength={0.08}
          maxFps={60}
          objectFit="cover"
          jitterStrength={1.6}
          jitterSpeed={2.4}
          fadeOnLeave
          fadeSpeed={0.16}
          responsive
          touchHandleId={portraitTouchHandleId}
          ariaLabel="Pixelated portrait of Jaxon facing the sea at dusk"
        />
        <span className="hero-portrait-label hero-portrait-label--top" aria-hidden="true">
          PORTRAIT / PIXEL FIELD
        </span>
        <span className="hero-portrait-label hero-portrait-label--bottom" aria-hidden="true">
          MOVE / DISTORT
        </span>
        <button
          id={portraitTouchHandleId}
          className="hero-portrait-touch-handle"
          type="button"
          aria-controls={portraitCanvasId}
          aria-label="Drag to distort the portrait. Swipe elsewhere on the image to scroll."
          aria-pressed="false"
          data-touch-active="false"
          data-touch-ready="false"
          disabled
        >
          <span data-touch-label="idle">DRAG / DISTORT</span>
          <span data-touch-label="active">RELEASE / SCROLL</span>
        </button>
      </div>
    </figure>
  );
}
