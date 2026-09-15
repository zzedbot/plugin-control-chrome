# Theme

## Compact token summary

- Brand accent: `#6747f5` primary violet; `#7857ff` interaction ring.
- Pointer: white fill, 2.5px violet outline, soft black 35% drop shadow.
- Popup status: connected `#16803a`; disconnected `#b42318`.
- Font: system UI for popup/options; monospace for blocked-host textarea.
- Spacing: 6px, 7px, 12px, 16px.
- Cursor dimensions: 28×36px; click ring 34×34px.
- Motion: pointer translation 70ms linear; press scale 80ms ease; click pulse 420ms ease-out.
- Layering: fixed viewport overlay, pointer-events none, z-index 2147483647.

## Raw `extension/ui.css`

```css
:root { color-scheme: light dark; font: 14px/1.45 system-ui, sans-serif; }
body { margin: 0; min-width: 320px; }
main { padding: 16px; display: grid; gap: 12px; }
main.wide { max-width: 720px; margin: 0 auto; }
h1 { font-size: 18px; margin: 0; }
p { margin: 0; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; }
button { width: fit-content; padding: 7px 12px; }
textarea { width: 100%; box-sizing: border-box; font: 13px/1.4 ui-monospace, monospace; }
.status.connected { color: #16803a; }
.status.disconnected { color: #b42318; }
```

## Raw controlled-tab overlay source

```js
export const VIRTUAL_CURSOR_KEY = "__lingeeChromeVirtualCursorV3";

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function renderVirtualCursor(markerKey, rawX, rawY, phase = "move") {
  if (!document.documentElement) return { visible: false };

  let state = globalThis[markerKey];
  const previousX = Number(state?.x);
  const previousY = Number(state?.y);
  let created = false;
  if (!state?.host?.isConnected) {
    state?.observer?.disconnect?.();
    globalThis.removeEventListener?.("resize", state?.onResize);
    state?.host?.remove?.();
    const host = document.createElement("lingee-agent-cursor");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-lingee-agent-cursor", "overlay-v3");
    host.style.cssText = "position:fixed;inset:0;display:block;pointer-events:none;overflow:visible;z-index:2147483647;contain:strict;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host{all:initial!important}
        #cursor{position:fixed;left:0;top:0;width:28px;height:36px;pointer-events:none;opacity:1;transform:translate3d(0,0,0);transform-origin:2px 2px;transition:transform 70ms linear;filter:drop-shadow(0 2px 2px rgb(0 0 0/.35))}
        #cursor.pressed svg{transform:scale(.88)}
        svg{display:block;width:28px;height:36px;transform-origin:2px 2px;transition:transform 80ms ease}
        #ring{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #7857ff;border-radius:50%;opacity:0;transform:translate3d(0,0,0) scale(.35);box-sizing:border-box}
        #ring.pulse{animation:lingee-click 420ms ease-out}
        @keyframes lingee-click{0%{opacity:.95;transform:translate3d(var(--x),var(--y),0) scale(.35)}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) scale(1.35)}}
      </style>
      <div id="ring"></div>
      <div id="cursor"><svg viewBox="0 0 28 36" aria-hidden="true"><path d="M2 2v25.2l6.3-6.1 4.7 11.2 5.2-2.2-4.7-11.1h9.1L2 2Z" fill="#fff" stroke="#6747f5" stroke-width="2.5" stroke-linejoin="round"/></svg></div>`;
    document.documentElement.appendChild(host);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(() => {
      if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
    }) : null;
    observer?.observe(document.documentElement, { childList: true });
    state = {
      host,
      cursor: shadow.querySelector("#cursor"),
      ring: shadow.querySelector("#ring"),
      observer,
      x: Number.isFinite(previousX) ? previousX : NaN,
      y: Number.isFinite(previousY) ? previousY : NaN,
      anchoredToCenter: false,
      onResize: null
    };
    state.onResize = () => {
      if (!state.anchoredToCenter || !state.host.isConnected) return;
      const width = Math.max(1, Number(globalThis.innerWidth) || 1);
      const height = Math.max(1, Number(globalThis.innerHeight) || 1);
      const x = Math.max(0, Math.min(width / 2, width - 1));
      const y = Math.max(0, Math.min(height / 2, height - 1));
      state.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
      state.host.setAttribute("data-x", String(Math.round(x)));
      state.host.setAttribute("data-y", String(Math.round(y)));
      state.x = x;
      state.y = y;
    };
    globalThis.addEventListener?.("resize", state.onResize, { passive: true });
    globalThis[markerKey] = state;
    created = true;
  }

  const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1);
  const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 1);
  const priorX = phase === "ensure" ? Number(state.x) : NaN;
  const priorY = phase === "ensure" ? Number(state.y) : NaN;
  const inputX = rawX == null ? (Number.isFinite(priorX) ? priorX : viewportWidth / 2) : Number(rawX);
  const inputY = rawY == null ? (Number.isFinite(priorY) ? priorY : viewportHeight / 2) : Number(rawY);
  const x = Math.max(0, Math.min(Number.isFinite(inputX) ? inputX : 0, viewportWidth - 1));
  const y = Math.max(0, Math.min(Number.isFinite(inputY) ? inputY : 0, viewportHeight - 1));
  state.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  if (phase !== "ensure") {
    state.cursor.classList.toggle("pressed", phase === "pressed");
    state.host.setAttribute("data-state", phase);
  } else if (created) {
    state.host.setAttribute("data-state", "move");
  }
  state.host.setAttribute("data-x", String(Math.round(x)));
  state.host.setAttribute("data-y", String(Math.round(y)));
  state.x = x;
  state.y = y;
  if (phase !== "ensure") state.anchoredToCenter = rawX == null && rawY == null;
  else if (created || !Number.isFinite(previousX) || !Number.isFinite(previousY)) state.anchoredToCenter = true;

  if (phase === "click") {
    state.ring.style.setProperty("--x", `${x}px`);
    state.ring.style.setProperty("--y", `${y}px`);
    state.ring.classList.remove("pulse");
    void state.ring.offsetWidth;
    state.ring.classList.add("pulse");
  }

  return { visible: true, x, y, phase };
}

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function removeVirtualCursor(markerKey) {
  const state = globalThis[markerKey];
  if (!state) return false;
  state.observer?.disconnect?.();
  globalThis.removeEventListener?.("resize", state.onResize);
  state.host?.remove?.();
  delete globalThis[markerKey];
  return true;
}
```
