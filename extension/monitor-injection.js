// Confirm coverage against a fresh frame inventory, not the inventory that
// preceded an injection: navigation may replace a document during either API.
export async function installMonitorsForTab({
  tabId,
  installed,
  getAllFrames,
  isInjectableFrame,
  executeMonitor,
  maxAttempts = 20,
  retryDelayMs = 25,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))
}) {
  const inventory = async () => (await getAllFrames({ tabId }) || []).filter(isInjectableFrame);
  const prune = (frames) => {
    const active = new Set(frames.map((frame) => frame.documentId));
    for (const id of installed) if (!active.has(id)) installed.delete(id);
  };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const frames = await inventory();
    prune(frames);
    for (const frame of frames) {
      if (installed.has(frame.documentId)) continue;
      try {
        const results = await executeMonitor({ tabId, documentIds: [frame.documentId] });
        if (results?.some((result) => result.documentId === frame.documentId && result.result === true)) {
          installed.add(frame.documentId);
        }
      } catch {}
    }
    const top = frames.find((frame) => frame.frameId === 0);
    if (!top || !installed.has(top.documentId)) {
      try {
        const results = await executeMonitor({ tabId, frameIds: [0] });
        for (const result of results || []) {
          if (result.frameId === 0 && result.documentId && result.result === true) installed.add(result.documentId);
        }
      } catch {}
    }
    const current = await inventory();
    prune(current);
    if (current.some((frame) => frame.frameId === 0) && current.every((frame) => installed.has(frame.documentId))) return;
    if (attempt + 1 < maxAttempts) await wait(retryDelayMs);
  }
  throw Object.assign(new Error("Could not install the foreign extension frame monitor in every active page frame"), {
    code: "FOREIGN_FRAME_MONITOR_FAILED"
  });
}

export function isMonitorablePageFrame(frame, ownerExtensionId, neutralizedFrameIds = new Set()) {
  if (!frame?.documentId || frame.errorOccurred) return false;
  if (frame.documentLifecycle && frame.documentLifecycle !== "active") return false;
  if (frame.frameId !== 0 && neutralizedFrameIds.has(frame.frameId)) return false;
  if (typeof frame.url === "string" && frame.url.startsWith("chrome-extension://")) {
    try { return new URL(frame.url).hostname === ownerExtensionId; } catch { return false; }
  }
  return true;
}

export function expandFrameIdSubtree(frames, frameIds) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const frame of frames) {
      if (frameIds.has(frame.frameId) || !frameIds.has(frame.parentFrameId)) continue;
      frameIds.add(frame.frameId);
      changed = true;
    }
  }
  const activeFrameIds = new Set(frames.map((frame) => frame.frameId));
  for (const frameId of [...frameIds]) {
    if (!activeFrameIds.has(frameId)) frameIds.delete(frameId);
  }
  return frameIds;
}
