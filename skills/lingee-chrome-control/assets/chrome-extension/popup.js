const status = document.querySelector("#status");
document.querySelector("#extension-id").textContent = chrome.runtime.id;

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: "bridge.status" });
  status.textContent = state.connected ? "Connected to native host" : `Disconnected${state.error ? `: ${state.error}` : ""}`;
  status.className = `status ${state.connected ? "connected" : "disconnected"}`;
}

document.querySelector("#reconnect").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "bridge.reconnect" });
  setTimeout(refresh, 300);
});

refresh();
