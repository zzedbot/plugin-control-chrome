import assert from "node:assert/strict";
import http from "node:http";
import { connectBridge, listBridgeInstances } from "../src/bridge-client.mjs";
import { verifyChromeRuntime } from "./chrome-e2e-preflight.mjs";

const foreignFrameUrl = process.env.UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL || "";
const requireForeignFrame = process.argv.includes("--require-foreign-frame");
if (requireForeignFrame && !foreignFrameUrl) {
  throw new Error("UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL is required for the foreign-frame regression test");
}
if (foreignFrameUrl && !/^chrome-extension:\/\/[a-p]{32}\//.test(foreignFrameUrl)) {
  throw new Error("UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL must be a chrome-extension:// URL with a valid extension ID");
}

const instances = await listBridgeInstances();
const requestedInstanceId = process.env.UNIVERSAL_BROWSER_INSTANCE_ID;
const selected = requestedInstanceId
  ? instances.find(({ instanceId }) => instanceId === requestedInstanceId)
  : instances.length === 1 ? instances[0] : null;
if (!selected) {
  throw new Error(requestedInstanceId
    ? `Bridge instance ${requestedInstanceId} is not running`
    : `Expected exactly one bridge instance; found ${instances.length}. Set UNIVERSAL_BROWSER_INSTANCE_ID.`);
}

const bridge = await connectBridge({ instanceId: selected.instanceId });
const runtime = await verifyChromeRuntime(bridge);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(testPage(foreignFrameUrl));
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

let tabId;
let stage = "openTab";
let primaryError;
try {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const tab = await bridge.call("browser.openTab", { url: `${baseUrl}/`, active: true });
  tabId = tab.id;
  stage = "waitForComplete";
  await waitForComplete(bridge, tabId);

  stage = "claimTab";
  await bridge.call("browser.claimTab", { tabId });
  stage = "navigateAfterClaim";
  await bridge.call("browser.navigate", { tabId, url: `${baseUrl}/after-claim` });
  await waitForComplete(bridge, tabId);
  stage = "domSnapshot";
  const before = await bridge.call("browser.domSnapshot", { tabId, maxNodes: 50, maxTextChars: 2000 });
  assert.ok(before.nodes.some(({ selector }) => selector === "#test-button"), "Test button was not found");

  const button = before.nodes.find(({ selector }) => selector === "#test-button");
  stage = "virtualCursor";
  const cursorX = button.rect.x + button.rect.width / 2;
  const cursorY = button.rect.y + button.rect.height / 2;
  await bridge.call("browser.mouseMove", { tabId, x: cursorX, y: cursorY });
  const cursorState = await bridge.call("browser.cdp", {
    tabId,
    command: "Runtime.evaluate",
    params: { expression: `(() => { const node = document.querySelector('lingee-agent-cursor'); return node && { marker: node.dataset.lingeeAgentCursor, state: node.dataset.state, x: node.dataset.x, y: node.dataset.y }; })()`, returnByValue: true }
  });
  assert.deepEqual(cursorState.result.value, { marker: "overlay-v1", state: "move", x: String(Math.round(cursorX)), y: String(Math.round(cursorY)) });

  if (foreignFrameUrl) {
    stage = "verifyForeignFrame";
    await waitForText(bridge, tabId, /外部框架已移除/);
  }

  stage = "click";
  await bridge.call("browser.click", { tabId, locator: { css: "#test-button" } });
  stage = "readText";
  const after = await bridge.call("browser.readText", { tabId, maxChars: 2000 });
  assert.match(after.text, /点击成功/);

  process.stdout.write(`${JSON.stringify({ ok: true, instanceId: selected.instanceId, ...runtime, virtualCursorChecked: true, foreignFrameChecked: Boolean(foreignFrameUrl) })}\n`);
} catch (error) {
  primaryError = error;
  error.message = `${stage}: ${error.message}`;
  throw error;
} finally {
  let cleanupError;
  try {
    if (tabId != null) {
      if (primaryError) {
        await bridge.call("browser.detachTab", { tabId }).catch(() => {});
        await bridge.call("browser.closeTab", { tabId }).catch(() => {});
      } else {
        await bridge.call("browser.detachTab", { tabId });
        await bridge.call("browser.closeTab", { tabId });
        await assert.rejects(bridge.call("browser.getTab", { tabId }), /No tab|tab.*not found/i);
      }
    }
  } catch (error) {
    cleanupError = error;
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  if (!primaryError && cleanupError) throw cleanupError;
}

async function waitForComplete(client, tabId, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await client.call("browser.getTab", { tabId });
    if (tab.status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Tab ${tabId} did not finish loading`);
}

async function waitForText(client, tabId, expected, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await client.call("browser.readText", { tabId, maxChars: 2000 });
    if (expected.test(result.text)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Foreign extension frame was not neutralized");
}

function testPage(frameUrl) {
  const frame = frameUrl ? `<iframe id="foreign-frame" src="${escapeHtml(frameUrl)}"></iframe>` : "";
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Universal Chrome E2E</title></head>
<body>
  <h1>通用浏览器控制测试</h1>
  <button id="test-button">执行测试</button>
  <p id="result">等待操作</p>
  <p id="frame-result">等待框架验证</p>
  ${frame}
  <script>
    document.querySelector("#test-button").addEventListener("click", () => {
      document.querySelector("#result").textContent = "点击成功";
    });
    const frame = document.querySelector("#foreign-frame");
    if (frame) {
      let blankReuseAttempted = false;
      frame.addEventListener("load", () => {
        try {
          const nested = frame.contentDocument.createElement("iframe");
          nested.src = ${JSON.stringify(frameUrl)};
          frame.contentDocument.body.append(nested);
          blankReuseAttempted = true;
        } catch {}
      });
      const timer = setInterval(() => {
        try {
          if (blankReuseAttempted && !document.querySelector("#foreign-frame")) {
            document.querySelector("#frame-result").textContent = "外部框架已移除";
            clearInterval(timer);
          }
        } catch {}
      }, 25);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
