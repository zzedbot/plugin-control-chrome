export function createDebuggerController({
  debuggerApi,
  cdpVersion = "1.3",
  installMonitor,
  diagnoseFailure = async () => undefined,
  removeMonitor = async () => {}
}) {
  const attachedTabs = new Set();
  const controlledTabs = new Set();
  const initializationByTab = new Map();
  const monitorRefreshByTab = new Map();
  const detachmentByTab = new Map();
  const generationByTab = new Map();

  function currentGeneration(tabId) {
    return generationByTab.get(tabId) || 0;
  }

  function beginControl(tabId) {
    const generation = currentGeneration(tabId) + 1;
    generationByTab.set(tabId, generation);
    controlledTabs.add(tabId);
    return generation;
  }

  function invalidateControl(tabId) {
    generationByTab.set(tabId, currentGeneration(tabId) + 1);
    attachedTabs.delete(tabId);
    controlledTabs.delete(tabId);
  }

  function isCurrent(tabId, generation) {
    return controlledTabs.has(tabId) && currentGeneration(tabId) === generation;
  }

  function assertCurrent(tabId, generation) {
    if (!isCurrent(tabId, generation)) {
      throw Object.assign(new Error(`Debugger initialization was cancelled for tab ${tabId}`), { code: "DEBUGGER_INITIALIZATION_CANCELLED" });
    }
  }

  async function refreshMonitor(tabId, generation = currentGeneration(tabId)) {
    if (!isCurrent(tabId, generation)) return false;
    const previous = monitorRefreshByTab.get(tabId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      if (!isCurrent(tabId, generation)) return false;
      await installMonitor(tabId);
      if (!isCurrent(tabId, generation)) {
        try { await removeMonitor(tabId); } catch {}
        return false;
      }
      return true;
    });
    monitorRefreshByTab.set(tabId, pending);
    pending.finally(() => {
      if (monitorRefreshByTab.get(tabId) === pending) monitorRefreshByTab.delete(tabId);
    }).catch(() => {});
    return pending;
  }

  async function initialize(tabId, generation) {
    let ownsConnection = false;
    let attachmentMayBeOurs = false;
    try {
      try {
        await refreshMonitor(tabId, generation);
      } catch (error) {
        throw stageError(error, "foreign-frame-monitor");
      }
      assertCurrent(tabId, generation);
      try {
        await debuggerApi.attach({ tabId }, cdpVersion);
        ownsConnection = true;
      } catch (error) {
        if (!isAlreadyAttachedError(error)) throw stageError(error, "debugger.attach");
        attachmentMayBeOurs = true;
      }

      assertCurrent(tabId, generation);
      try {
        await debuggerApi.sendCommand({ tabId }, "Page.enable");
      } catch (error) {
        throw stageError(error, "Page.enable");
      }
      ownsConnection = true;
      assertCurrent(tabId, generation);
      try {
        await debuggerApi.sendCommand({ tabId }, "Runtime.enable");
      } catch (error) {
        throw stageError(error, "Runtime.enable");
      }
      assertCurrent(tabId, generation);
      attachedTabs.add(tabId);
    } catch (error) {
      try {
        const diagnostics = await diagnoseFailure(tabId);
        if (diagnostics) error.data = { ...error.data, diagnostics };
      } catch {}
      const stillCurrent = isCurrent(tabId, generation);
      if (stillCurrent) invalidateControl(tabId);
      if (ownsConnection) {
        try { await debuggerApi.detach({ tabId }); } catch {}
      } else if (attachmentMayBeOurs) {
        try {
          await debuggerApi.sendCommand({ tabId }, "Runtime.enable");
          await debuggerApi.detach({ tabId });
        } catch {}
      }
      if (stillCurrent) {
        try { await removeMonitor(tabId); } catch {}
      }
      throw error;
    }
  }

  async function ensure(tabId) {
    while (detachmentByTab.has(tabId)) await detachmentByTab.get(tabId);
    const refreshing = monitorRefreshByTab.get(tabId);
    if (refreshing) await refreshing;
    if (attachedTabs.has(tabId)) return;
    let pending = initializationByTab.get(tabId);
    if (!pending) {
      const generation = beginControl(tabId);
      pending = initialize(tabId, generation);
      initializationByTab.set(tabId, pending);
      pending.finally(() => {
        if (initializationByTab.get(tabId) === pending) initializationByTab.delete(tabId);
      }).catch(() => {});
    }
    return pending;
  }

  async function refresh(tabId) {
    const generation = currentGeneration(tabId);
    try {
      return await refreshMonitor(tabId, generation);
    } catch (error) {
      if (isCurrent(tabId, generation) && attachedTabs.has(tabId)) {
        const cleanup = (async () => {
          invalidateControl(tabId);
          try { await debuggerApi.detach({ tabId }); } catch {}
          try { await removeMonitor(tabId); } catch {}
        })();
        detachmentByTab.set(tabId, cleanup);
        cleanup.finally(() => {
          if (detachmentByTab.get(tabId) === cleanup) detachmentByTab.delete(tabId);
        }).catch(() => {});
        await cleanup;
      }
      throw error;
    }
  }

  async function detach(tabId) {
    const existing = detachmentByTab.get(tabId);
    if (existing) return existing;
    const pending = (async () => {
      const hadAttachment = attachedTabs.has(tabId);
      invalidateControl(tabId);
      const initializing = initializationByTab.get(tabId);
      if (initializing) await initializing.catch(() => {});
      const monitorRefresh = monitorRefreshByTab.get(tabId);
      if (monitorRefresh) await monitorRefresh.catch(() => {});
      try {
        if (hadAttachment) await debuggerApi.detach({ tabId });
      } finally {
        try { await removeMonitor(tabId); } catch {}
      }
    })();
    detachmentByTab.set(tabId, pending);
    pending.finally(() => {
      if (detachmentByTab.get(tabId) === pending) detachmentByTab.delete(tabId);
    }).catch(() => {});
    return pending;
  }

  function handleDetached(tabId) {
    invalidateControl(tabId);
    const previous = detachmentByTab.get(tabId);
    const initializing = initializationByTab.get(tabId);
    const refresh = monitorRefreshByTab.get(tabId);
    const pending = (async () => {
      await previous?.catch(() => {});
      await initializing?.catch(() => {});
      await refresh?.catch(() => {});
      try { await removeMonitor(tabId); } catch {}
    })();
    detachmentByTab.set(tabId, pending);
    pending.finally(() => {
      if (detachmentByTab.get(tabId) === pending) detachmentByTab.delete(tabId);
    }).catch(() => {});
    return pending;
  }

  function forgetTab(tabId) {
    invalidateControl(tabId);
  }

  return { attachedTabs, controlledTabs, detach, ensure, forgetTab, handleDetached, refresh };
}

function isAlreadyAttachedError(error) {
  return String(error?.message || error).toLowerCase().includes("already attached");
}

function stageError(error, stage) {
  const wrapped = new Error(`${stage}: ${error?.message || String(error)}`);
  if (error?.code) wrapped.code = error.code;
  wrapped.data = { ...(error?.data || {}), stage };
  return wrapped;
}
