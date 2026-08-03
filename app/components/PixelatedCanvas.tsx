"use client";

import { useRef } from "react";
import {
  usePixelatedCanvas,
  type PixelatedCanvasProps,
} from "./usePixelatedCanvas";

export function PixelatedCanvas(props: PixelatedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellSize = props.cellSize ?? 3;
  const maxFps = props.maxFps ?? 60;

  usePixelatedCanvas({ ...props, canvasRef });

  return (
    <canvas
      ref={canvasRef}
      id={props.id}
      className={props.className}
      data-cell-size={Math.max(1, Math.round(cellSize))}
      data-max-fps={Math.max(1, maxFps)}
      aria-label={props.ariaLabel ?? "Pixelated rendering of source image"}
      role="img"
    />
  );
}
