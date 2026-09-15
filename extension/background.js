import { expandFrameIdSubtree, installMonitorsForTab, isMonitorablePageFrame } from "./monitor-injection.js";
import { createDebuggerController } from "./debugger-controller.js";
import { FOREIGN_FRAME_MONITOR_KEY, installForeignFrameMonitor, removeForeignFrameMonitor, readForeignFrameMonitorDiagnostics } from "./foreign-frame-monitor.js";

const HOST_NAME = "org.universal_browser.bridge";
const CDP_VERSION = "1.3";
const MAX_EVENTS = 1000;

let nativePort;
let connected = false;
let lastError = "";
let reconnectTimer;
let eventSequence = 0;
const events = [];

const debuggerController = createDebuggerController({
  debuggerApi: chrome.debugger,
  cdpVersion: CDP_VERSION,
  installMonitor: installForeignFrameMonitorInTab,
  diagnoseFailure: readMonitorDiagnosticsInTab,
  removeMonitor: removeForeignFrameMonitorFromTab
});
const { attachedTabs, controlledTabs } = debuggerController;
const monitoredDocumentsByTab = new Map();
const neutralizedFrameIdsByTab = new Map();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  await chrome.storage.local.set(current);
  chrome.alarms.create("bridge.keepalive", { periodInMinutes: 0.5 });
  connectNative();
});

chrome.runtime.onStartup.addListener(connectNative);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "bridge.keepalive" && !connected) connectNative();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "bridge.status") {
    sendResponse({ connected, error: lastError });
    return false;
  }
  if (message?.type === "bridge.reconnect") {
    connectNative(true);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  recordEvent({ source, method, params });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId != null) debuggerController.handleDetached(source.tabId);
  recordEvent({ source, method: "Debugger.detached", params: { reason } });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  debuggerController.forgetTab(tabId);
  monitoredDocumentsByTab.delete(tabId);
  neutralizedFrameIdsByTab.delete(tabId);
});
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  const wasControlled = controlledTabs.has(removedTabId);
  debuggerController.forgetTab(removedTabId);
  monitoredDocumentsByTab.delete(removedTabId);
  neutralizedFrameIdsByTab.delete(removedTabId);
  if (wasControlled) {
    recordEvent({ source: { tabId: removedTabId }, method: "Browser.tabReplaced", params: { addedTabId } });
  }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && controlledTabs.has(tabId)) refreshForeignFrameMonitor(tabId);
});
chrome.webNavigation.onCommitted.addListener(({ tabId }) => {
  if (controlledTabs.has(tabId)) refreshForeignFrameMonitor(tabId);
});

function connectNative(force = false) {
  if (connected && !force) return;
  if (nativePort) {
    try { nativePort.disconnect(); } catch {}
  }
  clearTimeout(reconnectTimer);
  try {
    const port = chrome.runtime.connectNative(HOST_NAME);
    nativePort = port;
    port.onMessage.addListener((message) => onNativeMessage(message, port));
    port.onDisconnect.addListener(() => {
      if (nativePort !== port) return;
      connected = false;
      lastError = chrome.runtime.lastError?.message || "Native host disconnected";
      reconnectTimer = setTimeout(connectNative, 2000);
    });
    connected = true;
    lastError = "";
    port.postMessage({
      type: "hello",
      extensionId: chrome.runtime.id,
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent
    });
  } catch (error) {
    connected = false;
    lastError = error.message;
    reconnectTimer = setTimeout(connectNative, 2000);
  }
}

async function onNativeMessage(message, port = nativePort) {
  if (message?.type !== "request" || message.id == null) return;
  try {
    const result = await execute(message.method, message.params || {});
    port.postMessage({ type: "response", id: message.id, result });
  } catch (error) {
    port.postMessage({
      type: "response",
      id: message.id,
      error: {
        code: error.code || "BROWSER_ERROR",
        message: error.message || String(error),
        data: error.data
      }
    });
  }
}

