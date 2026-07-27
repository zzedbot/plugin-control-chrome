#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { locateBridgeRoot, loadClient } from "./invoke.mjs";

const requiredMajor = 22;

export async function runDiagnostics(options = {}) {
  const env = options.env ?? process.env;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const report = {
    ok: false,
    node: nodeCheck(nodeVersion),
    bridgeRoot: undefined,
    bridgeClient: undefined,
    instances: undefined,
    connection: undefined
  };

  let bridgeRoot;
  try {
    bridgeRoot = await (options.locateBridgeRoot ?? locateBridgeRoot)({
      env,
      cwd: options.cwd,
      scriptDir: options.scriptDir
    });
    report.bridgeRoot = { ok: true, path: bridgeRoot };
  } catch (error) {
    report.bridgeRoot = failedCheck(error);
    report.bridgeClient = skippedCheck("bridge root unavailable");
    report.instances = skippedCheck("bridge root unavailable");
    report.connection = skippedCheck("bridge root unavailable");
    return finalize(report);
  }

  let client;
  try {
    client = await (options.loadClient ?? loadClient)(bridgeRoot);
    if (typeof client.listBridgeInstances !== "function" || typeof client.connectBridge !== "function") {
      throw Object.assign(new Error("Bridge Client exports are unavailable."), { code: "BRIDGE_CLIENT_UNAVAILABLE" });
    }
    report.bridgeClient = { ok: true };
  } catch (error) {
    report.bridgeClient = failedCheck(error);
    report.instances = skippedCheck("bridge client unavailable");
    report.connection = skippedCheck("bridge client unavailable");
    return finalize(report);
  }

  let instances;
  try {
    instances = await client.listBridgeInstances({ cleanupStale: false });
    if (!Array.isArray(instances)) {
      throw Object.assign(new Error("Bridge Client returned invalid instances."), { code: "BRIDGE_INSTANCES_INVALID" });
    }
  } catch (error) {
    report.instances = failedCheck(error);
    report.connection = skippedCheck("bridge instances unavailable");
    return finalize(report);
  }

  if (instances.length === 0) {
    report.instances = { ok: false, count: 0 };
    report.connection = skippedCheck("no bridge instances found");
    return finalize(report);
  }

  const selectedInstanceId = env.UNIVERSAL_BROWSER_INSTANCE_ID;
  const instance = selectedInstanceId
    ? instances.find((item) => item?.instanceId === selectedInstanceId)
    : instances[0];
  report.instances = {
    ok: true,
    count: instances.length,
    selectedInstanceId: instance?.instanceId ?? selectedInstanceId
  };

  if (!instance) {
    report.instances.ok = false;
    report.connection = skippedCheck("selected bridge instance unavailable");
    return finalize(report);
  }

  try {
    const bridge = await client.connectBridge({ instanceId: instance.instanceId, cleanupStale: false });
    const status = await bridge.call("bridge.getInfo", {});
    const extensionConnected = status?.extensionConnected === true;
    report.connection = {
      ok: extensionConnected,
      instanceId: instance.instanceId,
      extensionConnected
    };
  } catch (error) {
    report.connection = failedCheck(error, { instanceId: instance.instanceId });
  }

  return finalize(report);
}

function nodeCheck(version) {
  const major = Number.parseInt(String(version).split(".", 1)[0], 10);
  return { ok: Number.isInteger(major) && major >= requiredMajor, version, requiredMajor };
}

function failedCheck(error, details = {}) {
  return {
    ok: false,
    ...details,
    ...(error?.code === undefined ? {} : { code: error.code })
  };
}

function skippedCheck(reason) {
  return { ok: false, skipped: true, reason };
}

function finalize(report) {
  report.ok = report.node.ok
    && report.bridgeRoot.ok
    && report.bridgeClient.ok
    && report.instances.ok
    && report.connection.ok;
  return report;
}

async function main() {
  const report = await runDiagnostics();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
