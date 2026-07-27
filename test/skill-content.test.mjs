import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

async function listActualMcpTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, "src", "mcp-server.mjs")], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out reading tools/list: ${stderr}`));
    }, 2000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timer);
      child.kill();
      try {
        const response = JSON.parse(stdout.slice(0, newline));
        resolve(response.result.tools);
      } catch (error) {
        reject(error);
      }
    });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.stdin.end(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`);
  });
}

function parseParameterCell(cell) {
  if (cell === "—") return [];
  const names = [...cell.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)].map((match) => match[1]);
  assert.ok(names.length > 0, `parameter cell is structured: ${cell}`);
  return names.sort();
}

function parseToolCatalog(reference) {
  const section = reference.match(/^## Tool mapping\r?\n([\s\S]*?)(?=^## |\Z)/m)?.[1] ?? "";
  const catalog = new Map();
  for (const line of section.split(/\r?\n/)) {
    if (!/^\| `[^`]+` \|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 6, `six structured columns: ${line}`);
    const [toolCell, mappingCell, requiredCell, optionalCell, result, boundary] = cells;
    const name = toolCell.match(/^`([^`]+)`$/)?.[1];
    assert.ok(name && !catalog.has(name), `unique structured tool row: ${toolCell}`);
    const mapping = mappingCell.match(/^`([^`]+)`$/)?.[1];
    assert.ok(mapping, `structured Bridge mapping: ${mappingCell}`);
    assert.notEqual(result, "", `result summary for ${name}`);
    assert.notEqual(result, "—", `result summary for ${name}`);
    assert.notEqual(boundary, "", `usage boundary for ${name}`);
    catalog.set(name, {
      mapping,
      required: parseParameterCell(requiredCell),
      optional: parseParameterCell(optionalCell),
      result
    });
  }
  return catalog;
}

function declaredToolMappings(source) {
  const mappings = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/tool\("([a-z0-9_]+)",\s*"[^"]*",\s*(?:null|"([A-Za-z0-9.]+)")/);
    if (match) mappings.set(match[1], match[2] ?? "instances");
  }
  return mappings;
}

function parseTroubleshootingErrors(reference) {
  const section = reference.match(/^## Error handling\r?\n([\s\S]*?)(?=^## |\Z)/m)?.[1] ?? "";
  const errors = new Map();
  for (const line of section.split(/\r?\n/)) {
    if (!/^\| `[A-Z0-9_]+` \|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 3, `three structured error columns: ${line}`);
    const code = cells[0].match(/^`([A-Z0-9_]+)`$/)?.[1];
    assert.ok(code && !errors.has(code), `unique structured error row: ${cells[0]}`);
    assert.notEqual(cells[1], "", `meaning for ${code}`);
    assert.notEqual(cells[2], "", `smallest safe response for ${code}`);
    errors.set(code, { meaning: cells[1], response: cells[2] });
  }
  return errors;
}

function containsRelativeScriptInvocation(value) {
  return [
    /node\s+["']?(?:\.[\\/])?scripts[\\/](?:invoke|doctor)\.mjs/i,
    /node\s+(?:invoke|doctor)\.mjs/i,
    /(?:run|invoke)\s+`(?:\.[\\/])?(?:scripts[\\/])?(?:invoke|doctor)\.mjs`/i
  ].some((pattern) => pattern.test(value));
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

test("tool reference structurally matches MCP schemas and Bridge mappings", async () => {
  const source = await readFile(join(repoRoot, "src/mcp-server.mjs"), "utf8");
  const reference = await readFile(join(skillRoot, "references/tools.md"), "utf8");
  const api = await readFile(join(repoRoot, "docs/API.md"), "utf8");
  const tools = await listActualMcpTools();
  const catalog = parseToolCatalog(reference);
  const mappings = declaredToolMappings(source);
  const apiMethods = new Set([...api.matchAll(/`([a-z]+\.[A-Za-z][A-Za-z0-9]*)`/g)].map((match) => match[1]));

  assert.match(reference, /preferred MCP server is `universalChrome`/i);
  assert.deepEqual([...catalog.keys()].sort(), tools.map((tool) => tool.name).sort());
  assert.deepEqual([...mappings.keys()].sort(), tools.map((tool) => tool.name).sort());

  for (const tool of tools) {
    const row = catalog.get(tool.name);
    const required = [...(tool.inputSchema.required ?? [])].sort();
    const optional = Object.keys(tool.inputSchema.properties ?? {})
      .filter((name) => !required.includes(name))
      .sort();
    assert.equal(row.mapping, mappings.get(tool.name), `${tool.name} Bridge mapping`);
    assert.deepEqual(row.required, required, `${tool.name} required parameters`);
    assert.deepEqual(row.optional, optional, `${tool.name} optional parameters`);
    if (row.mapping !== "instances") {
      assert.equal(apiMethods.has(row.mapping), true, `${row.mapping} is documented in docs/API.md`);
    }
  }
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
  assert.match(skill, /resolve CLI entrypoints from the loaded Skill root/i);

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

test("CLI entrypoints resolve from the loaded Skill root, not the Bridge project root", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
  const tools = await readFile(join(skillRoot, "references/tools.md"), "utf8");

  assert.match(skill, /resolve CLI entrypoints from the loaded Skill root[^\n]*directory containing `SKILL\.md`/i);
  assert.match(tools, /`<skill-root>`[^\n]*directory containing the loaded `SKILL\.md`/i);
  assert.match(tools, /Bridge project[^\n]*separately[^\n]*searching upward/i);
  assert.match(tools, /UNIVERSAL_CHROME_BRIDGE_ROOT/);
  assert.match(tools, /node "<skill-root>\/scripts\/invoke\.mjs" instances/);
  assert.doesNotMatch(tools, /run `node scripts\/invoke\.mjs/);
});