async function execute(method, params) {
  const settings = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  if (!settings.enabled) throw codedError("EXTENSION_DISABLED", "Browser control is disabled in extension settings");

  switch (method) {
    case "browser.getInfo":
      return {
        name: "Lingee Chrome Agent Bridge",
        version: chrome.runtime.getManifest().version,
        type: "extension",
        extensionId: chrome.runtime.id,
        compatibility: { foreignFrameMonitor: "remove-after-blank-v11", debuggerState: "generation-v4", monitorDiagnostics: "counts-v2" },
        capabilities: capabilityList()
      };
    case "browser.listTabs":
      return chrome.tabs.query(params.query || {});
    case "browser.getTab":
      return chrome.tabs.get(requireTabId(params));
    case "browser.openTab":
      await assertUrlNotBlocked(params.url || "about:blank", settings);
      return chrome.tabs.create(compact({ url: params.url || "about:blank", active: params.active !== false, windowId: params.windowId }));
    case "browser.closeTab":
      await chrome.tabs.remove(requireTabId(params));
      return { closed: true };
    case "browser.activateTab": {
      const tab = await chrome.tabs.update(requireTabId(params), { active: true });
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      return tab;
    }
    case "browser.claimTab": {
      const tabId = requireTabId(params);
      try {
        await assertTabNotBlocked(tabId, settings);
        await ensureDebugger(tabId);
        return await chrome.tabs.get(tabId);
      } catch (error) {
        const stage = error.data?.stage || "claim";
        throw codedError(error.code || "BROWSER_ERROR", `browser.claimTab/${stage}: ${error.message || String(error)}`, error.data);
      }
    }
    case "browser.detachTab":
      await detachDebugger(requireTabId(params));
      return { detached: true };
    case "browser.navigate":
      await assertUrlNotBlocked(params.url, settings);
      return chrome.tabs.update(requireTabId(params), { url: requireString(params.url, "url") });
    case "browser.back":
      await assertTabNotBlocked(requireTabId(params), settings);
      await chrome.tabs.goBack(requireTabId(params));
      return { ok: true };
    case "browser.forward":
      await assertTabNotBlocked(requireTabId(params), settings);
      await chrome.tabs.goForward(requireTabId(params));
      return { ok: true };
    case "browser.reload":
      await assertTabNotBlocked(requireTabId(params), settings);
      await chrome.tabs.reload(requireTabId(params), { bypassCache: params.bypassCache === true });
      return { ok: true };
    case "browser.groupTabs": {
      const groupId = await chrome.tabs.group(compact({ tabIds: params.tabIds, groupId: params.groupId }));
      if (params.title != null || params.color != null || params.collapsed != null) {
        await chrome.tabGroups.update(groupId, compact({ title: params.title, color: params.color, collapsed: params.collapsed }));
      }
      return chrome.tabGroups.get(groupId);
    }
    case "browser.readText":
      return evaluateValue(await authorizedTab(params, settings), readTextExpression(params.maxChars));
    case "browser.domSnapshot":
      return evaluateValue(await authorizedTab(params, settings), domSnapshotExpression(params));
    case "browser.accessibilitySnapshot":
      return sendCdp(await authorizedTab(params, settings), "Accessibility.getFullAXTree", {});
    case "browser.screenshot": {
      const tabId = await authorizedTab(params, settings);
      const result = await sendCdp(tabId, "Page.captureScreenshot", {
        format: params.format || "png",
        quality: params.quality,
        captureBeyondViewport: params.captureBeyondViewport === true,
        fromSurface: true
      });
      return { data: result.data, mimeType: params.format === "jpeg" ? "image/jpeg" : "image/png" };
    }
    case "browser.click":
      return clickLocator(await authorizedTab(params, settings), params.locator, params.button || "left", params.clickCount || 1);
    case "browser.fill":
      return fillLocator(await authorizedTab(params, settings), params.locator, String(params.value ?? ""));
    case "browser.press":
      return pressKey(await authorizedTab(params, settings), requireString(params.key, "key"), params.modifiers || []);
    case "browser.type": {
      const tabId = await authorizedTab(params, settings);
      await sendCdp(tabId, "Input.insertText", { text: String(params.text ?? "") });
      return { typed: true, length: String(params.text ?? "").length };
    }
    case "browser.mouseMove": {
      const tabId = await authorizedTab(params, settings);
      await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: number(params.x, 0), y: number(params.y, 0), button: "none" });
      return { x: number(params.x, 0), y: number(params.y, 0) };
    }
    case "browser.coordinateClick": {
      const tabId = await authorizedTab(params, settings);
      const x = number(params.x, 0); const y = number(params.y, 0); const button = params.button || "left"; const clickCount = Number(params.clickCount) || 1;
      await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
      await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount });
      await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount });
      return { x, y, button, clickCount };
    }
    case "browser.drag":
      return drag(await authorizedTab(params, settings), params);
    case "browser.wheel": {
      const tabId = await authorizedTab(params, settings);
      await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseWheel", x: number(params.x, 0), y: number(params.y, 0), deltaX: number(params.deltaX, 0), deltaY: number(params.deltaY, 0), button: "none" });
      return { ok: true };
    }
    case "browser.scroll":
      return evaluateValue(await authorizedTab(params, settings), `(() => { window.scrollBy(${number(params.deltaX, 0)}, ${number(params.deltaY, 0)}); return {x: window.scrollX, y: window.scrollY}; })()`);
    case "browser.setFileInput":
      return setFileInput(await authorizedTab(params, settings), requireString(params.selector, "selector"), params.files);
    case "browser.handleDialog":
      await sendCdp(await authorizedTab(params, settings), "Page.handleJavaScriptDialog", { accept: params.accept !== false, promptText: params.promptText });
      return { ok: true };
    case "browser.cdp":
      return sendCdp(await authorizedTab(params, settings), requireString(params.command, "command"), params.params || {});
    case "browser.getEvents":
      return getEvents(params);
    case "browser.historySearch":
      return chrome.history.search({ text: params.text || "", startTime: params.startTime, endTime: params.endTime, maxResults: params.maxResults || 100 });
    case "browser.bookmarkSearch":
      return chrome.bookmarks.search(params.query || params.text || "");
    case "browser.downloadsSearch":
      return chrome.downloads.search(params.query || {});
    default:
      throw codedError("METHOD_NOT_FOUND", `Unknown browser method: ${method}`);
  }
}

