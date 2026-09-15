import test from "node:test";
import assert from "node:assert/strict";
import { verifyChromeRuntime } from "../scripts/chrome-e2e-preflight.mjs";
import { VERSION } from "../src/version.mjs";

const compatibility = { foreignFrameMonitor: "remove-after-blank-v11", debuggerState: "generation-v4", virtualCursor: "overlay-v3" };
const capabilities = ["virtualCursor"];
function fixture(browser, connected = true, hostVersion = VERSION) {
  const calls = [];
  return {
    calls,
    async call(method) {
      calls.push(method);
      if (method === "bridge.getInfo") return { extensionConnected: connected, version: hostVersion };
      if (method === "browser.getInfo") return browser;
      throw new Error(`Unexpected browser mutation: ${method}`);
    }
  };
}

test("E2E preflight rejects old code before opening a test tab", async () => {
  for (const browser of [
    { version: "0.1.1", compatibility, capabilities },
    { version: VERSION, capabilities },
    { version: VERSION, compatibility: { ...compatibility, debuggerState: "old" }, capabilities }
  ]) {
    const bridge = fixture(browser);
    await assert.rejects(verifyChromeRuntime(bridge), /Reload Chrome/);
    assert.deepEqual(bridge.calls, ["bridge.getInfo", "browser.getInfo"]);
  }
});

test("E2E preflight stops at a disconnected extension", async () => {
  const bridge = fixture({}, false);
  await assert.rejects(verifyChromeRuntime(bridge), /not connected/);
  assert.deepEqual(bridge.calls, ["bridge.getInfo"]);
});

test("E2E preflight returns running version evidence", async () => {
  const bridge = fixture({ version: VERSION, compatibility, capabilities });
  assert.deepEqual(await verifyChromeRuntime(bridge), {
    hostVersion: VERSION, extensionVersion: VERSION, compatibility
  });
});

test("E2E preflight rejects a stale installed native host", async () => {
  const bridge = fixture({ version: VERSION, compatibility, capabilities }, true, "0.1.0");
  await assert.rejects(verifyChromeRuntime(bridge), /Reinstall the native host/);
});
