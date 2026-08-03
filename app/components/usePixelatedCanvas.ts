"use client";

import { useEffect, useRef, type RefObject } from "react";
import { createPixelatedCanvasRenderer } from "./pixelated-canvas-renderer";

// Adapted from Aceternity UI's Pixelated Canvas for responsive sizing and
// idle/offscreen/reduced-motion runtime control in this portfolio.

export type PixelatedCanvasProps = {
  src: string;
  width?: number;
  height?: number;
  cellSize?: number;
  dotScale?: number;
  shape?: "circle" | "square";
  backgroundColor?: string;
  grayscale?: boolean;
  id?: string;
  className?: string;
  responsive?: boolean;
  dropoutStrength?: number;
  interactive?: boolean;
  distortionStrength?: number;
  distortionRadius?: number;
  distortionMode?: "repel" | "attract" | "swirl";
  followSpeed?: number;
  sampleAverage?: boolean;
  tintColor?: string;
  tintStrength?: number;
  maxFps?: number;
  objectFit?: "cover" | "contain" | "fill" | "none";
  jitterStrength?: number;
  jitterSpeed?: number;
  fadeOnLeave?: boolean;
  fadeSpeed?: number;
  touchHandleId?: string;
  ariaLabel?: string;
};

const OFFSCREEN_POINTER = -9999;
const REFERENCE_FRAME_MS = 1000 / 60;
const FRAME_TOLERANCE_MS = 0.75;

function timeAdjustedFactor(factor: number, deltaMs: number) {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  if (clampedFactor === 0 || clampedFactor === 1) return clampedFactor;
  return 1 - Math.pow(1 - clampedFactor, deltaMs / REFERENCE_FRAME_MS);
}

type UsePixelatedCanvasProps = Omit<PixelatedCanvasProps, "id" | "className" | "ariaLabel"> & {
  canvasRef: RefObject<HTMLCanvasElement | null>;
};

