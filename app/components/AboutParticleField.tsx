"use client";

import { useEffect, useRef } from "react";

const MIN_PARTICLES = 1040;
const MAX_PARTICLES = 1360;
const MIN_COMPACT_PARTICLES = 620;
const MAX_COMPACT_PARTICLES = 780;
const TRAIL_STEPS = 7;
const RAIL_POSITIONS = [0.22, 0.405, 0.595, 0.78] as const;
const LENS_BOUNDARIES = [-1.06, -0.8, 0.8, 1.06] as const;
// Mirrors the site tokens: --text, --mint, --violet, and --coral.
const PARTICLE_COLORS = ["#e9fff9", "#4ff7d5", "#8a72ff", "#ff6b57"] as const;
const PARTICLE_SHADOWS = [
  "transparent",
  "rgba(79,247,213,.72)",
  "rgba(138,114,255,.68)",
  "rgba(255,107,87,.62)",
] as const;
const MAX_VORTEX_PARTICLES = 360;
const VORTEX_ARM_TONES = [1, 2, 1, 3] as const;
const VORTEX_FRAME = {
  depth: new Float32Array(MAX_VORTEX_PARTICLES),
  radius: new Float32Array(MAX_VORTEX_PARTICLES),
  tailX: new Float32Array(MAX_VORTEX_PARTICLES),
  tailY: new Float32Array(MAX_VORTEX_PARTICLES),
  tone: new Uint8Array(MAX_VORTEX_PARTICLES),
  x: new Float32Array(MAX_VORTEX_PARTICLES),
  y: new Float32Array(MAX_VORTEX_PARTICLES),
};

type ParticleBuffer = {
  count: number;
  depth: Float32Array;
  influence: Float32Array;
  phase: Float32Array;
  rail: Uint8Array;
  size: Float32Array;
  sourceY: Float32Array;
  tone: Uint8Array;
  trailHead: number;
  trailX: Float32Array;
  trailY: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  x: Float32Array;
  y: Float32Array;
};

