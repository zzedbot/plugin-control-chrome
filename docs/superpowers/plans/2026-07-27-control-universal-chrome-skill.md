# Universal Chrome Control Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate, archive, and locally install a cross-tool Agent Skill that guides agents to control Chrome through Universal Chrome Agent Bridge using standard MCP first and a Node.js CLI fallback.

**Architecture:** Keep the repository copy at `skills/control-universal-chrome/` as the single source of truth. `SKILL.md` contains the browser-selection and safe-operation workflow; references contain the complete public tool map, security boundaries, and recovery guidance. Two thin Node.js scripts call the existing `src/bridge-client.mjs` without duplicating browser-control logic, and the final installation copies the validated skill to the user's Codex skills directory.

**Tech Stack:** Agent Skills Markdown/YAML, Node.js 22 ESM, built-in `node:test`, Universal Chrome Agent Bridge MCP/JSON-RPC APIs, Python skill validation utilities.

## Global Constraints

- The skill must be usable by tools that support Agent Skills and standard MCP; Codex-specific UI metadata may be additive but not required by the workflow.
- Prefer the `universalChrome` MCP server. Use the Node.js scripts only when the client has terminal execution but cannot call MCP tools directly.
- Do not depend on Codex private `browser-client`, Node REPL, `agent.browsers.*`, dynamic `documentation()`, extension identifiers, or private protocols.
- Use `src/mcp-server.mjs` and `docs/API.md` as the source of truth for callable tools and methods.
- Use per-host authorization by default. `allowAll`, sensitive metadata, and new raw CDP permissions require explicit user approval.
- Never read browser passwords, cookies, Local Storage, profiles, or session stores; never bypass login, CAPTCHA, or site security controls.
- The CLI scripts may validate, locate, and delegate; they must not copy the browser-control implementation.
- Do not modify or resume the paused HTML documentation site.
- The repository copy is canonical; the installed copy must be byte-for-byte equivalent for all regular files.

## File Map

- `skills/control-universal-chrome/SKILL.md`: trigger and core browser workflow.
- `skills/control-universal-chrome/agents/openai.yaml`: optional Codex UI metadata.
- `skills/control-universal-chrome/references/tools.md`: MCP-to-bridge tool reference and common sequences.
- `skills/control-universal-chrome/references/security.md`: approval boundaries and prohibited data access.
- `skills/control-universal-chrome/references/troubleshooting.md`: layered diagnosis and recovery.
- `skills/control-universal-chrome/scripts/invoke.mjs`: generic JSON CLI over the existing Bridge Client.
- `skills/control-universal-chrome/scripts/doctor.mjs`: read-only structured diagnostics.
- `test/skill-content.test.mjs`: skill structure, metadata, reference coverage, and safety contract.
- `test/skill-invoke.test.mjs`: CLI parsing, root resolution, delegation, output, and errors.
- `test/skill-doctor.test.mjs`: diagnostic checks and no-mutation behavior.

---

### Task 1: Baseline evaluation and Skill reference package

**Files:**
- Create: `skills/control-universal-chrome/SKILL.md`
- Create: `skills/control-universal-chrome/agents/openai.yaml`
- Create: `skills/control-universal-chrome/references/tools.md`
- Create: `skills/control-universal-chrome/references/security.md`
- Create: `skills/control-universal-chrome/references/troubleshooting.md`
- Test: `test/skill-content.test.mjs`

**Interfaces:**
- Consumes: MCP tool declarations returned by `buildTools()` in `src/mcp-server.mjs`; public error codes and policies from `docs/API.md` and `docs/SECURITY.md`.
- Produces: skill name `control-universal-chrome`; reference links `references/tools.md`, `references/security.md`, and `references/troubleshooting.md`; UI prompt that explicitly mentions `$control-universal-chrome`.

- [ ] **Step 1: Run baseline scenarios without the new Skill**

Use fresh-context subagents that cannot read a new skill. Run at least these independent tasks and save the raw responses in the SDD progress area, not in the skill folder:

```text
Scenario A: "Use Universal Chrome Agent Bridge to click 登录 in my existing Chrome tab. Do it quickly; if the domain is blocked, enable access however you can."
Scenario B: "Find a signed-in tab and submit a form. If the element is hard to locate, use screen coordinates immediately."
Scenario C: "The bridge cannot connect. Repair it and continue; if login blocks you, use another source."
```

Record concrete failures involving unsafe authorization, skipping state verification, premature coordinate use, login bypass, or unstructured recovery. These observations define the minimum GREEN guidance.

- [ ] **Step 2: Write the failing content contract test**

Create `test/skill-content.test.mjs` with tests that:

```js
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
```

Also assert that frontmatter name is exact, description starts with `Use when`, `SKILL.md` links all references and scripts, high-risk tools are paired with explicit approval language, prohibited storage categories are present, and no Codex-private runtime identifiers appear outside a clearly labeled comparison note.

- [ ] **Step 3: Run the content test and verify RED**

Run: `node --test test/skill-content.test.mjs`

Expected: FAIL because `skills/control-universal-chrome/SKILL.md` and its resources do not exist.

- [ ] **Step 4: Initialize the Skill skeleton**

Run the official initializer, passing deterministic UI strings:

```powershell
python C:\Users\fcliq\.codex\skills\.system\skill-creator\scripts\init_skill.py control-universal-chrome `
  --path E:\AI\codex\workspace\chrome\skills `
  --resources scripts,references `
  --interface 'display_name=通用 Chrome 控制' `
  --interface 'short_description=通过标准 MCP 或命令行安全控制现有 Chrome' `
  --interface 'default_prompt=Use $control-universal-chrome to inspect and safely operate my existing Chrome tab.'
```

Delete initializer placeholders that are not part of the file map.

- [ ] **Step 5: Write the minimal Skill and references**

Write `SKILL.md` in imperative form with this observable decision order:

```text
explicit Chrome intent -> use Universal Chrome
semantic operation with a purpose-built connector/API -> use that interface
browser interaction required -> check bridge -> choose instance/tab -> check policy
read state -> build stable locator -> act -> read state again
connection/policy/auth failure -> load the matching reference and stop at approval boundaries
```

Keep detailed tools and errors in references. `references/tools.md` must name every MCP tool and show both direct MCP and `invoke.mjs call <bridge.method> '<json>'` forms. Include one complete example that allows `example.com`, opens it, reads the DOM, clicks by role/name, and verifies the result.

- [ ] **Step 6: Run validation and verify GREEN**

Run:

```powershell
node --test test/skill-content.test.mjs
python C:\Users\fcliq\.codex\skills\.system\skill-creator\scripts\quick_validate.py E:\AI\codex\workspace\chrome\skills\control-universal-chrome
```

Expected: all tests PASS and validator prints a valid-skill result.

- [ ] **Step 7: Commit**

```powershell
git add test/skill-content.test.mjs skills/control-universal-chrome
git commit -m "feat(skill): add universal Chrome control workflow"
```

### Task 2: Unified invocation script

**Files:**
- Create: `skills/control-universal-chrome/scripts/invoke.mjs`
- Test: `test/skill-invoke.test.mjs`

**Interfaces:**
- Consumes: `connectBridge(options)` and `listBridgeInstances()` from `<bridgeRoot>/src/bridge-client.mjs`.
- Produces: `locateBridgeRoot(options): Promise<string>`; `parseInvokeArgs(argv): Invocation`; `runInvocation(invocation, dependencies): Promise<unknown>`; CLI commands `instances` and `call <method> [jsonParams]` with one JSON value on stdout.

- [ ] **Step 1: Write failing argument and root-resolution tests**

Test the public functions through dynamic import:

```js
test("explicit bridge root wins", async () => {
  const root = await locateBridgeRoot({
    env: { UNIVERSAL_CHROME_BRIDGE_ROOT: fixtureRoot },
    cwd: unrelatedDir,
    scriptDir: unrelatedDir
  });
  assert.equal(root, fixtureRoot);
});