async function authorizedTab(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  await ensureDebugger(tabId);
  return tabId;
}

async function ensureDebugger(tabId) {
  return debuggerController.ensure(tabId);
}

async function detachDebugger(tabId) {
  return debuggerController.detach(tabId);
}

async function installForeignFrameMonitorInTab(tabId) {
  const installed = monitoredDocumentsByTab.get(tabId) || new Set();
  const neutralizedFrameIds = neutralizedFrameIdsByTab.get(tabId) || new Set();
  monitoredDocumentsByTab.set(tabId, installed);
  neutralizedFrameIdsByTab.set(tabId, neutralizedFrameIds);
  const getTrackedFrames = async (target) => {
    const frames = await chrome.webNavigation.getAllFrames(target) || [];
    for (const frame of frames) {
      if (isForeignExtensionUrl(frame.url)) neutralizedFrameIds.add(frame.frameId);
    }
    expandFrameIdSubtree(frames, neutralizedFrameIds);
    return frames;
  };
  await installMonitorsForTab({
    tabId,
    installed,
    getAllFrames: getTrackedFrames,
    isInjectableFrame: (frame) => isMonitorablePageFrame(frame, chrome.runtime.id, neutralizedFrameIds),
    executeMonitor: executeForeignFrameMonitor
  });
  await waitForForeignExtensionFramesToClear(tabId);
}

