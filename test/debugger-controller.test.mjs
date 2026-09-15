import test from "node:test";
import assert from "node:assert/strict";
import { createDebuggerController } from "../extension/debugger-controller.js";

test("debugger initialization installs the monitor before attaching and commits state last", async () => {
  const calls = [];
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async (tabId) => calls.push(["monitor.install", tabId]),
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  await controller.ensure(7);

  assert.deepEqual(calls, [
    ["monitor.install", 7],
    ["debugger.attach", 7, "1.3"],
    ["debugger.send", 7, "Page.enable"],
    ["debugger.send", 7, "Runtime.enable"]
  ]);
  assert.equal(controller.attachedTabs.has(7), true);
  assert.equal(controller.controlledTabs.has(7), true);
});

test("concurrent ensure calls share one debugger initialization", async () => {
  const calls = [];
  let releaseMonitor;
  const monitorReady = new Promise((resolve) => { releaseMonitor = resolve; });
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => { calls.push(["monitor.install"]); await monitorReady; }
  });

  const first = controller.ensure(8);
  const second = controller.ensure(8);
  releaseMonitor();
  await Promise.all([first, second]);

  assert.equal(calls.filter(([name]) => name === "debugger.attach").length, 1);
  assert.equal(calls.filter(([name]) => name === "monitor.install").length, 1);
});

