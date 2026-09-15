import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { VIRTUAL_CURSOR_KEY, removeVirtualCursor, renderVirtualCursor } from "../extension/virtual-cursor.js";

test("virtual cursor is isolated, reusable, clamped, animated, and removable", { concurrency: false }, () => {
  const saved = { document: globalThis.document, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight };
  const root = new FakeElement("html");
  globalThis.document = {
    documentElement: root,
    createElement: (tagName) => new FakeElement(tagName)
  };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  try {
    assert.deepEqual(renderVirtualCursor(VIRTUAL_CURSOR_KEY, 120.4, 80.6, "move", 5000), {
      visible: true, x: 120.4, y: 80.6, phase: "move"
    });
    const host = root.children[0];
    assert.equal(host.tagName, "LINGEE-AGENT-CURSOR");
    assert.equal(host.shadowMode, "closed");
    assert.match(host.style.cssText, /pointer-events:none/);
    assert.equal(host.attributes.get("data-state"), "move");

    const state = globalThis[VIRTUAL_CURSOR_KEY];
    assert.match(state.cursor.style.transform, /120\.4px,80\.6px/);
    renderVirtualCursor(VIRTUAL_CURSOR_KEY, 999, -10, "pressed", 5000);
    assert.equal(root.children.length, 1, "repeated moves reuse one overlay");
    assert.equal(host.attributes.get("data-x"), "799");
    assert.equal(host.attributes.get("data-y"), "0");
    assert.equal(state.cursor.classList.has("pressed"), true);

    renderVirtualCursor(VIRTUAL_CURSOR_KEY, 40, 50, "click", 5000);
    assert.equal(state.ring.classList.has("pulse"), true);
    assert.equal(removeVirtualCursor(VIRTUAL_CURSOR_KEY), true);
    assert.equal(host.isConnected, false);
    assert.equal(globalThis[VIRTUAL_CURSOR_KEY], undefined);
  } finally {
    removeVirtualCursor(VIRTUAL_CURSOR_KEY);
    globalThis.document = saved.document;
    globalThis.innerWidth = saved.innerWidth;
    globalThis.innerHeight = saved.innerHeight;
  }
});

test("background integrates the cursor with all pointer actions and detach cleanup", async () => {
  const background = await fs.readFile("extension/background.js", "utf8");
  assert.match(background, /case "browser\.mouseMove"[\s\S]*showVirtualCursor/);
  assert.match(background, /case "browser\.coordinateClick"[\s\S]*"pressed"/);
  assert.match(background, /async function clickLocator[\s\S]*"click"/);
  assert.match(background, /async function drag[\s\S]*showVirtualCursor/);
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
  attachShadow({ mode }) {
    this.shadowMode = mode;
    const cursor = new FakeElement("div");
    const ring = new FakeElement("div");
    return {
      set innerHTML(_value) {},
      querySelector(selector) { return selector === "#cursor" ? cursor : ring; }
    };
  }
  appendChild(child) { child.isConnected = true; this.children.push(child); return child; }
  remove() { this.isConnected = false; }
}
