"use client";

import { useEffect, useRef } from "react";

import { SITE_TRACE_PATH, pointOnSiteTrace } from "@/app/lib/motion-performance";

const TRACE_EPSILON = 0.0005;
const TRACE_EASING = 0.18;
const TRACE_IDLE_DELAY_MS = 900;

function clampProgress(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function SiteTracingBeam() {
  const beamRef = useRef<HTMLElement>(null);
  const gradientRef = useRef<SVGLinearGradientElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const beam = beamRef.current;
    if (!beam) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let currentProgress = 0;
    let targetProgress = 0;
    let animationFrame: number | null = null;
    let idleTimer: number | null = null;
    let pageVisible = document.visibilityState === "visible";
    let beamSize = { width: 1, height: 1 };

    const syncBeamSize = (width: number, height: number) => {
      beamSize = {
        width: Math.max(1, width),
        height: Math.max(1, height),
      };
    };

    const initialRect = beam.getBoundingClientRect();
    syncBeamSize(initialRect.width, initialRect.height);

    const readProgress = () => {
      const scrollRange = Math.max(
        1,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      return clampProgress(window.scrollY / scrollRange);
    };

    const renderProgress = (progress: number, motion: "idle" | "responsive" | "reduced" | "paused") => {
      const normalizedProgress = clampProgress(progress);
      const tracePoint = pointOnSiteTrace(normalizedProgress);
      const gradientCenter = tracePoint.y;
      const gradientStart = Math.max(0, gradientCenter - 16);
      const gradientEnd = Math.min(100, gradientCenter + 12);
      beam.dataset.traceProgress = normalizedProgress.toFixed(4);
      beam.dataset.traceMotion = motion;
      gradientRef.current?.setAttribute("y1", gradientStart.toFixed(2));
      gradientRef.current?.setAttribute("y2", gradientEnd.toFixed(2));
      const headX = tracePoint.x / 20 * beamSize.width;
      const headY = tracePoint.y / 100 * beamSize.height;
      if (headRef.current) {
        headRef.current.style.transform = `translate3d(${headX.toFixed(2)}px, ${headY.toFixed(2)}px, 0) translate(-50%, -50%)`;
      }
    };

    const stopAnimation = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
    };

    const clearIdleTimer = () => {
      if (idleTimer !== null) {
        window.clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const settleIdle = () => {
      idleTimer = null;
      stopAnimation();
      currentProgress = targetProgress;
      renderProgress(currentProgress, motionQuery.matches ? "reduced" : "idle");
      beam.dataset.traceVisibility = "idle";
    };

    const revealForScroll = () => {
      if (!pageVisible) return;
      clearIdleTimer();
      beam.dataset.traceVisibility = "active";
      idleTimer = window.setTimeout(settleIdle, TRACE_IDLE_DELAY_MS);
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

    const handleScroll = () => {
      revealForScroll();
      scheduleProgress();
    };

    const handleVisibilityChange = () => {
      pageVisible = document.visibilityState === "visible";
      if (!pageVisible) {
        clearIdleTimer();
        stopAnimation();
        beam.dataset.traceVisibility = "idle";
        renderProgress(currentProgress, "paused");
      } else {
        targetProgress = readProgress();
        currentProgress = targetProgress;
        beam.dataset.traceVisibility = "idle";
        renderProgress(currentProgress, motionQuery.matches ? "reduced" : "idle");
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const beamEntry = entries.find((entry) => entry.target === beam);
      if (beamEntry) {
        syncBeamSize(beamEntry.contentRect.width, beamEntry.contentRect.height);
      }
      scheduleProgress();
    });
    resizeObserver.observe(document.body);
    resizeObserver.observe(beam);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleProgress);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", scheduleProgress);
    targetProgress = readProgress();
    currentProgress = targetProgress;
    renderProgress(currentProgress, motionQuery.matches ? "reduced" : "idle");

    return () => {
      clearIdleTimer();
      stopAnimation();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", handleScroll);
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
      data-trace-visibility="idle"
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
            y2="12"
          >
            <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0" />
            <stop offset="0.18" stopColor="var(--color-accent)" stopOpacity="0.76" />
            <stop offset="0.54" stopColor="var(--color-accent-signal)" />
            <stop
              offset="0.82"
              stopColor="var(--color-trace-terminal)"
              stopOpacity="0.72"
            />
            <stop offset="1" stopColor="var(--color-trace-terminal)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="site-tracing-beam__track" d={SITE_TRACE_PATH} />
        <path
          className="site-tracing-beam__progress"
          d={SITE_TRACE_PATH}
          stroke="url(#site-tracing-beam-gradient)"
        />
      </svg>
      <span
        ref={headRef}
        className="site-tracing-beam__head"
        style={{ left: 0, top: 0 }}
      >
        <span />
      </span>
    </aside>
  );
}
