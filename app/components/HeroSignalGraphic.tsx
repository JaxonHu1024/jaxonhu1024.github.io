export function HeroSignalGraphic() {
  return (
    <svg
      className="hero-signal-svg"
      viewBox="0 0 760 460"
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="hero-signal-echo"
        d="M36 354C146 354 142 182 258 182C374 182 374 298 482 298C590 298 614 132 728 132"
        pathLength="1"
      />
      <path
        className="hero-signal-path hero-signal-path--main"
        d="M36 334C150 334 148 162 266 162C384 162 382 278 492 278C602 278 616 112 728 112"
        pathLength="1"
      />
      <path
        className="hero-signal-path hero-signal-path--branch"
        d="M266 162C340 162 350 78 438 78C526 78 546 188 628 188"
        pathLength="1"
      />
      <path
        className="hero-signal-path hero-signal-path--branch hero-signal-path--branch-lower"
        d="M492 278C536 278 554 354 622 354C670 354 692 326 728 326"
        pathLength="1"
      />
      <circle className="hero-signal-node hero-signal-node--mint" cx="266" cy="162" r="7" />
      <circle className="hero-signal-node hero-signal-node--violet" cx="438" cy="78" r="6" />
      <circle className="hero-signal-node hero-signal-node--coral" cx="492" cy="278" r="8" />
      <circle className="hero-signal-node hero-signal-node--mint" cx="728" cy="112" r="6" />
    </svg>
  );
}
