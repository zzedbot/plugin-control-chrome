import test from "node:test";
import assert from "node:assert/strict";
import { assertCdpAllowed, assertUrlAllowed, isHostAllowed } from "../src/policy.mjs";

const policy = {
  allowAll: false,
  allowedHosts: ["example.com"],
  blockedHosts: ["private.example.com"],
  allowedCdpMethods: ["Page.captureScreenshot"]
};

test("policy allows subdomains and gives blocklist precedence", () => {
  assert.equal(isHostAllowed(policy, "www.example.com"), true);
  assert.equal(isHostAllowed(policy, "private.example.com"), false);
  assert.equal(isHostAllowed(policy, "example.net"), false);
});

test("URL policy returns an actionable approval error", () => {
  assert.throws(() => assertUrlAllowed(policy, "https://example.net/path"), (error) => error.code === "SITE_APPROVAL_REQUIRED");
});

test("CDP policy uses an explicit allowlist", () => {
  assert.doesNotThrow(() => assertCdpAllowed(policy, "Page.captureScreenshot"));
  assert.throws(() => assertCdpAllowed(policy, "Browser.close"), (error) => error.code === "CDP_METHOD_BLOCKED");
});
