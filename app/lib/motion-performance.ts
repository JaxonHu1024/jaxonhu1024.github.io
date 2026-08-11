type SiteTracePoint = Readonly<{ x: number; y: number }>;

const RESEARCH_MOBILE_MAX_WIDTH = 700;
const FRAME_TIME_TOLERANCE_MS = 0.5;
const SITE_TRACE_POINTS: readonly SiteTracePoint[] = [
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 6, y: 8 },
  { x: 6, y: 78 },
  { x: 14, y: 82 },
  { x: 14, y: 100 },
];
export const SITE_TRACE_PATH = SITE_TRACE_POINTS.map((point, index) => {
  if (index === 0) return `M ${point.x} ${point.y}`;

  const previous = SITE_TRACE_POINTS[index - 1];
  if (point.x === previous.x) return `V ${point.y}`;
  if (point.y === previous.y) return `H ${point.x}`;
  return `L ${point.x} ${point.y}`;
}).join(" ");
const SITE_TRACE_SEGMENTS = SITE_TRACE_POINTS.slice(1).map((end, index) => {
  const start = SITE_TRACE_POINTS[index];
  return {
    end,
    length: Math.hypot(end.x - start.x, end.y - start.y),
    start,
  };
});
const SITE_TRACE_LENGTH = SITE_TRACE_SEGMENTS.reduce(
  (total, segment) => total + segment.length,
  0,
);

export function getResearchFrameRate(viewportWidth: number): 30 | 45 {
  return viewportWidth <= RESEARCH_MOBILE_MAX_WIDTH ? 30 : 45;
}

export function createFrameRateGate(maxFramesPerSecond: number) {
  const frameInterval = 1000 / maxFramesPerSecond;
  let nextFrameAt: number | null = null;

  return {
    reset() {
      nextFrameAt = null;
    },
    shouldRender(timestamp: number) {
      if (nextFrameAt === null) {
        nextFrameAt = timestamp + frameInterval;
        return true;
      }

      if (timestamp + FRAME_TIME_TOLERANCE_MS < nextFrameAt) return false;

      const overdueBy = timestamp - nextFrameAt;
      nextFrameAt = overdueBy > frameInterval * 2
        ? timestamp + frameInterval
        : nextFrameAt + frameInterval;
      return true;
    },
  };
}

export function pointOnSiteTrace(progress: number): SiteTracePoint {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  let remainingDistance = clampedProgress * SITE_TRACE_LENGTH;

  for (const segment of SITE_TRACE_SEGMENTS) {
    if (remainingDistance <= segment.length) {
      const localProgress = segment.length === 0 ? 0 : remainingDistance / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * localProgress,
        y: segment.start.y + (segment.end.y - segment.start.y) * localProgress,
      };
    }
    remainingDistance -= segment.length;
  }

  return SITE_TRACE_POINTS[SITE_TRACE_POINTS.length - 1];
}
