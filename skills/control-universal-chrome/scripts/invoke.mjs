#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const usage = "node invoke.mjs instances | node invoke.mjs call <method> [jsonParams] [--timeout-ms <ms>]";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));

export async function locateBridgeRoot(options = {}) {
  const env = options.env ?? process.env;
  const searched = [];
  const explicitRoot = env.UNIVERSAL_CHROME_BRIDGE_ROOT;

  if (explicitRoot) {
    const root = path.resolve(explicitRoot);
    searched.push(root);
    if (await isBridgeRoot(root)) return root;
    throw structuredError(
      `Universal Chrome bridge root is not valid: ${root}`,
      "BRIDGE_ROOT_NOT_FOUND",
      { searched }
    );
  }

  for (const start of [options.scriptDir ?? scriptDir, options.cwd ?? process.cwd()]) {
    const root = await findBridgeRoot(path.resolve(start), searched);
    if (root) return root;
  }

  throw structuredError(
    "Universal Chrome bridge project was not found.",
    "BRIDGE_ROOT_NOT_FOUND",
    { searched }
  );
}

export function parseInvokeArgs(argv) {
  if (argv.length === 1 && argv[0] === "instances") return { mode: "instances" };
  if (argv[0] !== "call") throw invalidArguments();

  const method = argv[1];
  if (!method || method.startsWith("-")) throw invalidArguments();

  let index = 2;
  let params = {};
  if (argv[index] && argv[index] !== "--timeout-ms") {
    try {
      params = JSON.parse(argv[index]);
    } catch (error) {
      throw structuredError(`Invalid JSON parameters: ${error.message}`, "INVALID_ARGUMENTS", { usage });
    }
    index += 1;
  }

  let timeoutMs;
  if (argv[index] === "--timeout-ms") {
    timeoutMs = Number(argv[index + 1]);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw invalidArguments();
    index += 2;
  }
  if (index !== argv.length) throw invalidArguments();

  return timeoutMs === undefined
    ? { mode: "call", method, params }
    : { mode: "call", method, params, timeoutMs };
}

export async function runInvocation(invocation, dependencies = {}) {
  try {
    if (invocation?.mode === "instances") {
      const listBridgeInstances = await resolveClientFunction("listBridgeInstances", dependencies);
      return (await listBridgeInstances()).map(toPublicBridgeInstance);
    }
    if (invocation?.mode !== "call" || !invocation.method) throw invalidArguments();

    const connectBridge = await resolveClientFunction("connectBridge", dependencies);
    const env = dependencies.env ?? process.env;
    const client = await connectBridge({
      instanceId: env.UNIVERSAL_BROWSER_INSTANCE_ID,
      ...(invocation.timeoutMs === undefined ? {} : { timeoutMs: invocation.timeoutMs })
    });
    return await client.call(
      invocation.method,
      invocation.params ?? {},
      invocation.timeoutMs === undefined ? undefined : { timeoutMs: invocation.timeoutMs }
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

function toPublicBridgeInstance(descriptor) {
  const instance = {};
  for (const [field, type] of [
    ["instanceId", "string"],
    ["pid", "number"],
    ["transport", "string"],
    ["nativeHostName", "string"],
    ["startedAt", "string"]
  ]) {
    const value = descriptor?.[field];
    if (typeof value === type && (type !== "number" || Number.isFinite(value))) instance[field] = value;
  }
  return instance;
}

export async function loadClient(bridgeRoot) {
  const clientPath = path.join(bridgeRoot, "src", "bridge-client.mjs");
  return import(pathToFileURL(clientPath).href);
}

export function normalizeError(error) {
  if (error instanceof Error && error.details !== undefined) return error;
  const message = error?.message ?? error?.error ?? String(error);
  return structuredError(message, error?.code ?? "INVOCATION_FAILED", error?.details ?? error?.data);
}

async function findBridgeRoot(start, searched) {
  let current = start;
  while (true) {
    searched.push(current);
    if (await isBridgeRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function isBridgeRoot(root) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (manifest.name !== "universal-chrome-agent-bridge") return false;
    await access(path.join(root, "src", "bridge-client.mjs"));
    return true;
  } catch {
    return false;
  }
}

async function resolveClientFunction(name, dependencies) {
  if (typeof dependencies[name] === "function") return dependencies[name];
  const root = dependencies.bridgeRoot ?? await locateBridgeRoot({
    env: dependencies.env,
    cwd: dependencies.cwd,
    scriptDir: dependencies.scriptDir
  });
  const client = await (dependencies.loadClient ?? loadClient)(root);
  if (typeof client[name] !== "function") {
    throw structuredError(`Bridge Client does not export ${name}.`, "INVOCATION_FAILED");
  }
  return client[name];
}

function invalidArguments() {
  return structuredError("Invalid invocation arguments.", "INVALID_ARGUMENTS", { usage });
}

function structuredError(message, code, details) {
  const error = Object.assign(new Error(message), { error: message, code });
  if (details !== undefined) error.details = details;
  return error;
}

async function main() {
  try {
    const invocation = parseInvokeArgs(process.argv.slice(2));
    const bridgeRoot = await locateBridgeRoot();
    const client = await loadClient(bridgeRoot);
    const result = await runInvocation(invocation, { ...client });
    process.stdout.write(`${JSON.stringify(result === undefined ? null : result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(normalizeError(error)))}\n`);
    process.exitCode = 1;
  }
}

function serializeError(error) {
  return {
    error: error.message,
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details })
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