type PointerField = {
  active: boolean;
  strength: number;
  x: number;
  y: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smoothstep(edgeStart: number, edgeEnd: number, value: number) {
  const progress = clamp((value - edgeStart) / (edgeEnd - edgeStart), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function wrappedDistance(left: number, right: number) {
  const distance = Math.abs(left - right);
  return Math.min(distance, 1 - distance);
}

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function flowTargetY(
  progress: number,
  sourceY: number,
  rail: number,
  phase: number,
  width: number,
  height: number,
  time: number,
) {
  const lensCenter = 0.56;
  const lensWidth = width <= 600 ? 0.17 : 0.155;
  const normalizedDistance = (progress - lensCenter) / lensWidth;
  const lensInfluence = Math.exp(-(normalizedDistance * normalizedDistance));
  const order = smoothstep(0.65, 0.92, progress);
  const chaosEnvelope = 1 - smoothstep(0.18, 0.62, progress);
  const chaos = (
    Math.sin(phase + progress * 11.5 + time * 0.00062)
    + Math.cos(phase * 1.63 - progress * 19 + time * 0.0004) * 0.55
  ) * height * 0.052 * chaosEnvelope;
  const railY = RAIL_POSITIONS[rail] * height;
  const unconstrainedY = sourceY + chaos;
  const orderedY = unconstrainedY + (railY - unconstrainedY) * order;
  const lensRadiusY = height * (width <= 600 ? 0.245 : 0.25);
  const boundaryY = height * 0.5 + LENS_BOUNDARIES[rail] * lensRadiusY;
  const boundaryStrength = lensInfluence * (1 - order * 0.2);
  return orderedY + (boundaryY - orderedY) * boundaryStrength;
}

function resetParticleTrail(particles: ParticleBuffer, index: number) {
  for (let age = 0; age < TRAIL_STEPS; age += 1) {
    const slot = (particles.trailHead - age + TRAIL_STEPS) % TRAIL_STEPS;
    particles.trailX[slot * particles.count + index] = particles.x[index] - age * 1.15;
    particles.trailY[slot * particles.count + index] = particles.y[index];
  }
}

function createParticleBuffer(width: number, height: number, compact: boolean): ParticleBuffer {
  const count = compact
    ? clamp(
        Math.round((width * height) / 105),
        MIN_COMPACT_PARTICLES,
        MAX_COMPACT_PARTICLES,
      )
    : clamp(Math.round((width * height) / 180), MIN_PARTICLES, MAX_PARTICLES);
  const random = createRandom(Math.round(width * 31 + height * 17 + count * 13));
  const buffer: ParticleBuffer = {
    count,
    depth: new Float32Array(count),
    influence: new Float32Array(count),
    phase: new Float32Array(count),
    rail: new Uint8Array(count),
    size: new Float32Array(count),
    sourceY: new Float32Array(count),
    tone: new Uint8Array(count),
    trailHead: 0,
    trailX: new Float32Array(count * TRAIL_STEPS),
    trailY: new Float32Array(count * TRAIL_STEPS),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    x: new Float32Array(count),
    y: new Float32Array(count),
  };

  for (let index = 0; index < count; index += 1) {
    const progress = random();
    const rail = Math.min(3, Math.floor(random() * 4));
    const sourceY = height * (0.07 + random() * 0.86);
    buffer.x[index] = progress * width;
    buffer.sourceY[index] = sourceY;
    buffer.rail[index] = rail;
    buffer.phase[index] = random() * Math.PI * 2;
    buffer.size[index] = 0.58 + random() * 0.92;
    const toneRoll = random();
    buffer.tone[index] = toneRoll > 0.975
      ? 3
      : toneRoll > 0.92
        ? 2
        : toneRoll > 0.8
          ? 1
          : 0;
    buffer.vx[index] = 0.34 + random() * 0.34;
    buffer.vy[index] = 0;
    buffer.y[index] = flowTargetY(
      progress,
      sourceY,
      rail,
      buffer.phase[index],
      width,
      height,
      0,
    );
    buffer.depth[index] = 0.35 + random() * 0.65;
    resetParticleTrail(buffer, index);
  }

  return buffer;
}

function updateParticles(
  particles: ParticleBuffer,
  pointer: PointerField,
  width: number,
  height: number,
  time: number,
  delta: number,
) {
  const targetStrength = pointer.active ? 1 : 0;
  const strengthEase = 1 - Math.pow(0.82, delta);
  pointer.strength += (targetStrength - pointer.strength) * strengthEase;

  const lensCenterX = width * 0.56;
  const lensCenterY = height * 0.5;
  const lensRadiusX = width * (width <= 600 ? 0.13 : 0.12);
  const lensRadiusY = height * (width <= 600 ? 0.245 : 0.25);
  const pointerRadiusX = clamp(width * 0.15, 72, 132);
  const pointerRadiusY = pointerRadiusX * 0.72;
  const signalProgress = (time * 0.000085) % 1;
  const nextTrailHead = (particles.trailHead + 1) % TRAIL_STEPS;

  for (let index = 0; index < particles.count; index += 1) {
    let x = particles.x[index];
    let y = particles.y[index];
    let vx = particles.vx[index];
    let vy = particles.vy[index];
    const progress = clamp(x / width, 0, 1);
    const phase = particles.phase[index];
    const targetY = flowTargetY(
      progress,
      particles.sourceY[index],
      particles.rail[index],
      phase,
      width,
      height,
      time,
    );
    const order = smoothstep(0.64, 0.9, progress);
    const targetVelocity = 0.36 + particles.size[index] * 0.19 + order * 0.1;
    let targetInfluence = particles.tone[index] ? 0.18 : 0;

    vx += (targetVelocity - vx) * 0.045 * delta;
    vy += (targetY - y) * (0.012 + order * 0.012) * delta;

    const lensX = (x - lensCenterX) / lensRadiusX;
    const lensY = (y - lensCenterY) / lensRadiusY;
    const lensDistance = Math.sqrt(lensX * lensX + lensY * lensY);
    if (lensDistance < 1.36) {
      const side = particles.rail[index] < 2 ? -1 : 1;
      const force = (1.36 - lensDistance) * (0.58 + (1 - lensDistance / 1.36) * 0.42);
      vy += side * force * 0.72 * delta;
      vx += force * 0.09 * delta;
    }
    const caustic = Math.exp(-Math.abs(lensDistance - 1.08) * 5.2)
      * Math.exp(-Math.pow((progress - 0.56) / 0.2, 2));
    targetInfluence = Math.max(targetInfluence, caustic * 0.78);

    if (pointer.strength > 0.01) {
      const pointerX = (x - pointer.x) / pointerRadiusX;
      const pointerY = (y - pointer.y) / pointerRadiusY;
      const pointerDistance = Math.sqrt(pointerX * pointerX + pointerY * pointerY);
      if (pointerDistance < 1.42) {
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const distance = Math.max(0.001, Math.hypot(dx, dy));
        const falloff = 1 - pointerDistance / 1.42;
        const force = falloff * falloff * pointer.strength;
        vx += (dx / distance) * force * 0.92 * delta;
        vy += (dy / distance) * force * 1.08 * delta;
        targetInfluence = Math.max(targetInfluence, force);
      }
    }

    const signal = Math.exp(-Math.pow(wrappedDistance(progress, signalProgress) / 0.032, 2));
    targetInfluence = Math.max(targetInfluence, signal * (particles.tone[index] ? 0.95 : 0.28));
    const influenceEase = 1 - Math.pow(0.78, delta);
    particles.influence[index] += (
      targetInfluence - particles.influence[index]
    ) * influenceEase;

    vy *= Math.pow(0.89, delta);
    vx = clamp(vx, 0.08, 1.55);
    vy = clamp(vy, -2.4, 2.4);
    x += vx * delta;
    y += vy * delta;

    if (x > width + 10) {
      particles.phase[index] = (phase + 1.618) % (Math.PI * 2);
      particles.rail[index] = (particles.rail[index] + 1 + (index % 3)) % 4;
      particles.sourceY[index] = height * (
        0.07 + (Math.sin(phase * 2.73 + time * 0.00031) + 1) * 0.43
      );
      x = -10;
      y = particles.sourceY[index];
      vx = 0.34 + (phase % 1) * 0.32;
      vy = 0;
    }
    if (y < 2) {
      y = 2;
      vy = Math.abs(vy) * 0.62;
    } else if (y > height - 2) {
      y = height - 2;
      vy = -Math.abs(vy) * 0.62;
    }

    particles.x[index] = x;
    particles.y[index] = y;
    particles.vx[index] = vx;
    particles.vy[index] = vy;
    particles.depth[index] = 0.5 + Math.sin(phase + progress * 7.5 + time * 0.0002) * 0.5;
    particles.trailX[nextTrailHead * particles.count + index] = x;
    particles.trailY[nextTrailHead * particles.count + index] = y;

    if (x === -10) {
      particles.trailHead = nextTrailHead;
      resetParticleTrail(particles, index);
    }
  }
  particles.trailHead = nextTrailHead;
}

function updateParticleVortexFrame(
  pointer: PointerField,
  width: number,
  height: number,
  time: number,
) {
  const baseX = width * 0.56;
  const baseY = height * 0.5;
  const offsetX = clamp((pointer.x - baseX) * 0.018 * pointer.strength, -5, 5);
  const offsetY = clamp((pointer.y - baseY) * 0.018 * pointer.strength, -5, 5);
  const centerX = baseX + offsetX;
  const centerY = baseY + offsetY;
  const radiusX = width * (width <= 600 ? 0.108 : 0.098);
  const radiusY = height * (width <= 600 ? 0.205 : 0.2);
  const vortexCount = width <= 600 ? 260 : MAX_VORTEX_PARTICLES;
  const tilt = -0.1;
  const tiltCosine = Math.cos(tilt);
  const tiltSine = Math.sin(tilt);
  const pointerWarp = ((pointer.x - baseX) / width) * 0.48 * pointer.strength;

  for (let index = 0; index < vortexCount; index += 1) {
    const arm = index % 4;
    const radialSeed = (index * 0.618033988749895 + arm * 0.071) % 1;
    const jitterSeed = (index * 0.754877666246693 + arm * 0.173) % 1;
    const radial = 0.012 + Math.pow(radialSeed, 1.24) * 0.988;
    const pulseProgress = 1 - ((time * 0.000058 + arm * 0.19) % 1);
    const pulse = Math.exp(-Math.pow(
      wrappedDistance(radial, pulseProgress) / 0.055,
      2,
    ));
    const angularVelocity = 0.00013 + (1 - radial) * 0.00011;
    const jitter = (jitterSeed - 0.5) * (0.16 + radial * 0.26);
    const angle = arm * Math.PI * 0.5
      + radial * Math.PI * 4.85
      - time * angularVelocity
      + pointerWarp * (1 - radial)
      + jitter;
    const breathing = 1 + Math.sin(time * 0.00022 + index * 0.91) * 0.018;
    const projectedX = Math.cos(angle) * radiusX * radial * breathing;
    const projectedY = Math.sin(angle) * radiusY * radial * breathing;
    const depth = 0.5 + Math.sin(angle + 0.55) * 0.5;
    const x = centerX + projectedX * tiltCosine - projectedY * tiltSine;
    const y = centerY + projectedX * tiltSine + projectedY * tiltCosine;
    const tailAngle = angle + 0.03 + (1 - radial) * 0.085;
    const tailX = Math.cos(tailAngle) * radiusX * radial * breathing;
    const tailY = Math.sin(tailAngle) * radiusY * radial * breathing;
    const accentIndex = (index * 11 + arm * 7) % 43;

    VORTEX_FRAME.x[index] = x;
    VORTEX_FRAME.y[index] = y;
    VORTEX_FRAME.tailX[index] = centerX + tailX * tiltCosine - tailY * tiltSine;
    VORTEX_FRAME.tailY[index] = centerY + tailX * tiltSine + tailY * tiltCosine;
    VORTEX_FRAME.depth[index] = depth;
    VORTEX_FRAME.radius[index] = 0.28
      + depth * 0.48
      + (1 - radial) * 0.18
      + pulse * 0.66;
    VORTEX_FRAME.tone[index] = pulse > 0.24 || accentIndex === 0
      ? VORTEX_ARM_TONES[arm]
      : accentIndex === 11
        ? 2
        : 0;
  }

  return vortexCount;
}

function drawParticleVortex(
  context: CanvasRenderingContext2D,
  pointer: PointerField,
  width: number,
  height: number,
  time: number,
) {
  const vortexCount = updateParticleVortexFrame(pointer, width, height, time);

  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  context.beginPath();
  for (let index = 0; index < vortexCount; index += 1) {
    context.moveTo(VORTEX_FRAME.tailX[index], VORTEX_FRAME.tailY[index]);
    context.lineTo(VORTEX_FRAME.x[index], VORTEX_FRAME.y[index]);
  }
  context.strokeStyle = PARTICLE_COLORS[0];
  context.globalAlpha = 0.075;
  context.lineWidth = 0.42;
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.stroke();

  for (let tone = 1; tone < PARTICLE_COLORS.length; tone += 1) {
    context.beginPath();
    let hasAccentTrail = false;
    for (let index = 0; index < vortexCount; index += 1) {
      if (VORTEX_FRAME.tone[index] !== tone) continue;
      context.moveTo(VORTEX_FRAME.tailX[index], VORTEX_FRAME.tailY[index]);
      context.lineTo(VORTEX_FRAME.x[index], VORTEX_FRAME.y[index]);
      hasAccentTrail = true;
    }
    if (!hasAccentTrail) continue;
    context.strokeStyle = PARTICLE_COLORS[tone];
    context.globalAlpha = 0.21;
    context.lineWidth = 0.66;
    context.stroke();
  }

  for (let tone = 0; tone < PARTICLE_COLORS.length; tone += 1) {
    for (let depthBand = 0; depthBand < 3; depthBand += 1) {
      context.beginPath();
      let hasParticles = false;
      for (let index = 0; index < vortexCount; index += 1) {
        if (VORTEX_FRAME.tone[index] !== tone) continue;
        const currentDepthBand = Math.min(2, Math.floor(VORTEX_FRAME.depth[index] * 3));
        if (currentDepthBand !== depthBand) continue;
        const radius = VORTEX_FRAME.radius[index];
        context.moveTo(VORTEX_FRAME.x[index] + radius, VORTEX_FRAME.y[index]);
        context.arc(
          VORTEX_FRAME.x[index],
          VORTEX_FRAME.y[index],
          radius,
          0,
          Math.PI * 2,
        );
        hasParticles = true;
      }
      if (!hasParticles) continue;
      context.fillStyle = PARTICLE_COLORS[tone];
      context.globalAlpha = tone > 0
        ? 0.5 + depthBand * 0.16
        : 0.24 + depthBand * 0.12;
      context.shadowColor = PARTICLE_SHADOWS[tone];
      context.shadowBlur = tone > 0 ? 3.5 : 0;
      context.fill();
    }
  }
  context.restore();
}

function drawParticleField(
  context: CanvasRenderingContext2D,
  particles: ParticleBuffer,
  pointer: PointerField,
  width: number,
  height: number,
  time: number,
) {
  context.clearRect(0, 0, width, height);
  context.save();

  const railStart = width * 0.7;
  const railGradient = context.createLinearGradient(railStart, 0, width, 0);
  railGradient.addColorStop(0, "rgba(79,247,213,0)");
  railGradient.addColorStop(0.55, "rgba(79,247,213,0.045)");
  railGradient.addColorStop(1, "rgba(233,255,249,0.12)");
  context.strokeStyle = railGradient;
  context.lineWidth = 0.65;
  for (const railPosition of RAIL_POSITIONS) {
    const y = railPosition * height;
    context.beginPath();
    context.moveTo(railStart, y);
    context.lineTo(width, y);
    context.stroke();
  }

  drawParticleVortex(context, pointer, width, height, time);

  context.lineCap = "round";
  for (let age = TRAIL_STEPS - 2; age >= 0; age -= 1) {
    const newerSlot = (particles.trailHead - age + TRAIL_STEPS) % TRAIL_STEPS;
    const olderSlot = (newerSlot - 1 + TRAIL_STEPS) % TRAIL_STEPS;
    const ageStrength = 1 - age / (TRAIL_STEPS - 1);

    context.beginPath();
    for (let index = 0; index < particles.count; index += 1) {
      context.moveTo(
        particles.trailX[olderSlot * particles.count + index],
        particles.trailY[olderSlot * particles.count + index],
      );
      context.lineTo(
        particles.trailX[newerSlot * particles.count + index],
        particles.trailY[newerSlot * particles.count + index],
      );
    }
    context.globalAlpha = 0.018 + ageStrength * 0.065;
    context.strokeStyle = "#e9fff9";
    context.lineWidth = 0.48;
    context.stroke();

    for (let tone = 1; tone < PARTICLE_COLORS.length; tone += 1) {
      context.beginPath();
      let hasSignalTrail = false;
      for (let index = 0; index < particles.count; index += 1) {
        const effectiveTone = particles.tone[index] === 0 && particles.influence[index] >= 0.46
          ? 1
          : particles.tone[index];
        if (effectiveTone !== tone) continue;
        context.moveTo(
          particles.trailX[olderSlot * particles.count + index],
          particles.trailY[olderSlot * particles.count + index],
        );
        context.lineTo(
          particles.trailX[newerSlot * particles.count + index],
          particles.trailY[newerSlot * particles.count + index],
        );
        hasSignalTrail = true;
      }
      if (hasSignalTrail) {
        context.globalAlpha = 0.08 + ageStrength * 0.22;
        context.strokeStyle = PARTICLE_COLORS[tone];
        context.lineWidth = 0.68;
        context.stroke();
      }
    }
  }

  context.globalCompositeOperation = "lighter";
  for (let tone = 0; tone < PARTICLE_COLORS.length; tone += 1) {
    for (let depthBand = 0; depthBand < 3; depthBand += 1) {
      context.beginPath();
      let hasParticles = false;
      for (let index = 0; index < particles.count; index += 1) {
        const effectiveTone = particles.tone[index] === 0 && particles.influence[index] >= 0.5
          ? 1
          : particles.tone[index];
        if (effectiveTone !== tone) continue;
        const currentDepthBand = Math.min(2, Math.floor(particles.depth[index] * 3));
        if (currentDepthBand !== depthBand) continue;
        const radius = 0.42
          + particles.size[index] * (0.18 + depthBand * 0.14)
          + particles.influence[index] * 0.3;
        context.moveTo(particles.x[index] + radius, particles.y[index]);
        context.arc(particles.x[index], particles.y[index], radius, 0, Math.PI * 2);
        hasParticles = true;
      }
      if (!hasParticles) continue;
      context.fillStyle = PARTICLE_COLORS[tone];
      context.globalAlpha = tone > 0
        ? 0.52 + depthBand * 0.16
        : 0.24 + depthBand * 0.14;
      context.shadowColor = PARTICLE_SHADOWS[tone];
      context.shadowBlur = tone > 0 ? 4 : 0;
      context.fill();
    }
  }

  context.restore();
}

const PARTICLE_RGB = [
  [0.914, 1, 0.976],
  [0.31, 0.969, 0.835],
  [0.541, 0.447, 1],
  [1, 0.42, 0.341],
] as const;
const WEBGL_VERTEX_STRIDE = 7;
const MAX_WEBGL_LINE_VERTICES = (
  MAX_PARTICLES * (TRAIL_STEPS - 1) * 2
  + MAX_VORTEX_PARTICLES * 2
  + RAIL_POSITIONS.length * 2
);
const MAX_WEBGL_POINT_VERTICES = MAX_PARTICLES + MAX_VORTEX_PARTICLES;

type WebGLParticleRenderer = {
  destroy: () => void;
  draw: (
    particles: ParticleBuffer,
    pointer: PointerField,
    width: number,
    height: number,
    time: number,
  ) => void;
  resize: (pixelWidth: number, pixelHeight: number, dpr: number) => void;
};

function createWebGLProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function createWebGLParticleRenderer(canvas: HTMLCanvasElement): WebGLParticleRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    desynchronized: true,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    stencil: false,
  });
  if (!gl) return null;

  const program = createWebGLProgram(
    gl,
    `#version 300 es
      in vec2 a_position;
      in vec4 a_color;
      in float a_size;
      uniform vec2 u_resolution;
      out vec4 v_color;

      void main() {
        vec2 normalized = a_position / u_resolution;
        vec2 clip = normalized * 2.0 - 1.0;
        gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
        gl_PointSize = a_size;
        v_color = a_color;
      }
    `,
    `#version 300 es
      precision mediump float;
      in vec4 v_color;
      uniform bool u_round_points;
      out vec4 out_color;

      void main() {
        float alpha = v_color.a;
        if (u_round_points) {
          float distance_from_center = length(gl_PointCoord - vec2(0.5));
          float core = 1.0 - smoothstep(0.18, 0.5, distance_from_center);
          float glow = (1.0 - smoothstep(0.0, 0.5, distance_from_center)) * 0.28;
          alpha *= max(core, glow);
        }
        out_color = vec4(v_color.rgb, alpha);
      }
    `,
  );
  const buffer = gl.createBuffer();
  const vertexArray = gl.createVertexArray();
  if (!program || !buffer || !vertexArray) {
    if (program) gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    if (vertexArray) gl.deleteVertexArray(vertexArray);
    return null;
  }

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const colorLocation = gl.getAttribLocation(program, "a_color");
  const sizeLocation = gl.getAttribLocation(program, "a_size");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const roundPointsLocation = gl.getUniformLocation(program, "u_round_points");
  if (
    positionLocation < 0
    || colorLocation < 0
    || sizeLocation < 0
    || !resolutionLocation
    || !roundPointsLocation
  ) {
    gl.deleteProgram(program);
    gl.deleteBuffer(buffer);
    gl.deleteVertexArray(vertexArray);
    return null;
  }

  const lineVertices = new Float32Array(MAX_WEBGL_LINE_VERTICES * WEBGL_VERTEX_STRIDE);
  const pointVertices = new Float32Array(MAX_WEBGL_POINT_VERTICES * WEBGL_VERTEX_STRIDE);
  let devicePixelRatio = 1;
  let resolutionWidth = 1;
  let resolutionHeight = 1;

  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const byteStride = WEBGL_VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, byteStride, 0);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(
    colorLocation,
    4,
    gl.FLOAT,
    false,
    byteStride,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );
  gl.enableVertexAttribArray(sizeLocation);
  gl.vertexAttribPointer(
    sizeLocation,
    1,
    gl.FLOAT,
    false,
    byteStride,
    6 * Float32Array.BYTES_PER_ELEMENT,
  );
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  const writeVertex = (
    target: Float32Array,
    offset: number,
    x: number,
    y: number,
    tone: number,
    alpha: number,
    size: number,
  ) => {
    const color = PARTICLE_RGB[tone];
    target[offset] = x;
    target[offset + 1] = y;
    target[offset + 2] = color[0];
    target[offset + 3] = color[1];
    target[offset + 4] = color[2];
    target[offset + 5] = alpha;
    target[offset + 6] = size;
    return offset + WEBGL_VERTEX_STRIDE;
  };

  const drawVertices = (
    vertices: Float32Array,
    floatCount: number,
    mode: number,
    roundPoints: boolean,
  ) => {
    if (floatCount === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, floatCount), gl.DYNAMIC_DRAW);
    gl.uniform1i(roundPointsLocation, roundPoints ? 1 : 0);
    gl.drawArrays(mode, 0, floatCount / WEBGL_VERTEX_STRIDE);
  };

  return {
    destroy: () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vertexArray);
    },
    draw: (particles, pointer, width, height, time) => {
      resolutionWidth = width;
      resolutionHeight = height;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindVertexArray(vertexArray);
      gl.uniform2f(resolutionLocation, resolutionWidth, resolutionHeight);

      let lineOffset = 0;
      const railStart = width * 0.7;
      for (const railPosition of RAIL_POSITIONS) {
        const y = railPosition * height;
        lineOffset = writeVertex(lineVertices, lineOffset, railStart, y, 1, 0, 1);
        lineOffset = writeVertex(lineVertices, lineOffset, width, y, 0, 0.12, 1);
      }

      const vortexCount = updateParticleVortexFrame(pointer, width, height, time);
      for (let index = 0; index < vortexCount; index += 1) {
        const tone = VORTEX_FRAME.tone[index];
        lineOffset = writeVertex(
          lineVertices,
          lineOffset,
          VORTEX_FRAME.tailX[index],
          VORTEX_FRAME.tailY[index],
          tone,
          tone > 0 ? 0.21 : 0.075,
          1,
        );
        lineOffset = writeVertex(
          lineVertices,
          lineOffset,
          VORTEX_FRAME.x[index],
          VORTEX_FRAME.y[index],
          tone,
          tone > 0 ? 0.21 : 0.075,
          1,
        );
      }

      for (let age = TRAIL_STEPS - 2; age >= 0; age -= 1) {
        const newerSlot = (particles.trailHead - age + TRAIL_STEPS) % TRAIL_STEPS;
        const olderSlot = (newerSlot - 1 + TRAIL_STEPS) % TRAIL_STEPS;
        const ageStrength = 1 - age / (TRAIL_STEPS - 1);
        for (let index = 0; index < particles.count; index += 1) {
          const tone = particles.tone[index] === 0 && particles.influence[index] >= 0.46
            ? 1
            : particles.tone[index];
          const alpha = tone > 0
            ? 0.08 + ageStrength * 0.22
            : 0.018 + ageStrength * 0.065;
          lineOffset = writeVertex(
            lineVertices,
            lineOffset,
            particles.trailX[olderSlot * particles.count + index],
            particles.trailY[olderSlot * particles.count + index],
            tone,
            alpha,
            1,
          );
          lineOffset = writeVertex(
            lineVertices,
            lineOffset,
            particles.trailX[newerSlot * particles.count + index],
            particles.trailY[newerSlot * particles.count + index],
            tone,
            alpha,
            1,
          );
        }
      }
      drawVertices(lineVertices, lineOffset, gl.LINES, false);

      let pointOffset = 0;
      for (let index = 0; index < vortexCount; index += 1) {
        const tone = VORTEX_FRAME.tone[index];
        const depth = VORTEX_FRAME.depth[index];
        pointOffset = writeVertex(
          pointVertices,
          pointOffset,
          VORTEX_FRAME.x[index],
          VORTEX_FRAME.y[index],
          tone,
          tone > 0 ? 0.5 + depth * 0.32 : 0.24 + depth * 0.24,
          Math.max(
            1,
            (VORTEX_FRAME.radius[index] * 2 + (tone > 0 ? 1.1 : 0)) * devicePixelRatio,
          ),
        );
      }
      for (let index = 0; index < particles.count; index += 1) {
        const tone = particles.tone[index] === 0 && particles.influence[index] >= 0.5
          ? 1
          : particles.tone[index];
        const depthBand = Math.min(2, Math.floor(particles.depth[index] * 3));
        const radius = 0.42
          + particles.size[index] * (0.18 + depthBand * 0.14)
          + particles.influence[index] * 0.3;
        pointOffset = writeVertex(
          pointVertices,
          pointOffset,
          particles.x[index],
          particles.y[index],
          tone,
          tone > 0 ? 0.52 + depthBand * 0.16 : 0.24 + depthBand * 0.14,
          Math.max(1, (radius * 2 + (tone > 0 ? 0.8 : 0)) * devicePixelRatio),
        );
      }
      drawVertices(pointVertices, pointOffset, gl.POINTS, true);
      gl.flush();
    },
    resize: (pixelWidth, pixelHeight, dpr) => {
      devicePixelRatio = dpr;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
    },
  };
}

