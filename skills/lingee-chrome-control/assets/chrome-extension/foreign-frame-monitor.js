export const FOREIGN_FRAME_MONITOR_KEY = "__universalBrowserForeignExtensionFrameMonitor";

export function installForeignFrameMonitor(markerKey, ownerExtensionId) {
  if (globalThis[markerKey]) return true;

  const observedRoots = new WeakSet();
  const diagnostics = { foreignFramesSeen: 0, blankedFrames: 0, removedFrames: 0, shadowRootsObserved: 0,
    closedShadowAccessErrors: 0, closedShadowApiAvailable: typeof chrome.dom?.openOrClosedShadowRoot === "function" };
  const seenForeignFrames = new WeakSet();
  const extensionUrlIsForeign = (value) => {
    if (typeof value !== "string" || !value.startsWith("chrome-extension://")) return false;
    try {
      const extensionId = new URL(value).hostname;
      return extensionId.length > 0 && extensionId !== ownerExtensionId;
    } catch {
      return false;
    }
  };
  const shadowRootFor = (element) => {
    if (!(element instanceof HTMLElement)) return null;
    const includeClosedShadowRoot = chrome.dom?.openOrClosedShadowRoot;
    if (typeof includeClosedShadowRoot === "function") {
      try { return chrome.dom.openOrClosedShadowRoot(element); } catch { diagnostics.closedShadowAccessErrors += 1; }
    }
    return element.shadowRoot;
  };
  const neutralizeForeignFrame = (element) => {
    if (!(element instanceof Element)) return;
    const shadowRoot = shadowRootFor(element);
    if (element.tagName === "IFRAME" || element.tagName === "FRAME") {
      const attributeSource = element.getAttribute("src")?.trim() || "";
      const resolvedSource = element.tagName === "IFRAME" ? element.src?.trim() || "" : "";
      if (extensionUrlIsForeign(attributeSource) || extensionUrlIsForeign(resolvedSource)) {
        if (!seenForeignFrames.has(element)) {
          seenForeignFrames.add(element);
          diagnostics.foreignFramesSeen += 1;
        }
        const removeAfterSafeNavigation = () => {
          if (element.getAttribute("src") !== "about:blank") return;
          element.remove();
          diagnostics.removedFrames += 1;
        };
        element.addEventListener("load", removeAfterSafeNavigation, { once: true });
        element.removeAttribute("srcdoc");
        element.setAttribute("src", "about:blank");
        diagnostics.blankedFrames += 1;
      }
    }
    if (shadowRoot) observeRoot(shadowRoot);
  };
  const scanRoot = (root) => {
    if (!(root instanceof Document || root instanceof ShadowRoot || root instanceof Element)) return;
    if (root instanceof Element) neutralizeForeignFrame(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let element = walker.nextNode(); element; element = walker.nextNode()) {
      neutralizeForeignFrame(element);
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) {
        neutralizeForeignFrame(record.target);
      }
      for (const node of record.addedNodes) scanRoot(node);
    }
  });
  const observeRoot = (root) => {
    if (observedRoots.has(root)) return;
    observedRoots.add(root);
    if (root instanceof ShadowRoot) diagnostics.shadowRootsObserved += 1;
    observer.observe(root, { attributes: true, attributeFilter: ["src", "srcdoc"], childList: true, subtree: true });
    scanRoot(root);
  };

  globalThis[markerKey] = { observer, observedRoots, diagnostics };
  try {
    observeRoot(document);
  } catch (error) {
    observer.disconnect();
    Reflect.deleteProperty(globalThis, markerKey);
    throw error;
  }
  return true;
}

export function readForeignFrameMonitorDiagnostics(markerKey) {
  const state = globalThis[markerKey];
  return state ? { installed: true, ...state.diagnostics } : { installed: false };
}

export function removeForeignFrameMonitor(markerKey) {
  const state = globalThis[markerKey];
  if (!state) return true;
  try {
    if (typeof state.observer?.disconnect === "function") state.observer.disconnect();
  } finally {
    Reflect.deleteProperty(globalThis, markerKey);
  }
  return true;
}
