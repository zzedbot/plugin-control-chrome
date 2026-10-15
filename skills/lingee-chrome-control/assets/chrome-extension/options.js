const enabled = document.querySelector("#enabled");
const blocked = document.querySelector("#blocked");
const message = document.querySelector("#message");

async function load() {
  const settings = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  enabled.checked = settings.enabled;
  blocked.value = settings.blockedHosts.join("\n");
}

document.querySelector("#save").addEventListener("click", async () => {
  const blockedHosts = blocked.value.split(/\r?\n/).map((value) => value.trim().toLowerCase()).filter(Boolean);
  await chrome.storage.local.set({ enabled: enabled.checked, blockedHosts });
  message.textContent = "Saved.";
  setTimeout(() => { message.textContent = ""; }, 1200);
});

load();
