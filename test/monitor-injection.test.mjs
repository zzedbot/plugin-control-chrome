import test from "node:test";
import assert from "node:assert/strict";
import { expandFrameIdSubtree, installMonitorsForTab, isMonitorablePageFrame } from "../extension/monitor-injection.js";

const frame = (documentId, frameId = 0) => ({ documentId, frameId });

test("monitor policy skips an attributed neutralized subtree regardless of transient URL", () => {
  const neutralized = new Set([7]);
  assert.equal(isMonitorablePageFrame({ documentId: "top", frameId: 0, url: "about:blank" }, "a".repeat(32)), true);
  assert.equal(isMonitorablePageFrame({ documentId: "ordinary", frameId: 1, url: "about:blank" }, "a".repeat(32), neutralized), true);
  assert.equal(isMonitorablePageFrame({ documentId: "neutralized", frameId: 7, url: "about:blank" }, "a".repeat(32), neutralized), false);
  assert.equal(isMonitorablePageFrame({ documentId: "destroying", frameId: 7, url: "https://example.com/transient" }, "a".repeat(32), neutralized), false);
  assert.equal(isMonitorablePageFrame({ documentId: "srcdoc", frameId: 2, url: "about:srcdoc" }, "a".repeat(32), neutralized), true);
  assert.equal(isMonitorablePageFrame({ documentId: "page", frameId: 1, url: "https://example.com/" }, "a".repeat(32)), true);
  assert.equal(isMonitorablePageFrame({ documentId: "foreign", frameId: 1, url: `chrome-extension://${"b".repeat(32)}/page.html` }, "a".repeat(32)), false);
});

test("neutralized frame tracking includes transient descendants until they disappear", () => {
  const tracked = new Set([7]);
  expandFrameIdSubtree([
    { frameId: 0, parentFrameId: -1 },
    { frameId: 7, parentFrameId: 0 },
    { frameId: 8, parentFrameId: 7 },
    { frameId: 9, parentFrameId: 8 }
  ], tracked);
  assert.deepEqual([...tracked].sort((a, b) => a - b), [7, 8, 9]);
  expandFrameIdSubtree([{ frameId: 0, parentFrameId: -1 }, { frameId: 9, parentFrameId: 8 }], tracked);
  assert.deepEqual([...tracked], [9]);
  expandFrameIdSubtree([{ frameId: 0, parentFrameId: -1 }], tracked);
  assert.equal(tracked.size, 0);
});

test("a residual child is attributed after its tracked parent has already disappeared", () => {
  const tracked = new Set([7]);
  expandFrameIdSubtree([
    { frameId: 0, parentFrameId: -1 },
    { frameId: 8, parentFrameId: 7 }
  ], tracked);
  assert.deepEqual([...tracked], [8]);
});
function harness(inventories, executeMonitor, installed = new Set(), maxAttempts = 2) {
  let read = 0;
  return {
    installed,
    run: () => installMonitorsForTab({
      tabId: 1, installed, executeMonitor,
      isInjectableFrame: () => true,
      getAllFrames: async () => inventories[Math.min(read++, inventories.length - 1)],
      maxAttempts,
      wait: async () => {}
    })
  };
}

test("top-frame fallback records the returned document and recovers a failed document injection", async () => {
  const h = harness([[frame("old")], [frame("new")]], async (target) => {
    if (target.documentIds) throw new Error("document navigated");
    return [{ frameId: 0, documentId: "new", result: true }];
  });
  await h.run();
  assert.deepEqual([...h.installed], ["new"]);
});

test("navigation after successful injection requires installation in the replacement document", async () => {
  const calls = [];
  const h = harness([[frame("old")], [frame("new")]], async (target) => {
    calls.push(target.documentIds[0]);
    return [{ documentId: target.documentIds[0], frameId: 0, result: true }];
  });
  await h.run();
  assert.deepEqual(calls, ["old", "new"]);
  assert.deepEqual([...h.installed], ["new"]);
});

test("a failed child document that disappears does not reject current coverage", async () => {
  const h = harness([[frame("top"), frame("gone", 1)], [frame("top")]], async (target) => {
    if (target.documentIds[0] === "gone") throw new Error("frame removed");
    return [{ documentId: "top", frameId: 0, result: true }];
  });
  await h.run();
  assert.deepEqual([...h.installed], ["top"]);
});

test("coverage waits through several inventories for a removed child document to disappear", async () => {
  const h = harness([
    [frame("top"), frame("gone", 1)],
    [frame("top"), frame("gone", 1)],
    [frame("top"), frame("gone", 1)],
    [frame("top"), frame("gone", 1)],
    [frame("top")]
  ], async (target) => {
    if (target.documentIds[0] === "gone") throw new Error("frame is being destroyed");
    return [{ documentId: "top", frameId: 0, result: true }];
  }, new Set(), 4);
  await h.run();
  assert.deepEqual([...h.installed], ["top"]);
});

test("a persistent child injection failure rejects even when the top frame succeeds", async () => {
  const h = harness([[frame("top"), frame("child", 1)]], async (target) => {
    if (target.documentIds[0] === "child") throw new Error("denied");
    return [{ documentId: "top", frameId: 0, result: true }];
  });
  await assert.rejects(h.run(), { code: "FOREIGN_FRAME_MONITOR_FAILED" });
});

test("fallback without a confirmed document ID cannot establish coverage", async () => {
  const h = harness([[frame("top")]], async (target) => {
    if (target.documentIds) return [{ documentId: "top", result: false }];
    return [{ frameId: 0, result: true }];
  });
  await assert.rejects(h.run(), { code: "FOREIGN_FRAME_MONITOR_FAILED" });
});

test("continued navigation exhausts the bounded retry and fails closed", async () => {
  const h = harness([[frame("a")], [frame("b")], [frame("b")], [frame("c")]], async (target) => {
    return [{ documentId: target.documentIds[0], frameId: 0, result: true }];
  });
  await assert.rejects(h.run(), { code: "FOREIGN_FRAME_MONITOR_FAILED" });
  assert.equal(h.installed.size, 0);
});