export function AboutParticleField() {
  const rootRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const webglRenderer = createWebGLParticleRenderer(canvas);
    const canvas2d = webglRenderer
      ? null
      : canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!webglRenderer && !canvas2d) return;
    root.dataset.renderer = webglRenderer ? "webgl2" : "canvas2d";

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer: PointerField = {
      active: false,
      strength: 0,
      x: 0,
      y: 0,
    };
    let particles: ParticleBuffer | null = null;
    let cssWidth = 0;
    let cssHeight = 0;
    let frame = 0;
    let lastRafTime = 0;
    let frameAccumulator = 0;
    let motionState = "initializing";
    let ready = false;
    let reducedMotion = motionQuery.matches;
    let sizeDirty = true;
    let pendingWidth = 0;
    let pendingHeight = 0;
    let frameInterval = 0;
    let visualTime = 0;
    let visibilityFrame = 0;

    const currentVisibleRatio = () => {
      const rect = root.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0));
      const visibleWidth = Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
      return rect.width > 0 && rect.height > 0
        ? (visibleWidth * visibleHeight) / (rect.width * rect.height)
        : 0;
    };
    let visible = currentVisibleRatio() >= 0.05;

    const resizeCanvas = () => {
      if (!sizeDirty && particles) return;
      const nextWidth = Math.max(1, Math.round(pendingWidth || root.clientWidth));
      const nextHeight = Math.max(1, Math.round(pendingHeight || root.clientHeight));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(nextWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(nextHeight * dpr));
      const dimensionsChanged = nextWidth !== cssWidth || nextHeight !== cssHeight;

      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      if (webglRenderer) {
        webglRenderer.resize(pixelWidth, pixelHeight, dpr);
      } else {
        canvas2d?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      if (dimensionsChanged || !particles) {
        cssWidth = nextWidth;
        cssHeight = nextHeight;
        const compact = window.matchMedia("(pointer: coarse)").matches || cssWidth <= 600;
        frameInterval = compact ? 1000 / 45 : 0;
        particles = createParticleBuffer(cssWidth, cssHeight, compact);
        pointer.x = cssWidth * 0.54;
        pointer.y = cssHeight * 0.5;
        root.dataset.particleCount = String(particles.count);
      }
      sizeDirty = false;
    };

    const syncMotionState = () => {
      const state = reducedMotion
        ? "reduced"
        : visible && !document.hidden
          ? "running"
          : "paused";
      if (motionState !== state) {
        motionState = state;
        root.dataset.motion = state;
      }
      return state;
    };

    const renderFrame = (advanceMs: number) => {
      resizeCanvas();
      if (!particles) return;
      if (advanceMs > 0) {
        const delta = clamp(advanceMs / (1000 / 60), 0.35, 2.1);
        visualTime += advanceMs;
        updateParticles(particles, pointer, cssWidth, cssHeight, visualTime, delta);
      }
      if (webglRenderer) {
        webglRenderer.draw(particles, pointer, cssWidth, cssHeight, visualTime);
      } else if (canvas2d) {
        drawParticleField(canvas2d, particles, pointer, cssWidth, cssHeight, visualTime);
      }
      if (!ready) {
        ready = true;
        root.dataset.ready = "true";
      }
    };

    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
      lastRafTime = 0;
      frameAccumulator = 0;
    };

    const tick = (time: number) => {
      frame = 0;
      if (motionState !== "running") {
        renderFrame(0);
        return;
      }
      const elapsedMs = lastRafTime > 0
        ? clamp(time - lastRafTime, 0, 50)
        : 1000 / 60;
      lastRafTime = time;
      if (frameInterval > 0) {
        frameAccumulator += elapsedMs;
        if (frameAccumulator + 0.01 < frameInterval) {
          frame = window.requestAnimationFrame(tick);
          return;
        }
        frameAccumulator = Math.min(
          Math.max(0, frameAccumulator - frameInterval),
          frameInterval,
        );
        renderFrame(frameInterval);
      } else {
        renderFrame(elapsedMs);
      }
      frame = window.requestAnimationFrame(tick);
    };

    const schedule = () => {
      stop();
      const state = syncMotionState();
      if (state === "running") {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        renderFrame(0);
      });
    };

    const reconcileVisibility = () => {
      const nextVisible = currentVisibleRatio() >= 0.05;
      if (visible === nextVisible) return;
      visible = nextVisible;
      schedule();
    };
    const scheduleVisibilityReconciliation = () => {
      if (visibilityFrame) return;
      visibilityFrame = window.requestAnimationFrame(() => {
        visibilityFrame = 0;
        reconcileVisibility();
      });
    };

    const setPointerFromEvent = (event: PointerEvent, active: boolean) => {
      if (reducedMotion) return;
      const rect = root.getBoundingClientRect();
      pointer.x = clamp(event.clientX - rect.left, 0, rect.width);
      pointer.y = clamp(event.clientY - rect.top, 0, rect.height);
      if (pointer.active !== active) {
        pointer.active = active;
        root.dataset.pointerActive = active ? "true" : "false";
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      setPointerFromEvent(event, true);
    };
    const handlePointerDown = (event: PointerEvent) => {
      setPointerFromEvent(event, true);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.type === "pointerup") return;
      if (pointer.active) {
        pointer.active = false;
        root.dataset.pointerActive = "false";
      }
    };
    const handlePointerLeave = () => {
      if (pointer.active) {
        pointer.active = false;
        root.dataset.pointerActive = "false";
      }
    };
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) {
        pointer.active = false;
        pointer.strength = 0;
        root.dataset.pointerActive = "false";
      }
      schedule();
    };
    const handleVisibility = () => {
      schedule();
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      pendingWidth = entry.contentRect.width;
      pendingHeight = entry.contentRect.height;
      sizeDirty = true;
      visible = currentVisibleRatio() >= 0.05;
      schedule();
    });
    resizeObserver.observe(root);
    const visibilityObserver = new IntersectionObserver(() => {
      visible = currentVisibleRatio() >= 0.05;
      schedule();
    }, { threshold: [0, 0.05, 0.2] });
    visibilityObserver.observe(root);

    root.addEventListener("pointermove", handlePointerMove, { passive: true });
    root.addEventListener("pointerdown", handlePointerDown, { passive: true });
    root.addEventListener("pointerup", handlePointerEnd, { passive: true });
    root.addEventListener("pointercancel", handlePointerEnd, { passive: true });
    root.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    motionQuery.addEventListener("change", handleMotionPreference);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("scroll", scheduleVisibilityReconciliation, { passive: true });
    window.addEventListener("resize", scheduleVisibilityReconciliation);
    schedule();

    return () => {
      stop();
      if (visibilityFrame) window.cancelAnimationFrame(visibilityFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      webglRenderer?.destroy();
      root.removeEventListener("pointermove", handlePointerMove);
      root.removeEventListener("pointerdown", handlePointerDown);
      root.removeEventListener("pointerup", handlePointerEnd);
      root.removeEventListener("pointercancel", handlePointerEnd);
      root.removeEventListener("pointerleave", handlePointerLeave);
      motionQuery.removeEventListener("change", handleMotionPreference);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("scroll", scheduleVisibilityReconciliation);
      window.removeEventListener("resize", scheduleVisibilityReconciliation);
    };
  }, []);

  return (
    <figure
      ref={rootRef}
      className="about-particle-field"
      data-motion="initializing"
      data-motion-layer="about-particle-field"
      data-particle-count="0"
      data-pointer-active="false"
      data-ready="false"
      data-renderer="pending"
      role="img"
      aria-label="Unstructured context flowing through an evidence lens into testable output"
    >
      <div className="about-particle-fallback" aria-hidden="true" />
      <canvas ref={canvasRef} className="about-particle-canvas" aria-hidden="true" />
      <div className="about-field-overlay" aria-hidden="true">
        <span className="about-field-label about-field-label--input">RAW CONTEXT</span>
        <span className="about-field-label about-field-label--lens">EVIDENCE LENS</span>
        <span className="about-field-label about-field-label--output">TESTABLE OUTPUT</span>
        <span className="about-field-state">POINTER FIELD / </span>
      </div>
    </figure>
  );
}
