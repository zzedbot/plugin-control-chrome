# Lingee Chrome Agent Bridge

Lingee Chrome Agent Bridge is a clean-room, third-party-callable implementation of the browser-control architecture used by modern desktop agents:

```text
Agent / MCP client
        │ JSON-RPC over authenticated local pipe
        ▼
Native messaging host
        │ Chrome Native Messaging (length-prefixed JSON over stdio)
        ▼
Chrome MV3 extension
        │ Chrome extension APIs + chrome.debugger / CDP
        ▼
The user's existing Chrome profile and tabs
```

It is independent software. It does **not** contain OpenAI code, binaries, extension identifiers, branding, private protocols, or private authentication mechanisms.

## Capabilities

- Existing Chrome tabs, windows, and signed-in browser state
- Tab creation, activation, closing, navigation, reload, history movement, and tab groups
- Compact DOM snapshots, page text, and accessibility-tree reads
- CSS and Playwright-style role/name, label, text, and test-ID locators
- Mouse clicks, text input, key presses, scrolling, file inputs, and JavaScript dialogs
- A persistent Precision Glass overlay with a centered Lingee status chip, dual-outline pointer, two-ring click feedback, directional wheel capsule, and drag tether
- PNG/JPEG screenshots
- Policy-allowlisted raw Chrome DevTools Protocol commands and buffered CDP events
- Codex-style runtime isolation of foreign extension frames on controlled tabs for Chrome 152+
- Optional history, bookmark, and download metadata search
- Per-site allow/block policy, sensitive-metadata gate, CDP allowlist, and a second extension-side kill switch/blocklist
- Authenticated local named-pipe/Unix-socket JSON-RPC
- MCP stdio adapter for Codex-like tools and a direct JSON-RPC CLI/client library
- Multiple Chrome bridge processes discoverable through per-instance descriptors

## Requirements

- Google Chrome with Manifest V3 support
- Node.js 22 or newer for building and MCP clients
- Windows, macOS, or Linux

The automated native-host installer has been designed for all three platforms. The current repository verification is performed on Windows.

## Build and install

1. Install build dependencies:

   ```powershell
   npm.cmd install
   ```

2. Build the standalone Native Messaging Host executable:

   ```powershell
   npm.cmd run build:host
   ```

3. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the repository's `extension` directory.

4. Copy the generated extension ID from `chrome://extensions`, then register the Native Messaging Host:

   ```powershell
   npm.cmd run install:host -- --extension-id YOUR_EXTENSION_ID
   ```

5. Fully restart Chrome. The extension popup should show **Connected to native host**.

6. Verify the bridge:

   ```powershell
   node .\src\jsonrpc-cli.mjs bridge.getInfo
   node .\src\jsonrpc-cli.mjs browser.listTabs
   ```

7. Approve a site before reading or controlling it:

   ```powershell
   node .\src\jsonrpc-cli.mjs policy.allowHost '{"host":"example.com"}'
   node .\src\jsonrpc-cli.mjs browser.openTab '{"url":"https://example.com"}'
   ```

PowerShell quoting varies by host. Third-party applications should normally call the MCP server or import `src/bridge-client.mjs` instead of shelling out.

After reloading the unpacked extension, run a real Chrome end-to-end test with:

```powershell
npm.cmd run test:chrome
```

The test checks the running host and extension versions and compatibility markers before opening a tab. It also verifies the centered-on-claim cursor and a subsequent mouse move. After changing the native host, rebuild and reinstall it; the installer registers a hash-named executable without overwriting a running host. Chrome uses the new executable on its next native connection. The latest runtime markers are `remove-after-blank-v11`, `generation-v4`, and `overlay-v8`.

To exercise Chrome 152+'s foreign-extension-frame isolation, provide a known, non-sensitive test extension resource URL through `UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL`. The test opens a loopback fixture, claims it, verifies frame neutralization, reads the DOM, clicks a button, verifies the result, and cleans up its tab.

```powershell
$env:UNIVERSAL_BROWSER_E2E_FOREIGN_FRAME_URL = "chrome-extension://EXTENSION_ID/web-accessible-test-page.html"
npm.cmd run test:chrome:foreign-frame
```

The foreign-frame command fails rather than reporting success when the URL is omitted, so the core regression cannot be accidentally skipped. The fixture reports its own frame-neutralization state as visible text; verification uses `browser.readText` and does not require a raw CDP call or a policy change.

## MCP configuration

Use the absolute path to `src/mcp-server.mjs`:

```json
{
  "mcpServers": {
    "universalChrome": {
      "command": "node",
      "args": ["E:/AI/codex/workspace/chrome/src/mcp-server.mjs"]
    }
  }
}
```

The MCP server exposes focused tools such as `browser_list_tabs`, `browser_dom_snapshot`, `browser_click`, `browser_fill`, `browser_screenshot`, and `policy_allow_host`.

If several Chrome profiles create bridge instances, set `UNIVERSAL_BROWSER_INSTANCE_ID` for the MCP process. Discover IDs with:

```powershell
node .\src\jsonrpc-cli.mjs --instances
```

## JavaScript client

```javascript
import { connectBridge } from "./src/bridge-client.mjs";

const browser = await connectBridge();
await browser.call("policy.allowHost", { host: "example.com" });
const tab = await browser.call("browser.openTab", { url: "https://example.com" });
const snapshot = await browser.call("browser.domSnapshot", { tabId: tab.id });
await browser.call("browser.click", {
  tabId: tab.id,
  locator: { role: "link", name: "More information" }
});
```

## Security model

Installing a browser-control extension grants powerful permissions. The project therefore defaults to denying websites other than loopback hosts. A caller must explicitly add each site with `policy.allowHost` or deliberately enable `allowAll`.

The runtime descriptor contains a random bearer token and is created with user-only file permissions where supported. Transport uses a Windows named pipe or Unix-domain socket, not a network-facing port. The token is still required because other processes running as the same OS user may be able to reach the pipe.

Read [Security](docs/SECURITY.md) before deploying this bridge to end users.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API and methods](docs/API.md)
- [Security](docs/SECURITY.md)
- [Differences from the current Codex Chrome implementation](docs/CODEX-DIFFERENCES.md)

## Uninstall native host

```powershell
npm.cmd run uninstall:host
```

This removes the Native Messaging registration, host executable, and runtime descriptors. It intentionally preserves the policy file. Remove the unpacked extension separately from `chrome://extensions`.

## License

The clean-room code in this repository is licensed under MIT. OpenAI, ChatGPT, Codex, Chrome, and Playwright are trademarks of their respective owners. No affiliation or endorsement is implied.
