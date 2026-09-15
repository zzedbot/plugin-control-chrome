import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BridgeClient } from "../src/bridge-client.mjs";
import { encodeNativeMessage } from "../src/native-framing.mjs";
import { VERSION } from "../src/version.mjs";

test("built Native Messaging executable starts and exposes bridge status", async (t) => {
  const executable = path.resolve("dist", process.platform === "win32" ? "universal-browser-host.exe" : "universal-browser-host");
  try { await fs.access(executable); } catch { return t.skip("native host has not been built"); }

  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-sea-test-"));
  const child = spawn(executable, [], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: taskDir },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  t.after(async () => {
    child.stdin.end();
    child.kill();
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", extensionVersion: "sea-test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"), () => stderr);
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const info = await new BridgeClient(descriptor).call("bridge.getInfo");

  assert.equal(info.extensionConnected, true);
  assert.equal(info.version, VERSION, "Rebuild the native host after a version change");
  assert.equal(info.extension.extensionVersion, "sea-test");
});

async function waitForDescriptor(directory, readStderr, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const name = (await fs.readdir(directory)).find((entry) => /^bridge-\d+\.json$/.test(entry));
      if (name) return path.join(directory, name);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Native host executable did not publish a descriptor. stderr: ${readStderr()}`);
}
