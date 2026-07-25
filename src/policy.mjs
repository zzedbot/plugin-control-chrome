import fs from "node:fs/promises";
import path from "node:path";
import { policyPath } from "./runtime-paths.mjs";

const DEFAULT_POLICY = Object.freeze({
  allowAll: false,
  allowSensitiveMetadata: false,
  allowedHosts: ["localhost", "127.0.0.1", "::1"],
  blockedHosts: [],
  allowedCdpMethods: [
    "Accessibility.getFullAXTree",
    "DOM.getDocument",
    "DOM.querySelector",
    "DOM.resolveNode",
    "DOM.setFileInputFiles",
    "Network.getResponseBody",
    "Page.captureScreenshot",
    "Page.getLayoutMetrics",
    "Runtime.callFunctionOn",
    "Runtime.evaluate"
  ]
});

export async function loadPolicy() {
  try {
    const parsed = JSON.parse(await fs.readFile(policyPath(), "utf8"));
    return normalizePolicy(parsed);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return structuredClone(DEFAULT_POLICY);
  }
}

export async function savePolicy(policy) {
  const normalized = normalizePolicy(policy);
  await fs.mkdir(path.dirname(policyPath()), { recursive: true });
  await fs.writeFile(policyPath(), `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return normalized;
}

export function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) throw new Error("Host is required");
  if (raw.includes("://")) return new URL(raw).hostname.toLowerCase();
  return raw.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

export function isHostAllowed(policy, value) {
  const host = normalizeHost(value);
  if (matchesHostList(host, policy.blockedHosts)) return false;
  return policy.allowAll || matchesHostList(host, policy.allowedHosts);
}

export function assertUrlAllowed(policy, value) {
  const url = new URL(value);
  if (url.protocol === "about:" && url.href === "about:blank") return;
  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(new Error(`Unsupported URL protocol: ${url.protocol}`), { code: "UNSUPPORTED_PROTOCOL" });
  }
  if (!isHostAllowed(policy, url.hostname)) {
    throw Object.assign(new Error(`Site approval required for ${url.hostname}`), {
      code: "SITE_APPROVAL_REQUIRED",
      data: { host: url.hostname }
    });
  }
}

export function assertCdpAllowed(policy, method) {
  if (!policy.allowedCdpMethods.includes(method)) {
    throw Object.assign(new Error(`CDP method is not allowed: ${method}`), { code: "CDP_METHOD_BLOCKED" });
  }
}

function normalizePolicy(policy = {}) {
  return {
    allowAll: policy.allowAll === true,
    allowSensitiveMetadata: policy.allowSensitiveMetadata === true,
    allowedHosts: uniqueHosts(policy.allowedHosts ?? DEFAULT_POLICY.allowedHosts),
    blockedHosts: uniqueHosts(policy.blockedHosts ?? []),
    allowedCdpMethods: [...new Set((policy.allowedCdpMethods ?? DEFAULT_POLICY.allowedCdpMethods).map(String))].sort()
  };
}

function uniqueHosts(values) {
  return [...new Set(values.map(normalizeHost))].sort();
}

function matchesHostList(host, values) {
  return values.some((entry) => host === entry || host.endsWith(`.${entry}`));
}
