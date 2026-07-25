# Security

This software can operate websites in the user's existing signed-in Chrome profile. Treat it as privileged automation software.

## Threat model

The design assumes:

- Browser pages may contain malicious prompt injection.
- Agent clients may be buggy or over-broad.
- Other processes running as the same OS user may attempt to connect locally.
- Browser history, bookmarks, downloads, screenshots, and page text may be sensitive.
- `chrome.debugger` is powerful enough to alter page and browser state.

It does not claim to defend against a fully compromised OS account, a malicious Chrome installation, or an administrator with machine-level access.

## Default protections

- Site access is denied by default except loopback hosts.
- A hostname blocklist takes precedence over all other settings.
- History, bookmarks, and downloads are disabled independently.
- Raw CDP is method-allowlisted.
- Third-party IPC uses a random 256-bit token.
- IPC is a local named pipe or Unix socket, not a listening TCP port.
- Native Messaging accepts only the configured Chrome extension ID.
- Extension settings include a second kill switch and blocklist.
- Locator evaluation returns structured data and does not expose a general arbitrary-script tool.
- Tab details for unapproved hosts are redacted.

## Production hardening still required

Before distributing to untrusted end users, add:

1. An OS-native consent UI for one-time and persistent domain approval.
2. Per-client identities rather than one token shared by all local adapters.
3. ACL enforcement on Windows named pipes and Unix socket files.
4. Signed binaries, signed extension packages, and an update mechanism.
5. Audit logs with sensitive-value redaction.
6. Confirmation classes for sending messages, purchases, financial actions, account changes, deletion, and publishing.
7. Stronger prompt-injection isolation between page content and agent instructions.
8. Secure credential entry that never returns secrets to the model-visible channel.
9. Enterprise managed-policy integration.
10. Independent security review and penetration testing.

## Operational recommendations

- Use a dedicated Chrome profile when broad automation is unnecessary.
- Keep `allowAll` off.
- Allow only the specific host needed for the current task.
- Keep DevTools closed on tabs being controlled; Chrome generally permits only one debugger attachment owner.
- Do not add broad CDP mutation commands without reviewing their impact.
- Review active account and tenant before approving actions.
- Remove the extension and Native Host when no longer needed.

## Reporting

Do not include cookies, authorization headers, passwords, page screenshots, or private URLs in public issue reports.
