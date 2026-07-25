import { connectBridge } from "../src/bridge-client.mjs";

const browser = await connectBridge();
console.log(await browser.call("bridge.getInfo"));

await browser.call("policy.allowHost", { host: "example.com" });
const tab = await browser.call("browser.openTab", { url: "https://example.com" });
console.log(await browser.call("browser.domSnapshot", { tabId: tab.id }));
