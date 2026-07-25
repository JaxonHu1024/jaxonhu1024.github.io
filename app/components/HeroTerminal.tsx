"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A decorative, engineer-readable CLI build session for the Hero. The server
 * renders the completed frame; motion-enabled clients replay one command and
 * five build steps while CSS handles every visible transition.
 */

type TerminalPhase = "typing" | "running" | "ready" | "resetting";

type CliStep = {
  readonly progress: number;
  readonly text: string;
};

const CLI_STEPS: readonly CliStep[] = [
  { progress: 0.11, text: "initializing agent runtime" },
  { progress: 0.3, text: "binding LLM / VLM models" },
  { progress: 0.57, text: "validating perception policy" },
  { progress: 0.82, text: "optimizing inference graph" },
  { progress: 1, text: "publishing production artifact" },
];

const COMMAND_DURATION_MS = 700;
const STEP_DURATION_MS = 900;
const RUN_DURATION_MS = STEP_DURATION_MS * CLI_STEPS.length;
const READY_HOLD_MS = 2_800;
const RESET_DURATION_MS = 500;
const STATIC_PHASE: TerminalPhase = "ready";
const STATIC_VISIBLE_STEP_COUNT = CLI_STEPS.length;

export function HeroTerminal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<TerminalPhase>(STATIC_PHASE);
  const [visibleStepCount, setVisibleStepCount] = useState(STATIC_VISIBLE_STEP_COUNT);
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
    let phaseTimer: number | undefined;

    const clearTimer = () => {
      if (phaseTimer !== undefined) window.clearTimeout(phaseTimer);
      phaseTimer = undefined;
    };

    const schedule = (callback: () => void, delay: number) => {
      clearTimer();
      phaseTimer = window.setTimeout(() => {
        phaseTimer = undefined;
        callback();
      }, delay);
    };

    function enterTyping() {
      if (!loopActive) return;
      setPhase("typing");
      setVisibleStepCount(0);
      schedule(() => enterStep(1), COMMAND_DURATION_MS);
    }

    function enterStep(stepCount: number) {
      if (!loopActive) return;
      setPhase("running");
      setVisibleStepCount(stepCount);
      schedule(
        stepCount < CLI_STEPS.length
          ? () => enterStep(stepCount + 1)
          : enterReady,
        STEP_DURATION_MS,
      );
    }

    function enterReady() {
      if (!loopActive) return;
      setPhase("ready");
      setVisibleStepCount(CLI_STEPS.length);
      schedule(enterResetting, READY_HOLD_MS);
    }

    function enterResetting() {
      if (!loopActive) return;
      setPhase("resetting");
      setVisibleStepCount(0);
      schedule(enterTyping, RESET_DURATION_MS);
    }

    const startLoop = () => {
      if (loopActive) return;
      loopActive = true;
      clearTimer();
      enterTyping();
    };

    const stop = () => {
      loopActive = false;
      clearTimer();
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
        setVisibleStepCount(STATIC_VISIBLE_STEP_COUNT);
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

  const progress = phase === "ready"
    ? 1
    : CLI_STEPS[visibleStepCount - 1]?.progress ?? 0;
  const progressPercent = Math.round(progress * 100);
  const readyVisible = phase === "ready";

  return (
    <div
      ref={rootRef}
      className="hero-terminal"
      data-phase={phase}
      data-motion={motion}
      data-motion-layer="hero-flow"
      data-visible-steps={visibleStepCount}
      aria-hidden="true"
      style={
        {
          "--progress": progress,
          "--progress-run-duration": `${RUN_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="hero-terminal-bar">
        <span className="hero-terminal-window-controls" aria-hidden="true">
          <i className="hero-terminal-window-control" />
          <i className="hero-terminal-window-control" />
          <i className="hero-terminal-window-control" />
        </span>
      </div>
      <div className="hero-terminal-body">
        <p className="hero-terminal-command">
          <span className="hero-terminal-prompt">›_</span>
          <span className="hero-terminal-command-text">ai build --target production</span>
          <span className="hero-terminal-caret" aria-hidden="true" />
        </p>
        <ol className="hero-terminal-log">
          {CLI_STEPS.map((step, index) => (
            <li
              key={step.text}
              className={`hero-terminal-line${index < visibleStepCount ? " is-visible" : ""}`}
            >
              <span className="hero-terminal-step">
                [{index + 1}/{CLI_STEPS.length}]
              </span>
              <span className="hero-terminal-text">{step.text}</span>
            </li>
          ))}
        </ol>
        <p className={`hero-terminal-ready${readyVisible ? " is-visible" : ""}`}>
          <span aria-hidden="true">✓</span> AI pipeline ready
        </p>
      </div>
      <div className="hero-terminal-progress-row">
        <div className="hero-terminal-progress" aria-hidden="true">
          <span className="hero-terminal-progress-fill" />
        </div>
        <span className="hero-terminal-readout">
          <span className="hero-terminal-percent">{progressPercent}</span>
          <span className="hero-terminal-percent-sign">%</span>
        </span>
      </div>
    </div>
  );
}
