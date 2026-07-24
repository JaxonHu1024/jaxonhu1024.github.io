"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-compiling build terminal that replaces the former hero chip photo and
 * its Canvas signal overlay. It renders a complete, readable terminal at SSR
 * time (a static "ready" frame) and — once mounted with motion enabled —
 * drives a six-phase state machine that visualizes "compiling intelligence".
 *
 * The React tree only re-renders on phase changes (~6 setState per loop). All
 * visual transitions live in CSS keyed off `data-phase` / `data-motion`; the
 * percentage counter is written straight to a ref (never per-character
 * setState) and is fully torn down when offscreen, backgrounded, or when the
 * user prefers reduced motion.
 */

type PhaseName = "booting" | "compiling" | "linking" | "sealing" | "ready" | "idle";

type Phase = {
  readonly name: PhaseName;
  /** Phase duration in milliseconds. */
  readonly duration: number;
  /** Progress target for this phase, 0–1 (drives the bar and the counter). */
  readonly progress: number;
  /** Footer status word rendered after the version string. */
  readonly label: string;
};

// One full loop lasts ~14.7s. Each entry is one React render.
const PHASES: readonly Phase[] = [
  { name: "booting", duration: 600, progress: 0, label: "boot" },
  { name: "compiling", duration: 5000, progress: 0.55, label: "compiling" },
  { name: "linking", duration: 4500, progress: 0.92, label: "linking" },
  { name: "sealing", duration: 2000, progress: 1, label: "sealing" },
  { name: "ready", duration: 1600, progress: 1, label: "ready" },
  { name: "idle", duration: 1000, progress: 1, label: "idle" },
];

const PHASE_BY_NAME = new Map(PHASES.map((phase) => [phase.name, phase]));

// SSR + no-JS + reduced-motion all present this completed static frame.
const STATIC_PHASE: PhaseName = "ready";

type LogGroup = "compile" | "link";

type LogLine = {
  readonly stamp: string;
  readonly text: string;
  readonly group: LogGroup;
  /** Cascade index within the group (drives the staggered CSS reveal). */
  readonly order: number;
};

// Personal-capability compilation narrative; static so tests and the static
// export can assert against it without executing the animation.
const LOG_LINES: readonly LogLine[] = [
  { stamp: "+0.42s", text: "mapping AI systems", group: "compile", order: 0 },
  { stamp: "+1.18s", text: "loading research signals", group: "compile", order: 1 },
  { stamp: "+2.36s", text: "resolving model dependencies", group: "compile", order: 2 },
  { stamp: "+3.87s", text: "optimizing deployment path", group: "compile", order: 3 },
  { stamp: "+0.64s", text: "validating production impact", group: "link", order: 0 },
  { stamp: "+1.52s", text: "linking real-world intelligence", group: "link", order: 1 },
];

const COUNTER_THROTTLE_MS = 80; // ~12fps text updates, well under any INP budget.

