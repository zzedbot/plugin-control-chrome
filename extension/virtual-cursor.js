export const VIRTUAL_CURSOR_KEY = "__lingeeChromeVirtualCursorV1";

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function renderVirtualCursor(markerKey, rawX, rawY, phase = "move", hideDelay = 1800) {
  if (!document.documentElement) return { visible: false };

  let state = globalThis[markerKey];
  if (!state?.host?.isConnected) {
    state?.host?.remove?.();
    const host = document.createElement("lingee-agent-cursor");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-lingee-agent-cursor", "overlay-v1");
    host.style.cssText = "position:fixed;inset:0;display:block;pointer-events:none;overflow:visible;z-index:2147483647;contain:strict;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host{all:initial!important}
        #cursor{position:fixed;left:0;top:0;width:28px;height:36px;pointer-events:none;opacity:0;transform:translate3d(0,0,0);transform-origin:2px 2px;transition:transform 70ms linear,opacity 90ms ease;filter:drop-shadow(0 2px 2px rgb(0 0 0/.35))}
        #cursor.visible{opacity:1}
        #cursor.pressed svg{transform:scale(.88)}
        svg{display:block;width:28px;height:36px;transform-origin:2px 2px;transition:transform 80ms ease}
        #ring{position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border:3px solid #7857ff;border-radius:50%;opacity:0;transform:translate3d(0,0,0) scale(.35);box-sizing:border-box}
        #ring.pulse{animation:lingee-click 420ms ease-out}
        @keyframes lingee-click{0%{opacity:.95;transform:translate3d(var(--x),var(--y),0) scale(.35)}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) scale(1.35)}}
      </style>
      <div id="ring"></div>
      <div id="cursor"><svg viewBox="0 0 28 36" aria-hidden="true"><path d="M2 2v25.2l6.3-6.1 4.7 11.2 5.2-2.2-4.7-11.1h9.1L2 2Z" fill="#fff" stroke="#6747f5" stroke-width="2.5" stroke-linejoin="round"/></svg></div>`;
    document.documentElement.appendChild(host);
    state = { host, cursor: shadow.querySelector("#cursor"), ring: shadow.querySelector("#ring"), hideTimer: 0 };
    globalThis[markerKey] = state;
  }

  const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1);
  const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 1);
  const inputX = Number(rawX);
  const inputY = Number(rawY);
  const x = Math.max(0, Math.min(Number.isFinite(inputX) ? inputX : 0, viewportWidth - 1));
  const y = Math.max(0, Math.min(Number.isFinite(inputY) ? inputY : 0, viewportHeight - 1));
  state.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  state.cursor.classList.add("visible");
  state.cursor.classList.toggle("pressed", phase === "pressed");
  state.host.setAttribute("data-state", phase);
  state.host.setAttribute("data-x", String(Math.round(x)));
  state.host.setAttribute("data-y", String(Math.round(y)));

  if (phase === "click") {
    state.ring.style.setProperty("--x", `${x}px`);
    state.ring.style.setProperty("--y", `${y}px`);
    state.ring.classList.remove("pulse");
    void state.ring.offsetWidth;
    state.ring.classList.add("pulse");
  }

  clearTimeout(state.hideTimer);
  state.hideTimer = setTimeout(() => {
    if (!state.host.isConnected) return;
    state.cursor.classList.remove("visible", "pressed");
    state.host.setAttribute("data-state", "hidden");
  }, Math.max(100, Number(hideDelay) || 1800));
  return { visible: true, x, y, phase };
}

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function removeVirtualCursor(markerKey) {
  const state = globalThis[markerKey];
  if (!state) return false;
  clearTimeout(state.hideTimer);
  state.host?.remove?.();
  delete globalThis[markerKey];
  return true;
}
