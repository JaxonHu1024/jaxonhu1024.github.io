import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrameRateGate,
  getResearchFrameRate,
  pointOnSiteTrace,
} from "../app/lib/motion-performance.ts";

test("research motion uses the mobile and desktop frame budgets", () => {
  assert.equal(getResearchFrameRate(390), 30);
  assert.equal(getResearchFrameRate(700), 30);
  assert.equal(getResearchFrameRate(768), 45);
  assert.equal(getResearchFrameRate(1920), 45);
});

test("the frame gate keeps one second of 60 Hz callbacks near each visual budget", () => {
  const timestamps = Array.from({ length: 61 }, (_, index) => index * (1000 / 60));
  const mobileGate = createFrameRateGate(30);
  const desktopGate = createFrameRateGate(45);

  const mobileFrames = timestamps.filter((timestamp) => mobileGate.shouldRender(timestamp));
  const desktopFrames = timestamps.filter((timestamp) => desktopGate.shouldRender(timestamp));

  assert.ok(mobileFrames.length >= 30 && mobileFrames.length <= 31, mobileFrames.length);
  assert.ok(desktopFrames.length >= 45 && desktopFrames.length <= 46, desktopFrames.length);
});

test("the frame gate restarts cleanly after an offscreen pause", () => {
  const gate = createFrameRateGate(30);

  assert.equal(gate.shouldRender(0), true);
  assert.equal(gate.shouldRender(16), false);
  gate.reset();
  assert.equal(gate.shouldRender(17), true);
});

test("the tracing-beam head follows the bent SVG route", () => {
  assert.deepEqual(pointOnSiteTrace(0), { x: 10, y: 0 });
  assert.deepEqual(pointOnSiteTrace(1), { x: 19, y: 100 });

  const midpoint = pointOnSiteTrace(0.5);
  assert.equal(midpoint.x, 1);
  assert.ok(Math.abs(midpoint.y - 54.3807) < 0.0001, midpoint.y);
});

test("tracing-beam progress is clamped to the route endpoints", () => {
  assert.deepEqual(pointOnSiteTrace(-1), { x: 10, y: 0 });
  assert.deepEqual(pointOnSiteTrace(2), { x: 19, y: 100 });
});
