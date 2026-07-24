import assert from "node:assert/strict";
import test from "node:test";

import { startCancellableScroll } from "../app/lib/cancellable-scroll.ts";

function createScrollHarness() {
  let frameId = 0;
  const frames = new Map();
  const listeners = new Map();
  const cancelledFrames = [];
  const scrollPositions = [];
  const historyEntries = [];
  const focusCalls = [];

  const window = {
    scrollY: 0,
    performance: { now: () => 0 },
    history: {
      pushState: (_state, _unused, url) => historyEntries.push(url),
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback) => {
      frameId += 1;
      frames.set(frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id) => {
      cancelledFrames.push(id);
      frames.delete(id);
    },
    scrollTo: (_x, y) => {
      window.scrollY = y;
      scrollPositions.push(y);
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };

  return {
    window,
    target: {
      focus: (options) => focusCalls.push(options),
      getBoundingClientRect: () => ({ top: 1200 }),
    },
    frames,
    listeners,
    cancelledFrames,
    scrollPositions,
    historyEntries,
    focusCalls,
  };
}

function runNextFrame(harness, time) {
  const [frameId, frame] = [...harness.frames.entries()][0];
  harness.frames.delete(frameId);
  frame(time);
}

for (const inputType of ["wheel", "touchstart", "keydown"]) {
  test(`${inputType} input immediately cancels an active section navigation`, () => {
    const harness = createScrollHarness();

    startCancellableScroll(harness.window, harness.target, "#research", { duration: 600 });

    assert.deepEqual(harness.historyEntries, ["#research"]);
    assert.deepEqual([...harness.listeners.keys()].sort(), ["keydown", "touchstart", "wheel"]);
    assert.equal(harness.frames.size, 1);

    runNextFrame(harness, 200);
    assert.ok(harness.scrollPositions.at(-1) > 0);
    assert.ok(harness.scrollPositions.at(-1) < 1200);

    harness.listeners.get(inputType)(new Event(inputType));

    assert.equal(harness.frames.size, 0);
    assert.equal(harness.cancelledFrames.length, 1);
    assert.equal(harness.listeners.size, 0);
  });
}

test("an uninterrupted section navigation finishes exactly at its target", () => {
  const harness = createScrollHarness();
  const settlements = [];

  const cancel = startCancellableScroll(harness.window, harness.target, "#foundations", {
    duration: 600,
    onSettled: (result) => settlements.push(result),
  });
  runNextFrame(harness, 600);
  cancel();

  assert.equal(harness.scrollPositions.at(-1), 1200);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.listeners.size, 0);
  assert.deepEqual(settlements, ["finished"]);
});

test("reduced motion skips the animation and moves immediately", () => {
  const harness = createScrollHarness();
  const settlements = [];
  harness.window.matchMedia = () => ({ matches: true });

  startCancellableScroll(harness.window, harness.target, "#contact", {
    onSettled: (result) => settlements.push(result),
  });

  assert.deepEqual(harness.scrollPositions, [1200]);
  assert.equal(harness.frames.size, 0);
  assert.equal(harness.listeners.size, 0);
  assert.deepEqual(settlements, ["finished"]);
});

test("section navigation moves the sequential focus origin without forcing another scroll", () => {
  const harness = createScrollHarness();

  startCancellableScroll(harness.window, harness.target, "#experience");

  assert.deepEqual(harness.focusCalls, [{ preventScroll: true }]);
});

test("a new caller cancels an active section navigation on the same window", () => {
  const harness = createScrollHarness();

  startCancellableScroll(harness.window, harness.target, "#experience");
  startCancellableScroll(harness.window, harness.target, "#research");

  assert.deepEqual(harness.historyEntries, ["#experience", "#research"]);
  assert.equal(harness.cancelledFrames.length, 1);
  assert.equal(harness.frames.size, 1);
});

test("cancellation settles once even if the returned cancel function is reused", () => {
  const harness = createScrollHarness();
  const settlements = [];

  const cancel = startCancellableScroll(harness.window, harness.target, "#research", {
    onSettled: (result) => settlements.push(result),
  });
  cancel();
  cancel();

  assert.deepEqual(settlements, ["cancelled"]);
  assert.equal(harness.listeners.size, 0);
});
