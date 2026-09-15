import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { VIRTUAL_CURSOR_KEY, removeVirtualCursor, renderVirtualCursor } from "../extension/virtual-cursor.js";

test("virtual cursor starts centered, stays visible, recovers its host, and is removable", { concurrency: false }, () => {
  const saved = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight, MutationObserver: globalThis.MutationObserver, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };
  const root = new FakeElement("html");
  const observers = [];
  const listeners = new Map();
  globalThis.addEventListener = (type, listener) => listeners.set(type, listener);
  globalThis.removeEventListener = (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); };
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  };
  globalThis.document = {
    documentElement: root,
    createElement: (tagName) => new FakeElement(tagName)
  };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  try {
    assert.deepEqual(renderVirtualCursor(VIRTUAL_CURSOR_KEY, null, null, "ensure"), {
      visible: true, x: 400, y: 300, phase: "ensure"
    });
    const host = root.children[0];
    assert.equal(host.tagName, "LINGEE-AGENT-CURSOR");
    assert.equal(host.shadowMode, "closed");
    assert.match(host.style.cssText, /pointer-events:none/);
    assert.equal(host.attributes.get("data-state"), "move");

    globalThis.innerHeight = 500;
    listeners.get("resize")();
    assert.equal(host.attributes.get("data-y"), "250", "an untouched cursor follows the viewport center");

    const state = globalThis[VIRTUAL_CURSOR_KEY];
    assert.match(state.cursor.style.transform, /400px,250px/);
    renderVirtualCursor(VIRTUAL_CURSOR_KEY, 999, -10, "pressed");
    assert.equal(root.children.length, 1, "repeated moves reuse one overlay");
    assert.equal(host.attributes.get("data-x"), "799");
    assert.equal(host.attributes.get("data-y"), "0");
    assert.equal(state.cursor.classList.has("pressed"), true);
    globalThis.innerHeight = 400;
    listeners.get("resize")();
    assert.equal(host.attributes.get("data-y"), "0", "a moved cursor is not recentered on resize");
    renderVirtualCursor(VIRTUAL_CURSOR_KEY, null, null, "ensure");
    assert.equal(host.attributes.get("data-x"), "799", "ensure preserves the last pointer position");
    assert.equal(host.attributes.get("data-state"), "pressed", "ensure preserves the current pointer phase");

    host.remove();
    assert.equal(host.isConnected, false);
    renderVirtualCursor(VIRTUAL_CURSOR_KEY, null, null, "ensure");
    assert.equal(observers[0].disconnected, true, "a racing action retires the old observer");
    const replacement = globalThis[VIRTUAL_CURSOR_KEY];
    assert.equal(replacement.host.attributes.get("data-x"), "799", "a recreated host preserves the last position");
    replacement.host.remove();
    observers[1].callback();
    assert.equal(replacement.host.isConnected, true, "the observer restores a removed cursor host");

    renderVirtualCursor(VIRTUAL_CURSOR_KEY, 40, 50, "click");
    assert.equal(replacement.ring.classList.has("pulse"), true);
    assert.equal(removeVirtualCursor(VIRTUAL_CURSOR_KEY), true);
    assert.equal(observers[1].disconnected, true);
    assert.equal(host.isConnected, false);
    assert.equal(globalThis[VIRTUAL_CURSOR_KEY], undefined);
  } finally {
    removeVirtualCursor(VIRTUAL_CURSOR_KEY);
    globalThis.document = saved.document;
    globalThis.innerWidth = saved.innerWidth;
    globalThis.innerHeight = saved.innerHeight;
    globalThis.MutationObserver = saved.MutationObserver;
    globalThis.addEventListener = saved.addEventListener;
    globalThis.removeEventListener = saved.removeEventListener;
  }
});

test("background integrates the cursor with all pointer actions and detach cleanup", async () => {
  const background = await fs.readFile("extension/background.js", "utf8");
  assert.match(background, /case "browser\.mouseMove"[\s\S]*showVirtualCursor/);
  assert.match(background, /case "browser\.coordinateClick"[\s\S]*"pressed"/);
  assert.match(background, /async function clickLocator[\s\S]*"click"/);
  assert.match(background, /async function drag[\s\S]*showVirtualCursor/);
  assert.match(background, /async function ensureDebugger[\s\S]*null, null, "ensure"/);
  assert.match(background, /function refreshForeignFrameMonitor[\s\S]*null, null, "ensure"/);
  assert.match(background, /func: removeVirtualCursor/);
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { for (const value of values) this.values.add(value); }
  remove(...values) { for (const value of values) this.values.delete(value); }
  toggle(value, force) { if (force) this.values.add(value); else this.values.delete(value); }
  has(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.style = { cssText: "", setProperty(name, value) { this[name] = value; } };
    this.classList = new FakeClassList();
    this.isConnected = false;
    this.offsetWidth = 34;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  attachShadow({ mode }) {
    this.shadowMode = mode;
    const cursor = new FakeElement("div");
    const ring = new FakeElement("div");
    return {
      set innerHTML(_value) {},
      querySelector(selector) { return selector === "#cursor" ? cursor : ring; }
    };
  }
  appendChild(child) {
    if (child.parent) child.parent.children = child.parent.children.filter((item) => item !== child);
    child.parent = this;
    child.isConnected = true;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((item) => item !== this);
    this.parent = null;
    this.isConnected = false;
  }
}
