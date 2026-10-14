import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doctorUrl = pathToFileURL(
  path.join(workspaceRoot, "skills", "lingee-chrome-control", "scripts", "doctor.mjs")
).href;

async function doctorModule() {
  return import(doctorUrl);
}

function diagnosticDependencies(overrides = {}) {
  const instances = [{ instanceId: "chrome-a", startedAt: "2026-07-27T00:00:00.000Z" }];
  return {
    nodeVersion: process.versions.node,
    env: {},
    resolveClient: async () => ({
      source: "injected",
      client: {
        listBridgeInstances: async () => instances,
        connectBridge: async () => ({
          call: async () => ({ extensionConnected: true })
        })
      }
    }),
    ...overrides
  };
}

function assertReadOnlyDependencies(dependencies) {
  for (const key of Object.keys(dependencies)) {
    assert.doesNotMatch(key, /install|start|policy|browser|mutat/i);
  }
}

test("reports a healthy read-only bridge diagnostic", async () => {
  const { runDiagnostics } = await doctorModule();
  const dependencies = diagnosticDependencies();
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.node, { ok: true, version: process.versions.node, requiredMajor: 22 });
  assert.equal(report.bridgeClient.ok, true);
  assert.equal(report.bridgeClient.source, "injected");
  assert.equal(report.instances.count, 1);
  assert.equal(report.connection.ok, true);
  assert.equal(report.ok, true);
});

test("reports an unsupported Node version without mutating the bridge", async () => {
  const { runDiagnostics } = await doctorModule();
  const dependencies = diagnosticDependencies({ nodeVersion: "21.9.0" });
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.node, { ok: false, version: "21.9.0", requiredMajor: 22 });
  assert.equal(report.ok, false);
});

test("skips dependent checks when the bundled bridge client is unavailable", async () => {
  const { runDiagnostics } = await doctorModule();
  const clientError = Object.assign(new Error("Bridge client not found"), { code: "BRIDGE_CLIENT_UNAVAILABLE" });
  const dependencies = diagnosticDependencies({
    resolveClient: async () => { throw clientError; }
  });
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.bridgeClient, { ok: false, code: "BRIDGE_CLIENT_UNAVAILABLE" });
  assert.deepEqual(report.instances, { ok: false, skipped: true, reason: "bridge client unavailable" });
  assert.deepEqual(report.connection, { ok: false, skipped: true, reason: "bridge client unavailable" });
  assert.equal(report.ok, false);
});

test("reports zero instances without connecting or starting a process", async () => {
  const { runDiagnostics } = await doctorModule();
  let connectCalls = 0;
  const dependencies = diagnosticDependencies({
    resolveClient: async () => ({ source: "injected", client: {
      listBridgeInstances: async () => [],
      connectBridge: async () => { connectCalls += 1; }
    } })
  });
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.instances, { ok: false, count: 0 });
  assert.deepEqual(report.connection, { ok: false, skipped: true, reason: "no bridge instances found" });
  assert.equal(connectCalls, 0);
  assert.equal(report.ok, false);
});

test("reports a connected bridge whose extension is disconnected", async () => {
  const { runDiagnostics } = await doctorModule();
  const dependencies = diagnosticDependencies({
    resolveClient: async () => ({ source: "injected", client: {
      listBridgeInstances: async () => [{ instanceId: "chrome-a", startedAt: "2026-07-27T00:00:00.000Z" }],
      connectBridge: async () => ({
        call: async (method, params) => {
          assert.equal(method, "bridge.getInfo");
          assert.deepEqual(params, {});
          return { extensionConnected: false };
        }
      })
    } })
  });
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.connection, {
    ok: false,
    instanceId: "chrome-a",
    extensionConnected: false
  });
  assert.equal(report.ok, false);
});

test("uses read-only discovery and connection options for the requested instance", async () => {
  const { runDiagnostics } = await doctorModule();
  const discoveryOptions = [];
  const connectionOptions = [];
  const dependencies = diagnosticDependencies({
    env: { UNIVERSAL_BROWSER_INSTANCE_ID: "chrome-b" },
    resolveClient: async () => ({ source: "injected", client: {
      listBridgeInstances: async (options) => {
        discoveryOptions.push(options);
        return [
          { instanceId: "chrome-a", startedAt: "2026-07-27T00:00:00.000Z" },
          { instanceId: "chrome-b", startedAt: "2026-07-27T00:00:01.000Z" }
        ];
      },
      connectBridge: async (options) => {
        connectionOptions.push(options);
        return { call: async () => ({ extensionConnected: true }) };
      }
    } })
  });
  assertReadOnlyDependencies(dependencies);

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(discoveryOptions, [{ cleanupStale: false }]);
  assert.deepEqual(connectionOptions, [{ instanceId: "chrome-b", cleanupStale: false }]);
  assert.equal(report.connection.instanceId, "chrome-b");
  assert.equal(report.ok, true);
});

test("does not connect when multiple instances exist without explicit selection", async () => {
  const { runDiagnostics } = await doctorModule();
  let connectCalls = 0;
  const dependencies = diagnosticDependencies({
    resolveClient: async () => ({ source: "injected", client: {
      listBridgeInstances: async () => [{ instanceId: "chrome-a" }, { instanceId: "chrome-b" }],
      connectBridge: async () => { connectCalls += 1; }
    } })
  });

  const report = await runDiagnostics(dependencies);

  assert.deepEqual(report.instances, {
    ok: false,
    count: 2,
    code: "BRIDGE_INSTANCE_SELECTION_REQUIRED"
  });
  assert.deepEqual(report.connection, {
    ok: false,
    skipped: true,
    reason: "multiple bridge instances require explicit selection"
  });
  assert.equal(connectCalls, 0);
  assert.equal(report.ok, false);
});

test("CLI emits exactly one JSON diagnostic report", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "universal-chrome-doctor-"));
  try {
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "lingee-chrome-agent-bridge" }));
    await writeFile(
      path.join(root, "src", "bridge-client.mjs"),
      "export async function listBridgeInstances() { return [{ instanceId: 'chrome-a' }]; }\n"
        + "export async function connectBridge() { return { call: async () => ({ extensionConnected: true }) }; }\n"
    );
    const result = await runNode([fileURLToPath(doctorUrl)], {
      env: { ...process.env, UNIVERSAL_CHROME_BRIDGE_ROOT: root }
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, true);
    assert.equal(result.stdout, `${JSON.stringify(report)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}
