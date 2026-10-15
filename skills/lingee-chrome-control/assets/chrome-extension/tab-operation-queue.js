export function createTabOperationQueue() {
  const tails = new Map();
  const generations = new Map();

  function run(tabId, operation) {
    const generation = generations.get(tabId) || 0;
    const previous = tails.get(tabId) || Promise.resolve();
    const result = previous.then(() => {
      if ((generations.get(tabId) || 0) !== generation) {
        throw Object.assign(new Error(`Tab ${tabId} operation was cancelled`), { code: "TAB_OPERATION_CANCELLED" });
      }
      return operation();
    });
    const tail = result.then(() => undefined, () => undefined);
    tails.set(tabId, tail);
    return result.finally(() => {
      if (tails.get(tabId) === tail) tails.delete(tabId);
    });
  }

  function cancel(tabId) {
    generations.set(tabId, (generations.get(tabId) || 0) + 1);
    tails.delete(tabId);
  }

  return { run, cancel, has: (tabId) => tails.has(tabId) };
}