test("failed debugger domain initialization detaches and clears all state", async () => {
  const calls = [];
  const api = debuggerApi(calls);
  api.sendCommand = async ({ tabId }, method) => {
    calls.push(["debugger.send", tabId, method]);
    if (method === "Runtime.enable") throw new Error("runtime initialization failed");
  };
  const controller = createDebuggerController({
    debuggerApi: api,
    installMonitor: async (tabId) => calls.push(["monitor.install", tabId]),
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  await assert.rejects(controller.ensure(9), /runtime initialization failed/);

  assert.equal(controller.attachedTabs.has(9), false);
  assert.equal(controller.controlledTabs.has(9), false);
  assert.deepEqual(calls.slice(-2), [["debugger.detach", 9], ["monitor.remove", 9]]);
});

test("monitor failure prevents debugger attachment and clears controlled state", async () => {
  const calls = [];
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => { throw new Error("monitor unavailable"); },
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  await assert.rejects(controller.ensure(13), /monitor unavailable/);

  assert.equal(controller.attachedTabs.has(13), false);
  assert.equal(controller.controlledTabs.has(13), false);
  assert.equal(calls.some(([name]) => name === "debugger.attach"), false);
  assert.deepEqual(calls, [["monitor.remove", 13]]);
});

test("an existing attachment is accepted only when this extension can send commands", async () => {
  const calls = [];
  const api = debuggerApi(calls);
  api.attach = async ({ tabId }) => {
    calls.push(["debugger.attach", tabId, "1.3"]);
    throw new Error("Another debugger is already attached");
  };
  const controller = createDebuggerController({ debuggerApi: api, installMonitor: async () => {} });

  await controller.ensure(10);

  assert.equal(controller.attachedTabs.has(10), true);
  assert.deepEqual(calls.slice(1), [
    ["debugger.send", 10, "Page.enable"],
    ["debugger.send", 10, "Runtime.enable"]
  ]);
});

test("another extension's debugger attachment never creates a false attached state", async () => {
  const calls = [];
  const api = debuggerApi(calls);
  api.attach = async ({ tabId }) => {
    calls.push(["debugger.attach", tabId, "1.3"]);
    throw new Error("Another debugger is already attached");
  };
  api.sendCommand = async ({ tabId }, method) => {
    calls.push(["debugger.send", tabId, method]);
    throw new Error("Debugger is not attached to the tab");
  };
  const controller = createDebuggerController({
    debuggerApi: api,
    installMonitor: async () => {},
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  await assert.rejects(controller.ensure(11), /Debugger is not attached/);

  assert.equal(controller.attachedTabs.has(11), false);
  assert.equal(controller.controlledTabs.has(11), false);
  assert.equal(calls.some(([name]) => name === "debugger.detach"), false);
  assert.deepEqual(calls.at(-1), ["monitor.remove", 11]);
});

test("detach removes the debugger and monitor even when cleanup is retried", async () => {
  const calls = [];
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => {},
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });
  await controller.ensure(12);

  await controller.detach(12);
  await controller.detach(12);

  assert.equal(controller.attachedTabs.has(12), false);
  assert.equal(controller.controlledTabs.has(12), false);
  assert.equal(calls.filter(([name]) => name === "debugger.detach").length, 1);
  assert.equal(calls.filter(([name]) => name === "monitor.remove").length, 2);
});

test("an onDetach event during initialization cannot create a ghost attachment", async () => {
  const calls = [];
  let controller;
  const api = debuggerApi(calls);
  api.sendCommand = async ({ tabId }, method) => {
    calls.push(["debugger.send", tabId, method]);
    if (method === "Runtime.enable") controller.handleDetached(tabId);
  };
  controller = createDebuggerController({
    debuggerApi: api,
    installMonitor: async () => {},
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  await assert.rejects(controller.ensure(14), { code: "DEBUGGER_INITIALIZATION_CANCELLED" });

  assert.equal(controller.attachedTabs.has(14), false);
  assert.equal(controller.controlledTabs.has(14), false);
  assert.ok(calls.some(([name]) => name === "debugger.detach"));
});

test("detach invalidates an in-flight monitor installation before attach", async () => {
  const calls = [];
  let releaseMonitor;
  let monitorStarted;
  const started = new Promise((resolve) => { monitorStarted = resolve; });
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => {
      calls.push(["monitor.install"]);
      monitorStarted();
      await new Promise((resolve) => { releaseMonitor = resolve; });
    },
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });

  const ensure = controller.ensure(15);
  await started;
  const detach = controller.detach(15);
  releaseMonitor();
  await assert.rejects(ensure, { code: "DEBUGGER_INITIALIZATION_CANCELLED" });
  await detach;

  assert.equal(calls.some(([name]) => name === "debugger.attach"), false);
  assert.equal(controller.attachedTabs.has(15), false);
  assert.equal(controller.controlledTabs.has(15), false);
});

test("a new ensure waits until prior detach cleanup finishes", async () => {
  const calls = [];
  let releaseRemoval;
  let removalStarted;
  const started = new Promise((resolve) => { removalStarted = resolve; });
  let removalCount = 0;
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => calls.push(["monitor.install"]),
    removeMonitor: async () => {
      removalCount += 1;
      calls.push(["monitor.remove", removalCount]);
      if (removalCount === 1) {
        removalStarted();
        await new Promise((resolve) => { releaseRemoval = resolve; });
      }
    }
  });
  await controller.ensure(16);

  const detach = controller.detach(16);
  await started;
  const ensureAgain = controller.ensure(16);
  await Promise.resolve();
  assert.equal(calls.filter(([name]) => name === "debugger.attach").length, 1);

  releaseRemoval();
  await detach;
  await ensureAgain;

  assert.equal(calls.filter(([name]) => name === "debugger.attach").length, 2);
  assert.equal(controller.attachedTabs.has(16), true);
  assert.equal(controller.controlledTabs.has(16), true);
});

test("a new ensure waits for asynchronous onDetach monitor cleanup", async () => {
  const calls = [];
  let releaseRemoval;
  let removalStarted;
  const started = new Promise((resolve) => { removalStarted = resolve; });
  let monitorInstalled = false;
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => { monitorInstalled = true; },
    removeMonitor: async () => {
      removalStarted();
      await new Promise((resolve) => { releaseRemoval = resolve; });
      monitorInstalled = false;
    }
  });
  await controller.ensure(17);
  const cleanup = controller.handleDetached(17);
  await started;
  const reattach = controller.ensure(17);
  await Promise.resolve();
  assert.equal(calls.filter(([name]) => name === "debugger.attach").length, 1);
  releaseRemoval();
  await cleanup;
  await reattach;
  assert.equal(monitorInstalled, true);
  assert.equal(controller.attachedTabs.has(17), true);
});

test("a late detach event cancels a new initialization safely and permits retry", async () => {
  const calls = [];
  let controller;
  const api = debuggerApi(calls);
  let lateEvent = false;
  api.sendCommand = async ({ tabId }, method) => {
    calls.push(["debugger.send", tabId, method]);
    if (lateEvent && method === "Page.enable") {
      lateEvent = false;
      controller.handleDetached(tabId);
    }
  };
  controller = createDebuggerController({ debuggerApi: api, installMonitor: async () => {} });
  await controller.ensure(18);
  await controller.detach(18);
  lateEvent = true;
  await assert.rejects(controller.ensure(18), { code: "DEBUGGER_INITIALIZATION_CANCELLED" });
  assert.equal(controller.attachedTabs.has(18), false);
  await controller.ensure(18);
  assert.equal(controller.attachedTabs.has(18), true);
});

