# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — A TypeScript/React/Vite front-end web app with a retro Apple IIe and Commodore 64 theme to control Squad agents remotely using the squad-rc feature and devtunnel. Will be hosted in Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, Azure Static Web Apps, devtunnel
- **Created:** 2026-04-05

## Core Context

Lead agent for squad-uplink. Responsible for architecture, code review, scope decisions, and maintaining the product vision of a retro computing interface for Squad remote control.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-05: Architecture v1 decisions locked
- **State management:** Zustand. Single store. Works outside React — critical because WebSocket messages arrive outside component lifecycle. React Context rejected (re-render cost), Jotai rejected (unnecessary indirection for single-view app).
- **Component tree:** Flat, single-screen. No routing. `CRTShell` wraps `TerminalView` + `StatusBar`. `TelemetryDrawer` and `AudioEngine` are siblings.
- **xterm.js integration:** CSS overlay pattern. xterm owns rendering; CRT effects (scanlines, glow, curvature) are pure CSS/SVG layered on the container. Never touch xterm's rendering pipeline.
- **WebSocket:** `ConnectionManager` class lives outside React, pushes to Zustand. Handles auth handshake, reconnection, replay buffer, rate limiting. Terminal binds to it directly.
- **Theme engine:** Paired objects — CSS custom properties for the shell + xterm `ITheme` for terminal colors. C64 enforces 40-col via `terminal.resize()`. HITL switch is just a CSS class toggle.
- **Audio:** Procedural Web Audio API oscillators. No sample files. Event-driven from Zustand state transitions. Two sound profiles (Apple IIe = clean sine/square, C64 = SID sawtooth/pulse).
- **Cut from scope:** Agent persona routing (theme ≠ work type), OAuth tunnel discovery (just use URL), Azure Monitor chart embedding (defer), multi-terminal tabs (never).
- **MVP definition:** xterm.js + CRT effects + WebSocket to squad-rc + theme toggle + HITL switch. Five things. Nothing else ships in MVP.
- **6 milestones defined:** M0 Scaffold → M1 Terminal Core → M2 Chassis → M3 Connection Resilience → M4 Audio → M5 Telemetry → M6 Ship. M2 and M3 can run in parallel.
