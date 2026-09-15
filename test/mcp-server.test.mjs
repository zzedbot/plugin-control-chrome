import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { VERSION } from "../src/version.mjs";

test("MCP server initializes and lists browser tools", async (t) => {
  const child = spawn(process.execPath, [path.resolve("src/mcp-server.mjs")], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => child.kill());
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const responses = [];
  lines.on("line", (line) => responses.push(JSON.parse(line)));

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  await waitUntil(() => responses.length === 2);

  assert.equal(responses[0].result.serverInfo.name, "universal-chrome-agent-bridge");
  assert.equal(responses[0].result.serverInfo.version, VERSION);
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "browser_dom_snapshot"));
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "policy_allow_host"));
});

test("MCP instance listing exposes only stable public descriptor fields", async (t) => {
  const bridgeHome = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-mcp-"));
  const runtimeDirectory = path.join(bridgeHome, "runtime");
  await fs.mkdir(runtimeDirectory);
  const endpoint = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    endpoint.once("error", reject);
    endpoint.listen(0, "127.0.0.1", resolve);
  });
  const address = endpoint.address();
  const descriptor = {
    instanceId: "chrome-a",
    pid: 1234,
    transport: "local-pipe",
    nativeHostName: "org.universal_browser.bridge",
    startedAt: "2026-07-27T00:00:00.000Z",
    endpoint: { host: "127.0.0.1", port: address.port },
    token: "top-level-secret",
    diagnostics: { token: "nested-secret", futureField: true },
    futureField: "future-secret",
    schemaVersion: 99
  };
  await fs.writeFile(path.join(runtimeDirectory, "bridge-1234.json"), JSON.stringify(descriptor));

  const child = spawn(process.execPath, [path.resolve("src/mcp-server.mjs")], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: bridgeHome },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => {
    child.kill();
    await new Promise((resolve) => endpoint.close(resolve));
    await fs.rm(bridgeHome, { recursive: true, force: true });
  });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  const responses = [];
  lines.on("line", (line) => responses.push(JSON.parse(line)));

  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "bridge_list_instances", arguments: {} }
  })}\n`);
  await waitUntil(() => responses.length === 1);

  const instances = JSON.parse(responses[0].result.content[0].text);
  assert.deepEqual(instances, [{
    instanceId: "chrome-a",
    pid: 1234,
    transport: "local-pipe",
    nativeHostName: "org.universal_browser.bridge",
    startedAt: "2026-07-27T00:00:00.000Z"
  }]);
  assert.doesNotMatch(responses[0].result.content[0].text, /secret|token|endpoint|futureField|schemaVersion/);
});

async function waitUntil(predicate, timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for child process output");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
