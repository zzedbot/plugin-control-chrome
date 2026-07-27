import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(repoRoot, "skills", "control-universal-chrome");

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test("skill package contains required cross-tool files", async () => {
  for (const path of [
    "SKILL.md",
    "agents/openai.yaml",
    "references/tools.md",
    "references/security.md",
    "references/troubleshooting.md"
  ]) assert.equal(await exists(join(skillRoot, path)), true, path);
});

test("tool reference covers every exported MCP tool", async () => {
  const source = await readFile(join(repoRoot, "src/mcp-server.mjs"), "utf8");
  const toolNames = [...source.matchAll(/tool\("([a-z0-9_]+)"/g)].map((match) => match[1]);
  const reference = await readFile(join(skillRoot, "references/tools.md"), "utf8");
  for (const name of toolNames) assert.match(reference, new RegExp(`\\b${name}\\b`));
});

test("skill metadata and workflow expose the cross-tool contract", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const metadata = await readFile(join(skillRoot, "agents/openai.yaml"), "utf8");

  assert.match(skill, /^---\r?\nname: control-universal-chrome\r?\ndescription: Use when /);
  for (const resource of [
    "references/tools.md",
    "references/security.md",
    "references/troubleshooting.md",
    "scripts/invoke.mjs",
    "scripts/doctor.mjs"
  ]) assert.match(skill, new RegExp(resource.replaceAll(".", "\\.")));

  assert.doesNotMatch(skill, /scripts\/diagnose\.mjs/);
  assert.match(skill, /scripts are unavailable until later tasks create them; verify each file exists before invoking it\./i);

  const orderedDecisions = [
    "explicit Chrome intent",
    "purpose-built connector/API",
    "check bridge",
    "choose instance/tab",
    "check policy",
    "read state",
    "stable locator",
    "act",
    "read state again",
    "matching reference",
    "approval boundaries"
  ];
  let cursor = -1;
  for (const decision of orderedDecisions) {
    const next = skill.indexOf(decision, cursor + 1);
    assert.ok(next > cursor, `workflow decision is present in order: ${decision}`);
    cursor = next;
  }

  assert.match(metadata, /display_name: "通用 Chrome 控制"/);
  assert.match(metadata, /short_description: "通过标准 MCP 或命令行安全控制现有 Chrome"/);
  assert.match(metadata, /default_prompt: "Use \$control-universal-chrome to inspect and safely operate my existing Chrome tab\."/);
});

test("security contract requires approval and forbids secret-store access", async () => {
  const tools = await readFile(join(skillRoot, "references/tools.md"), "utf8");
  const security = await readFile(join(skillRoot, "references/security.md"), "utf8");
  const reference = `${tools}\n${security}`;

  for (const name of [
    "policy_set_allow_all",
    "policy_set_sensitive_metadata",
    "policy_allow_cdp_method",
    "browser_cdp",
    "browser_history_search",
    "browser_bookmark_search",
    "browser_downloads_search"
  ]) {
    assert.match(reference, new RegExp(`\\b${name}\\b[^\\n]*explicit user approval`, "i"));
  }

  for (const category of ["cookies", "passwords", "Local Storage", "profiles", "Session Storage"])
    assert.match(security, new RegExp(`\\b${category.replace(" ", "\\s+")}\\b`, "i"));

  assert.match(security, /login[^\n]*(?:stop|do not bypass)|(?:stop|do not bypass)[^\n]*login/i);
  assert.match(security, /CAPTCHA[^\n]*(?:stop|do not bypass)|(?:stop|do not bypass)[^\n]*CAPTCHA/i);
});

test("host approval discloses and authorizes subdomain scope", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const security = await readFile(join(skillRoot, "references/security.md"), "utf8");
  for (const content of [skill, security]) {
    assert.match(content, /host and its subdomains[^\n]*explicit[^\n]*approval/i);
  }
});

test("public skill does not depend on Codex-private browser runtime identifiers", async () => {
  const paths = [
    "SKILL.md",
    "references/tools.md",
    "references/security.md",
    "references/troubleshooting.md"
  ];
  const packageText = (await Promise.all(paths.map((path) => readFile(join(skillRoot, path), "utf8")))).join("\n");
  const withoutComparisonNotes = packageText.replace(/^## Comparison note\b[\s\S]*?(?=^## |\Z)/gim, "");
  assert.doesNotMatch(withoutComparisonNotes, /browser-client\.mjs|agent\.browsers|node_repl|mcp__node_repl/i);
});
