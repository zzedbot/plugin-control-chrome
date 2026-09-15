export const VIRTUAL_CURSOR_KEY = "__lingeeChromeVirtualCursorV8";

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function renderVirtualCursor(markerKey, rawX, rawY, phase = "move", details = {}, iconUrl = "") {
  if (!document.documentElement) return { visible: false };

  let state = globalThis[markerKey];
  const previousX = Number(state?.x);
  const previousY = Number(state?.y);
  let created = false;
  if (!state?.host?.isConnected) {
    state?.observer?.disconnect?.();
    globalThis.removeEventListener?.("resize", state?.onResize);
    clearTimeout(state?.scrollTimer);
    state?.host?.remove?.();
    const host = document.createElement("lingee-agent-cursor");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-lingee-agent-cursor", "overlay-v8");
    host.style.cssText = "position:fixed;inset:0;display:block;pointer-events:none;overflow:visible;z-index:2147483647;contain:strict;";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        :host{all:initial!important;pointer-events:none!important;--lingee-violet-700:#5132d6;--lingee-violet-600:#6747f5;--lingee-violet-500:#7857ff;--lingee-lavender:#b8a9ff;--lingee-cyan:#72e6ff;--lingee-ink:#17142b}
        *{box-sizing:border-box;pointer-events:none}
        #status{position:fixed;left:50%;top:12px;height:32px;padding:0 13px;border-radius:16px;display:flex;align-items:center;gap:7px;color:var(--lingee-ink);font:600 12px/16px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(247,245,255,.82));border:1px solid rgba(103,71,245,.24);box-shadow:0 8px 28px rgba(43,31,102,.18),0 2px 6px rgba(20,16,42,.16);backdrop-filter:blur(16px);transform:translateX(-50%);animation:lingee-status-in 260ms cubic-bezier(.2,.8,.2,1) both}
        #status img{width:16px;height:16px;border-radius:4px;display:block}
        #status-dot{width:6px;height:6px;border-radius:50%;background:var(--lingee-violet-600);box-shadow:0 0 0 4px rgba(103,71,245,.11),0 0 9px rgba(114,230,255,.62)}
        #edge{position:fixed;inset:0;border:2px solid transparent;background:linear-gradient(100deg,transparent 7%,rgba(114,230,255,.82) 37%,rgba(103,71,245,.9) 53%,transparent 82%) border-box;mask:linear-gradient(#000 0 0) padding-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:0;animation:lingee-edge-sweep 520ms ease-out both}
        #cursor{position:fixed;left:0;top:0;width:30px;height:38px;opacity:1;transform:translate3d(0,0,0);transform-origin:2px 2px;transition:transform 70ms linear;filter:drop-shadow(0 5px 5px rgba(23,20,43,.28)) drop-shadow(0 1px 1px rgba(81,50,214,.24))}
        #cursor.dragging{transition-duration:0ms}
        #cursor svg{display:block;width:30px;height:38px;overflow:visible;transform-origin:2px 2px;transition:transform 110ms cubic-bezier(.2,.8,.2,1)}
        #cursor.pressed svg{transform:scale(.9);transition-duration:70ms}
        .click-ring,#flash{position:fixed;left:0;top:0;border-radius:50%;opacity:0;pointer-events:none}
        #ring-inner{width:40px;height:40px;margin:-20px 0 0 -20px;border:2px solid rgba(120,87,255,.82);box-shadow:0 0 14px rgba(120,87,255,.25)}
        #ring-outer{width:58px;height:58px;margin:-29px 0 0 -29px;border:1.5px solid rgba(114,230,255,.74);box-shadow:0 0 18px rgba(184,169,255,.24)}
        #flash{width:6px;height:6px;margin:-3px 0 0 -3px;background:#fff;box-shadow:0 0 0 3px var(--lingee-violet-500),0 0 14px var(--lingee-cyan)}
        #ring-inner.pulse{animation:lingee-click-inner 360ms ease-out both}
        #ring-outer.pulse{animation:lingee-click-outer 520ms 35ms ease-out both}
        #flash.pulse{animation:lingee-click-flash 90ms ease-out both}
        #scroll{position:fixed;left:0;top:0;width:22px;height:46px;border-radius:23px;opacity:0;transform:translate3d(0,0,0);transition:opacity 110ms ease;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(247,244,255,.86));border:1px solid rgba(103,71,245,.24);box-shadow:0 8px 22px rgba(43,31,102,.16);backdrop-filter:blur(12px)}
        #scroll.visible{opacity:1}
        #scroll-track{position:absolute;left:9px;top:11px;width:3px;height:24px;border-radius:3px;background:#e2dcfb}
        #scroll-thumb{position:absolute;left:8px;top:18px;width:5px;height:10px;border-radius:5px;background:linear-gradient(var(--lingee-cyan),var(--lingee-violet-600));box-shadow:0 0 8px rgba(103,71,245,.55);transition:transform 90ms ease-out}
        #scroll-up,#scroll-down{position:absolute;left:6px;width:8px;height:5px}
        #scroll-up{top:3px}#scroll-down{bottom:3px}
        #scroll.up #scroll-up path{stroke:var(--lingee-cyan)}#scroll.down #scroll-down path{stroke:var(--lingee-violet-600)}
        #tether{position:fixed;inset:0;width:100vw;height:100vh;overflow:visible;opacity:0;transition:opacity 90ms ease}
        #tether.visible{opacity:.7}#tether.releasing{opacity:0;transition-duration:220ms}
        #tether line{stroke:url(#lingee-tether-gradient);stroke-width:2;stroke-linecap:round;filter:drop-shadow(0 0 5px rgba(103,71,245,.34))}
        #tether circle{fill:var(--lingee-violet-600);stroke:rgba(255,255,255,.9);stroke-width:1.5}
        @keyframes lingee-status-in{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
        @keyframes lingee-edge-sweep{0%{opacity:0;background-position:-100vw 0}18%{opacity:1}70%{opacity:.85}100%{opacity:0;background-position:100vw 0}}
        @keyframes lingee-click-inner{0%{opacity:.95;transform:translate3d(var(--x),var(--y),0) scale(.6)}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) scale(1)}}
        @keyframes lingee-click-outer{0%{opacity:.78;transform:translate3d(var(--x),var(--y),0) scale(.68)}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) scale(1)}}
        @keyframes lingee-click-flash{0%,35%{opacity:1;transform:translate3d(var(--x),var(--y),0) scale(1)}100%{opacity:0;transform:translate3d(var(--x),var(--y),0) scale(.5)}}
        @media (prefers-reduced-motion:reduce){#edge{display:none}#status{animation-duration:80ms}#cursor,#cursor svg,#scroll,#scroll-thumb,#tether{transition-duration:0ms}.click-ring.pulse,#flash.pulse{animation:none;opacity:.72;transform:translate3d(var(--x),var(--y),0)}#ring-outer.pulse{opacity:.42}}
      </style>
      <div id="edge"></div>
      <div id="status"><img id="status-icon" alt=""><span id="status-dot"></span><span>Lingee 正在控制</span></div>
      <svg id="tether" aria-hidden="true"><defs><linearGradient id="lingee-tether-gradient"><stop stop-color="#b8a9ff"/><stop offset="1" stop-color="#6747f5"/></linearGradient></defs><line id="tether-line"/><circle id="tether-origin" r="4"/></svg>
      <div id="ring-inner" class="click-ring"></div><div id="ring-outer" class="click-ring"></div><div id="flash"></div>
      <div id="scroll"><svg id="scroll-up" viewBox="0 0 8 5"><path d="M1 4 4 1l3 3" fill="none" stroke="#b8a9ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg><div id="scroll-track"></div><div id="scroll-thumb"></div><svg id="scroll-down" viewBox="0 0 8 5"><path d="m1 1 3 3 3-3" fill="none" stroke="#b8a9ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div id="cursor"><svg viewBox="0 0 30 38" aria-hidden="true"><defs><linearGradient id="lingee-pointer-fill" x1="4" y1="3" x2="20" y2="33" gradientUnits="userSpaceOnUse"><stop stop-color="#fff"/><stop offset="1" stop-color="#eeeaff"/></linearGradient></defs><path d="M2 2 3.6 30l7-6 5.7 11 6-3.1-5.8-10.7 9.8-1.1Z" fill="#fff" stroke="rgba(255,255,255,.92)" stroke-width="4" stroke-linejoin="round"/><path d="M2 2 3.6 30l7-6 5.7 11 6-3.1-5.8-10.7 9.8-1.1Z" fill="url(#lingee-pointer-fill)" stroke="#5132d6" stroke-width="2" stroke-linejoin="round"/><path d="M3.4 4.7 4.6 24" fill="none" stroke="#72e6ff" stroke-width="1.2" stroke-linecap="round"/></svg></div>`;
    document.documentElement.appendChild(host);
    const observer = typeof MutationObserver === "function" ? new MutationObserver(() => {
      if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host);
    }) : null;
    observer?.observe(document.documentElement, { childList: true });
    state = {
      host,
      cursor: shadow.querySelector("#cursor"),
      ring: shadow.querySelector("#ring-inner"),
      outerRing: shadow.querySelector("#ring-outer"),
      flash: shadow.querySelector("#flash"),
      scroll: shadow.querySelector("#scroll"),
      scrollThumb: shadow.querySelector("#scroll-thumb"),
      tether: shadow.querySelector("#tether"),
      tetherLine: shadow.querySelector("#tether-line"),
      tetherOrigin: shadow.querySelector("#tether-origin"),
      statusIcon: shadow.querySelector("#status-icon"),
      observer,
      scrollTimer: null,
      x: Number.isFinite(previousX) ? previousX : NaN,
      y: Number.isFinite(previousY) ? previousY : NaN,
      anchoredToCenter: false,
      onResize: null
    };
    if (state.statusIcon && iconUrl) state.statusIcon.src = iconUrl;
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
  const hasPrevious = Number.isFinite(Number(state.x)) && Number.isFinite(Number(state.y));
  const inputX = rawX == null ? (hasPrevious ? Number(state.x) : viewportWidth / 2) : Number(rawX);
  const inputY = rawY == null ? (hasPrevious ? Number(state.y) : viewportHeight / 2) : Number(rawY);
  const x = Math.max(0, Math.min(Number.isFinite(inputX) ? inputX : 0, viewportWidth - 1));
  const y = Math.max(0, Math.min(Number.isFinite(inputY) ? inputY : 0, viewportHeight - 1));
  if (details?.drag || details?.dragEnd) {
    state.cursor.classList.add("dragging");
    state.cursor.style.transitionDuration = "0ms";
  } else {
    state.cursor.classList.remove("dragging");
    state.cursor.style.transitionDuration = "";
  }
  state.cursor.style.transform = `translate3d(${x}px,${y}px,0)`;
  if (details?.dragEnd) {
    void state.cursor.offsetWidth;
    state.cursor.classList.remove("dragging");
    state.cursor.style.transitionDuration = "";
  }
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
  if (rawX != null || rawY != null) state.anchoredToCenter = false;
  else if (created || !hasPrevious) state.anchoredToCenter = true;

  const restart = (element, className) => {
    element?.classList.remove(className);
    if (element) void element.offsetWidth;
    element?.classList.add(className);
  };
  if (phase === "click") {
    for (const element of [state.ring, state.outerRing, state.flash]) {
      element?.style.setProperty("--x", `${x}px`);
      element?.style.setProperty("--y", `${y}px`);
      restart(element, "pulse");
    }
  }

  if (phase === "wheel") {
    const deltaY = Number(details?.deltaY) || 0;
    const direction = deltaY < 0 ? "up" : "down";
    const travel = Math.max(4, Math.min(8, Math.abs(deltaY) / 80 * 8 || 4));
    state.scroll.style.transform = `translate3d(${Math.min(x + 18, viewportWidth - 24)}px,${Math.max(0, Math.min(y - 12, viewportHeight - 48))}px,0)`;
    state.scroll.classList.remove("up", "down");
    state.scroll.classList.add("visible", direction);
    state.scrollThumb.style.transform = `translateY(${direction === "up" ? -travel : travel}px)`;
    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(() => state.scroll?.classList.remove("visible"), 650);
  }

  if (details?.drag) {
    const originX = Number(details.originX);
    const originY = Number(details.originY);
    if (Number.isFinite(originX) && Number.isFinite(originY)) {
      state.tetherLine.setAttribute("x1", String(originX));
      state.tetherLine.setAttribute("y1", String(originY));
      state.tetherLine.setAttribute("x2", String(x));
      state.tetherLine.setAttribute("y2", String(y));
      state.tetherOrigin.setAttribute("cx", String(originX));
      state.tetherOrigin.setAttribute("cy", String(originY));
      state.tether.classList.remove("releasing");
      state.tether.classList.add("visible");
    }
  } else if (details?.dragEnd) {
    state.tether.classList.add("releasing");
    state.tether.classList.remove("visible");
  }

  return { visible: true, x, y, phase };
}

// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function removeVirtualCursor(markerKey) {
  const state = globalThis[markerKey];
  if (!state) return false;
  state.observer?.disconnect?.();
  globalThis.removeEventListener?.("resize", state.onResize);
  clearTimeout(state.scrollTimer);
  state.host?.remove?.();
  delete globalThis[markerKey];
  return true;
}
