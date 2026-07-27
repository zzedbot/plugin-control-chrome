# Tool reference

Use the public MCP tools when available. Use the bundled Node CLI only when the client cannot call MCP tools; both surfaces delegate to the same public bridge methods.

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

| Direct MCP tool | Bridge method / CLI target | Use and approval boundary |
|---|---|---|
| `bridge_list_instances` | CLI `instances` | List live local bridge instances. |
| `bridge_status` | `bridge.getInfo` | Read host, instance, transport, and extension handshake state. |
| `policy_get` | `policy.get` | Read effective local policy. |
| `policy_allow_host` | `policy.allowHost` | Allow one exact HTTP(S) host and subdomains only after explicit user approval. |
| `policy_block_host` | `policy.blockHost` | Block a host and its subdomains. |
| `policy_set_allow_all` | `policy.setAllowAll` | Global site access; requires explicit user approval. Keep disabled by default. |
| `policy_set_sensitive_metadata` | `policy.setSensitiveMetadata` | History/bookmark/download metadata gate; requires explicit user approval. |
| `policy_allow_cdp_method` | `policy.allowCdpMethod` | Add one raw CDP method; requires explicit user approval after impact review. |
| `browser_get_info` | `browser.getInfo` | Read backend identity and capabilities. |
| `browser_list_tabs` | `browser.listTabs` | List tabs; unapproved sites are redacted. |
| `browser_get_tab` | `browser.getTab` | Read one tab; unapproved sites are redacted. |
| `browser_open_tab` | `browser.openTab` | Open an approved URL. |
| `browser_close_tab` | `browser.closeTab` | Close one selected tab. Confirm if unsaved work may be lost. |
| `browser_activate_tab` | `browser.activateTab` | Activate a tab and focus its window. |
| `browser_claim_tab` | `browser.claimTab` | Attach debugger-backed control to an approved tab. |
| `browser_detach_tab` | `browser.detachTab` | Detach debugger-backed control. |
| `browser_navigate` | `browser.navigate` | Navigate a selected tab to an approved URL. |
| `browser_back` | `browser.back` | Navigate backward. |
| `browser_forward` | `browser.forward` | Navigate forward. |
| `browser_reload` | `browser.reload` | Reload, optionally bypassing cache. |
| `browser_group_tabs` | `browser.groupTabs` | Create or update a Chrome tab group. |
| `browser_read_text` | `browser.readText` | Read URL, title, and bounded visible text. |
| `browser_dom_snapshot` | `browser.domSnapshot` | Read compact interactive DOM state for locators. |
| `browser_accessibility_snapshot` | `browser.accessibilitySnapshot` | Read the Chrome accessibility tree. |
| `browser_screenshot` | `browser.screenshot` | Capture sensitive image data only when needed. |
| `browser_click` | `browser.click` | Click one visible element resolved by a stable locator. |
| `browser_fill` | `browser.fill` | Focus, clear, and fill one located input. Never supply secrets. |
| `browser_press` | `browser.press` | Dispatch one keyboard key to the active element. |
| `browser_type` | `browser.type` | Insert non-secret text into the focused element. |
| `browser_mouse_move` | `browser.mouseMove` | Move to current viewport coordinates. |
| `browser_coordinate_click` | `browser.coordinateClick` | Vision-guided fallback after semantic retries and a fresh screenshot. |
| `browser_drag` | `browser.drag` | Drag between current viewport points or unique locators. |
| `browser_wheel` | `browser.wheel` | Dispatch a wheel event at current viewport coordinates. |
| `browser_scroll` | `browser.scroll` | Scroll by CSS pixels. |
| `browser_set_file_input` | `browser.setFileInput` | Set files on one CSS-selected file input; verify file scope first. |
| `browser_handle_dialog` | `browser.handleDialog` | Accept or dismiss a JavaScript dialog; confirm consequential choices. |
| `browser_get_events` | `browser.getEvents` | Read buffered debugger events with a sequence cursor. |
| `browser_cdp` | `browser.cdp` | Send one allowlisted raw CDP command; requires explicit user approval. |
| `browser_history_search` | `browser.historySearch` | Search sensitive history metadata; requires explicit user approval. |
| `browser_bookmark_search` | `browser.bookmarkSearch` | Search sensitive bookmark metadata; requires explicit user approval. |
| `browser_downloads_search` | `browser.downloadsSearch` | Search sensitive download metadata; requires explicit user approval. |

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
