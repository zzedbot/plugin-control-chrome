# Tool reference

Use the public MCP tools when available. The preferred MCP server is `universalChrome`. Use the bundled Node CLI only when the client cannot call MCP tools; both surfaces delegate to the same public bridge methods.

`<skill-root>` below means the resolved absolute directory containing the loaded `SKILL.md`. Replace the placeholder before running a command. The CLI entrypoint belongs to the Skill, not the Bridge project. It locates the Bridge project separately by searching upward from the script and current directories; if neither is inside the Bridge checkout, set `UNIVERSAL_CHROME_BRIDGE_ROOT` to the Bridge project root.

## Contents

- [Invocation forms](#invocation-forms)
- [Tool mapping](#tool-mapping)
- [Complete example](#complete-example)
- [Locator and coordinate rules](#locator-and-coordinate-rules)

## Invocation forms

- Direct MCP: call the named MCP tool with its JSON arguments, for example `browser_click({"tabId": 7, "locator": {"role": "link", "name": "More information"}})`.
- Node CLI: run `node "<skill-root>/scripts/invoke.mjs" call <bridge.method> '<json>'`, for example `node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":7,"locator":{"role":"link","name":"More information"}}'`.
- Instance discovery is the CLI exception: run `node "<skill-root>/scripts/invoke.mjs" instances`. Select a particular live instance for either surface by setting `UNIVERSAL_BROWSER_INSTANCE_ID` for that client process.

Do not reimplement JSON-RPC, read runtime descriptors, or supply authentication tokens. The public Bridge Client handles discovery and authentication.

## Tool mapping

| Direct MCP tool | Bridge method / CLI target | Required parameters | Optional parameters | Result summary | Use and approval boundary |
|---|---|---|---|---|---|
| `bridge_list_instances` | `instances` | — | — | Array of public instance descriptors: instance ID, PID, transport, host name, and start time. | Discover first; the result never includes endpoint, token, or unknown descriptor fields. |
| `bridge_status` | `bridge.getInfo` | — | — | Bridge identity, selected instance, transport, and extension handshake state. | Call only after instance selection. |
| `policy_get` | `policy.get` | — | — | Effective allowlist, blocklist, global gates, and CDP allowlist. | Read before requesting a policy change. |
| `policy_allow_host` | `policy.allowHost` | `host` | — | Saved effective policy. | Allow the exact HTTP(S) host and subdomains only after explicit user approval. |
| `policy_block_host` | `policy.blockHost` | `host` | — | Saved effective policy. | Block the host and its subdomains; the blocklist wins. |
| `policy_set_allow_all` | `policy.setAllowAll` | `enabled` | — | Saved effective policy. | Global site access requires explicit user approval; keep disabled by default. |
| `policy_set_sensitive_metadata` | `policy.setSensitiveMetadata` | `enabled` | — | Saved effective policy. | History, bookmark, and download metadata access requires explicit user approval. |
| `policy_allow_cdp_method` | `policy.allowCdpMethod` | `command` | — | Saved effective policy with the command allowlisted. | Raw CDP permission requires explicit user approval after impact review. |
| `browser_get_info` | `browser.getInfo` | — | — | Browser backend identity, version, and capability list. | Read-only capability discovery. |
| `browser_list_tabs` | `browser.listTabs` | — | `query` | Array of Chrome tab records. | Unapproved-site details are redacted. |
| `browser_get_tab` | `browser.getTab` | `tabId` | — | One Chrome tab record. | Unapproved-site details are redacted. |
| `browser_open_tab` | `browser.openTab` | `url` | `active`, `windowId` | Created Chrome tab record. | The target URL must be approved. |
| `browser_close_tab` | `browser.closeTab` | `tabId` | — | Closure confirmation. | Confirm first if unsaved work may be lost. |
| `browser_activate_tab` | `browser.activateTab` | `tabId` | — | Activated tab record. | Also focuses its Chrome window. |
| `browser_claim_tab` | `browser.claimTab` | `tabId` | — | Claimed tab record. | Attaches debugger-backed control to an approved tab. |
| `browser_detach_tab` | `browser.detachTab` | `tabId` | — | Detach confirmation. | Releases debugger-backed control. |
| `browser_navigate` | `browser.navigate` | `tabId`, `url` | — | Updated tab record. | The target URL must be approved. |
| `browser_back` | `browser.back` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_forward` | `browser.forward` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_reload` | `browser.reload` | `tabId` | `bypassCache` | Reload acknowledgement. | Verify whether prior mutations already occurred. |
| `browser_group_tabs` | `browser.groupTabs` | `tabIds` | `groupId`, `title`, `color`, `collapsed` | Chrome tab-group record. | Group only the intended tabs. |
| `browser_read_text` | `browser.readText` | `tabId` | `maxChars` | URL, title, and bounded visible body text. | Prefer this for lightweight observation. |
| `browser_dom_snapshot` | `browser.domSnapshot` | `tabId` | `maxNodes`, `maxTextChars` | Compact interactive DOM nodes and page metadata. | Use to construct stable locators. |
| `browser_accessibility_snapshot` | `browser.accessibilitySnapshot` | `tabId` | — | Chrome accessibility tree. | Use for accessible roles, names, and state. |
| `browser_screenshot` | `browser.screenshot` | `tabId` | `format`, `quality`, `captureBeyondViewport` | MCP image content with MIME type. | Capture sensitive visual data only when needed. |
| `browser_click` | `browser.click` | `tabId`, `locator` | `button`, `clickCount` | Click result for the uniquely resolved element. | Use a stable visible locator and verify afterward. |
| `browser_fill` | `browser.fill` | `tabId`, `locator`, `value` | — | Fill result for the uniquely resolved input. | Never supply secrets. |
| `browser_press` | `browser.press` | `tabId`, `key` | `modifiers` | Key-dispatch acknowledgement. | Ensure the intended element has focus. |
| `browser_type` | `browser.type` | `tabId`, `text` | — | Typed flag and inserted-text length. | Insert only non-secret text into the focused element. |
| `browser_mouse_move` | `browser.mouseMove` | `tabId`, `x`, `y` | — | Final viewport coordinates. | Use only with current viewport evidence. |
| `browser_coordinate_click` | `browser.coordinateClick` | `tabId`, `x`, `y` | `button`, `clickCount` | Clicked coordinates, button, and count. | Use only after semantic retries and a fresh screenshot. |
| `browser_drag` | `browser.drag` | `tabId`, `from`, `to` | `steps` | Drag result with resolved endpoints. | Use current points or unique locators. |
| `browser_wheel` | `browser.wheel` | `tabId`, `x`, `y` | `deltaX`, `deltaY` | Wheel-dispatch acknowledgement. | Coordinates refer to the current viewport. |
| `browser_scroll` | `browser.scroll` | `tabId` | `deltaX`, `deltaY` | Resulting page scroll coordinates. | Re-read state after scrolling. |
| `browser_set_file_input` | `browser.setFileInput` | `tabId`, `selector`, `files` | — | File-input assignment result. | Verify the selector and exact file scope first. |
| `browser_handle_dialog` | `browser.handleDialog` | `tabId` | `accept`, `promptText` | Dialog-handling acknowledgement. | Confirm consequential accept or dismiss choices. |
| `browser_get_events` | `browser.getEvents` | `tabId` | `afterSequence`, `limit`, `methods` | Buffered events with cursor, pagination, and truncation state. | Continue from the returned sequence cursor. |
| `browser_cdp` | `browser.cdp` | `tabId`, `command` | `params` | Raw CDP command result. | Allowlisted raw CDP use requires explicit user approval. |
| `browser_history_search` | `browser.historySearch` | — | `text`, `startTime`, `endTime`, `maxResults` | Array of Chrome history records. | Sensitive history metadata requires explicit user approval. |
| `browser_bookmark_search` | `browser.bookmarkSearch` | — | `query`, `text` | Array of Chrome bookmark records. | Sensitive bookmark metadata requires explicit user approval. |
| `browser_downloads_search` | `browser.downloadsSearch` | — | `query` | Array of Chrome download metadata records. | Sensitive download metadata requires explicit user approval. |

## Complete example

After the user explicitly approves `example.com`, allow it, open it, read the DOM, click the link by role/name, and verify the visible result.

Direct MCP sequence:

```text
bridge_list_instances({})
bridge_status({})
policy_get({})
policy_allow_host({"host":"example.com"})
browser_open_tab({"url":"https://example.com"}) -> {"id":7,...}
browser_dom_snapshot({"tabId":7})
browser_click({"tabId":7,"locator":{"role":"link","name":"More information"}})
browser_read_text({"tabId":7})
```

Confirm that the final URL/title/text differs as expected; do not infer success from the click response alone.

Equivalent Node CLI sequence:

```powershell
node "<skill-root>/scripts/invoke.mjs" instances
node "<skill-root>/scripts/invoke.mjs" call bridge.getInfo '{}'
node "<skill-root>/scripts/invoke.mjs" call policy.get '{}'
node "<skill-root>/scripts/invoke.mjs" call policy.allowHost '{"host":"example.com"}'
node "<skill-root>/scripts/invoke.mjs" call browser.openTab '{"url":"https://example.com"}'
node "<skill-root>/scripts/invoke.mjs" call browser.domSnapshot '{"tabId":7}'
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":7,"locator":{"role":"link","name":"More information"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.readText '{"tabId":7}'
```

Use the actual `tabId` returned by `browser.openTab`; `7` only shows how values flow between calls.

## Locator and coordinate rules

Construct locators in this order: stable `testId`; role plus accessible name; label; exact visible text; stable CSS. A locator must resolve to exactly one visible element. On `LOCATOR_NOT_FOUND` or `LOCATOR_AMBIGUOUS`, re-read DOM/accessibility state and refine the semantic locator. Only after repeated semantic inspection fails may a fresh screenshot support a coordinate action. Read state immediately afterward.
