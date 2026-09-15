# Extractable components

## VirtualCursorOverlay
- Source: `extension/virtual-cursor.js`
- Category: basic
- Description: Viewport-fixed controlled-tab pointer with centered, moved, pressed, clicked, scrolling, and dragging visual states.
- Extractable props: phase, x, y, anchoredToCenter, interactionLabel
- Hardcoded: pointer SVG geometry, Shadow DOM isolation, overlay z-index, lifecycle recovery

## BridgeStatusPanel
- Source: `extension/popup.html`, `extension/popup.js`
- Category: basic
- Description: Compact connection status with reconnect action and settings link.
- Extractable props: connected, error, extensionId
- Hardcoded: Native host label and settings destination

## SecuritySettingsForm
- Source: `extension/options.html`, `extension/options.js`
- Category: basic
- Description: Enable switch and extension-side blocked-host editor.
- Extractable props: enabled, blockedHosts, saveStatus
- Hardcoded: explanatory copy and storage keys
