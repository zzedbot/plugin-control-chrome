import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { runtimeDirectory } from "./runtime-paths.mjs";

export async function listBridgeInstances({ cleanupStale = true } = {}) {
  return (await discoverBridgeDescriptors({ cleanupStale })).map(toPublicBridgeInstance);
}

export function toPublicBridgeInstance(descriptor) {
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

async function discoverBridgeDescriptors({ cleanupStale = true } = {}) {
  let names;
  try { names = await fs.readdir(runtimeDirectory()); } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const instances = [];
  for (const name of names.filter((entry) => /^bridge-\d+\.json$/.test(entry))) {
    const file = path.join(runtimeDirectory(), name);
    try {
      const descriptor = JSON.parse(await fs.readFile(file, "utf8"));
      if (await canConnect(descriptor)) instances.push(descriptor);
      else if (cleanupStale) await fs.rm(file, { force: true });
    } catch {}
  }
  return instances.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export async function connectBridge({ instanceId, timeoutMs = 3000, cleanupStale = true } = {}) {
  const instances = await discoverBridgeDescriptors({ cleanupStale });
  const descriptor = instanceId ? instances.find((item) => item.instanceId === instanceId) : instances[0];
  if (!descriptor) throw Object.assign(new Error("No running Universal Chrome Agent Bridge instance was found. Open Chrome and enable the extension."), { code: "BRIDGE_NOT_FOUND" });
  return new BridgeClient(descriptor, timeoutMs);
}

export class BridgeClient {
  constructor(descriptor, timeoutMs = 30000) {
    this.descriptor = descriptor;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
  }

  call(method, params = {}, { timeoutMs = this.timeoutMs } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.descriptor.endpoint);
      let buffer = "";
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error(`${method} timed out`), { code: "BRIDGE_TIMEOUT" })), timeoutMs);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params, auth: this.descriptor.token })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        socket.end();
        try {
          const response = JSON.parse(buffer.slice(0, newline));
          if (response.error) reject(Object.assign(new Error(response.error.message), response.error.data || {}, { rpcCode: response.error.code }));
          else resolve(response.result);
        } catch (error) { reject(error); }
      });
      socket.on("error", (error) => { clearTimeout(timer); reject(error); });
    });
  }
}

async function canConnect(descriptor) {
  return new Promise((resolve) => {
    if (!descriptor.endpoint) return resolve(false);
    const socket = net.createConnection(descriptor.endpoint);
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 250);
    socket.once("connect", () => { clearTimeout(timer); socket.end(); resolve(true); });
    socket.once("error", () => { clearTimeout(timer); resolve(false); });
  });
}
