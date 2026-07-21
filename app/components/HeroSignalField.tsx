"use client";

import { useEffect, useRef } from "react";

type Point = readonly [number, number];

type SignalPath = {
  color: readonly [number, number, number];
  phase: number;
  speed: number;
  points: readonly Point[];
};

const signalPaths: readonly SignalPath[] = [
  {
    color: [79, 247, 213],
    phase: 0.04,
    speed: 0.000078,
    points: [[0.03, 0.31], [0.2, 0.31], [0.28, 0.39], [0.49, 0.39], [0.58, 0.46], [0.69, 0.47]],
  },
  {
    color: [184, 255, 241],
    phase: 0.38,
    speed: 0.000064,
    points: [[0.01, 0.39], [0.24, 0.39], [0.31, 0.45], [0.53, 0.45], [0.61, 0.48], [0.69, 0.48]],
  },
  {
    color: [124, 92, 255],
    phase: 0.66,
    speed: 0.000092,
    points: [[0.11, 0.48], [0.31, 0.48], [0.39, 0.51], [0.56, 0.51], [0.63, 0.49], [0.69, 0.49]],
  },
  {
    color: [79, 247, 213],
    phase: 0.82,
    speed: 0.000071,
    points: [[0.05, 0.58], [0.28, 0.58], [0.35, 0.53], [0.53, 0.53], [0.61, 0.5], [0.69, 0.5]],
  },
  {
    color: [207, 255, 246],
    phase: 0.2,
    speed: 0.000105,
    points: [[0.18, 0.66], [0.37, 0.66], [0.44, 0.58], [0.57, 0.58], [0.63, 0.52], [0.69, 0.51]],
  },
];

function pointAlongPath(points: readonly Point[], progress: number): Point {
  const lengths: number[] = [];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const [ax, ay] = points[index - 1];
    const [bx, by] = points[index];
    const length = Math.hypot(bx - ax, by - ay);
    lengths.push(length);
    total += length;
  }

  let remaining = ((progress % 1) + 1) % 1 * total;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length) {
      const [ax, ay] = points[index];
      const [bx, by] = points[index + 1];
      const ratio = length === 0 ? 0 : remaining / length;
      return [ax + (bx - ax) * ratio, ay + (by - ay) * ratio];
    }
    remaining -= length;
  }

  return points.at(-1) ?? [0, 0];
}

export function HeroSignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let reducedMotion = motionQuery.matches;
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssWidth = rect.width;
      cssHeight = rect.height;
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const drawPacket = (
      path: SignalPath,
      progress: number,
      width: number,
      height: number,
    ) => {
      const [red, green, blue] = path.color;
      for (let trail = 9; trail >= 0; trail -= 1) {
        const [x, y] = pointAlongPath(path.points, progress - trail * 0.0085);
        const strength = (10 - trail) / 10;
        const size = trail === 0 ? 3.4 : 1.2 + strength * 1.2;
        context.beginPath();
        context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${strength * 0.62})`;
        context.shadowColor = `rgba(${red}, ${green}, ${blue}, ${strength})`;
        context.shadowBlur = 7 + strength * 12;
        context.arc(x * width, y * height, size, 0, Math.PI * 2);
        context.fill();
      }
    };

    const render = (time: number) => {
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.globalCompositeOperation = "lighter";

      signalPaths.forEach((path) => {
        const progress = reducedMotion ? path.phase : time * path.speed + path.phase;
        drawPacket(path, progress, cssWidth, cssHeight);
      });

      const coreX = cssWidth * 0.715;
      const coreY = cssHeight * 0.472;
      const pulse = reducedMotion ? 0.32 : (Math.sin(time * 0.0022) + 1) / 2;
      context.strokeStyle = `rgba(141, 255, 232, ${0.14 + pulse * 0.22})`;
      context.lineWidth = 1;
      context.shadowColor = "rgba(79, 247, 213, .7)";
      context.shadowBlur = 9 + pulse * 12;
      const coreSize = 29 + pulse * 7;
      context.strokeRect(coreX - coreSize / 2, coreY - coreSize / 2, coreSize, coreSize);
      context.shadowBlur = 0;
      context.globalCompositeOperation = "source-over";

      if (visible && !reducedMotion && !document.hidden) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const restart = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(render);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      restart();
    });
    resizeObserver.observe(canvas.parentElement ?? canvas);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) restart();
      else window.cancelAnimationFrame(frame);
    }, { threshold: 0.05 });
    visibilityObserver.observe(canvas);

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      canvas.dataset.motion = reducedMotion ? "reduced" : "running";
      restart();
    };

    const handleVisibility = () => {
      if (!document.hidden && visible) restart();
      else window.cancelAnimationFrame(frame);
    };

    canvas.dataset.motion = reducedMotion ? "reduced" : "running";
    motionQuery.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    resize();
    restart();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      motionQuery.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="hero-signal-field"
      data-motion="initializing"
      data-motion-layer="hero-flow"
      aria-hidden="true"
    />
  );
}
