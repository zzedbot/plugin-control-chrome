# Structured troubleshooting

Recover the failed layer without installing software, starting processes, mutating policy, or operating a page speculatively. Preserve the restriction until the user supplies any required approval or action.

## Recovery sequence

1. Record the exact sanitized error code, intended instance ID, and last verified read-only result. Never record descriptor tokens, private URLs, page screenshots, cookies, or authorization headers.
2. Prefer `bridge_list_instances`, then `bridge_status`. Without MCP, resolve `<skill-root>` as the absolute directory containing the loaded `SKILL.md`. For a read-only structured report, run `node "<skill-root>/scripts/doctor.mjs"`; use `node "<skill-root>/scripts/invoke.mjs" instances` / `node "<skill-root>/scripts/invoke.mjs" call bridge.getInfo '{}'` for focused checks.
3. Classify the error before changing anything. Apply one recovery action at the failed layer.
4. Recheck in this order: instance discovery, selected-instance bridge status, `extensionConnected`, harmless tab listing, effective policy, then target state.
5. Continue with one narrow action only after every preceding check passes. Re-read the target state after the action.

## `doctor.mjs` interpretation

Run `node "<skill-root>/scripts/doctor.mjs"`. It emits one JSON report and does not install software, start processes, change policy, operate a browser page, or clean stale bridge runtime descriptors. Ordinary Bridge Client connections retain their default stale-descriptor cleanup as part of connection recovery. Use the first failed check to choose exactly one next action.

| Failed check | Next action |
|---|---|
| `node` | Install or select Node.js 22+ |
| `bridgeRoot` | Set `UNIVERSAL_CHROME_BRIDGE_ROOT` |
| `bridgeClient` | Restore the repository installation |
| `instances` | Start Chrome and verify Native Host registration |
| `connection` | Open extension status and verify Native Messaging connectivity |

## Error handling

| Code | Meaning | Smallest safe response |
|---|---|---|
| `BRIDGE_ROOT_NOT_FOUND` | The CLI or doctor could not locate a valid Bridge project root. | Set `UNIVERSAL_CHROME_BRIDGE_ROOT` to the verified Bridge project root and rerun read-only discovery; do not guess paths or install anything. |
| `INVALID_ARGUMENTS` | The CLI received missing, malformed, or extra arguments. | Read the emitted usage, correct the command or JSON, and retry; no Bridge operation ran. |
| `INVOCATION_FAILED` | The invocation wrapper or Bridge Client failed without a more specific stable code. | Run `node "<skill-root>/scripts/doctor.mjs"` for read-only layer checks, preserve the sanitized error, and verify target state before any retry. |
| `BRIDGE_CLIENT_UNAVAILABLE` | The located module does not provide the required Bridge Client exports. | Restore the repository installation at the verified root; do not substitute an untrusted client module. |
| `BRIDGE_INSTANCES_INVALID` | The Bridge Client returned an instance list that is not an array. | Stop and verify the repository and Bridge Client versions match before listing instances again. |
| `BRIDGE_NOT_FOUND` | No live Native Host descriptor was discovered for the selected instance. | Ask the user to open Chrome with the approved bridge extension enabled. Use the extension popup's Reconnect control or restart Chrome, then list instances again. Do not install or enable components without authorization. |
| `EXTENSION_NOT_READY` | The Native Host exists, but the Chrome extension handshake is incomplete. | Ask the user to verify the expected profile and extension, reconnect, then repeat `bridge_status`. |
| `AUTH_FAILED` | The runtime descriptor token is missing, invalid, stale, or inconsistent. | Never manufacture, copy, edit, or expose a token. Ask the user to reconnect the extension or restart Chrome so the legitimate host regenerates state. |
| `SITE_APPROVAL_REQUIRED` | The target host is not allowed by the effective policy. | Name the exact host and request approval before `policy_allow_host`. Do not substitute `policy_set_allow_all`. |
| `SITE_BLOCKED` | The extension-side blocklist rejected the target host. | Preserve the block, report it, and ask the user to change that specific block if intended. |
| `CDP_METHOD_BLOCKED` | The raw CDP command is absent from the local allowlist. | Use a higher-level tool when possible. Request method-specific approval before `policy_allow_cdp_method`; do not broaden the CDP allowlist. |
| `SENSITIVE_METADATA_APPROVAL_REQUIRED` | Sensitive history, bookmark, or download metadata access is disabled. | Explain the exact metadata need and request explicit approval. Do not use page scripts or another profile as a workaround. |
| `LOCATOR_NOT_FOUND` | The semantic locator matched no visible element. | Re-read DOM or accessibility state, check the current tab and page, then build a narrower semantic locator. Do not jump to coordinates after one failure. |
| `LOCATOR_AMBIGUOUS` | The semantic locator matched more than one visible element. | Re-read state and add stable role/name, label, exact text, test ID, or CSS evidence until one visible element remains. |
| `BROWSER_TIMEOUT` | A browser operation exceeded its timeout and may have partially completed. | Recheck bridge status and current target state. Determine whether the prior action occurred before deciding whether to retry. |

## Multiple instances or tabs

List live instances and use the user-confirmed ID through `UNIVERSAL_BROWSER_INSTANCE_ID`. Do not guess a profile from sensitive tab titles. List tabs, expect unapproved details to be redacted, and ask the user when multiple candidates remain plausible.

## Authentication boundary

If login, MFA, CAPTCHA, consent requiring personal judgment, or another security challenge blocks progress, stop. Ask the user to complete the challenge in Chrome and report readiness. “Use another source” authorizes only a legitimate public or already-approved source for the same information need; it never authorizes bypassing access control or transferring a signed-in session.

## Failed recovery report

Return the failed layer, sanitized code, checks that passed, checks that were skipped, and the smallest user action or approval needed. Do not claim a script, component, or capability was used unless its observable result was captured.
