"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A decorative, engineer-readable CLI build session for the Hero. The server
 * renders the completed frame; motion-enabled clients replay one command and
 * five build steps while CSS handles every visible transition.
 */

type TerminalPhase = "typing" | "running" | "ready" | "resetting";
type ActivationTone = 1 | 2 | 3;

type ActivationCellState = {
  readonly active: boolean;
  readonly tone: ActivationTone;
};

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

const FIELD_CELL_COUNT = 50;
const FIELD_DENSITY_BY_STEP = [0.28, 0.42, 0.58, 0.72, 0.52] as const;
const EMPTY_ACTIVATION_FIELD: readonly ActivationCellState[] = Array.from(
  { length: FIELD_CELL_COUNT },
  () => ({ active: false, tone: 1 as ActivationTone }),
);

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createActivationField(
  seed: number,
  density: number,
): readonly ActivationCellState[] {
  const random = createSeededRandom(seed);
  const positions = Array.from({ length: FIELD_CELL_COUNT }, (_, index) => index);

  for (let index = positions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [positions[index], positions[swapIndex]] = [positions[swapIndex], positions[index]];
  }

  const activeCount = Math.max(
    3,
    Math.min(
      FIELD_CELL_COUNT,
      Math.round(FIELD_CELL_COUNT * density + (random() - 0.5) * 4),
    ),
  );
  const field: ActivationCellState[] = EMPTY_ACTIVATION_FIELD.map((cell) => ({ ...cell }));

  positions.slice(0, activeCount).forEach((position, rank) => {
    const roll = random();
    const tone: ActivationTone = rank === 0
      ? 1
      : rank === 1
        ? 2
        : rank === 2
          ? 3
          : roll < 0.62
            ? 1
            : roll < 0.9
              ? 2
              : 3;
    field[position] = { active: true, tone };
  });

  return field;
}

const STATIC_ACTIVATION_FIELD = createActivationField(0x5a17c9e3, 0.52);

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
  const [activationField, setActivationField] = useState(STATIC_ACTIVATION_FIELD);
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
    let activationSeed = Math.floor(Math.random() * 0xffff_ffff);

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
      setActivationField(EMPTY_ACTIVATION_FIELD);
      schedule(() => enterStep(1), COMMAND_DURATION_MS);
    }

    function enterStep(stepCount: number) {
      if (!loopActive) return;
      setPhase("running");
      setVisibleStepCount(stepCount);
      activationSeed = (activationSeed + 0x9e3779b9 + stepCount) >>> 0;
      setActivationField(createActivationField(
        activationSeed,
        FIELD_DENSITY_BY_STEP[stepCount - 1],
      ));
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
      setActivationField(EMPTY_ACTIVATION_FIELD);
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
        setActivationField(STATIC_ACTIVATION_FIELD);
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
                d="M186 38H304L312 46V142L304 150H186L178 142V46Z"
              />
              <text className="hero-activation-title" x="245" y="26">
                LATENT FIELD
              </text>
              <g className="hero-activation-field">
                {activationField.map((cell, index) => {
                  const row = Math.floor(index / 10);
                  const column = index % 10;
                  return (
                    <rect
                      key={`${row}-${column}`}
                      className={`hero-activation-cell tone-${cell.tone}${cell.active ? " is-active" : " is-dormant"}`}
                      x={191 + column * 11}
                      y={52 + row * 18}
                      width="6"
                      height="6"
                      style={
                        {
                          "--cell-breathe-delay": `${-((index * 137) % 1_100)}ms`,
                          "--cell-breathe-duration": `${1_350 + (index % 7) * 95}ms`,
                        } as React.CSSProperties
                      }
                    />
                  );
                })}
              </g>
            </g>
            <g className={`hero-signal-output${completedStageCount >= 5 ? " is-active" : ""}${phase === "running" && visibleStepCount === 5 ? " is-current" : ""}`}>
              <path className="hero-signal-output-route" d="M312 94H386" />
              <path
                className={`hero-topology-signal${phase === "running" && visibleStepCount === 5 ? " is-current" : ""}`}
                d="M312 94H386"
                pathLength="1"
              />
              <path className="hero-signal-output-node" d="M386 84V104M386 94H404" />
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