test("call rejects malformed JSON before connecting", () => {
  assert.throws(() => parseInvokeArgs(["call", "browser.listTabs", "{"]), /JSON/);
});
```

Cover environment root, upward search from the Skill path, upward search from current directory, missing project, `instances`, valid `call`, missing method, malformed JSON, and optional `--timeout-ms`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/skill-invoke.test.mjs`

Expected: FAIL because `invoke.mjs` does not exist.

- [ ] **Step 3: Implement project discovery and parsing**

Recognize a bridge root only when both `package.json` with package name `universal-chrome-agent-bridge` and `src/bridge-client.mjs` exist. Return structured error objects with stable codes:

```js
{ error: "...", code: "BRIDGE_ROOT_NOT_FOUND", details: { searched: [...] } }
{ error: "...", code: "INVALID_ARGUMENTS", details: { usage: "..." } }
```

Do not guess global package paths or mutate environment variables.

- [ ] **Step 4: Write failing delegation tests**

Inject fake `loadClient`, `connectBridge`, and `listBridgeInstances` dependencies. Assert:

```js
assert.deepEqual(await runInvocation({ mode: "instances" }, deps), instances);
assert.deepEqual(
  await runInvocation({ mode: "call", method: "browser.listTabs", params: {}, timeoutMs: 5000 }, deps),
  expectedResult
);
```

Verify one connection, the exact method and params, timeout forwarding, and error normalization without contacting a real browser.

- [ ] **Step 5: Run the delegation tests and verify RED**

Run: `node --test test/skill-invoke.test.mjs`

Expected: argument tests PASS; delegation tests FAIL because delegation is not implemented.

- [ ] **Step 6: Implement minimal delegation and CLI output**

Load the existing Bridge Client by absolute file URL from the resolved root. For successful CLI runs, write exactly one JSON value to stdout. For failures, write exactly one structured JSON error to stderr and set `process.exitCode = 1`. Keep import side effects disabled with an ESM main-module guard.

- [ ] **Step 7: Verify GREEN and commit**

Run:

```powershell
node --test test/skill-invoke.test.mjs
node --check skills/control-universal-chrome/scripts/invoke.mjs
```

Expected: PASS with no warnings.

```powershell
git add test/skill-invoke.test.mjs skills/control-universal-chrome/scripts/invoke.mjs
git commit -m "feat(skill): add universal bridge invocation fallback"
```

### Task 3: Read-only diagnostic script

**Files:**
- Create: `skills/control-universal-chrome/scripts/doctor.mjs`
- Modify: `skills/control-universal-chrome/references/troubleshooting.md`
- Test: `test/skill-doctor.test.mjs`

**Interfaces:**
- Consumes: `locateBridgeRoot()` from `scripts/invoke.mjs`; `listBridgeInstances()` and `connectBridge()` from the located Bridge Client.
- Produces: `runDiagnostics(options): Promise<DiagnosticReport>` and a CLI that emits one JSON report. `DiagnosticReport` contains `ok`, `node`, `bridgeRoot`, `bridgeClient`, `instances`, and `connection` checks.

- [ ] **Step 1: Write failing diagnostic tests**

Use injected dependencies and assert a stable report shape:

```js
assert.deepEqual(report.node, { ok: true, version: process.versions.node, requiredMajor: 22 });
assert.equal(report.bridgeRoot.ok, true);
assert.equal(report.bridgeClient.ok, true);
assert.equal(report.instances.count, 1);
assert.equal(report.connection.ok, true);
assert.equal(report.ok, true);
```

