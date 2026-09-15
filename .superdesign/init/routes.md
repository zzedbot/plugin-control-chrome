# Routes and extension surfaces

| Surface | Entry | Script | Shared style |
|---|---|---|---|
| Browser action popup | `extension/popup.html` | `extension/popup.js` | `extension/ui.css` |
| Security settings | `extension/options.html` | `extension/options.js` | `extension/ui.css` |
| Controlled-tab overlay | Injected into the active approved page | `extension/virtual-cursor.js` through `extension/background.js` | Closed Shadow DOM inline CSS |

The requested design target is the controlled-tab overlay. It appears centered after debugger attachment, persists while controlled, moves with pointer actions, pulses on click, and is removed on detach.
