"use client";

import { useEffect, useRef } from "react";

// Adapted from Aceternity UI's Pixelated Canvas for responsive sizing and
// idle/offscreen/reduced-motion runtime control in this portfolio.

type PixelatedCanvasProps = {
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

type PixelSample = {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  color: string;
  drop: boolean;
  seed: number;
};

type CanvasDimensions = {
  width: number;
  height: number;
  cell: number;
  dot: number;
  columns: number;
  rows: number;
};

const OFFSCREEN_POINTER = -9999;
const REFERENCE_FRAME_MS = 1000 / 60;
const FRAME_TOLERANCE_MS = 0.75;

function timeAdjustedFactor(factor: number, deltaMs: number) {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  if (clampedFactor === 0 || clampedFactor === 1) return clampedFactor;
  return 1 - Math.pow(1 - clampedFactor, deltaMs / REFERENCE_FRAME_MS);
}

function parseColor(color: string): [number, number, number] | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return [
        Number.parseInt(hex[0] + hex[0], 16),
        Number.parseInt(hex[1] + hex[1], 16),
        Number.parseInt(hex[2] + hex[2], 16),
      ];
    }
    if (hex.length === 6) {
      return [
        Number.parseInt(hex.slice(0, 2), 16),
        Number.parseInt(hex.slice(2, 4), 16),
        Number.parseInt(hex.slice(4, 6), 16),
      ];
    }
  }

  const match = color.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i);
  return match
    ? [
        Number.parseInt(match[1], 10),
        Number.parseInt(match[2], 10),
        Number.parseInt(match[3], 10),
      ]
    : null;
}

function hash2D(x: number, y: number) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

