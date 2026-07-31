"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  AboutParticleField,
  type AboutCompilerStage,
} from "./AboutParticleField";

type OperatingStage = {
  detail: string;
  id: AboutCompilerStage;
  label: string;
  output: string;
};

const operatingTrace: readonly OperatingStage[] = [
  {
    id: "frame",
    label: "PERCEIVE",
    detail: "Language and vision become one shared context.",
    output: "SIGNAL",
  },
  {
    id: "model",
    label: "REASON",
    detail: "Agents turn context into an inspectable decision.",
    output: "DECISION",
  },
  {
    id: "build",
    label: "ACT",
    detail: "Tools and autonomy close the loop in the real world.",
    output: "BEHAVIOR",
  },
  {
    id: "verify",
    label: "VERIFY",
    detail: "Evaluation keeps every claim attached to evidence.",
    output: "EVIDENCE",
  },
];

export function AboutContextCompiler() {
  const [activeStage, setActiveStage] = useState<AboutCompilerStage>("frame");
  const stageButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = operatingTrace.findIndex((stage) => stage.id === activeStage);
  const active = operatingTrace[activeIndex] ?? operatingTrace[0];
  const activateStageAt = (index: number) => {
    const nextIndex = (index + operatingTrace.length) % operatingTrace.length;
    const nextStage = operatingTrace[nextIndex];
    setActiveStage(nextStage.id);
    stageButtonRefs.current[nextIndex]?.focus();
  };
  const handleStageKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = index + 1;
    } else if (event.key === "ArrowLeft") {
      nextIndex = index - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = operatingTrace.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    activateStageAt(nextIndex);
  };

  return (
    <div className="about-compiler">
      <AboutParticleField
        stage={active.id}
        stageLabel={active.label}
        stageOutput={active.output}
      />

      <div className="about-process" data-active-stage={active.id}>
        <div
          className="about-stage-tabs"
          role="tablist"
          aria-label="System transformation stages"
          aria-orientation="horizontal"
        >
          {operatingTrace.map((stage, index) => {
            const isActive = stage.id === active.id;

            return (
              <button
                ref={(element) => {
                  stageButtonRefs.current[index] = element;
                }}
                className="about-stage-tab"
                type="button"
                role="tab"
                id={`about-stage-tab-${stage.id}`}
                aria-controls={`about-stage-panel-${stage.id}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveStage(stage.id)}
                onKeyDown={(event) => handleStageKeyDown(event, index)}
                key={stage.id}
              >
                <span>{stage.label}</span>
              </button>
            );
          })}
        </div>

        <div className="about-stage-panels" aria-live="polite" aria-atomic="true">
          {operatingTrace.map((stage) => {
            const isActive = stage.id === active.id;

            return (
              <div
                className="about-stage-panel"
                role="tabpanel"
                id={`about-stage-panel-${stage.id}`}
                aria-labelledby={`about-stage-tab-${stage.id}`}
                hidden={!isActive}
                key={stage.id}
              >
                <p className="about-stage-detail">{stage.detail}</p>
                <p className="about-stage-output">
                  <span>OUTPUT</span>
                  <strong>{stage.output}</strong>
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
