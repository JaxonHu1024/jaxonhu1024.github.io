import assert from "node:assert/strict";
import test from "node:test";

import { createHashNavigation } from "../app/lib/hash-navigation.ts";

function createHarness() {
  let frameId = 0;
  const frames = new Map();
  const listeners = new Map();
  const cancelledFrames = [];
  const historyEntries = [];
  const focusCalls = [];
  const targets = new Map([
    ["experience", {
      focus: (options) => focusCalls.push(["experience", options]),
      getBoundingClientRect: () => ({ top: 768 }),
    }],
    ["research", {
      focus: (options) => focusCalls.push(["research", options]),
      getBoundingClientRect: () => ({ top: 2200 }),
    }],
  ]);

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
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type, listener) => {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };

  return {
    window,
    document: {
      getElementById: (id) => targets.get(id) ?? null,
    },
    frames,
    listeners,
    cancelledFrames,
    historyEntries,
    focusCalls,
  };
}

function createClick(overrides = {}) {
  let prevented = false;
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: () => {
      prevented = true;
    },
    ...overrides,
  };

  return {
    event,
    wasPrevented: () => prevented,
  };
}

test("hero hash navigation uses the cancellable section-scroll path", () => {
  const harness = createHarness();
  const navigation = createHashNavigation(harness.window, harness.document);
  const click = createClick();

  assert.equal(navigation.navigate(click.event, "#experience"), true);
  assert.equal(click.wasPrevented(), true);
  assert.deepEqual(harness.historyEntries, ["#experience"]);
  assert.deepEqual(harness.focusCalls, [["experience", { preventScroll: true }]]);
  assert.deepEqual([...harness.listeners.keys()].sort(), ["keydown", "touchstart", "wheel"]);
  assert.equal(harness.frames.size, 1);
});

test("starting another hash navigation cancels the previous animation", () => {
  const harness = createHarness();
  const navigation = createHashNavigation(harness.window, harness.document);

  navigation.navigate(createClick().event, "#experience");
  navigation.navigate(createClick().event, "#research");

  assert.deepEqual(harness.historyEntries, ["#experience", "#research"]);
  assert.equal(harness.cancelledFrames.length, 1);
  assert.equal(harness.frames.size, 1);
});

test("modified clicks and missing targets keep native link behavior", () => {
  const harness = createHarness();
  const navigation = createHashNavigation(harness.window, harness.document);
  const modified = createClick({ metaKey: true });
  const missing = createClick();

  assert.equal(navigation.navigate(modified.event, "#experience"), false);
  assert.equal(modified.wasPrevented(), false);
  assert.equal(navigation.navigate(missing.event, "#missing"), false);
  assert.equal(missing.wasPrevented(), false);
  assert.equal(harness.frames.size, 0);
});
