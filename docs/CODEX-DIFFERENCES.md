# Differences from the current Codex Chrome implementation

## Scope and methodology

This project is a clean-room functional analogue based on:

- Public OpenAI documentation describing the Codex Chrome extension's user-visible behavior
- The installed plugin's public-facing manifest, skill/API descriptions, and observable component boundaries
- Chrome's documented Native Messaging, extension, and DevTools Protocol APIs

It does not copy or depend on OpenAI's proprietary `browser-client`, `extension-host`, Chrome extension package, private protocols, brand assets, authentication, or server infrastructure.

Because the OpenAI extension is not publicly source-licensed, exact internal equivalence cannot be verified. “Same” below means equivalent architectural role or observable capability, not byte-for-byte or protocol compatibility.

## Architecture comparison

| Area | Current Codex Chrome implementation | Lingee Chrome Agent Bridge | Difference |
|---|---|---|---|
| Browser surface | User's existing Chrome profile | User's existing Chrome profile | Equivalent |
| Extension platform | Chrome extension | Chrome Manifest V3 extension | Equivalent role |
| Browser control | Chrome extension APIs, debugger/CDP, higher-level browser API | Chrome extension APIs, debugger/CDP, clean-room locator API | Same primitives; different implementation |
| Foreign extension frame isolation | Runtime monitor on controlled tabs before debugger attachment | Clean-room runtime monitor with the same boundary and lifecycle | Functionally aligned; implementation and private lease model differ |
| Desktop bridge | OpenAI Native Messaging Host | Independent Native Messaging Host | Same pattern; incompatible protocol |
| Chrome-to-host transport | Native Messaging over stdio | Native Messaging over stdio | Equivalent |
| Host discovery | Codex privileged browser runtime/native pipe bridge | Descriptor-based local named pipe/Unix socket discovery | Same local-IPC role; different discovery/authentication |
| Agent entry point | Codex privileged JavaScript runtime and `agent.browsers.*` | MCP stdio, JSON-RPC CLI, and JavaScript client | Intentionally vendor-neutral |
| Distribution | Signed OpenAI Chrome Web Store extension and bundled proprietary plugin | Unpacked development extension plus locally built host | Production signing/update not included |
| Extension identity | OpenAI-controlled fixed ID | ID assigned to the loaded/published independent extension | Necessarily different |
| Native host name | `com.openai.codexextension` | `org.universal_browser.bridge` | Necessarily different |

## Capability comparison

| Capability | Status | Notes |
|---|---|---|
| List and select existing tabs | Implemented | Unapproved tab details are redacted |
| Open, close, activate, and navigate tabs | Implemented | HTTP(S) site approval enforced |
| Back, forward, reload | Implemented | — |
| Tab grouping | Implemented | Title, color, and collapsed state supported |
| Read page text | Implemented | Bounded result size |
| DOM snapshot | Implemented with differences | Compact clean-room format, not Codex's private snapshot schema |
| Accessibility snapshot | Implemented | Uses CDP Accessibility domain |
| Playwright-style selectors | Partially equivalent | CSS, role/name, label, text, test ID; not the full Codex subset or upstream Playwright |
| Click, fill, keypress, scroll | Implemented | CDP Input-backed |
| Drag and coordinate-level computer use | Implemented at execution layer | Screenshots, coordinate click, move, drag, wheel, key and text are available; visual reasoning belongs to the calling model |
| Visible virtual pointer | Implemented | Persistent closed-Shadow-DOM pointer starts centered, follows mouse, click, wheel, and drag actions, and is removed on detach; exact Codex styling and internals are proprietary |
| Screenshots | Implemented | PNG/JPEG and beyond-viewport option |
| File chooser/input upload | Implemented with differences | CSS file-input path; no private secure picker workflow |
| JavaScript dialogs | Implemented | — |
| Downloads | Metadata search implemented | Download initiation is performed through page interaction; richer lifecycle helpers differ |
| CDP events and raw commands | Implemented | Explicit local allowlist |
| History and bookmarks | Implemented, off by default | Independent sensitive-metadata approval |
| Multiple Chrome profiles/instances | Implemented at discovery level | Explicit instance ID selection; no Codex task tab-group ownership semantics |
| Browser authentication forms | Not equivalent | No OpenAI secure credential form or secret-isolation service |
| Vision-based computer use | Not implemented | MCP screenshot consumers may add their own vision loop |
| Website confirmation UI | Policy API implemented; native consent UI missing | Codex has integrated user prompts and settings UI |
| Allow/block lists | Implemented | JSON policy plus extension defense-in-depth blocklist |
| Memory and account data controls | Not applicable | Belongs to OpenAI product/account infrastructure |
| Telemetry and training controls | Not implemented | No telemetry is sent by this project |
| WebMCP/private browser capabilities | Not guaranteed | Only documented methods in this repository are supported |

## Reuse assessment

Reused directly:

- Chrome Native Messaging protocol specification
- Chrome extension APIs
- Chrome DevTools Protocol
- Node.js standard library and Single Executable Application tooling
- MCP's public JSON-RPC protocol shape

Not reused:

- OpenAI's extension ID or Chrome Web Store package
- `com.openai.codexextension`
- OpenAI's `extension-host.exe`
- OpenAI's `browser-client.mjs`
- The proprietary `agent.browsers.*` runtime implementation
- OpenAI brand assets, UI, service authentication, telemetry, or private safety services

## Practical compatibility

This implementation is not wire-compatible with the OpenAI extension or Codex Native Host. Third-party software must call the supplied MCP server, JSON-RPC bridge, or JavaScript client.

Feature parity can be extended without changing the architecture. The controlled-tab mitigation for the previously observed Chrome 152+ foreign-extension-frame debugger incompatibility is covered by simulated API/DOM tests and a real Chrome 152 regression using a web-accessible Surfingkeys frame. The main remaining production-grade gaps are integrated consent UI, secure credential entry, Codex's private visual reasoning/orchestration, richer download lifecycle management, signed distribution, and broader security hardening.