async function removeForeignFrameMonitorFromTab(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const documentIds = (frames || [])
      .filter((frame) => frame.documentId && !frame.errorOccurred && !isForeignExtensionUrl(frame.url))
      .map((frame) => frame.documentId);
    if (documentIds.length === 0) return;
    await chrome.scripting.executeScript({
      target: { tabId, documentIds: [...new Set(documentIds)] },
      func: removeForeignFrameMonitor,
      args: [FOREIGN_FRAME_MONITOR_KEY],
      injectImmediately: true
    });
  } catch {
  } finally {
    monitoredDocumentsByTab.delete(tabId);
    neutralizedFrameIdsByTab.delete(tabId);
  }
}

async function readMonitorDiagnosticsInTab(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId }) || [];
  const pageFrames = frames.filter(isInjectableFrame);
  const documents = [];
  for (const frame of pageFrames) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, documentIds: [frame.documentId] },
        func: readForeignFrameMonitorDiagnostics,
        args: [FOREIGN_FRAME_MONITOR_KEY]
      });
      documents.push(...results.map(({ result }) => result));
    } catch { documents.push({ diagnosticUnavailable: true }); }
  }
  return { pageFrameCount: pageFrames.length,
    foreignFrameCount: frames.filter((frame) => isForeignExtensionUrl(frame.url)).length,
    documents };
}

function executeForeignFrameMonitor(target) {
  return chrome.scripting.executeScript({
    target,
    func: installForeignFrameMonitor,
    args: [FOREIGN_FRAME_MONITOR_KEY, chrome.runtime.id],
    injectImmediately: true
  });
}

function isForeignExtensionUrl(value) {
  if (typeof value !== "string" || !value.startsWith("chrome-extension://")) return false;
  try {
    const url = new URL(value);
    return url.hostname.length > 0 && url.hostname !== chrome.runtime.id;
  } catch {
    return false;
  }
}

function isInjectableFrame(frame) {
  return isMonitorablePageFrame(frame, chrome.runtime.id, neutralizedFrameIdsByTab.get(frame?.tabId));
}

async function waitForForeignExtensionFramesToClear(tabId, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveClearChecks = 0;
  while (Date.now() < deadline) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const neutralizedFrameIds = neutralizedFrameIdsByTab.get(tabId) || new Set();
    const activeFrameIds = new Set((frames || []).map((frame) => frame.frameId));
    const hasPendingNeutralizedFrame = [...neutralizedFrameIds].some((frameId) => activeFrameIds.has(frameId));
    if (!(frames || []).some((frame) => isForeignExtensionUrl(frame.url)) && !hasPendingNeutralizedFrame) {
      consecutiveClearChecks += 1;
      if (consecutiveClearChecks >= 3) {
        neutralizedFrameIds.clear();
        return;
      }
    } else {
      consecutiveClearChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw codedError("FOREIGN_FRAME_MONITOR_FAILED", "A foreign extension frame did not become inert before debugger attachment");
}

function refreshForeignFrameMonitor(tabId) {
  debuggerController.refresh(tabId).catch((error) => {
    recordEvent({ source: { tabId }, method: "Bridge.foreignFrameMonitorFailed", params: { message: error.message || String(error) } });
  });
}

async function sendCdp(tabId, method, params = {}) {
  await ensureDebugger(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, compact(params));
}

async function evaluateValue(tabId, expression) {
  const response = await sendCdp(tabId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false
  });
  if (response.exceptionDetails) throw codedError("PAGE_EVALUATION_FAILED", response.exceptionDetails.text || "Page evaluation failed");
  return response.result?.value;
}

async function clickLocator(tabId, locator, button, clickCount) {
  const target = await locate(tabId, locator);
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x, y: target.y, button: "none" });
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button, clickCount });
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button, clickCount });
  return target;
}

async function fillLocator(tabId, locator, value) {
  const target = await locate(tabId, locator);
  await clickLocator(tabId, locator, "left", 1);
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace" });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace" });
  if (value) await sendCdp(tabId, "Input.insertText", { text: value });
  return { ...target, filled: true };
}