export function PixelatedCanvas({
  src,
  width = 400,
  height = 500,
  cellSize = 3,
  dotScale = 0.9,
  shape = "square",
  backgroundColor = "#000000",
  grayscale = false,
  id,
  className,
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
  ariaLabel = "Pixelated rendering of source image",
}: PixelatedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const samplesRef = useRef<PixelSample[]>([]);
  const dimensionsRef = useRef<CanvasDimensions | null>(null);
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
    let baseLayer: HTMLCanvasElement | null = null;
    const affectedSamples: PixelSample[] = [];
    const affectedInfluences: number[] = [];
    const affectedDeltaX: number[] = [];
    const affectedDeltaY: number[] = [];
    const image = new Image();
    image.crossOrigin = "anonymous";

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

    const getDisplayDimensions = () => {
      if (!responsive) {
        return { width: Math.max(1, width), height: Math.max(1, height) };
      }

      const parentBounds = canvas.parentElement?.getBoundingClientRect();
      return {
        width: Math.max(1, Math.round(parentBounds?.width || width)),
        height: Math.max(1, Math.round(parentBounds?.height || height)),
      };
    };

    const clearCanvas = (context: CanvasRenderingContext2D, dimensions: CanvasDimensions) => {
      context.globalAlpha = 1;
      if (backgroundColor) {
        context.fillStyle = backgroundColor;
        context.fillRect(0, 0, dimensions.width, dimensions.height);
      } else {
        context.clearRect(0, 0, dimensions.width, dimensions.height);
      }
    };

    const paintSample = (
      context: CanvasRenderingContext2D,
      sample: PixelSample,
      drawX: number,
      drawY: number,
      dimensions: CanvasDimensions,
      opacity = 1,
    ) => {
      const alpha = sample.a * opacity;
      if (alpha <= 0) return;

      context.globalAlpha = alpha;
      context.fillStyle = sample.color;
      if (shape === "circle") {
        context.beginPath();
        context.arc(drawX, drawY, dimensions.dot / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(
          drawX - dimensions.dot / 2,
          drawY - dimensions.dot / 2,
          dimensions.dot,
          dimensions.dot,
        );
      }
    };

    const drawBaseLayer = (
      context: CanvasRenderingContext2D,
      dimensions: CanvasDimensions,
    ) => {
      context.globalAlpha = 1;
      if (!baseLayer) {
        clearCanvas(context, dimensions);
        for (const sample of samplesRef.current) {
          paintSample(
            context,
            sample,
            sample.x + dimensions.cell / 2,
            sample.y + dimensions.cell / 2,
            dimensions,
          );
        }
        context.globalAlpha = 1;
        return;
      }

      if (!backgroundColor) {
        context.clearRect(0, 0, dimensions.width, dimensions.height);
      }
      context.drawImage(
        baseLayer,
        0,
        0,
        baseLayer.width,
        baseLayer.height,
        0,
        0,
        dimensions.width,
        dimensions.height,
      );
    };

    const draw = (now: number, activity: number) => {
      const context = canvas.getContext("2d");
      const dimensions = dimensionsRef.current;
      if (!context || !dimensions) return;

      drawBaseLayer(context, dimensions);
      const pointerX = animatedPointerRef.current.x;
      const pointerY = animatedPointerRef.current.y;
      if (activity <= 0 || pointerX === OFFSCREEN_POINTER || pointerY === OFFSCREEN_POINTER) {
        return;
      }

      const radius = Math.max(1, distortionRadius);
      const radiusSquared = radius * radius;
      const jitterTime = now * 0.001 * jitterSpeed;
      const startColumn = Math.max(0, Math.floor((pointerX - radius) / dimensions.cell));
      const endColumn = Math.min(
        dimensions.columns - 1,
        Math.ceil((pointerX + radius) / dimensions.cell),
      );
      const startRow = Math.max(0, Math.floor((pointerY - radius) / dimensions.cell));
      const endRow = Math.min(
        dimensions.rows - 1,
        Math.ceil((pointerY + radius) / dimensions.cell),
      );
      let affectedCount = 0;

      for (let row = startRow; row <= endRow; row += 1) {
        for (let column = startColumn; column <= endColumn; column += 1) {
          const sample = samplesRef.current[row * dimensions.columns + column];
          if (!sample || sample.a <= 0) continue;

          const centerX = sample.x + dimensions.cell / 2;
          const centerY = sample.y + dimensions.cell / 2;
          const deltaX = centerX - pointerX;
          const deltaY = centerY - pointerY;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY;
          if (distanceSquared > radiusSquared) continue;

          const normalizedDistance = 1 - distanceSquared / radiusSquared;
          const influence = (
            normalizedDistance
            * normalizedDistance
            * (3 - 2 * normalizedDistance)
            * activity
          );
          if (influence <= 0.0005) continue;

          affectedSamples[affectedCount] = sample;
          affectedInfluences[affectedCount] = influence;
          affectedDeltaX[affectedCount] = deltaX;
          affectedDeltaY[affectedCount] = deltaY;
          affectedCount += 1;
        }
      }

      context.globalAlpha = 1;
      if (backgroundColor) context.fillStyle = backgroundColor;
      for (let index = 0; index < affectedCount; index += 1) {
        const sample = affectedSamples[index];
        const centerX = sample.x + dimensions.cell / 2;
        const centerY = sample.y + dimensions.cell / 2;
        if (backgroundColor) {
          context.fillRect(
            centerX - dimensions.dot / 2,
            centerY - dimensions.dot / 2,
            dimensions.dot,
            dimensions.dot,
          );
        } else {
          context.clearRect(
            centerX - dimensions.dot / 2,
            centerY - dimensions.dot / 2,
            dimensions.dot,
            dimensions.dot,
          );
        }
      }

      for (let index = 0; index < affectedCount; index += 1) {
        const sample = affectedSamples[index];
        const influence = affectedInfluences[index];
        const deltaX = affectedDeltaX[index];
        const deltaY = affectedDeltaY[index];
        let drawX = sample.x + dimensions.cell / 2;
        let drawY = sample.y + dimensions.cell / 2;

        if (distortionMode === "swirl") {
          const angle = distortionStrength * 0.05 * influence;
          const cosine = Math.cos(angle);
          const sine = Math.sin(angle);
          drawX = pointerX + cosine * deltaX - sine * deltaY;
          drawY = pointerY + sine * deltaX + cosine * deltaY;
        } else {
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY) + 0.0001;
          const direction = distortionMode === "repel" ? 1 : -1;
          drawX += direction * (deltaX / distance) * distortionStrength * influence;
          drawY += direction * (deltaY / distance) * distortionStrength * influence;
        }

        if (jitterStrength > 0) {
          const phase = sample.seed * 43758.5453;
          drawX += Math.sin(jitterTime + phase) * jitterStrength * influence;
          drawY += Math.cos(jitterTime + phase * 1.13) * jitterStrength * influence;
        }

        paintSample(
          context,
          sample,
          drawX,
          drawY,
          dimensions,
          sample.drop ? 1 - influence : 1,
        );
      }
      context.globalAlpha = 1;
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
        draw(now, 0);
        lastFrameRef.current = 0;
        nextFrameRef.current = 0;
        return;
      }

      draw(now, Math.max(0, Math.min(1, activityRef.current)));
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

      const display = getDisplayDimensions();
      const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const sampleCell = Math.max(1, Math.round(cellSize));
      canvas.width = Math.max(1, Math.floor(display.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(display.height * devicePixelRatio));
      canvas.style.width = `${display.width}px`;
      canvas.style.height = `${display.height}px`;

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.max(1, Math.floor(display.width));
      offscreen.height = Math.max(1, Math.floor(display.height));
      const offscreenContext = offscreen.getContext("2d", { willReadFrequently: true });
      if (!offscreenContext) return;

      const imageWidth = image.naturalWidth;
      const imageHeight = image.naturalHeight;
      let drawWidth = display.width;
      let drawHeight = display.height;
      let drawX = 0;
      let drawY = 0;

      if (objectFit === "cover" || objectFit === "contain") {
        const scale = objectFit === "cover"
          ? Math.max(display.width / imageWidth, display.height / imageHeight)
          : Math.min(display.width / imageWidth, display.height / imageHeight);
        drawWidth = Math.ceil(imageWidth * scale);
        drawHeight = Math.ceil(imageHeight * scale);
        drawX = Math.floor((display.width - drawWidth) / 2);
        drawY = Math.floor((display.height - drawHeight) / 2);
      } else if (objectFit === "none") {
        drawWidth = imageWidth;
        drawHeight = imageHeight;
        drawX = Math.floor((display.width - drawWidth) / 2);
        drawY = Math.floor((display.height - drawHeight) / 2);
      }

      offscreenContext.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      let imageData: ImageData;
      try {
        imageData = offscreenContext.getImageData(0, 0, offscreen.width, offscreen.height);
      } catch {
        context.drawImage(image, 0, 0, display.width, display.height);
        return;
      }

      const data = imageData.data;
      const stride = offscreen.width * 4;
      const tint = tintStrength > 0 ? parseColor(tintColor) : null;
      const samples: PixelSample[] = [];
      const luminanceAt = (x: number, y: number) => {
        const sampleX = Math.max(0, Math.min(offscreen.width - 1, x));
        const sampleY = Math.max(0, Math.min(offscreen.height - 1, y));
        const index = sampleY * stride + sampleX * 4;
        return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
      };

      for (let y = 0; y < offscreen.height; y += sampleCell) {
        const centerY = Math.min(offscreen.height - 1, y + Math.floor(sampleCell / 2));
        for (let x = 0; x < offscreen.width; x += sampleCell) {
          const centerX = Math.min(offscreen.width - 1, x + Math.floor(sampleCell / 2));
          let red = 0;
          let green = 0;
          let blue = 0;
          let alpha = 0;

          if (sampleAverage) {
            let count = 0;
            for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
              for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
                const sampleX = Math.max(0, Math.min(offscreen.width - 1, centerX + offsetX));
                const sampleY = Math.max(0, Math.min(offscreen.height - 1, centerY + offsetY));
                const index = sampleY * stride + sampleX * 4;
                red += data[index];
                green += data[index + 1];
                blue += data[index + 2];
                alpha += data[index + 3] / 255;
                count += 1;
              }
            }
            red = Math.round(red / count);
            green = Math.round(green / count);
            blue = Math.round(blue / count);
            alpha /= count;
          } else {
            const index = centerY * stride + centerX * 4;
            red = data[index];
            green = data[index + 1];
            blue = data[index + 2];
            alpha = data[index + 3] / 255;
          }

          if (grayscale) {
            const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
            red = luminance;
            green = luminance;
            blue = luminance;
          } else if (tint) {
            const strength = Math.max(0, Math.min(1, tintStrength));
            red = Math.round(red * (1 - strength) + tint[0] * strength);
            green = Math.round(green * (1 - strength) + tint[1] * strength);
            blue = Math.round(blue * (1 - strength) + tint[2] * strength);
          }

          const centerLuminance = luminanceAt(centerX, centerY);
          const left = luminanceAt(centerX - 1, centerY);
          const right = luminanceAt(centerX + 1, centerY);
          const top = luminanceAt(centerX, centerY - 1);
          const bottom = luminanceAt(centerX, centerY + 1);
          const gradient =
            Math.abs(right - left)
            + Math.abs(bottom - top)
            + Math.abs(centerLuminance - (left + right + top + bottom) / 4);
          const gradientStrength = Math.max(0, Math.min(1, gradient / 255));
          const dropoutProbability = Math.max(
            0,
            Math.min(1, (1 - gradientStrength) * dropoutStrength),
          );

          samples.push({
            x,
            y,
            r: red,
            g: green,
            b: blue,
            a: alpha,
            color: `rgb(${red}, ${green}, ${blue})`,
            drop: hash2D(centerX, centerY) < dropoutProbability,
            seed: hash2D(centerX, centerY),
          });
        }
      }

      const dimensions = {
        width: display.width,
        height: display.height,
        cell: sampleCell,
        dot: Math.max(1, sampleCell * Math.max(0, Math.min(1, dotScale))),
        columns: Math.ceil(offscreen.width / sampleCell),
        rows: Math.ceil(offscreen.height / sampleCell),
      };
      dimensionsRef.current = dimensions;
      samplesRef.current = samples;

      const nextBaseLayer = document.createElement("canvas");
      nextBaseLayer.width = canvas.width;
      nextBaseLayer.height = canvas.height;
      const baseContext = nextBaseLayer.getContext("2d");
      if (baseContext) {
        baseContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        clearCanvas(baseContext, dimensions);
        for (const sample of samples) {
          paintSample(
            baseContext,
            sample,
            sample.x + dimensions.cell / 2,
            sample.y + dimensions.cell / 2,
            dimensions,
          );
        }
        baseContext.globalAlpha = 1;
        baseLayer = nextBaseLayer;
      } else {
        baseLayer = null;
      }

      sourceReady = true;
      canvas.dataset.pixelatedReady = "true";
      syncTouchHandleAvailability();
      draw(performance.now(), 0);
    };

    const resetInteraction = (motion = interactionEnabled ? "idle" : "reduced") => {
      clearTouchHandleInteraction();
      pointerInsideRef.current = false;
      targetActivityRef.current = 0;
      activityRef.current = 0;
      stopAnimation();
      canvas.dataset.motion = motion;
      if (sourceReady) draw(performance.now(), 0);
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

  return (
    <canvas
      ref={canvasRef}
      id={id}
      className={className}
      data-cell-size={Math.max(1, Math.round(cellSize))}
      data-max-fps={Math.max(1, maxFps)}
      aria-label={ariaLabel}
      role="img"
    />
  );
}