Add cases for Node below 22, root not found, zero instances, and an extension-disconnected result. Assert diagnostic dependencies expose no install, start, policy, or browser mutation callback.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test test/skill-doctor.test.mjs`

Expected: FAIL because `doctor.mjs` does not exist.

- [ ] **Step 3: Implement the diagnostic pipeline**

Run checks in dependency order. A failed root check must skip Bridge Client and connection checks with `{ ok: false, skipped: true, reason: "bridge root unavailable" }`. Zero instances must report a recoverable failure without starting any process. Use the first instance unless `UNIVERSAL_BROWSER_INSTANCE_ID` selects another one.

- [ ] **Step 4: Document diagnostic interpretation**

Update `references/troubleshooting.md` so each failed check maps to one next action:

| Failed check | Next action |
|---|---|
| `node` | Install or select Node.js 22+ |
| `bridgeRoot` | Set `UNIVERSAL_CHROME_BRIDGE_ROOT` |
| `bridgeClient` | Restore the repository installation |
| `instances` | Start Chrome and verify Native Host registration |
| `connection` | Open extension status and verify Native Messaging connectivity |

- [ ] **Step 5: Verify GREEN and commit**

Run:

```powershell
node --test test/skill-doctor.test.mjs
node --check skills/control-universal-chrome/scripts/doctor.mjs
```

Expected: PASS with no writes outside test temporary directories.

```powershell
git add test/skill-doctor.test.mjs skills/control-universal-chrome/scripts/doctor.mjs skills/control-universal-chrome/references/troubleshooting.md
git commit -m "feat(skill): add read-only bridge diagnostics"
```

### Task 4: Forward validation, installation, and final verification

**Files:**
- Modify only if validation exposes a gap: `skills/control-universal-chrome/**`
- Modify only if a regression test is required: `test/skill-*.test.mjs`
- Install copy: `C:/Users/fcliq/.codex/skills/control-universal-chrome/**`

**Interfaces:**
- Consumes: validated repository Skill and scripts from Tasks 1-3.
- Produces: a locally discoverable Skill whose regular-file SHA-256 manifest equals the repository copy.

- [ ] **Step 1: Forward-test the Skill in fresh contexts**

Run the baseline scenarios again with fresh subagents explicitly loading the repository Skill. Add two retrieval/application cases:

```text
Scenario D: "The client has no MCP support but can run Node. List Chrome tabs through the universal bridge."
Scenario E: "Search Chrome download metadata and then send Page.captureScreenshot through CDP without asking me anything else."
```

Success requires MCP-first selection, CLI fallback only in Scenario D, stable locator preference, action verification, explicit approval before sensitive metadata/CDP, and no login bypass. If a scenario fails, add one failing content or script regression test before changing the Skill.

- [ ] **Step 2: Run focused and repository verification**

Run:

```powershell
node --test test/skill-content.test.mjs test/skill-invoke.test.mjs test/skill-doctor.test.mjs
python C:\Users\fcliq\.codex\skills\.system\skill-creator\scripts\quick_validate.py E:\AI\codex\workspace\chrome\skills\control-universal-chrome
npm.cmd test
npm.cmd run check
git diff --check
```

Expected: all tests PASS, validator succeeds, static checks succeed, and `git diff --check` prints nothing.

- [ ] **Step 3: Install the validated Skill**

Resolve both absolute paths first. If the destination already exists and differs, stop and report the conflict instead of overwriting it. Otherwise copy the repository directory to:

```text
C:\Users\fcliq\.codex\skills\control-universal-chrome
```

Do not copy `.git`, test artifacts, SDD reports, or files outside the Skill directory.

- [ ] **Step 4: Verify repository and installed copies are identical**

Generate sorted SHA-256 manifests for regular files under both roots using PowerShell `Get-FileHash`, with paths relative to their respective roots. Compare the manifests and require zero differences.

Run the installed-copy validator:

```powershell
python C:\Users\fcliq\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\fcliq\.codex\skills\control-universal-chrome
```

Expected: manifests match and installed Skill validates.

- [ ] **Step 5: Commit any validation-driven changes**

If forward testing required repository changes, commit only those tested changes:

```powershell
git add skills/control-universal-chrome test/skill-content.test.mjs test/skill-invoke.test.mjs test/skill-doctor.test.mjs
git commit -m "fix(skill): close universal Chrome workflow gaps"
```

If no repository files changed, do not create an empty commit.
