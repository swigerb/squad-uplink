# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — Retro-themed terminal frontend (Apple IIe & C64 aesthetic) for controlling Squad agents remotely via squad-rc and devtunnel. TypeScript/React/Vite, hosted on Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, xterm.js, Azure SWA, devtunnel
- **Created:** 2026-04-05

## Core Context

Scribe for squad-uplink. Maintains decisions, orchestration logs, session logs, and cross-agent knowledge sharing.

## Recent Updates

📌 Team initialized on 2026-04-05 with Apple Legends universe (Jobs, Woz, Kare, Hertzfeld)
📌 **Wave 3 (2026-04-05T04:01)**: Woz completed ConnectionManager integration (backoff fix, rate limiting, command system); Kare expanded audio to 12 types with HITL MechanicalSwitch; Hertzfeld verified 233 tests (↑31 audio). Build + lint clean. **Ready for Wave 4 (Telemetry).**
📌 **Wave 6 (2026-04-05T15:32)**: Pip-Boy 3000 theme (Kare) + 5 data-driven tabs (Woz) + 25 spec tests (Hertzfeld). Full S.P.E.C.I.A.L. integration, message history tracking, tab navigation, CRT effects, audio triggers. 17 files touched. Build clean, 374 tests passing. **Ready for production deployment.**

## Learnings

- Model preference: Claude Opus 4.6 for all developers (saved to config.json)
- Universe: Apple Legends (custom — not from standard allowlist)
- **Zustand + React Context split**: Zustand for connection/system state (WebSocket, commands, auth). React Context for theme (visual, audio profiles, layout). No conflicts; clean separation.
- **Terminal Ref Pattern**: `forwardRef + useImperativeHandle` better than React prop chaining for xterm write calls (no re-render overhead).
- **Rate Limiting**: Window-based (60s) tracking simpler than token bucket; queue + drain timer handles bursts.
- **Audio Mocking**: Hand-rolled AudioContext mocks prevent flakiness (no reliance on browser audio API in CI).
- **HITL Philosophy**: MechanicalSwitch + CRTOverlay toggle gives users explicit "high-readability" mode for intense work (phosphor text-shadow stripped, scanline overlay off).
- **Layout Modes**: Pip-Boy introduced 4th mode (`'pipboy'`) alongside fullscreen/windowed/panel. Terminal preserved across tab switches via CSS `display:none` (not conditional rendering).
- **Store Extensions**: S.P.E.C.I.A.L. stat calculations driven by connection metrics (latency→strength, throughput→perception, tokenUsage→intelligence). 50-entry message history ring buffer enables live data tab + analytics.
- **Theme Specificity**: CSS `!important` overrides (Win95 gray-on-gray text contrast) valid when component updates are invasive/fragile. Scoped to `[data-theme='theme-id']` for isolation.
