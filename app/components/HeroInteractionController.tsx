"use client";

import { useEffect } from "react";

import { createHashNavigation } from "../lib/hash-navigation";

function useHeroExperienceNavigation() {
  useEffect(() => {
    const navigation = createHashNavigation(window, document);

    const handleClick = (event: MouseEvent) => {
      const origin = event.target;
      if (!(origin instanceof Element)) return;

      const link = origin.closest<HTMLAnchorElement>('a.hero-cta[href^="#"]');
      if (!link) return;

      navigation.navigate(event, link.hash);
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      navigation.cancel();
    };
  }, []);
}

function useSectionMotionVisibility() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".section"));
    if (sections.length === 0) return;

    const setVisibility = (section: HTMLElement, visible: boolean) => {
      section.dataset.sectionVisible = visible ? "true" : "false";
    };

    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      setVisibility(section, rect.bottom > 0 && rect.top < window.innerHeight);
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setVisibility(entry.target as HTMLElement, entry.isIntersecting);
        });
      },
      { rootMargin: "18% 0px", threshold: 0.01 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      sections.forEach((section) => delete section.dataset.sectionVisible);
    };
  }, []);
}

function usePageMotionActivity() {
  useEffect(() => {
    const root = document.documentElement;
    const syncActivity = () => {
      root.dataset.pageActive = document.hidden ? "false" : "true";
    };

    syncActivity();
    document.addEventListener("visibilitychange", syncActivity);

    return () => {
      document.removeEventListener("visibilitychange", syncActivity);
      delete root.dataset.pageActive;
    };
  }, []);
}

function useAboutSpotlight() {
  useEffect(() => {
    const list = document.querySelector<HTMLElement>("[data-about-spotlight]");
    if (!list) return;

    const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeStep: HTMLElement | null = null;
    let frame = 0;
    let pendingPoint: { step: HTMLElement; x: number; y: number } | null = null;

    const clearSpotlight = () => {
      if (frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      pendingPoint = null;
      if (!activeStep) return;
      delete activeStep.dataset.spotlightActive;
      activeStep.style.removeProperty("--about-spotlight-x");
      activeStep.style.removeProperty("--about-spotlight-y");
      activeStep = null;
    };

    const paintSpotlight = () => {
      frame = 0;
      const point = pendingPoint;
      pendingPoint = null;
      if (!point || !point.step.isConnected || !list.contains(point.step)) return;

      const rect = point.step.getBoundingClientRect();
      if (activeStep && activeStep !== point.step) {
        delete activeStep.dataset.spotlightActive;
        activeStep.style.removeProperty("--about-spotlight-x");
        activeStep.style.removeProperty("--about-spotlight-y");
      }

      activeStep = point.step;
      activeStep.dataset.spotlightActive = "true";
      activeStep.style.setProperty("--about-spotlight-x", `${point.x - rect.left}px`);
      activeStep.style.setProperty("--about-spotlight-y", `${point.y - rect.top}px`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerQuery.matches || motionQuery.matches || document.hidden) {
        clearSpotlight();
        return;
      }

      const origin = event.target;
      if (!(origin instanceof Element)) return;
      const step = origin.closest<HTMLElement>(".about-loop-step");
      if (!step || !list.contains(step)) {
        clearSpotlight();
        return;
      }

      pendingPoint = { step, x: event.clientX, y: event.clientY };
      if (frame === 0) frame = requestAnimationFrame(paintSpotlight);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) clearSpotlight();
    };

    list.addEventListener("pointermove", handlePointerMove, { passive: true });
    list.addEventListener("pointerleave", clearSpotlight, { passive: true });
    pointerQuery.addEventListener("change", clearSpotlight);
    motionQuery.addEventListener("change", clearSpotlight);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearSpotlight();
      list.removeEventListener("pointermove", handlePointerMove);
      list.removeEventListener("pointerleave", clearSpotlight);
      pointerQuery.removeEventListener("change", clearSpotlight);
      motionQuery.removeEventListener("change", clearSpotlight);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
}

function useExperienceTrace() {
  useEffect(() => {
    const section = document.querySelector<HTMLElement>("#experience");
    const log = section?.querySelector<HTMLElement>(".experience-log");
    const track = log?.querySelector<HTMLElement>(".experience-scan-track");
    const cursor = track?.querySelector<HTMLElement>(".experience-scan-cursor");
    if (!section || !log || !track || !cursor) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let cursorHeight = 0;
    let traceHeight = 0;
    let traceRange = 0;
    let lastProgress = -1;

    const writeProgress = (progress: number) => {
      const bounded = Math.min(1, Math.max(0, progress));
      if (Math.abs(bounded - lastProgress) < 0.001) return;
      lastProgress = bounded;
      const serialized = bounded.toFixed(4);
      log.dataset.traceProgress = serialized;
      log.style.setProperty("--experience-trace-progress", serialized);
      log.style.setProperty(
        "--experience-trace-y",
        `${Math.round(Math.min(
          traceRange,
          Math.max(0, bounded * traceHeight - cursorHeight / 2),
        ) * 100) / 100}px`,
      );
    };

    const isActive = () => (
      !document.hidden
      && section.dataset.sectionVisible !== "false"
      && !motionQuery.matches
    );

    const updateTrace = () => {
      frame = 0;
      if (motionQuery.matches) {
        section.dataset.traceMotion = "reduced";
        writeProgress(1);
        return;
      }
      if (!isActive()) return;

      section.dataset.traceMotion = "responsive";
      const rect = log.getBoundingClientRect();
      const startLine = window.innerHeight * 0.72;
      const endLine = window.innerHeight * 0.28;
      const travel = Math.max(1, rect.height + startLine - endLine);
      writeProgress((startLine - rect.top) / travel);
    };

    const scheduleTrace = () => {
      if (motionQuery.matches) return;
      if (!isActive() || frame !== 0) return;
      frame = requestAnimationFrame(updateTrace);
    };

    const syncGeometry = () => {
      traceHeight = track.clientHeight;
      cursorHeight = cursor.offsetHeight;
      traceRange = Math.max(0, traceHeight - cursorHeight);
      lastProgress = -1;
      if (motionQuery.matches) {
        updateTrace();
        return;
      }
      scheduleTrace();
    };

    const handleVisibilityChange = () => {
      if (document.hidden && frame !== 0) {
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      scheduleTrace();
    };

    const visibilityObserver = new MutationObserver(scheduleTrace);
    visibilityObserver.observe(section, {
      attributes: true,
      attributeFilter: ["data-section-visible"],
    });

    const resizeObserver = new ResizeObserver(syncGeometry);
    resizeObserver.observe(log);
    window.addEventListener("scroll", scheduleTrace, { passive: true });
    window.addEventListener("resize", syncGeometry);
    motionQuery.addEventListener("change", syncGeometry);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    syncGeometry();

    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      visibilityObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleTrace);
      window.removeEventListener("resize", syncGeometry);
      motionQuery.removeEventListener("change", syncGeometry);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      delete section.dataset.traceMotion;
      delete log.dataset.traceProgress;
      log.style.removeProperty("--experience-trace-progress");
      log.style.removeProperty("--experience-trace-y");
    };
  }, []);
}

export function HeroInteractionController() {
  useHeroExperienceNavigation();
  useSectionMotionVisibility();
  usePageMotionActivity();
  useAboutSpotlight();
  useExperienceTrace();
  return null;
}
