#!/usr/bin/env node
import { connectBridge, listBridgeInstances } from "./bridge-client.mjs";

const [method, rawParams = "{}"] = process.argv.slice(2);
if (!method || ["-h", "--help"].includes(method)) {
  process.stdout.write("Usage: universal-browser-rpc <method> [json-params]\n       universal-browser-rpc --instances\n");
  process.exit(method ? 0 : 2);
}

try {
  if (method === "--instances") {
    process.stdout.write(`${JSON.stringify(await listBridgeInstances(), null, 2)}\n`);
  } else {
    const client = await connectBridge({ instanceId: process.env.UNIVERSAL_BROWSER_INSTANCE_ID });
    const result = await client.call(method, JSON.parse(rawParams));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code, details: error.data }, null, 2)}\n`);
  process.exit(1);
}