async function drag(tabId, params) {
  const from = params.from?.locator ? await locate(tabId, params.from.locator) : { x: number(params.from?.x, 0), y: number(params.from?.y, 0) };
  const to = params.to?.locator ? await locate(tabId, params.to.locator) : { x: number(params.to?.x, 0), y: number(params.to?.y, 0) };
  const steps = Math.max(2, Math.min(Number(params.steps) || 12, 60));
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, button: "none" });
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, button: "left", buttons: 1 });
  }
  await sendCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
  return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, steps };
}

async function pressKey(tabId, key, modifiers) {
  const definition = keyDefinition(key);
  const modifierMask = modifiers.reduce((mask, value) => mask | ({ alt: 1, control: 2, meta: 4, shift: 8 }[String(value).toLowerCase()] || 0), 0);
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...definition, modifiers: modifierMask });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...definition, modifiers: modifierMask });
  return { key, modifiers };
}

async function locate(tabId, locator) {
  const result = await evaluateValue(tabId, `(${resolveLocator.toString()})(${JSON.stringify(locator || {})})`);
  if (!result) throw codedError("LOCATOR_NOT_FOUND", `No element matched locator ${JSON.stringify(locator)}`);
  if (result.ambiguous) throw codedError("LOCATOR_AMBIGUOUS", `Locator matched ${result.count} elements`, result);
  return result;
}

async function setFileInput(tabId, selector, files) {
  if (!Array.isArray(files) || files.length === 0) throw codedError("INVALID_PARAMS", "files must be a non-empty array");
  const document = await sendCdp(tabId, "DOM.getDocument", { depth: 0, pierce: true });
  const match = await sendCdp(tabId, "DOM.querySelector", { nodeId: document.root.nodeId, selector });
  if (!match.nodeId) throw codedError("LOCATOR_NOT_FOUND", `No file input matched ${selector}`);
  await sendCdp(tabId, "DOM.setFileInputFiles", { nodeId: match.nodeId, files });
  return { selector, files: files.map((file) => file.split(/[\\/]/).pop()) };
}

function getEvents(params) {
  const afterSequence = Number(params.afterSequence || 0);
  const limit = Math.min(Math.max(Number(params.limit || 100), 1), 500);
  const filtered = events.filter((event) => event.sequence > afterSequence && (!params.tabId || event.source?.tabId === params.tabId) && (!params.methods || params.methods.includes(event.method)));
  const page = filtered.slice(0, limit);
  return { events: page, cursor: page.at(-1)?.sequence || afterSequence, hasMore: filtered.length > page.length, truncated: events.length > 0 && afterSequence < events[0].sequence - 1 };
}

