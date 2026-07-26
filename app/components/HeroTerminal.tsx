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
  readonly label: string;
  readonly status: string;
  readonly tone: "primary" | "signal" | "status";
};

const CLI_STEPS: readonly CliStep[] = [
  { progress: 0.11, label: "runtime", status: "online", tone: "primary" },
  { progress: 0.3, label: "models", status: "bound", tone: "signal" },
  { progress: 0.57, label: "policy", status: "verified", tone: "status" },
  { progress: 0.82, label: "graph", status: "optimized", tone: "signal" },
  { progress: 1, label: "artifact", status: "shipped", tone: "primary" },
];

const MOBILE_STEPS = [
  { label: "boot", status: "online", threshold: 1, tone: "primary" },
  { label: "verify", status: "verified", threshold: 3, tone: "status" },
  { label: "ship", status: "ready", threshold: 5, tone: "signal" },
] as const;

const SIGNAL_LANES = [
  {
    id: "language",
    label: "LANG",
    d: "M52 46C94 46 111 118 178 126",
    labelY: 49,
    step: 1,
  },
  {
    id: "vision",
    label: "VISION",
    d: "M52 94C98 94 116 58 178 62",
    labelY: 97,
    step: 2,
  },
  {
    id: "context",
    label: "CONTEXT",
    d: "M52 142C104 142 122 88 178 94",
    labelY: 145,
    step: 3,
  },
] as const;

const ACTIVATION_MATRIX = [
  [3, 4, 2, 5, 4, 3],
  [2, 3, 5, 3, 2, 4],
  [4, 2, 3, 4, 5, 2],
  [3, 5, 4, 2, 3, 5],
] as const;

const COMMAND_DURATION_MS = 750;
const STEP_DURATION_MS = 960;
const RUN_DURATION_MS = STEP_DURATION_MS * CLI_STEPS.length;
const READY_HOLD_MS = 2_200;
const RESET_DURATION_MS = 700;
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

  const progress = phase === "ready" || phase === "resetting"
    ? 1
    : CLI_STEPS[visibleStepCount - 1]?.progress ?? 0;
  const progressPercent = Math.round(progress * 100);
  const readyVisible = phase === "ready";
  const completedStageCount = phase === "ready" ? CLI_STEPS.length : visibleStepCount;
  const progressLabel = phase === "ready"
    ? "FIELD STABLE"
    : phase === "resetting"
      ? "RECYCLING FIELD"
      : "ROUTING SIGNALS";

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
          "--command-duration": `${COMMAND_DURATION_MS}ms`,
          "--progress-run-duration": `${RUN_DURATION_MS}ms`,
          "--reset-duration": `${RESET_DURATION_MS}ms`,
          "--step-duration": `${STEP_DURATION_MS}ms`,
        } as React.CSSProperties
      }
    >
      <div className="hero-terminal-bar">
        <span className="hero-terminal-identity">
          <span className="hero-terminal-index">SYS/07</span>
          <span>NEURAL PIPELINE</span>
        </span>
        <span className="hero-terminal-environment">
          <i aria-hidden="true" />
          PRODUCTION · ONLINE
        </span>
      </div>
      <div className="hero-terminal-stage">
        <div className="hero-terminal-body">
          <p className="hero-terminal-command">
            <span className="hero-terminal-prompt">›_</span>
            <span className="hero-terminal-command-text">agentctl compile --prod</span>
            <span className="hero-terminal-caret" aria-hidden="true" />
          </p>
          <ol className="hero-terminal-log">
            {CLI_STEPS.map((step, index) => (
              <li
                key={step.label}
                className={`hero-terminal-line tone-${step.tone}${index < visibleStepCount ? " is-visible" : ""}${phase === "running" && index === visibleStepCount - 1 ? " is-current" : ""}`}
              >
                <span className="hero-terminal-step">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="hero-terminal-text">{step.label}</span>
                <span className="hero-terminal-status">{step.status}</span>
              </li>
            ))}
          </ol>
          <ol className="hero-terminal-mobile-log">
            {MOBILE_STEPS.map((step, index) => (
              <li
                key={step.label}
                className={`hero-terminal-mobile-line tone-${step.tone}${step.threshold <= completedStageCount ? " is-visible" : ""}${phase === "running" && step.threshold === completedStageCount ? " is-current" : ""}`}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{step.label}</span>
                <span>{step.status}</span>
              </li>
            ))}
          </ol>
          <p className={`hero-terminal-ready${readyVisible ? " is-visible" : ""}`}>
            <span aria-hidden="true">◆</span> BUILD READY
          </p>
        </div>
        <div className="hero-topology">
          <div className="hero-topology-caption">
            <span>SIGNAL FIELD</span>
            <span>{String(completedStageCount).padStart(2, "0")} / 05</span>
          </div>
          <svg
            className="hero-topology-map"
            viewBox="0 0 420 188"
            role="presentation"
            aria-hidden="true"
          >
            <g className="hero-topology-guides">
              <path d="M8 12H50M8 12V38M412 176H370M412 176V150" />
            </g>
            <g className="hero-signal-lanes">
              {SIGNAL_LANES.map((lane) => {
                const active = lane.step <= completedStageCount;
                const current = phase === "running" && lane.step === visibleStepCount;

                return (
                  <g
                    key={lane.id}
                    className={`hero-signal-lane${active ? " is-active" : ""}`}
                  >
                    <text className="hero-signal-label" x="4" y={lane.labelY}>
                      {lane.label}
                    </text>
                    <path
                      className="hero-signal-route"
                      d={lane.d}
                    />
                    <path
                      className={`hero-topology-signal${current ? " is-current" : ""}`}
                      d={lane.d}
                      pathLength="1"
                    />
                  </g>
                );
              })}
            </g>
            <g className={`hero-activation-core${completedStageCount >= 2 ? " is-active" : ""}`}>
              <path
                className="hero-activation-frame"
                d="M178 42H190V34H300V42H312V146H300V154H190V146H178Z"
              />
              <text className="hero-activation-title" x="245" y="26">
                LATENT FIELD
              </text>
              <g className="hero-activation-matrix">
                {ACTIVATION_MATRIX.flatMap((row, rowIndex) => (
                  row.map((threshold, columnIndex) => {
                    const active = threshold <= completedStageCount;
                    const current = phase === "running" && threshold === visibleStepCount;
                    const tone = (rowIndex + columnIndex) % 3;

                    return (
                      <rect
                        key={`${rowIndex}-${columnIndex}`}
                        className={`hero-activation-cell tone-${tone + 1}${active ? " is-active" : ""}${current ? " is-current" : ""}`}
                        x={194 + columnIndex * 18}
                        y={54 + rowIndex * 22}
                        width="11"
                        height="11"
                      />
                    );
                  })
                ))}
              </g>
            </g>
            <g className={`hero-signal-output${completedStageCount >= 5 ? " is-active" : ""}${phase === "running" && visibleStepCount === 5 ? " is-current" : ""}`}>
              <path className="hero-signal-output-route" d="M312 94C342 94 355 94 385 94" />
              <path
                className={`hero-topology-signal${phase === "running" && visibleStepCount === 5 ? " is-current" : ""}`}
                d="M312 94C342 94 355 94 385 94"
                pathLength="1"
              />
              <path className="hero-signal-output-node" d="M398 82 410 94 398 106 386 94Z" />
              <text className="hero-signal-output-label" x="398" y="121">OUT</text>
            </g>
          </svg>
        </div>
      </div>
      <div className="hero-terminal-progress-row">
        <span className="hero-terminal-progress-copy">
          {progressLabel}
        </span>
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
