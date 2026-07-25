# Architecture

## Design objective

The project mirrors the observable layered process of the current Codex Chrome integration while replacing every proprietary component with independently written code and open platform interfaces.

```mermaid
sequenceDiagram
    participant Agent as Third-party agent
    participant MCP as MCP / JSON-RPC adapter
    participant Host as Native host
    participant Extension as Chrome MV3 extension
    participant Chrome as Chrome APIs / CDP
    participant Page as Existing browser tab

    Extension->>Host: connectNative(org.universal_browser.bridge)
    Chrome->>Host: start executable with stdio
    Extension->>Host: hello(extension ID, version)
    Host->>Host: create authenticated local pipe descriptor
    Agent->>MCP: browser_dom_snapshot(tabId)
    MCP->>Host: JSON-RPC + random token
    Host->>Host: enforce site and CDP policy
    Host->>Extension: length-prefixed request
    Extension->>Chrome: attach debugger / call extension API
    Chrome->>Page: DOM, input, navigation, screenshot
    Page-->>Chrome: result or event
    Chrome-->>Extension: result
    Extension-->>Host: length-prefixed response
    Host-->>MCP: JSON-RPC result
    MCP-->>Agent: MCP content
```

## Components

### Chrome extension

`extension/background.js` is a Manifest V3 service worker. It initiates Chrome Native Messaging, dispatches browser methods, keeps a bounded debugger-event buffer, and adds an extension-local blocklist and kill switch.

The extension uses two control planes:

1. Chrome extension APIs for tabs, tab groups, history, bookmarks, downloads, and Native Messaging.
2. `chrome.debugger` for CDP domains such as Runtime, Page, DOM, Accessibility, and Input.

The high-level locator API is implemented on top of DOM inspection plus CDP input dispatch. It intentionally exposes a smaller surface than upstream Playwright.

### Native Messaging Host

`src/native-host.mjs` is packaged as a standalone executable with Node's Single Executable Application facility. Chrome starts it using a manifest whose `allowed_origins` contains only the installed extension ID.

Native messages are JSON payloads preceded by a four-byte little-endian length. The host's stdout is reserved exclusively for this framing; logs go to stderr.

The host creates one authenticated local IPC endpoint per extension instance:

- Windows: named pipe
- macOS/Linux: Unix-domain socket

Descriptors are stored beneath the current user's application-data directory. They contain an instance ID, endpoint, process ID, creation time, and a random 256-bit bearer token.

### Bridge client

`src/bridge-client.mjs` discovers live descriptors, removes stale descriptors, selects the newest instance by default, and sends one newline-delimited JSON-RPC request per connection.

The explicit `UNIVERSAL_BROWSER_INSTANCE_ID` selection mechanism corresponds to choosing a particular Chrome extension/profile instance.

### MCP adapter

`src/mcp-server.mjs` implements MCP over stdio. It never receives browser credentials. It maps narrowly described tools to bridge methods and converts screenshots to MCP image content.

### Policy

The Native Host is the authoritative enforcement point. Before forwarding a page command it resolves the tab's current URL and checks the effective site policy. Raw CDP uses a separate method allowlist. History, bookmark, and download metadata has an independent off-by-default switch.

The extension-side blocklist is defense in depth and can stop actions even when a third-party client possesses the runtime token.

## Request lifecycle

1. The agent calls a focused MCP tool or JSON-RPC method.
2. The adapter discovers the selected bridge instance and authenticates using its runtime descriptor.
3. The Native Host validates the method and parameters.
4. For a tab-scoped command, the host first reads the tab URL and enforces site approval.
5. For raw CDP, the host checks the CDP method allowlist.
6. The host sends a Native Messaging request to the extension.
7. The extension applies its local enabled/blocklist settings.
8. The extension executes a Chrome API or CDP operation.
9. The response returns over the same layers.
10. Page/debugger events are stored with monotonic cursors for later retrieval.

## Process and failure boundaries

- If Chrome closes the Native Messaging port, the host removes its descriptor and exits.
- If an MV3 service worker is suspended, the alarm/reconnect path recreates the Native Messaging connection.
- If a debugger is already attached by DevTools or another extension, Chrome may reject attachment; this is returned as a browser error.
- Requests default to a 30-second timeout.
- A stale descriptor is removed after connection probing fails.
