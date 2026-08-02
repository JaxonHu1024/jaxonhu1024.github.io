"use client";

import { useEffect, useRef } from "react";

const TRACE_EPSILON = 0.0005;
const TRACE_EASING = 0.18;

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function SiteTracingBeam() {
  const beamRef = useRef<HTMLElement>(null);
  const gradientRef = useRef<SVGLinearGradientElement>(null);

  useEffect(() => {
    const beam = beamRef.current;
    if (!beam) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let currentProgress = 0;
    let targetProgress = 0;
    let animationFrame: number | null = null;
    let pageVisible = document.visibilityState === "visible";

    const readProgress = () => {
      const scrollRange = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      return clampProgress(window.scrollY / scrollRange);
    };

    const renderProgress = (progress: number, motion: "idle" | "responsive" | "reduced" | "paused") => {
      const normalizedProgress = clampProgress(progress);
      const gradientCenter = 5 + normalizedProgress * 90;
      const gradientStart = Math.max(0, gradientCenter - 24);
      const gradientEnd = Math.min(100, gradientCenter + 18);
      beam.style.setProperty("--site-trace-progress", normalizedProgress.toFixed(4));
      beam.dataset.traceProgress = normalizedProgress.toFixed(4);
      beam.dataset.traceMotion = motion;
      gradientRef.current?.setAttribute("y1", gradientStart.toFixed(2));
      gradientRef.current?.setAttribute("y2", gradientEnd.toFixed(2));
    };

    const stopAnimation = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const animate = () => {
      animationFrame = null;
      if (!pageVisible || motionQuery.matches) return;

      currentProgress += (targetProgress - currentProgress) * TRACE_EASING;
      if (Math.abs(targetProgress - currentProgress) <= TRACE_EPSILON) {
        currentProgress = targetProgress;
        renderProgress(currentProgress, "idle");
        return;
      }

      renderProgress(currentProgress, "responsive");
      animationFrame = window.requestAnimationFrame(animate);
    };

    const scheduleProgress = () => {
      targetProgress = readProgress();

      if (motionQuery.matches) {
        stopAnimation();
        currentProgress = targetProgress;
        renderProgress(currentProgress, "reduced");
        return;
      }

      if (!pageVisible) {
        renderProgress(currentProgress, "paused");
        return;
      }

      if (animationFrame === null) {
        renderProgress(currentProgress, "responsive");
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      if (!pageVisible) {
        stopAnimation();
        renderProgress(currentProgress, "paused");
      } else {
        scheduleProgress();
      }
    };

    const resizeObserver = new ResizeObserver(scheduleProgress);
    resizeObserver.observe(document.body);
    window.addEventListener("scroll", scheduleProgress, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", scheduleProgress);
    scheduleProgress();

    return () => {
      stopAnimation();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", scheduleProgress);
    };
  }, []);

  return (
    <aside
      ref={beamRef}
      className="site-tracing-beam"
      aria-hidden="true"
      data-trace-motion="pending"
      data-trace-progress="0.0000"
    >
      <svg
        className="site-tracing-beam__path"
        viewBox="0 0 20 100"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient
            ref={gradientRef}
            id="site-tracing-beam-gradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            x2="0"
            y1="0"
            y2="23"
          >
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="0" stopColor="var(--color-accent)" />
            <stop offset="0.325" stopColor="var(--color-accent-signal)" />
            <stop offset="1" stopColor="var(--color-status-active)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="site-tracing-beam__track" d="M 10 0 V 4 L 19 7 V 80 L 1 83 V 100" />
        <path
          className="site-tracing-beam__progress"
          d="M 10 0 V 4 L 19 7 V 80 L 1 83 V 100"
          stroke="url(#site-tracing-beam-gradient)"
        />
      </svg>
      <span className="site-tracing-beam__head">
        <span />
      </span>
    </aside>
  );
}
