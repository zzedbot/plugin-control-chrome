#!/usr/bin/env node
import readline from "node:readline";
import { connectBridge, listBridgeInstances, toPublicBridgeInstance } from "./bridge-client.mjs";
import { VERSION } from "./version.mjs";

const SERVER_INFO = { name: "lingee-chrome-agent-bridge", version: VERSION };
const TOOLS = buildTools();
const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));
let client;

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
    if (request.id == null) return;
    const result = await handleRequest(request);
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    write({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: error.rpcCode || -32000, message: error.message || String(error), data: error.code ? { code: error.code, details: error.data } : undefined } });
  }
});

async function handleRequest(request) {
  switch (request.method) {
    case "initialize":
      return { protocolVersion: request.params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ method, imageResult, ...tool }) => tool) };
    case "tools/call":
      return callTool(request.params?.name, request.params?.arguments || {});
    default:
      throw Object.assign(new Error(`Method not found: ${request.method}`), { rpcCode: -32601 });
  }
}

async function callTool(name, args) {
  const tool = toolByName.get(name);
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { rpcCode: -32602 });
  try {
    if (name === "bridge_list_instances") {
      return textResult((await listBridgeInstances()).map(toPublicBridgeInstance));
    }
    client ||= await connectBridge({ instanceId: process.env.UNIVERSAL_BROWSER_INSTANCE_ID });
    const result = await client.call(tool.method, args, { timeoutMs: Number(args.timeoutMs) || undefined });
    if (tool.imageResult && result?.data) {
      return { content: [{ type: "image", data: result.data, mimeType: result.mimeType || "image/png" }] };
    }
    return textResult(result);
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: error.message, code: error.code, details: error.data }, null, 2) }] };
  }
}

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function buildTools() {
  const object = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
  const tabId = { tabId: { type: "integer", minimum: 0, description: "Chrome tab ID" } };
  const locator = {
    type: "object",
    description: "A CSS, role/name, label, text, or data-testid locator. It must resolve to one visible element.",
    properties: {
      css: { type: "string" }, role: { type: "string" }, name: { type: "string" }, label: { type: "string" },
      text: { type: "string" }, testId: { type: "string" }, exact: { type: "boolean" }
    },
    additionalProperties: false
  };
  const point = {
    type: "object",
    properties: { x: { type: "number" }, y: { type: "number" }, locator },
    additionalProperties: false
  };
  const tool = (name, description, method, inputSchema, extra = {}) => ({ name, description, method, inputSchema, ...extra });
  return [
    tool("bridge_list_instances", "List running Chrome bridge instances.", null, object()),
    tool("bridge_status", "Get bridge and Chrome extension connection status.", "bridge.getInfo", object()),
    tool("policy_get", "Read the effective local browser security policy.", "policy.get", object()),
    tool("policy_allow_host", "Allow an HTTP(S) host and its subdomains.", "policy.allowHost", object({ host: { type: "string" } }, ["host"])),
    tool("policy_block_host", "Block an HTTP(S) host and its subdomains.", "policy.blockHost", object({ host: { type: "string" } }, ["host"])),
    tool("policy_set_allow_all", "Enable or disable access to all sites. Use only with explicit user approval.", "policy.setAllowAll", object({ enabled: { type: "boolean" } }, ["enabled"])),
    tool("policy_set_sensitive_metadata", "Enable or disable history, bookmark, and download metadata access.", "policy.setSensitiveMetadata", object({ enabled: { type: "boolean" } }, ["enabled"])),
    tool("policy_allow_cdp_method", "Add a Chrome DevTools Protocol method to the local allowlist.", "policy.allowCdpMethod", object({ command: { type: "string" } }, ["command"])),
    tool("browser_get_info", "Get browser backend identity and capabilities.", "browser.getInfo", object()),
    tool("browser_list_tabs", "List tabs. Details for unapproved sites are redacted.", "browser.listTabs", object({ query: { type: "object", additionalProperties: true } })),
    tool("browser_get_tab", "Get one tab. Details for an unapproved site are redacted.", "browser.getTab", object(tabId, ["tabId"])),
    tool("browser_open_tab", "Open an approved URL in a new tab.", "browser.openTab", object({ url: { type: "string" }, active: { type: "boolean" }, windowId: { type: "integer" } }, ["url"])),
    tool("browser_close_tab", "Close a tab.", "browser.closeTab", object(tabId, ["tabId"])),
    tool("browser_activate_tab", "Activate a tab and focus its window.", "browser.activateTab", object(tabId, ["tabId"])),
    tool("browser_claim_tab", "Attach the debugger-backed control session to an approved tab.", "browser.claimTab", object(tabId, ["tabId"])),
    tool("browser_detach_tab", "Detach debugger-backed control from a tab.", "browser.detachTab", object(tabId, ["tabId"])),
    tool("browser_navigate", "Navigate a tab to an approved URL.", "browser.navigate", object({ ...tabId, url: { type: "string" } }, ["tabId", "url"])),
    tool("browser_back", "Navigate a tab backward.", "browser.back", object(tabId, ["tabId"])),
    tool("browser_forward", "Navigate a tab forward.", "browser.forward", object(tabId, ["tabId"])),
    tool("browser_reload", "Reload a tab.", "browser.reload", object({ ...tabId, bypassCache: { type: "boolean" } }, ["tabId"])),
    tool("browser_group_tabs", "Create or update a Chrome tab group.", "browser.groupTabs", object({ tabIds: { type: "array", items: { type: "integer" }, minItems: 1 }, groupId: { type: "integer" }, title: { type: "string" }, color: { type: "string" }, collapsed: { type: "boolean" } }, ["tabIds"])),
    tool("browser_read_text", "Read title, URL, and visible page text.", "browser.readText", object({ ...tabId, maxChars: { type: "integer", minimum: 1, maximum: 500000 } }, ["tabId"])),
    tool("browser_dom_snapshot", "Read a compact DOM/interaction snapshot for locator construction.", "browser.domSnapshot", object({ ...tabId, maxNodes: { type: "integer", minimum: 1, maximum: 5000 }, maxTextChars: { type: "integer", minimum: 100, maximum: 200000 } }, ["tabId"])),
    tool("browser_accessibility_snapshot", "Read the Chrome accessibility tree.", "browser.accessibilitySnapshot", object(tabId, ["tabId"])),
    tool("browser_screenshot", "Capture a tab screenshot.", "browser.screenshot", object({ ...tabId, format: { enum: ["png", "jpeg"] }, quality: { type: "integer", minimum: 0, maximum: 100 }, captureBeyondViewport: { type: "boolean" } }, ["tabId"]), { imageResult: true }),
    tool("browser_click", "Click one element resolved by a stable locator.", "browser.click", object({ ...tabId, locator, button: { enum: ["left", "middle", "right"] }, clickCount: { type: "integer", minimum: 1, maximum: 3 } }, ["tabId", "locator"])),
    tool("browser_fill", "Focus, clear, and fill one input resolved by a locator.", "browser.fill", object({ ...tabId, locator, value: { type: "string" } }, ["tabId", "locator", "value"])),
    tool("browser_press", "Dispatch a keyboard key to the active element.", "browser.press", object({ ...tabId, key: { type: "string" }, modifiers: { type: "array", items: { enum: ["alt", "control", "meta", "shift"] } } }, ["tabId", "key"])),
    tool("browser_type", "Insert text into the currently focused element.", "browser.type", object({ ...tabId, text: { type: "string" } }, ["tabId", "text"])),
    tool("browser_mouse_move", "Move the mouse to viewport coordinates.", "browser.mouseMove", object({ ...tabId, x: { type: "number" }, y: { type: "number" } }, ["tabId", "x", "y"])),
    tool("browser_coordinate_click", "Click viewport coordinates for vision-guided interaction.", "browser.coordinateClick", object({ ...tabId, x: { type: "number" }, y: { type: "number" }, button: { enum: ["left", "middle", "right"] }, clickCount: { type: "integer", minimum: 1, maximum: 3 } }, ["tabId", "x", "y"])),
    tool("browser_drag", "Drag between viewport points or uniquely resolved locators.", "browser.drag", object({ ...tabId, from: point, to: point, steps: { type: "integer", minimum: 2, maximum: 60 } }, ["tabId", "from", "to"])),
    tool("browser_wheel", "Dispatch a wheel event at viewport coordinates.", "browser.wheel", object({ ...tabId, x: { type: "number" }, y: { type: "number" }, deltaX: { type: "number" }, deltaY: { type: "number" } }, ["tabId", "x", "y"])),
    tool("browser_scroll", "Scroll a page by CSS pixels.", "browser.scroll", object({ ...tabId, deltaX: { type: "number" }, deltaY: { type: "number" } }, ["tabId"])),
    tool("browser_set_file_input", "Set files on a CSS-selected file input.", "browser.setFileInput", object({ ...tabId, selector: { type: "string" }, files: { type: "array", items: { type: "string" }, minItems: 1 } }, ["tabId", "selector", "files"])),
    tool("browser_handle_dialog", "Accept or dismiss a JavaScript dialog.", "browser.handleDialog", object({ ...tabId, accept: { type: "boolean" }, promptText: { type: "string" } }, ["tabId"])),
    tool("browser_get_events", "Read buffered debugger events using a sequence cursor.", "browser.getEvents", object({ tabId: { type: "integer" }, afterSequence: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 }, methods: { type: "array", items: { type: "string" } } }, ["tabId"])),
    tool("browser_cdp", "Send a policy-allowlisted raw CDP command to an approved tab.", "browser.cdp", object({ ...tabId, command: { type: "string" }, params: { type: "object", additionalProperties: true } }, ["tabId", "command"])),
    tool("browser_history_search", "Search browser history when sensitive metadata access is enabled.", "browser.historySearch", object({ text: { type: "string" }, startTime: { type: "number" }, endTime: { type: "number" }, maxResults: { type: "integer" } })),
    tool("browser_bookmark_search", "Search bookmarks when sensitive metadata access is enabled.", "browser.bookmarkSearch", object({ query: { oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }] }, text: { type: "string" } })),
    tool("browser_downloads_search", "Search download metadata when sensitive metadata access is enabled.", "browser.downloadsSearch", object({ query: { type: "object", additionalProperties: true } }))
  ];
}
