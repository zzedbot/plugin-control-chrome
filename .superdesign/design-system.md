# Lingee Controlled Tab Interaction System

## Product context

Lingee Chrome Agent Bridge controls an approved existing Chrome tab. Its UI is injected above arbitrary websites, so it must remain legible on light, dark, photographic, and dense application backgrounds without blocking clicks or hiding meaningful page content. The system has four related surfaces: control entry, persistent pointer, click feedback, and scroll/drag feedback.

## Visual direction

Use a compact translucent hardware-control language inspired by glass interface depth, adapted strictly to Lingee's violet identity. The overlay should feel precise, calm, and trustworthy. Avoid a dashboard, modal, large panel, black page shell, neon lime, decorative noise, or anything that makes the controlled page look redesigned. Every overlay element uses `pointer-events: none`.

## Color tokens

- `--lingee-violet-700: #5132D6` — dark edge and high-contrast details.
- `--lingee-violet-600: #6747F5` — primary brand stroke.
- `--lingee-violet-500: #7857FF` — click and active feedback.
- `--lingee-lavender-300: #B8A9FF` — soft outer glow.
- `--lingee-cyan-300: #72E6FF` — restrained secondary highlight, never a dominant fill.
- `--lingee-ink: #17142B` — text on pale glass.
- `--lingee-white: #FFFFFF` — pointer body and bright edge.
- `--lingee-glass: rgba(255,255,255,.82)` — status chip surface.
- `--lingee-glass-border: rgba(103,71,245,.24)`.
- `--lingee-shadow: 0 8px 28px rgba(43,31,102,.18), 0 2px 6px rgba(20,16,42,.20)`.

## Type

Use the system UI stack already used by the extension: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Status text is 12px/16px, weight 600, with normal letter spacing. Do not load external fonts into controlled pages.

## Controlled-state indicator

- Position a compact chip at top center, at least 12px below the viewport edge and below browser-owned UI.
- Resting size approximately 152×32px; 16px radius; pale glass surface, 1px violet-tinted border, subtle backdrop blur, and restrained shadow.
- Use the supplied Lingee brand icon at 16×16px, a 6px breathing violet status dot, and the text `Lingee 正在控制`.
- On attachment, play a 520ms edge-light sweep around the viewport and bring the chip in with opacity plus an 8px upward-to-zero translation. The edge light disappears; the chip remains visible while controlled.
- On detach, fade the chip and pointer together in 140ms, then remove the host.

## Pointer

- Preserve the familiar northwest arrow silhouette and exact pointer tip at coordinate `(2,2)`.
- Nominal artboard 30×38px. Use a white-to-pale-lavender body, a 2px deep-violet inner stroke, and a 1px semi-opaque white outer keyline so it remains visible on both black and white backgrounds.
- Add a short cyan-violet highlight only along the upper-left edge, plus the shared shadow. Avoid cartoon proportions, emoji styling, hand cursors, or an oversized halo at rest.
- Idle and move states remain fully visible. Movement uses a 70ms linear transform transition. Press scales to 0.90 around the tip over 70ms and returns over 110ms.

## Click feedback

- Emit two concentric rings from the exact pointer tip: an inner 24px violet ring and an outer 40px lavender/cyan ring.
- Inner ring expands to 40px and fades over 360ms; outer ring expands to 58px and fades over 520ms with a 35ms delay.
- Add a tiny 5px center flash for the first 90ms. The full effect stays below 550ms and never obscures the target.
- Double click replays the same system with a second pulse, rather than changing color.

## Scroll feedback

- While wheel input is active, show a 22×46px translucent capsule 18px to the right of the pointer.
- Inside, render a slim vertical track, a bright thumb that moves 8px in the scroll direction, and two small directional chevrons. Violet indicates downward scroll; cyan-violet indicates upward scroll.
- Scale thumb travel or glow slightly with delta magnitude, capped to avoid visual noise.
- Fade the capsule 650ms after the final wheel event; keep the pointer itself visible.

## Drag feedback

- Pressed pointer uses the same 0.90 scale.
- Show a 7px origin dot and a 2px curved or straight violet-lavender tether from origin to current pointer tip. Use a soft glow and 70% opacity.
- The tether follows drag steps, then retracts/fades over 220ms after release. Click rings fire only at release.

## Motion and accessibility

- Use transform and opacity for animation; avoid layout-affecting properties.
- Respect `prefers-reduced-motion: reduce`: remove viewport sweep, pointer interpolation, ring expansion, scroll-thumb travel, and tether retraction; use immediate state changes plus short opacity fades under 100ms.
- All text contrast must meet WCAG AA against the chip surface. Overlay visuals have no focus order, accessible name, or hit testing and remain `aria-hidden="true"`.
- Keep the current closed Shadow DOM, maximum z-index, lifecycle recovery, centered-on-claim behavior, resize anchoring, and detach cleanup.

## Design showcase requirements

The Superdesign draft should be a desktop interaction-specimen canvas, not a product marketing page. Use a neutral mock web application as background and show labeled frozen examples of: controlled entry/resting chip, idle pointer, pressed pointer, click pulse midpoint, scroll up, scroll down, drag tether, and reduced-motion equivalents. Include a compact token strip and timing annotations so the design can be implemented precisely.