export function usePixelatedCanvas({
  canvasRef,
  src,
  width = 400,
  height = 500,
  cellSize = 3,
  dotScale = 0.9,
  shape = "square",
  backgroundColor = "#000000",
  grayscale = false,
  responsive = false,
  dropoutStrength = 0.4,
  interactive = true,
  distortionStrength = 3,
  distortionRadius = 80,
  distortionMode = "swirl",
  followSpeed = 0.2,
  sampleAverage = true,
  tintColor = "#FFFFFF",
  tintStrength = 0.2,
  maxFps = 60,
  objectFit = "cover",
  jitterStrength = 4,
  jitterSpeed = 4,
  fadeOnLeave = true,
  fadeSpeed = 0.1,
  touchHandleId,
}: UsePixelatedCanvasProps) {
  const targetPointerRef = useRef({ x: OFFSCREEN_POINTER, y: OFFSCREEN_POINTER });
  const animatedPointerRef = useRef({ x: OFFSCREEN_POINTER, y: OFFSCREEN_POINTER });
  const animationFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const nextFrameRef = useRef(0);
  const activityRef = useRef(0);
  const targetActivityRef = useRef(0);
  const pointerInsideRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const touchHandle = touchHandleId ? document.getElementById(touchHandleId) : null;

    let cancelled = false;
    let sourceReady = false;
    let visible = true;
    let pageActive = document.visibilityState === "visible";
    let interactionEnabled = false;
    let interactionEndTimeout: number | null = null;
    let touchHandlePointerId: number | null = null;
    const image = new Image();
    image.crossOrigin = "anonymous";
    const renderer = createPixelatedCanvasRenderer({
      canvas,
      width,
      height,
      cellSize,
      dotScale,
      shape,
      backgroundColor,
      grayscale,
      responsive,
      dropoutStrength,
      distortionStrength,
      distortionRadius,
      distortionMode,
      sampleAverage,
      tintColor,
      tintStrength,
      objectFit,
      jitterStrength,
      jitterSpeed,
    });

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const setTouchHandleActive = (active: boolean) => {
      if (!touchHandle) return;
      touchHandle.dataset.touchActive = String(active);
      touchHandle.setAttribute("aria-pressed", String(active));
    };

    const clearTouchHandleInteraction = () => {
      const pointerId = touchHandlePointerId;
      touchHandlePointerId = null;
      setTouchHandleActive(false);
      if (pointerId !== null && touchHandle?.hasPointerCapture(pointerId)) {
        try {
          touchHandle.releasePointerCapture(pointerId);
        } catch {
          // Pointer capture can already be gone after a system-level cancellation.
        }
      }
    };

    const syncTouchHandleAvailability = () => {
      if (!touchHandle) return;
      const ready = interactionEnabled && sourceReady;
      touchHandle.dataset.touchReady = String(ready);
      touchHandle.setAttribute("aria-disabled", String(!ready));
      if (touchHandle instanceof HTMLButtonElement) touchHandle.disabled = !ready;
      if (!ready) clearTouchHandleInteraction();
    };

    const syncInteractionState = () => {
      interactionEnabled = interactive && !motionQuery.matches;
      canvas.dataset.interactive = String(interactionEnabled);
      canvas.dataset.motion = interactionEnabled ? "idle" : "reduced";
      if (!interactionEnabled) {
        pointerInsideRef.current = false;
        targetActivityRef.current = 0;
      }
      syncTouchHandleAvailability();
    };

    const stopAnimation = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameRef.current = 0;
      nextFrameRef.current = 0;
    };

    const animate = (now: number) => {
      animationFrameRef.current = null;
      if (!sourceReady || !visible || !pageActive || !interactionEnabled) return;

      const frameInterval = 1000 / Math.max(1, maxFps);
      if (nextFrameRef.current === 0) nextFrameRef.current = now;
      if (now + FRAME_TOLERANCE_MS < nextFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      const deltaMs = lastFrameRef.current === 0
        ? frameInterval
        : Math.min(100, Math.max(0, now - lastFrameRef.current));
      lastFrameRef.current = now;
      nextFrameRef.current += frameInterval;
      while (nextFrameRef.current <= now) nextFrameRef.current += frameInterval;

      const pointerFactor = timeAdjustedFactor(followSpeed, deltaMs);
      const activityFactor = fadeOnLeave ? timeAdjustedFactor(fadeSpeed, deltaMs) : 1;

      animatedPointerRef.current.x +=
        (targetPointerRef.current.x - animatedPointerRef.current.x) * pointerFactor;
      animatedPointerRef.current.y +=
        (targetPointerRef.current.y - animatedPointerRef.current.y) * pointerFactor;
      activityRef.current +=
        (targetActivityRef.current - activityRef.current) * activityFactor;

      if (!pointerInsideRef.current && activityRef.current < 0.006) {
        activityRef.current = 0;
        canvas.dataset.motion = "idle";
        renderer.draw(now, 0, animatedPointerRef.current);
        lastFrameRef.current = 0;
        nextFrameRef.current = 0;
        return;
      }

      renderer.draw(
        now,
        Math.max(0, Math.min(1, activityRef.current)),
        animatedPointerRef.current,
      );
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (
        animationFrameRef.current === null
        && sourceReady
        && visible
        && pageActive
        && interactionEnabled
      ) {
        canvas.dataset.motion = "running";
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    const computeSamples = () => {
      if (cancelled || !image.naturalWidth || !image.naturalHeight) return;
      sourceReady = renderer.computeSamples(image);
      if (!sourceReady) return;
      canvas.dataset.pixelatedReady = "true";
      syncTouchHandleAvailability();
      renderer.draw(performance.now(), 0, animatedPointerRef.current);
    };

    const resetInteraction = (motion = interactionEnabled ? "idle" : "reduced") => {
      clearTouchHandleInteraction();
      pointerInsideRef.current = false;
      targetActivityRef.current = 0;
      activityRef.current = 0;
      stopAnimation();
      canvas.dataset.motion = motion;
      if (sourceReady) renderer.draw(performance.now(), 0, animatedPointerRef.current);
    };

    const updatePointerPosition = (clientX: number, clientY: number) => {
      if (!interactionEnabled) return;
      if (interactionEndTimeout !== null) {
        window.clearTimeout(interactionEndTimeout);
        interactionEndTimeout = null;
      }
      const bounds = canvas.getBoundingClientRect();
      const x = clientX - bounds.left;
      const y = clientY - bounds.top;
      if (!pointerInsideRef.current || animatedPointerRef.current.x === OFFSCREEN_POINTER) {
        animatedPointerRef.current = { x, y };
      }
      targetPointerRef.current = { x, y };
      pointerInsideRef.current = true;
      targetActivityRef.current = 1;
      startAnimation();
    };

    const updatePointer = (event: PointerEvent) => {
      updatePointerPosition(event.clientX, event.clientY);
    };

    const fadeInteraction = () => {
      interactionEndTimeout = null;
      pointerInsideRef.current = false;
      targetActivityRef.current = 0;
      if (fadeOnLeave) {
        startAnimation();
      } else {
        resetInteraction();
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        fadeInteraction();
        return;
      }

      if (interactionEndTimeout !== null) window.clearTimeout(interactionEndTimeout);
      interactionEndTimeout = window.setTimeout(fadeInteraction, 160);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") handlePointerEnd(event);
    };

    const handlePointerCancel = () => {
      if (interactionEndTimeout !== null) {
        window.clearTimeout(interactionEndTimeout);
        interactionEndTimeout = null;
      }
      resetInteraction();
    };

    const canvasUsesTouchHandle = (event: PointerEvent) => (
      event.pointerType === "touch" && touchHandle !== null
    );

    const handleCanvasPointerEnter = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) updatePointer(event);
    };

    const handleCanvasPointerDown = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) updatePointer(event);
    };

    const handleCanvasPointerMove = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) updatePointer(event);
    };

    const handleCanvasPointerLeave = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) handlePointerEnd(event);
    };

    const handleCanvasPointerUp = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) handlePointerUp(event);
    };

    const handleCanvasPointerCancel = (event: PointerEvent) => {
      if (!canvasUsesTouchHandle(event)) handlePointerCancel();
    };

    const beginTouchHandleInteraction = (event: PointerEvent) => {
      if (!interactionEnabled || !sourceReady || !event.isPrimary || event.button > 0) return;
      event.preventDefault();
      touchHandlePointerId = event.pointerId;
      setTouchHandleActive(true);
      try {
        touchHandle?.setPointerCapture(event.pointerId);
      } catch {
        // Continue without capture if the browser has already retired this pointer.
      }
      updatePointer(event);
    };

    const moveTouchHandleInteraction = (event: PointerEvent) => {
      if (touchHandlePointerId !== event.pointerId) return;
      event.preventDefault();
      updatePointer(event);
    };

    const endTouchHandleInteraction = (event: PointerEvent, interrupted = false) => {
      if (touchHandlePointerId !== event.pointerId) return;
      event.preventDefault();
      clearTouchHandleInteraction();
      if (interrupted) {
        handlePointerCancel();
      } else {
        handlePointerEnd(event);
      }
    };

    const handleTouchHandlePointerUp = (event: PointerEvent) => {
      endTouchHandleInteraction(event);
    };

    const handleTouchHandlePointerCancel = (event: PointerEvent) => {
      endTouchHandleInteraction(event, true);
    };

    const handleTouchHandleLostCapture = (event: PointerEvent) => {
      if (touchHandlePointerId === event.pointerId) {
        touchHandlePointerId = null;
        setTouchHandleActive(false);
        handlePointerCancel();
      }
    };

    const handleTouchHandleClick = (event: MouseEvent) => {
      if (event.detail !== 0 || !interactionEnabled || !sourceReady) return;
      const bounds = canvas.getBoundingClientRect();
      setTouchHandleActive(true);
      updatePointerPosition(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      if (interactionEndTimeout !== null) window.clearTimeout(interactionEndTimeout);
      interactionEndTimeout = window.setTimeout(() => {
        setTouchHandleActive(false);
        fadeInteraction();
      }, 320);
    };

    const handleVisibilityChange = () => {
      pageActive = document.visibilityState === "visible";
      if (!pageActive) {
        resetInteraction("paused");
      } else if (visible) {
        canvas.dataset.motion = interactionEnabled ? "idle" : "reduced";
      }
    };

    const handleWindowBlur = () => {
      resetInteraction();
    };

    const handleMotionChange = () => {
      syncInteractionState();
      if (!interactionEnabled) resetInteraction();
    };

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) {
        resetInteraction("paused");
      } else if (animationFrameRef.current === null) {
        canvas.dataset.motion = interactionEnabled ? "idle" : "reduced";
      }
    }, { threshold: 0.01 });

    const scheduleResize = () => {
      if (!sourceReady || resizeFrameRef.current !== null) return;
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        computeSamples();
      });
    };

    const resizeObserver = responsive ? new ResizeObserver(scheduleResize) : null;

    syncInteractionState();
    canvas.addEventListener("pointerenter", handleCanvasPointerEnter);
    canvas.addEventListener("pointerdown", handleCanvasPointerDown);
    canvas.addEventListener("pointermove", handleCanvasPointerMove);
    canvas.addEventListener("pointerleave", handleCanvasPointerLeave);
    canvas.addEventListener("pointerup", handleCanvasPointerUp);
    canvas.addEventListener("pointercancel", handleCanvasPointerCancel);
    touchHandle?.addEventListener("pointerdown", beginTouchHandleInteraction);
    touchHandle?.addEventListener("pointermove", moveTouchHandleInteraction);
    touchHandle?.addEventListener("pointerup", handleTouchHandlePointerUp);
    touchHandle?.addEventListener("pointercancel", handleTouchHandlePointerCancel);
    touchHandle?.addEventListener("lostpointercapture", handleTouchHandleLostCapture);
    touchHandle?.addEventListener("click", handleTouchHandleClick);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    motionQuery.addEventListener("change", handleMotionChange);
    intersectionObserver.observe(canvas);
    if (resizeObserver && canvas.parentElement) resizeObserver.observe(canvas.parentElement);

    image.onload = computeSamples;
    image.onerror = () => {
      canvas.dataset.pixelatedError = "true";
      syncTouchHandleAvailability();
      console.error("Failed to load image for PixelatedCanvas:", src);
    };
    image.src = src;

    return () => {
      cancelled = true;
      stopAnimation();
      clearTouchHandleInteraction();
      if (touchHandle) {
        touchHandle.dataset.touchReady = "false";
        touchHandle.setAttribute("aria-disabled", "true");
        if (touchHandle instanceof HTMLButtonElement) touchHandle.disabled = true;
      }
      if (interactionEndTimeout !== null) window.clearTimeout(interactionEndTimeout);
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      canvas.removeEventListener("pointerenter", handleCanvasPointerEnter);
      canvas.removeEventListener("pointerdown", handleCanvasPointerDown);
      canvas.removeEventListener("pointermove", handleCanvasPointerMove);
      canvas.removeEventListener("pointerleave", handleCanvasPointerLeave);
      canvas.removeEventListener("pointerup", handleCanvasPointerUp);
      canvas.removeEventListener("pointercancel", handleCanvasPointerCancel);
      touchHandle?.removeEventListener("pointerdown", beginTouchHandleInteraction);
      touchHandle?.removeEventListener("pointermove", moveTouchHandleInteraction);
      touchHandle?.removeEventListener("pointerup", handleTouchHandlePointerUp);
      touchHandle?.removeEventListener("pointercancel", handleTouchHandlePointerCancel);
      touchHandle?.removeEventListener("lostpointercapture", handleTouchHandleLostCapture);
      touchHandle?.removeEventListener("click", handleTouchHandleClick);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      motionQuery.removeEventListener("change", handleMotionChange);
      intersectionObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [
    backgroundColor,
    canvasRef,
    cellSize,
    distortionMode,
    distortionRadius,
    distortionStrength,
    dotScale,
    dropoutStrength,
    fadeOnLeave,
    fadeSpeed,
    followSpeed,
    grayscale,
    height,
    interactive,
    jitterSpeed,
    jitterStrength,
    maxFps,
    objectFit,
    responsive,
    sampleAverage,
    shape,
    src,
    tintColor,
    tintStrength,
    touchHandleId,
    width,
  ]);
}
