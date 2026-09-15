# Pages and dependency trees

## Browser action popup
Entry: `extension/popup.html`
Dependencies:
- `extension/ui.css`
- `extension/popup.js`
  - Chrome runtime messaging: `bridge.status`, `bridge.reconnect`

## Security settings
Entry: `extension/options.html`
Dependencies:
- `extension/ui.css`
- `extension/options.js`
  - Chrome storage: `enabled`, `blockedHosts`

## Controlled-tab overlay
Entry: `extension/background.js`
Dependencies:
- `extension/virtual-cursor.js`
  - Closed Shadow DOM inline SVG and CSS
- `extension/debugger-controller.js`
- `extension/monitor-injection.js`
- `extension/foreign-frame-monitor.js`
