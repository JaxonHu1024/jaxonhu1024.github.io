"use client";

import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import {
  AboutParticleField,
  type AboutCompilerStage,
} from "./AboutParticleField";

type OperatingStage = {
  detail: string;
  id: AboutCompilerStage;
  index: string;
  label: string;
  output: string;
};

const operatingTrace: readonly OperatingStage[] = [
  {
    id: "frame",
    index: "01",
    label: "PERCEIVE",
    detail: "Language and vision become one shared context.",
    output: "SIGNAL",
  },
  {
    id: "model",
    index: "02",
    label: "REASON",
    detail: "Agents turn context into an inspectable decision.",
    output: "DECISION",
  },
  {
    id: "build",
    index: "03",
    label: "ACT",
    detail: "Tools and autonomy close the loop in the real world.",
    output: "BEHAVIOR",
  },
  {
    id: "verify",
    index: "04",
    label: "VERIFY",
    detail: "Evaluation keeps every claim attached to evidence.",
    output: "EVIDENCE",
  },
];

export function AboutContextCompiler() {
  const [activeStage, setActiveStage] = useState<AboutCompilerStage>("frame");
  const activeIndex = operatingTrace.findIndex((stage) => stage.id === activeStage);
  const active = operatingTrace[activeIndex] ?? operatingTrace[0];
  const activateFromPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    stage: AboutCompilerStage,
  ) => {
    if (
      window.innerWidth <= 600
      || event.pointerType !== "mouse"
      || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
    ) {
      return;
    }
    setActiveStage(stage);
  };

  return (
    <>
      <AboutParticleField
        stage={active.id}
        stageLabel={active.label}
        stageOutput={active.output}
      />

      <div className="about-process" data-active-stage={active.id}>
        <p className="about-process-heading" aria-hidden="true">
          <span>SYSTEM RANGE</span>
          <span>ACTIVE / {active.index} {active.label}</span>
        </p>
        <ol className="about-method" aria-label="System range">
          {operatingTrace.map((stage) => {
            const isActive = stage.id === active.id;

            return (
              <li key={stage.id} data-active={isActive ? "true" : "false"}>
                <button
                  className="about-method-button"
                  type="button"
                  aria-label={`${stage.label}. ${stage.detail} Output ${stage.output}.`}
                  aria-pressed={isActive}
                  onClick={() => setActiveStage(stage.id)}
                  onFocus={() => setActiveStage(stage.id)}
                  onPointerEnter={(event) => activateFromPointer(event, stage.id)}
                >
                  <span className="about-method-meta">
                    <span className="about-method-index">{stage.index}</span>
                    <span className="about-method-label">{stage.label}</span>
                  </span>
                  <span className="about-method-detail">{stage.detail}</span>
                  <span className="about-method-output">
                    OUT / {stage.output}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}
