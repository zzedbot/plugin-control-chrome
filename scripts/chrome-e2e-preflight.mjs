import assert from "node:assert/strict";
import manifest from "../extension/manifest.json" with { type: "json" };
import { VERSION } from "../src/version.mjs";

export async function verifyChromeRuntime(bridge) {
  const status = await bridge.call("bridge.getInfo");
  assert.equal(status.extensionConnected, true, "Chrome extension is not connected");
  const browser = await bridge.call("browser.getInfo");
  assert.equal(browser.version, manifest.version, "Reload Chrome: running extension differs from source");
  assert.equal(browser.compatibility?.foreignFrameMonitor, "remove-after-blank-v11", "Reload Chrome: foreign-frame monitor code is stale");
  assert.equal(browser.compatibility?.debuggerState, "generation-v4", "Reload Chrome: debugger controller code is stale");
  assert.equal(status.version, VERSION, "Reinstall the native host and reconnect Chrome: running host differs from source");
  return { hostVersion: status.version, extensionVersion: browser.version, compatibility: browser.compatibility };
}
