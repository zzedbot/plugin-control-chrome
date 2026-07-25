import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

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
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "browser_dom_snapshot"));
  assert.ok(responses[1].result.tools.some((tool) => tool.name === "policy_allow_host"));
});

async function waitUntil(predicate, timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for child process output");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