test("instance selection happens before MCP status can cache a connection", async () => {
  const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");

  const listInstances = skill.indexOf("`bridge_list_instances`");
  const bridgeStatus = skill.indexOf("`bridge_status`", listInstances + 1);
  assert.ok(listInstances >= 0 && bridgeStatus > listInstances, "list instances before bridge status");
  assert.match(
    skill,
    /multiple instances[^\n]*no (?:user-)?confirmed or preconfigured[^\n]*stop/i
  );
  assert.match(
    skill,
    /MCP server process[^\n]*`UNIVERSAL_BROWSER_INSTANCE_ID`[^\n]*(?:restart|reconnect)[^\n]*before `bridge_status`/i
  );
  assert.match(
    skill,
    /CLI[^\n]*set `UNIVERSAL_BROWSER_INSTANCE_ID`[^\n]*before each invocation/i
  );
});

test("troubleshooting defines stable wrapper errors and minimal safe recovery", async () => {
  const troubleshooting = await readFile(join(skillRoot, "references", "troubleshooting.md"), "utf8");
  const errors = parseTroubleshootingErrors(troubleshooting);
  const required = {
    BRIDGE_ROOT_NOT_FOUND: {
      meaning: /Bridge project root/i,
      response: /`UNIVERSAL_CHROME_BRIDGE_ROOT`[^.]*verified/i
    },
    INVALID_ARGUMENTS: {
      meaning: /CLI[^.]*arguments|arguments[^.]*CLI/i,
      response: /usage[^.]*correct/i
    },
    INVOCATION_FAILED: {
      meaning: /invocation wrapper|Bridge Client/i,
      response: /doctor\.mjs[^.]*read-only|read-only[^.]*doctor\.mjs/i
    },
    BRIDGE_CLIENT_UNAVAILABLE: {
      meaning: /required Bridge Client exports/i,
      response: /repository installation/i
    },
    BRIDGE_INSTANCES_INVALID: {
      meaning: /instance list[^.]*array|array[^.]*instance list/i,
      response: /version[^.]*Bridge Client|Bridge Client[^.]*version/i
    }
  };

  for (const [code, contract] of Object.entries(required)) {
    assert.equal(errors.has(code), true, `${code} is documented`);
    assert.match(errors.get(code).meaning, contract.meaning);
    assert.match(errors.get(code).response, contract.response);
  }
});

test("all documented CLI invocations use an absolute loaded Skill root", async () => {
  const paths = [
    "SKILL.md",
    "references/tools.md",
    "references/troubleshooting.md"
  ];
  const documents = await Promise.all(paths.map(async (path) => ({
    path,
    text: await readFile(join(skillRoot, path), "utf8")
  })));
  const troubleshooting = documents.find(({ path }) => path.endsWith("troubleshooting.md")).text;

  assert.match(
    troubleshooting,
    /`<skill-root>`[^\n]*absolute directory containing the loaded `SKILL\.md`/i
  );
  assert.match(troubleshooting, /node "<skill-root>\/scripts\/invoke\.mjs"/);
  assert.match(troubleshooting, /node "<skill-root>\/scripts\/doctor\.mjs"/);

  for (const typo of [
    "node scripts/invoke.mjs instances",
    "node .\\scripts\\invoke.mjs instances",
    "node ./scripts/invoke.mjs instances",
    "node scripts/doctor.mjs",
    "node .\\scripts\\doctor.mjs",
    "node doctor.mjs",
    "Run `doctor.mjs`"
  ]) assert.equal(containsRelativeScriptInvocation(typo), true, `detects relative typo: ${typo}`);

  for (const { path, text } of documents) {
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      assert.equal(containsRelativeScriptInvocation(line), false, `${path}:${index + 1} uses absolute entrypoint`);
    }
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
