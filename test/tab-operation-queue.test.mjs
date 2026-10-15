import test from "node:test";
import assert from "node:assert/strict";
import { createTabOperationQueue } from "../extension/tab-operation-queue.js";

test("tab operation queue serializes operations for one tab", async () => {
  const queue = createTabOperationQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const first = queue.run(7, async () => {
    events.push("first:start");
    await firstGate;
    events.push("first:end");
    return 1;
  });
  const second = queue.run(7, async () => {
    events.push("second:start");
    events.push("second:end");
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(events, ["first:start"]);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
  assert.equal(queue.has(7), false);
});

test("a failed operation does not block the next operation", async () => {
  const queue = createTabOperationQueue();
  const first = queue.run(8, async () => { throw new Error("expected"); });
  const second = queue.run(8, async () => "continued");
  await assert.rejects(first, /expected/);
  assert.equal(await second, "continued");
});

test("cancelling a tab prevents its queued operations from starting", async () => {
  const queue = createTabOperationQueue();
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = queue.run(9, () => firstGate);
  const second = queue.run(9, async () => "must not run");
  await Promise.resolve();
  queue.cancel(9);
  releaseFirst("finished");
  assert.equal(await first, "finished");
  await assert.rejects(second, (error) => error.code === "TAB_OPERATION_CANCELLED");
});