export function HeroTerminal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<PhaseName>(STATIC_PHASE);
  const [motion, setMotion] = useState<"running" | "reduced" | undefined>(undefined);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const heroMedia = root.closest<HTMLElement>(".hero-media");
    if (!heroMedia) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const initialRect = heroMedia.getBoundingClientRect();
    let reduced = motionQuery.matches;
    let intersecting = initialRect.bottom > 0 && initialRect.top < window.innerHeight;
    let loopActive = false;
    let phaseIndex = 0;
    let phaseStart = 0;
    let fromPercent = 100;
    let toPercent = 100;
    let phaseTimer: number | undefined;
    let frame: number | undefined;
    let lastWrite = 0;

    const writePercent = (value: number) => {
      const node = percentRef.current;
      if (node) node.textContent = String(value);
    };

    const clearTimers = () => {
      if (phaseTimer !== undefined) window.clearTimeout(phaseTimer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      phaseTimer = undefined;
      frame = undefined;
    };

    const runCounter = () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      lastWrite = 0;
      const tick = (now: number) => {
        if (now - lastWrite >= COUNTER_THROTTLE_MS) {
          lastWrite = now;
          const active = PHASES[phaseIndex];
          const elapsed = performance.now() - phaseStart;
          const ratio = active.duration > 0 ? Math.min(1, elapsed / active.duration) : 1;
          writePercent(Math.round(fromPercent + (toPercent - fromPercent) * ratio));
        }
        frame = window.requestAnimationFrame(tick);
      };
      frame = window.requestAnimationFrame(tick);
    };

    const enterPhase = (index: number) => {
      phaseIndex = index;
      const active = PHASES[index];
      fromPercent = toPercent;
      toPercent = active.progress * 100;
      phaseStart = performance.now();
      setPhase(active.name);
      runCounter();
      phaseTimer = window.setTimeout(
        () => enterPhase((index + 1) % PHASES.length),
        active.duration,
      );
    };

    const startLoop = () => {
      if (loopActive) return;
      loopActive = true;
      clearTimers();
      fromPercent = 100;
      toPercent = 100;
      writePercent(100);
      enterPhase(0);
    };

    const stop = () => {
      loopActive = false;
      clearTimers();
    };

    const cancelTransitions = () => {
      root.getAnimations({ subtree: true }).forEach((animation) => {
        if (animation instanceof CSSTransition) animation.cancel();
      });
    };

    const syncActivity = () => {
      const active = intersecting && !document.hidden;
      heroMedia.dataset.heroVisible = active ? "true" : "false";

      if (reduced || !active) {
        stop();
        cancelTransitions();
        return;
      }
      startLoop();
    };

    const applyMotion = () => {
      if (reduced) {
        stop();
        setMotion("reduced");
        setPhase(STATIC_PHASE);
        writePercent(100);
        syncActivity();
        return;
      }
      setMotion("running");
      syncActivity();
    };

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        intersecting = Boolean(entry?.isIntersecting);
        syncActivity();
      },
      { threshold: 0.05 },
    );
    visibilityObserver.observe(heroMedia);

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      applyMotion();
    };

    const handleVisibility = () => {
      syncActivity();
    };

    motionQuery.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);

    applyMotion();

    return () => {
      stop();
      visibilityObserver.disconnect();
      delete heroMedia.dataset.heroVisible;
      motionQuery.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const active = PHASE_BY_NAME.get(phase) ?? PHASE_BY_NAME.get(STATIC_PHASE)!;

  return (
    <div
      ref={rootRef}
      className="hero-terminal"
      data-phase={phase}
      data-motion={motion}
      data-motion-layer="hero-flow"
      aria-hidden="true"
      style={
        {
          "--progress": active.progress,
          "--progress-dur": `${active.duration}ms`,
        } as React.CSSProperties
      }
    >
      <div className="hero-terminal-bar">
        <span className="hero-terminal-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="hero-terminal-path">sac://build</span>
      </div>
      <div className="hero-terminal-body">
        <p className="hero-terminal-command">
          <span className="hero-terminal-prompt">›_</span>
          <span className="hero-terminal-command-text">jaxon build --real-world</span>
          <span className="hero-terminal-caret" aria-hidden="true" />
        </p>
        <ul className="hero-terminal-log">
          {LOG_LINES.map((line) => (
            <li
              key={line.text}
              className={`hero-terminal-line is-${line.group}`}
              style={{ "--reveal-order": line.order } as React.CSSProperties}
            >
              <span className="hero-terminal-stamp">{line.stamp}</span>
              <span className="hero-terminal-text">{line.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="hero-terminal-footer">
        <span className="hero-terminal-version">
          v1.0.0 · {active.label}
          <span className="hero-terminal-ellipsis" aria-hidden="true">
            …
          </span>
        </span>
        <span className="hero-terminal-readout">
          <span className="hero-terminal-percent" ref={percentRef} suppressHydrationWarning>
            100
          </span>
          <span className="hero-terminal-percent-sign">%</span>
        </span>
      </div>
      <div className="hero-terminal-progress" aria-hidden="true">
        <span className="hero-terminal-progress-fill" />
      </div>
    </div>
  );
}
