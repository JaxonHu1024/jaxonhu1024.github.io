import { PixelatedCanvas } from "./PixelatedCanvas";

const portraitSource = "/assets/jaxon-sea-portrait.webp";

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
          ariaLabel="Pixelated portrait of Jaxon facing the sea at dusk"
        />
        <span className="hero-portrait-label hero-portrait-label--top" aria-hidden="true">
          PORTRAIT / PIXEL FIELD
        </span>
        <span className="hero-portrait-label hero-portrait-label--bottom" aria-hidden="true">
          MOVE / DISTORT
        </span>
      </div>
    </figure>
  );
}
