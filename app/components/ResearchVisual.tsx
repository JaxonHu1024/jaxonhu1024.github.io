"use client";

import { useEffect, useRef } from "react";

type Variant = "road" | "wave";
type Point = readonly [number, number];

const roadRoutes: readonly (readonly Point[])[] = [
  [[0.02, 0.62], [0.16, 0.62], [0.23, 0.39], [0.38, 0.39], [0.49, 0.58], [0.64, 0.31], [0.75, 0.58], [0.87, 0.43], [0.98, 0.43]],
  [[0.11, 0.86], [0.23, 0.64], [0.35, 0.79], [0.48, 0.79], [0.58, 0.59], [0.75, 0.58], [0.84, 0.76], [0.96, 0.76]],
  [[0.15, 0.12], [0.31, 0.12], [0.39, 0.39], [0.49, 0.58], [0.58, 0.59], [0.69, 0.84]],
  [[0.46, 0.08], [0.64, 0.31], [0.75, 0.58], [0.87, 0.43], [0.91, 0.16]],
];

const roadNodes: readonly Point[] = [
  [0.16, 0.62], [0.23, 0.39], [0.31, 0.12], [0.38, 0.39], [0.49, 0.58],
  [0.58, 0.59], [0.64, 0.31], [0.75, 0.58], [0.87, 0.43], [0.84, 0.76],
];

function pointOnRoute(route: readonly Point[], progress: number): Point {
  const segments = route.slice(1).map((point, index) => {
    const previous = route[index];
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  const totalLength = segments.reduce((sum, length) => sum + length, 0);
  let distance = progress * totalLength;

  for (let index = 0; index < segments.length; index += 1) {
    if (distance <= segments[index]) {
      const start = route[index];
      const end = route[index + 1];
      const local = distance / segments[index];
      return [
        start[0] + (end[0] - start[0]) * local,
        start[1] + (end[1] - start[1]) * local,
      ];
    }
    distance -= segments[index];
  }

  return route[route.length - 1];
}

export function ResearchVisual({ variant }: { variant: Variant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let visible = true;
    let reducedMotion = motionQuery.matches;

    const render = (time = 0) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
      const nextHeight = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const w = rect.width;
      const h = rect.height;
      const phase = reducedMotion ? 0 : time * 0.001;

      ctx.strokeStyle = "rgba(79,247,213,.13)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 34) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += 34) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      if (variant === "road") {
        roadRoutes.forEach((route, routeIndex) => {
          ctx.strokeStyle = routeIndex === 0
            ? "rgba(79,247,213,.82)"
            : routeIndex === 2
              ? "rgba(181,140,255,.52)"
              : "rgba(233,255,249,.29)";
          ctx.lineWidth = routeIndex === 0 ? 1.7 : 1.05;
          ctx.beginPath();
          route.forEach(([x, y], pointIndex) => {
            if (pointIndex === 0) ctx.moveTo(x * w, y * h);
            else ctx.lineTo(x * w, y * h);
          });
          ctx.stroke();
        });

        roadNodes.forEach(([x, y], index) => {
          const primary = [1, 4, 6, 7, 8].includes(index);
          const pulse = reducedMotion ? 0 : (Math.sin(phase * 1.8 + index * 0.9) + 1) * 0.55;
          const size = (primary ? 9 : 5) + pulse;
          ctx.fillStyle = primary ? "#e9fff9" : "#7c5cff";
          ctx.shadowColor = primary ? "rgba(79,247,213,.85)" : "rgba(181,140,255,.7)";
          ctx.shadowBlur = primary ? 11 : 7;
          ctx.fillRect(x * w - size / 2, y * h - size / 2, size, size);
          ctx.shadowBlur = 0;
          if (primary) {
            ctx.strokeStyle = "rgba(79,247,213,.5)";
            ctx.strokeRect(x * w - size / 2 - 4, y * h - size / 2 - 4, size + 8, size + 8);
          }
        });

        [
          { route: 0, speed: 0.075, offset: 0 },
          { route: 1, speed: 0.052, offset: 0.42 },
          { route: 3, speed: 0.062, offset: 0.74 },
        ].forEach(({ route, speed, offset }, index) => {
          const progress = reducedMotion ? 0.32 + index * 0.21 : (phase * speed + offset) % 1;
          const [x, y] = pointOnRoute(roadRoutes[route], progress);
          const packetSize = index === 0 ? 6 : 4;
          ctx.fillStyle = index === 1 ? "#d5b6ff" : "#d7fff6";
          ctx.shadowColor = index === 1 ? "rgba(181,140,255,.95)" : "rgba(79,247,213,.95)";
          ctx.shadowBlur = 15;
          ctx.fillRect(x * w - packetSize / 2, y * h - packetSize / 2, packetSize, packetSize);
          ctx.shadowBlur = 0;
        });

        ctx.fillStyle = "rgba(233,255,249,.26)";
        [[0.04, 0.19], [0.055, 0.19], [0.07, 0.19], [0.93, 0.9], [0.945, 0.9], [0.96, 0.9]].forEach(([x, y]) => {
          ctx.fillRect(x * w, y * h, 2, 2);
        });
      } else {
        ctx.strokeStyle = "rgba(233,255,249,.28)";
        ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#d5b6ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = h / 2
            + Math.sin(x / w * Math.PI * 9 + phase * 0.8) * h * 0.2
            + Math.sin(x / w * Math.PI * 18 + phase * 1.15) * h * 0.11;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const packetProgress = reducedMotion ? 0.58 : (phase * 0.12) % 1;
        const packetX = packetProgress * w;
        const packetY = h / 2
          + Math.sin(packetProgress * Math.PI * 9 + phase * 0.8) * h * 0.2
          + Math.sin(packetProgress * Math.PI * 18 + phase * 1.15) * h * 0.11;
        ctx.fillStyle = "#f1e8ff";
        ctx.shadowColor = "rgba(181,140,255,.95)";
        ctx.shadowBlur = 15;
        ctx.fillRect(packetX - 3, packetY - 3, 6, 6);
        ctx.shadowBlur = 0;
        [[0.04, 0.6], [0.96, 0.36]].forEach(([x, y]) => {
          ctx.fillStyle = "#b58cff";
          ctx.fillRect(x * w - 5, y * h - 5, 10, 10);
        });
      }

      if (visible && !reducedMotion && !document.hidden) {
        frame = window.requestAnimationFrame(render);
      }
    };

    const scheduleRender = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(render);
    };
    const observer = new ResizeObserver(scheduleRender);
    observer.observe(canvas.parentElement ?? canvas);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) scheduleRender();
      else window.cancelAnimationFrame(frame);
    }, { threshold: 0.05 });
    visibilityObserver.observe(canvas);

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      canvas.dataset.motion = reducedMotion ? "reduced" : "running";
      scheduleRender();
    };

    const handleVisibility = () => {
      if (!document.hidden && visible) scheduleRender();
      else window.cancelAnimationFrame(frame);
    };

    canvas.dataset.motion = reducedMotion ? "reduced" : "running";
    motionQuery.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    scheduleRender();
    return () => {
      observer.disconnect();
      visibilityObserver.disconnect();
      motionQuery.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.cancelAnimationFrame(frame);
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      className="research-canvas"
      data-motion="initializing"
      data-motion-layer={`research-${variant}`}
      aria-hidden="true"
    />
  );
}
