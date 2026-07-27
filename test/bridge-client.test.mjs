import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { connectBridge, listBridgeInstances } from "../src/bridge-client.mjs";

test("read-only discovery retains an unreachable runtime descriptor", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory);

    assert.deepEqual(await listBridgeInstances({ cleanupStale: false }), []);
    await fs.access(descriptorPath);
  });
});

test("ordinary discovery removes an unreachable runtime descriptor by default", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory);

    assert.deepEqual(await listBridgeInstances(), []);
    await assert.rejects(() => fs.access(descriptorPath), { code: "ENOENT" });
  });
});

test("read-only connection discovery retains an unreachable runtime descriptor", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory);

    await assert.rejects(
      () => connectBridge({ cleanupStale: false }),
      (error) => error.code === "BRIDGE_NOT_FOUND"
    );
    await fs.access(descriptorPath);
  });
});

async function withRuntimeDirectory(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-bridge-client-"));
  const previousHome = process.env.UNIVERSAL_BROWSER_BRIDGE_HOME;
  process.env.UNIVERSAL_BROWSER_BRIDGE_HOME = root;
  try {
    const runtimeDirectory = path.join(root, "runtime");
    await fs.mkdir(runtimeDirectory);
    return await run(runtimeDirectory);
  } finally {
    if (previousHome === undefined) delete process.env.UNIVERSAL_BROWSER_BRIDGE_HOME;
    else process.env.UNIVERSAL_BROWSER_BRIDGE_HOME = previousHome;
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeUnreachableDescriptor(runtimeDirectory) {
  const descriptorPath = path.join(runtimeDirectory, "bridge-1.json");
  await fs.writeFile(descriptorPath, JSON.stringify({ instanceId: "stale", endpoint: "" }));
  return descriptorPath;
}
