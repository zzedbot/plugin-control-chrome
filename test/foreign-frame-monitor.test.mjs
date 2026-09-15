import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { FOREIGN_FRAME_MONITOR_KEY, installForeignFrameMonitor, removeForeignFrameMonitor } from "../extension/foreign-frame-monitor.js";

test("background injects the monitor by document ID and never targets every frame blindly", async () => {
  const manifest = JSON.parse(await fs.readFile("extension/manifest.json", "utf8"));
  const background = await fs.readFile("extension/background.js", "utf8");
  const injection = await fs.readFile("extension/monitor-injection.js", "utf8");

  assert.equal(manifest.content_scripts, undefined);
  assert.match(background, /getAllFrames\(\{\s*tabId\s*\}\)/);
  assert.match(background, /documentIds:/);
  assert.match(injection, /frameIds:\s*\[0\]/);
  assert.doesNotMatch(background, /allFrames:\s*true/);
  assert.match(background, /func:\s*installForeignFrameMonitor/);
  assert.match(background, /injectImmediately:\s*true/);
});

test("monitor removes existing, dynamic, mutated, and closed-shadow foreign frames after safe navigation", { concurrency: false }, () => {
  const harness = installDomHarness();
  try {
    const existing = harness.element("iframe", { src: "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/panel.html" });
    let blankReuseAttempted = false;
    existing.addEventListener("load", () => { blankReuseAttempted = true; });
    const own = harness.element("iframe", { src: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/panel.html" });
    const ordinary = harness.element("iframe", { src: "https://example.com/frame" });
    const closedShadowFrame = harness.element("frame", { src: "chrome-extension://cccccccccccccccccccccccccccccccc/frame.html" });
    const shadowHost = harness.element("div");
    shadowHost.closedShadowRoot = harness.shadowRoot([closedShadowFrame]);
    harness.document.children.push(existing, own, ordinary, shadowHost);

    assert.equal(installForeignFrameMonitor(FOREIGN_FRAME_MONITOR_KEY, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.equal(existing.getAttribute("src"), "about:blank");
    existing.dispatchLoad();
    assert.equal(blankReuseAttempted, true);
    assert.equal(existing.removed, true);
    assert.equal(own.getAttribute("src").startsWith("chrome-extension://"), true);
    assert.equal(ordinary.getAttribute("src"), "https://example.com/frame");
    assert.equal(closedShadowFrame.getAttribute("src"), "about:blank");
    closedShadowFrame.dispatchLoad();
    assert.equal(closedShadowFrame.removed, true);
    assert.equal(harness.observers.length, 1);

    const dynamic = harness.element("iframe", { src: "chrome-extension://dddddddddddddddddddddddddddddddd/dynamic.html" });
    harness.observers[0].callback([{ type: "childList", addedNodes: [dynamic] }]);
    assert.equal(dynamic.getAttribute("src"), "about:blank");
    dynamic.dispatchLoad();
    assert.equal(dynamic.removed, true);

    const mutated = harness.element("iframe", { src: "https://example.com/first" });
    mutated.setAttribute("src", "chrome-extension://eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/mutated.html");
    harness.observers[0].callback([{ type: "attributes", target: mutated, addedNodes: [] }]);
    assert.equal(mutated.getAttribute("src"), "about:blank");
    mutated.dispatchLoad();
    assert.equal(mutated.removed, true);

    assert.equal(installForeignFrameMonitor(FOREIGN_FRAME_MONITOR_KEY, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.equal(harness.observers.length, 1);
    assert.equal(removeForeignFrameMonitor(FOREIGN_FRAME_MONITOR_KEY), true);
    assert.equal(harness.observers[0].disconnected, true);
    assert.equal(globalThis[FOREIGN_FRAME_MONITOR_KEY], undefined);
  } finally {
    harness.restore();
  }
});

function installDomHarness() {
  const saved = new Map();
  for (const key of ["Document", "Element", "HTMLElement", "ShadowRoot", "MutationObserver", "NodeFilter", "document", "chrome"]) saved.set(key, globalThis[key]);
  const observers = [];

  class FakeElement {
    constructor(tagName, attributes = {}) {
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map(Object.entries(attributes));
      this.children = [];
      this.shadowRoot = null;
      this.closedShadowRoot = null;
      this.listeners = new Map();
      this.removed = false;
    }
    get src() { return this.getAttribute("src") || ""; }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(type, callback, options = {}) {
      const listeners = this.listeners.get(type) || [];
      listeners.push({ callback, once: options.once === true });
      this.listeners.set(type, listeners);
    }
    remove() { this.removed = true; }
    dispatchLoad() {
      const listeners = this.listeners.get("load") || [];
      for (const listener of [...listeners]) listener.callback();
      this.listeners.set("load", listeners.filter((listener) => !listener.once));
    }
  }
  class FakeHTMLElement extends FakeElement {}
  class FakeDocument { constructor(children = []) { this.children = children; } }
  class FakeShadowRoot { constructor(children = []) { this.children = children; } }
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(_root, options) { this.options = options; }
    disconnect() { this.disconnected = true; }
  }

  const document = new FakeDocument();
  document.createTreeWalker = (root) => {
    const nodes = [];
    const visit = (value) => {
      for (const child of value.children || []) {
        nodes.push(child);
        visit(child);
      }
    };
    visit(root);
    let index = 0;
    return { nextNode: () => nodes[index++] || null };
  };

  Object.assign(globalThis, {
    Document: FakeDocument,
    Element: FakeElement,
    HTMLElement: FakeHTMLElement,
    ShadowRoot: FakeShadowRoot,
    MutationObserver: FakeMutationObserver,
    NodeFilter: { SHOW_ELEMENT: 1 },
    document,
    chrome: { dom: { openOrClosedShadowRoot: (element) => element.closedShadowRoot || element.shadowRoot } }
  });

  return {
    document,
    observers,
    element: (tagName, attributes) => new FakeHTMLElement(tagName, attributes),
    shadowRoot: (children) => new FakeShadowRoot(children),
    restore() {
      Reflect.deleteProperty(globalThis, FOREIGN_FRAME_MONITOR_KEY);
      for (const [key, value] of saved) {
        if (value === undefined) Reflect.deleteProperty(globalThis, key);
        else globalThis[key] = value;
      }
    }
  };
}
