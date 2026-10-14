import os from "node:os";
import path from "node:path";

export const HOST_NAME = "org.universal_browser.bridge";

export function dataDirectory() {
  if (process.env.UNIVERSAL_BROWSER_BRIDGE_HOME) return path.resolve(process.env.UNIVERSAL_BROWSER_BRIDGE_HOME);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "UniversalBrowserBridge");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "UniversalBrowserBridge");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "universal-browser-bridge");
}

export function runtimeDirectory() {
  return path.join(dataDirectory(), "runtime");
}

export function policyPath() {
  return path.join(dataDirectory(), "policy.json");
}
