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

## Learnings

- Model preference: Claude Opus 4.6 for all developers (saved to config.json)
- Universe: Apple Legends (custom — not from standard allowlist)
- **Zustand + React Context split**: Zustand for connection/system state (WebSocket, commands, auth). React Context for theme (visual, audio profiles, layout). No conflicts; clean separation.
- **Terminal Ref Pattern**: `forwardRef + useImperativeHandle` better than React prop chaining for xterm write calls (no re-render overhead).
- **Rate Limiting**: Window-based (60s) tracking simpler than token bucket; queue + drain timer handles bursts.
- **Audio Mocking**: Hand-rolled AudioContext mocks prevent flakiness (no reliance on browser audio API in CI).
- **HITL Philosophy**: MechanicalSwitch + CRTOverlay toggle gives users explicit "high-readability" mode for intense work (phosphor text-shadow stripped, scanline overlay off).
