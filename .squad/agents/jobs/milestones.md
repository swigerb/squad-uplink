# squad-uplink Milestones

**Last updated:** 2026-04-05
**Author:** Jobs (Lead)

---

## M0: Scaffold — "Boots to BASIC prompt"
**Owner:** Woz
**Goal:** Empty project runs in browser, deploys to Azure SWA.

- [ ] Vite + React + TypeScript project init
- [ ] Azure SWA config (`staticwebapp.config.json`)
- [ ] GitHub Actions workflow for SWA deployment
- [ ] ESLint + Prettier config (match team conventions)
- [ ] Dev server runs on `npm run dev`
- [ ] Empty `<App>` renders a placeholder

**Exit criteria:** `npm run dev` shows a page. Push triggers SWA deploy. Hertzfeld confirms test runner works.

---

## M1: Terminal Core — "Hello, World."
**Owner:** Woz (terminal + WebSocket), Kare (initial xterm styling)
**Goal:** xterm.js terminal connects to squad-rc and you can have a conversation.

- [ ] xterm.js + `@xterm/addon-canvas` + `@xterm/addon-fit` integration
- [ ] `ConnectionManager` class (WebSocket lifecycle, outside React)
- [ ] Session token + ticket auth handshake with squad-rc
- [ ] Terminal input → WebSocket → squad-rc → response → terminal output
- [ ] `UplinkStore` (Zustand) with connection state
- [ ] Basic `StatusBar` showing connection status
- [ ] Tunnel URL input (simple config, no OAuth discovery)

**Exit criteria:** Type a message in the terminal, get a response from squad-rc through a devtunnel. StatusBar shows connected/disconnected.

---

## M2: The Chassis — "It looks like 1984"
**Owner:** Kare
**Goal:** Both themes fully implemented. CRT effects are convincing. HITL switch works.

- [ ] `CRTShell` component with CSS overlay system
- [ ] Apple IIe theme: `#33ff33` on `#000`, scanlines, phosphor glow, screen curvature
- [ ] C64 theme: `#706ce4` on `#3528be`, 40-column mode, fat border, C64 Pro Mono font
- [ ] PrintChar21 / Apple II font integration (self-hosted, no CDN)
- [ ] C64 Pro Mono font integration
- [ ] Theme toggle in StatusBar (instant switch, no page reload)
- [ ] HITL "Mechanical Switch" — toggles CRT effects off, plain terminal remains
- [ ] CSS custom properties system (`--crt-glow-color`, etc.)
- [ ] Screen curvature via CSS transforms or SVG displacement filter

**Exit criteria:** Side-by-side screenshots of both themes would fool someone into thinking they're looking at real hardware. HITL switch makes it instantly readable.

---

## M3: Connection Resilience — "Never drops a byte"
**Owner:** Woz
**Goal:** Connection survives network hiccups. User never loses context.

- [ ] Exponential backoff reconnection (1s, 2s, 4s, 8s… cap 30s)
- [ ] Replay buffer consumption on reconnect (squad-rc sends last 500 messages)
- [ ] Visual reconnection state in StatusBar (pulsing indicator)
- [ ] Outbound rate limiting awareness (queue if approaching 20 msg/min)
- [ ] Graceful session expiry handling (4-hour TTL)
- [ ] Connection error messages displayed in terminal (themed, not browser alerts)

**Exit criteria:** Kill and restart the squad-rc server. Frontend reconnects automatically and replays missed messages. No manual refresh needed.

---

## M4: Audio & Polish — "You can hear the floppy drive"
**Owner:** Kare (audio design), Woz (Web Audio API plumbing)
**Goal:** Procedural audio feedback. Both themes have distinct sound profiles.

- [ ] `AudioEngine` component (headless, subscribes to Zustand)
- [ ] Web Audio API initialization on first user gesture
- [ ] Floppy drive spin-up sound (connection start)
- [ ] Floppy seek click (connection established)
- [ ] SID buzz/glitch (connection error, disconnect)
- [ ] Mechanical toggle click (theme switch, HITL switch)
- [ ] Apple IIe sound profile: clean sine/square, higher pitch
- [ ] C64 sound profile: sawtooth/pulse, detuned, SID character
- [ ] Audio toggle in StatusBar (mute/unmute)
- [ ] StatusBar visual polish (final layout, spacing, iconography)

**Exit criteria:** Close your eyes, listen to the sounds. You know what's happening without looking. Audio is skippable (toggle off) and doesn't block any functionality.

---

## M5: Telemetry Panel — "The secret modern layer"
**Owner:** Woz
**Goal:** Hidden panel reveals modern diagnostics. The mask slips, intentionally.

- [ ] `TelemetryDrawer` component (slides in from right edge)
- [ ] Keyboard shortcut or hidden UI gesture to toggle
- [ ] Connection metrics display (latency, messages/sec, uptime)
- [ ] Session info display (token, tunnel URL, agent roster)
- [ ] Squad-rc `/status` response rendering
- [ ] Styled to contrast with retro theme (modern dark UI, clear fonts)

**Exit criteria:** A hidden hotkey reveals a clean, modern status panel. It shows real data. Closing it returns you to 1984.

---

## M6: Ship It — "Goes live"
**Owner:** Woz
**Goal:** Production deployment pipeline works end-to-end.

- [ ] Azure SWA production environment configured
- [ ] GitHub Actions CI: lint + type-check + test + build + deploy
- [ ] Font files optimized (woff2, subset if possible)
- [ ] Bundle size audit (target: <500KB gzipped total)
- [ ] README with setup instructions
- [ ] Environment variable handling for tunnel URL

**Exit criteria:** Push to `main` → automatic deployment → working app at SWA URL. README is sufficient for Brady to run it locally.

---

## Milestone Dependency Graph

```
M0 (Scaffold)
 └─► M1 (Terminal Core)
      ├─► M2 (The Chassis)      ← can start during M1
      ├─► M3 (Connection Resilience)
      └─► M4 (Audio & Polish)   ← needs M2 themes
           └─► M5 (Telemetry)
                └─► M6 (Ship It) ← needs everything
```

**Parallelism:** M2 and M3 can run in parallel after M1. M4 needs M2 (theme-specific audio profiles). M5 and M6 are sequential tail work.

---

## What's NOT a Milestone

These are explicitly out of scope per the architecture decision record:

- Agent persona routing (theme ≠ work type)
- OAuth-based Dev Tunnel discovery (just use a URL)
- Azure Monitor chart embedding (status JSON first)
- Multiple terminals or tabs
- Custom keybinding configuration
