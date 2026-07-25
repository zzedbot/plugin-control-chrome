# API

All direct bridge calls use JSON-RPC 2.0 semantics. The client library adds the descriptor's authentication token automatically.

## Bridge

| Method | Purpose |
|---|---|
| `bridge.getInfo` | Host, transport, instance, and extension handshake status |

## Policy

| Method | Parameters | Purpose |
|---|---|---|
| `policy.get` | — | Read effective policy |
| `policy.allowHost` | `host` | Allow a host and its subdomains |
| `policy.blockHost` | `host` | Block a host and its subdomains |
| `policy.setAllowAll` | `enabled` | Toggle global site access |
| `policy.setSensitiveMetadata` | `enabled` | Toggle history/bookmark/download metadata |
| `policy.allowCdpMethod` | `command` | Add one raw CDP method to the allowlist |

The blocklist always takes precedence over the allowlist and `allowAll`.

## Browser lifecycle and tabs

| Method | Required parameters |
|---|---|
| `browser.getInfo` | — |
| `browser.listTabs` | — |
| `browser.getTab` | `tabId` |
| `browser.openTab` | `url` |
| `browser.closeTab` | `tabId` |
| `browser.activateTab` | `tabId` |
| `browser.claimTab` | `tabId` |
| `browser.detachTab` | `tabId` |
| `browser.navigate` | `tabId`, `url` |
| `browser.back` | `tabId` |
| `browser.forward` | `tabId` |
| `browser.reload` | `tabId` |
| `browser.groupTabs` | `tabIds` |

Unapproved entries returned by `browser.listTabs` and `browser.getTab` are redacted to basic structural metadata and hostname.

## Page observation

| Method | Required parameters | Result |
|---|---|---|
| `browser.readText` | `tabId` | URL, title, visible body text |
| `browser.domSnapshot` | `tabId` | Compact interactive-node snapshot |
| `browser.accessibilitySnapshot` | `tabId` | Chrome accessibility tree |
| `browser.screenshot` | `tabId` | Base64 image and MIME type |

## Page interaction

| Method | Required parameters |
|---|---|
| `browser.click` | `tabId`, `locator` |
| `browser.fill` | `tabId`, `locator`, `value` |
| `browser.press` | `tabId`, `key` |
| `browser.type` | `tabId`, `text` |
| `browser.mouseMove` | `tabId`, `x`, `y` |
| `browser.coordinateClick` | `tabId`, `x`, `y` |
| `browser.drag` | `tabId`, `from`, `to` |
| `browser.wheel` | `tabId`, `x`, `y` |
| `browser.scroll` | `tabId` and optional deltas |
| `browser.setFileInput` | `tabId`, `selector`, `files` |
| `browser.handleDialog` | `tabId` |

A locator supports `css`, `role` plus `name`, `label`, `text`, or `testId`. Locator operations reject zero matches and ambiguous matches.

## Debugging and events

| Method | Required parameters |
|---|---|
| `browser.cdp` | `tabId`, `command` |
| `browser.getEvents` | optional cursor, tab and method filters |

Only CDP methods in `policy.allowedCdpMethods` are accepted. Event results contain `cursor`, `hasMore`, and `truncated` fields.

## Sensitive browser metadata

| Method | Purpose |
|---|---|
| `browser.historySearch` | Chrome history search |
| `browser.bookmarkSearch` | Bookmark search |
| `browser.downloadsSearch` | Download metadata search |

These methods fail with `SENSITIVE_METADATA_APPROVAL_REQUIRED` until explicitly enabled.

## Common error codes

| Code | Meaning |
|---|---|
| `AUTH_FAILED` | Runtime descriptor token was missing or invalid |
| `BRIDGE_NOT_FOUND` | No live Native Host descriptor was discovered |
| `EXTENSION_NOT_READY` | Host exists but the extension handshake is incomplete |
| `SITE_APPROVAL_REQUIRED` | The page host has not been allowed |
| `SITE_BLOCKED` | The extension-side blocklist rejected the host |
| `CDP_METHOD_BLOCKED` | Raw CDP method is not on the allowlist |
| `SENSITIVE_METADATA_APPROVAL_REQUIRED` | Sensitive metadata switch is off |
| `LOCATOR_NOT_FOUND` | Locator matched no visible element |
| `LOCATOR_AMBIGUOUS` | Locator matched more than one visible element |
| `BROWSER_TIMEOUT` | Extension operation exceeded its timeout |
