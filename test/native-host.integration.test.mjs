import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BridgeClient } from "../src/bridge-client.mjs";
import { NativeMessageDecoder, encodeNativeMessage } from "../src/native-framing.mjs";
import { VERSION } from "../src/version.mjs";

test("native host publishes an authenticated pipe and accepts bridge RPC", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-host-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: taskDir },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => {
    child.stdin.end();
    child.kill();
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const client = new BridgeClient(descriptor);
  const info = await client.call("bridge.getInfo");

  assert.equal(info.extensionConnected, true);
  assert.equal(info.version, VERSION);
  assert.equal(info.extension.extensionId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(info.transport.type, "local-pipe-jsonrpc");

  const nativeRequest = nextNativeMessage(child.stdout);
  const browserInfoPromise = client.call("browser.getInfo");
  const request = await nativeRequest;
  assert.equal(request.method, "browser.getInfo");
  child.stdin.write(encodeNativeMessage({ type: "response", id: request.id, result: { name: "Test Chrome", type: "extension" } }));
  assert.deepEqual(await browserInfoPromise, { name: "Test Chrome", type: "extension" });
});

async function waitForDescriptor(directory, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const name = (await fs.readdir(directory)).find((entry) => /^bridge-\d+\.json$/.test(entry));
      if (name) return path.join(directory, name);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Native host did not publish a runtime descriptor");
}

function nextNativeMessage(stream) {
  const decoder = new NativeMessageDecoder();
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      try {
        const [message] = decoder.push(chunk);
        if (!message) return;
        stream.off("data", onData);
        resolve(message);
      } catch (error) {
        stream.off("data", onData);
        reject(error);
      }
    };
    stream.on("data", onData);
  });
}