test("ensure waits for a navigation monitor refresh", async () => {
  const calls = [];
  let refreshStarted;
  let releaseRefresh;
  const started = new Promise((resolve) => { refreshStarted = resolve; });
  let installs = 0;
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => {
      installs += 1;
      if (installs === 2) {
        refreshStarted();
        await new Promise((resolve) => { releaseRefresh = resolve; });
      }
    }
  });
  await controller.ensure(19);
  const refresh = controller.refresh(19);
  await started;
  let operationReady = false;
  const operation = controller.ensure(19).then(() => { operationReady = true; });
  await Promise.resolve();
  assert.equal(operationReady, false);
  releaseRefresh();
  await Promise.all([refresh, operation]);
  assert.equal(operationReady, true);
});

test("a failed navigation refresh detaches and invalidates control", async () => {
  const calls = [];
  let installs = 0;
  const controller = createDebuggerController({
    debuggerApi: debuggerApi(calls),
    installMonitor: async () => {
      installs += 1;
      if (installs === 2) throw new Error("new document denied injection");
    },
    removeMonitor: async (tabId) => calls.push(["monitor.remove", tabId])
  });
  await controller.ensure(20);
  await assert.rejects(controller.refresh(20), /denied injection/);
  assert.equal(controller.attachedTabs.has(20), false);
  assert.equal(controller.controlledTabs.has(20), false);
  assert.ok(calls.some(([name]) => name === "debugger.detach"));
  await controller.ensure(20);
  assert.equal(controller.attachedTabs.has(20), true);
});

test("detach during an already-attached response cleans a session owned by this extension", async () => {
  const calls = [];
  let releaseAttach;
  let attachStarted;
  const started = new Promise((resolve) => { attachStarted = resolve; });
  const api = debuggerApi(calls);
  api.attach = async ({ tabId }) => {
    calls.push(["debugger.attach", tabId]);
    attachStarted();
    await new Promise((resolve) => { releaseAttach = resolve; });
    throw new Error("Another debugger is already attached");
  };
  const controller = createDebuggerController({ debuggerApi: api, installMonitor: async () => {} });
  const initialization = controller.ensure(21);
  await started;
  const detachment = controller.detach(21);
  releaseAttach();
  await assert.rejects(initialization, { code: "DEBUGGER_INITIALIZATION_CANCELLED" });
  await detachment;
  assert.ok(calls.some(([name]) => name === "debugger.detach"));
  assert.equal(controller.attachedTabs.has(21), false);
});

test("explicit detach waits for cleanup caused by a failed navigation refresh", async () => {
  const calls = [];
  let installs = 0;
  let detachStarted;
  let releaseDetach;
  const started = new Promise((resolve) => { detachStarted = resolve; });
  const api = debuggerApi(calls);
  api.detach = async ({ tabId }) => {
    calls.push(["debugger.detach", tabId]);
    detachStarted();
    await new Promise((resolve) => { releaseDetach = resolve; });
  };
  const controller = createDebuggerController({
    debuggerApi: api,
    installMonitor: async () => {
      installs += 1;
      if (installs === 2) throw new Error("refresh failed");
    }
  });
  await controller.ensure(22);
  const refresh = controller.refresh(22);
  await started;
  let explicitDetachDone = false;
  const explicitDetach = controller.detach(22).then(() => { explicitDetachDone = true; });
  await Promise.resolve();
  assert.equal(explicitDetachDone, false);
  releaseDetach();
  await assert.rejects(refresh, /refresh failed/);
  await explicitDetach;
  assert.equal(explicitDetachDone, true);
});

function debuggerApi(calls) {
  return {
    async attach({ tabId }, version) { calls.push(["debugger.attach", tabId, version]); },
    async sendCommand({ tabId }, method) { calls.push(["debugger.send", tabId, method]); },
    async detach({ tabId }) { calls.push(["debugger.detach", tabId]); }
  };
}
