import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const invokeUrl = pathToFileURL(
  path.join(workspaceRoot, "skills", "control-universal-chrome", "scripts", "invoke.mjs")
).href;

async function createBridgeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "universal-chrome-bridge-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "universal-chrome-agent-bridge" })
  );
  await writeFile(path.join(root, "src", "bridge-client.mjs"), "export {};\n");
  return root;
}

async function withFixture(run) {
  const root = await createBridgeFixture();
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function invokeModule() {
  return import(invokeUrl);
}

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

test("explicit bridge root wins", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      const root = await locateBridgeRoot({
        env: { UNIVERSAL_CHROME_BRIDGE_ROOT: fixtureRoot },
        cwd: unrelatedDir,
        scriptDir: unrelatedDir
      });
      assert.equal(root, fixtureRoot);
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("locates the bridge root upward from the Skill path", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const skillScriptDir = path.join(fixtureRoot, "skills", "control-universal-chrome", "scripts");
    await mkdir(skillScriptDir, { recursive: true });
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      assert.equal(
        await locateBridgeRoot({ env: {}, cwd: unrelatedDir, scriptDir: skillScriptDir }),
        fixtureRoot
      );
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("locates the bridge root upward from the current directory", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const nestedCwd = path.join(fixtureRoot, "work", "nested");
    await mkdir(nestedCwd, { recursive: true });
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      assert.equal(
        await locateBridgeRoot({ env: {}, cwd: nestedCwd, scriptDir: unrelatedDir }),
        fixtureRoot
      );
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("reports a structured error when no bridge project is found", async () => {
  const { locateBridgeRoot } = await invokeModule();
  const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
  try {
    await assert.rejects(
      () => locateBridgeRoot({ env: {}, cwd: unrelatedDir, scriptDir: unrelatedDir }),
      (error) => error.error === error.message
        && error.code === "BRIDGE_ROOT_NOT_FOUND"
        && Array.isArray(error.details?.searched)
    );
  } finally {
    await rm(unrelatedDir, { recursive: true, force: true });
  }
});

test("parses instances invocation", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["instances"]), { mode: "instances" });
});

test("parses a call invocation with JSON parameters", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["call", "browser.listTabs", "{}"]), {
    mode: "call",
    method: "browser.listTabs",
    params: {}
  });
});

test("call rejects a missing method", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.throws(
    () => parseInvokeArgs(["call"]),
    (error) => error.code === "INVALID_ARGUMENTS" && Boolean(error.details?.usage)
  );
});

test("call rejects malformed JSON before connecting", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.throws(() => parseInvokeArgs(["call", "browser.listTabs", "{"]), /JSON/);
});

test("parses an optional timeout", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["call", "browser.listTabs", "{}", "--timeout-ms", "5000"]), {
    mode: "call",
    method: "browser.listTabs",
    params: {},
    timeoutMs: 5000
  });
});

test("delegates instance discovery to the Bridge Client", async () => {
  const { runInvocation } = await invokeModule();
  const instances = [{ instanceId: "chrome-a", startedAt: "2026-07-27T00:00:00.000Z" }];
  let loadCalls = 0;
  const deps = {
    loadClient: async () => {
      loadCalls += 1;
      return { connectBridge: deps.connectBridge, listBridgeInstances: deps.listBridgeInstances };
    },
    connectBridge: async () => assert.fail("instances must not connect"),
    listBridgeInstances: async () => instances
  };

  assert.deepEqual(await runInvocation({ mode: "instances" }, deps), instances);
  assert.equal(loadCalls, 0);
});

test("delegates calls with exact arguments and timeout forwarding", async () => {
  const { runInvocation } = await invokeModule();
  const expectedResult = [{ id: 7, title: "Docs" }];
  const connectionOptions = [];
  const calls = [];
  const deps = {
    loadClient: async () => assert.fail("injected methods must avoid loading a client"),
    connectBridge: async (options) => {
      connectionOptions.push(options);
      return {
        call: async (method, params, options) => {
          calls.push({ method, params, options });
          return expectedResult;
        }
      };
    },
    listBridgeInstances: async () => assert.fail("call must not list instances"),
    env: { UNIVERSAL_BROWSER_INSTANCE_ID: "chrome-a" }
  };

  assert.deepEqual(
    await runInvocation(
      { mode: "call", method: "browser.listTabs", params: {}, timeoutMs: 5000 },
      deps
    ),
    expectedResult
  );
  assert.deepEqual(connectionOptions, [{ instanceId: "chrome-a", timeoutMs: 5000 }]);
  assert.deepEqual(calls, [{ method: "browser.listTabs", params: {}, options: { timeoutMs: 5000 } }]);
});

test("normalizes Bridge Client errors without contacting a browser", async () => {
  const { runInvocation } = await invokeModule();
  const bridgeError = Object.assign(new Error("Bridge unavailable"), {
    code: "BRIDGE_NOT_FOUND",
    data: { recovery: "Open Chrome" }
  });
  await assert.rejects(
    () => runInvocation(
      { mode: "call", method: "bridge.getInfo", params: {} },
      {
        loadClient: async () => assert.fail("injected connection must avoid loading a client"),
        connectBridge: async () => { throw bridgeError; },
        listBridgeInstances: async () => []
      }
    ),
    (error) => error.code === "BRIDGE_NOT_FOUND" && error.details?.recovery === "Open Chrome"
  );
});

test("CLI writes one JSON value when a Bridge Client call returns undefined", async () => {
  await withFixture(async (fixtureRoot) => {
    await writeFile(
      path.join(fixtureRoot, "src", "bridge-client.mjs"),
      "export async function connectBridge() { return { call: async () => undefined }; }\n"
    );
    const result = await runNode([fileURLToPath(invokeUrl), "call", "bridge.getInfo", "{}"], {
      env: { ...process.env, UNIVERSAL_CHROME_BRIDGE_ROOT: fixtureRoot }
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "null\n");
  });
});