function recordEvent(event) {
  events.push({ sequence: ++eventSequence, timestamp: Date.now(), ...event });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

async function assertTabNotBlocked(tabId, settings) {
  const tab = await chrome.tabs.get(tabId);
  await assertUrlNotBlocked(tab.url || "about:blank", settings);
}

async function assertUrlNotBlocked(value, settings) {
  if (!value || /^(about|chrome|chrome-extension):/.test(value)) return;
  const host = new URL(value).hostname.toLowerCase();
  if (settings.blockedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
    throw codedError("SITE_BLOCKED", `Site is blocked by extension settings: ${host}`);
  }
}

function readTextExpression(maxChars = 50000) {
  return `(() => ({ url: location.href, title: document.title, text: (document.body?.innerText || "").slice(0, ${Math.max(1, Math.min(Number(maxChars) || 50000, 500000))}) }))()`;
}

function domSnapshotExpression(params) {
  const maxNodes = Math.max(1, Math.min(Number(params.maxNodes) || 1000, 5000));
  const maxTextChars = Math.max(100, Math.min(Number(params.maxTextChars) || 20000, 200000));
  return `(() => {
    const maxNodes = ${maxNodes}; const maxTextChars = ${maxTextChars};
    const selector = (el) => {
      if (el.id && CSS.escape) return '#' + CSS.escape(el.id);
      const parts = []; let node = el;
      while (node && node.nodeType === 1 && parts.length < 6) {
        let part = node.localName; if (!part) break;
        const parent = node.parentElement;
        if (parent) { const peers = [...parent.children].filter(x => x.localName === node.localName); if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(node) + 1) + ')'; }
        parts.unshift(part); node = parent;
      }
      return parts.join(' > ');
    };
    const role = (el) => el.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT: el.type === 'checkbox' ? 'checkbox' : 'textbox',SELECT:'combobox',TEXTAREA:'textbox'}[el.tagName] || null);
    const nodes = [];
    for (const el of document.querySelectorAll('a,button,input,select,textarea,[role],[contenteditable="true"],summary,[tabindex]')) {
      if (nodes.length >= maxNodes) break;
      const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      nodes.push({ selector: selector(el), tag: el.localName, role: role(el), name: (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().slice(0, 500), type: el.getAttribute('type'), disabled: !!el.disabled, checked: el.checked, rect: {x:r.x,y:r.y,width:r.width,height:r.height} });
    }
    return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, maxTextChars), nodes };
  })()`;
}

function resolveLocator(locator) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const implicitRole = (el) => el.getAttribute("role") || ({
    A: el.hasAttribute("href") ? "link" : null,
    BUTTON: "button",
    SELECT: "combobox",
    TEXTAREA: "textbox",
    INPUT: el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : ["button", "submit", "reset"].includes(el.type) ? "button" : "textbox"
  }[el.tagName] || null);
  const accessibleName = (el) => normalize(el.getAttribute("aria-label") || (el.labels ? [...el.labels].map((x) => x.innerText).join(" ") : "") || el.innerText || el.value || el.getAttribute("placeholder"));
  let candidates;
  if (locator.css) candidates = [...document.querySelectorAll(locator.css)];
  else if (locator.testId) candidates = [...document.querySelectorAll(`[data-testid="${CSS.escape(locator.testId)}"]`)];
  else candidates = [...document.querySelectorAll("a,button,input,select,textarea,[role],[contenteditable='true'],summary,[tabindex]")];
  if (locator.role) candidates = candidates.filter((el) => implicitRole(el) === locator.role);
  if (locator.label) candidates = candidates.filter((el) => accessibleName(el) === normalize(locator.label) || (!locator.exact && accessibleName(el).includes(normalize(locator.label))));
  if (locator.text) candidates = candidates.filter((el) => normalize(el.innerText || el.textContent) === normalize(locator.text) || (!locator.exact && normalize(el.innerText || el.textContent).includes(normalize(locator.text))));
  if (locator.name) candidates = candidates.filter((el) => accessibleName(el) === normalize(locator.name) || (!locator.exact && accessibleName(el).includes(normalize(locator.name))));
  candidates = candidates.filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; });
  if (candidates.length !== 1) return candidates.length === 0 ? null : { ambiguous: true, count: candidates.length };
  const el = candidates[0]; el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.localName, role: implicitRole(el), name: accessibleName(el) };
}

function keyDefinition(key) {
  const known = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
    Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }
  };
  if (known[key]) return known[key];
  if (key.length === 1) return { key, text: key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : undefined };
  return { key, code: key };
}

function capabilityList() {
  return ["tabs", "tabGroups", "navigation", "domSnapshot", "accessibility", "playwrightStyleLocators", "screenshots", "coordinateInput", "drag", "input", "fileUpload", "downloads", "history", "bookmarks", "cdp", "events"];
}

function requireTabId(params) {
  const value = Number(params.tabId);
  if (!Number.isInteger(value) || value < 0) throw codedError("INVALID_PARAMS", "tabId must be a non-negative integer");
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw codedError("INVALID_PARAMS", `${name} must be a non-empty string`);
  return value;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function codedError(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

connectNative();
