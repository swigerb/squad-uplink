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

### 2026-04-05: Wave 4 (M5) TelemetryDrawer gap analysis
- **Drawer is ~90% done.** Core functionality (sections, auto-refresh, keyboard shortcuts, tests, lazy-loading, z-index overlay) all solid. The "mask slips" modern design is BY DESIGN per architecture decision — do NOT theme it.
- **3 gaps identified:** (1) No visible button in StatusBar to open drawer — critical discoverability hole. (2) Three inline `style={}` blocks in the component should be CSS classes. (3) No focus management on open/close for keyboard accessibility.
- **Cut from scope:** Theme-responsive styling (architecture says no), additional metrics display (Pip-Boy territory), content animations (polish not substance), focus trapping (it's a sidebar not a modal).
- **Decision written to:** `.squad/decisions/inbox/jobs-wave4-gaps.md`

### 2026-04-07: Wave 4–6 batch orchestration
- **Jobs' analysis finalized:** TelemetryDrawer gap analysis delivered to orchestration log. 3 gaps confirmed (StatusBar button CRITICAL, inline styles CODE QUALITY, focus management ACCESSIBILITY). Component ~90% feature-complete; ready for implementation wave. Gaps assigned: Woz (button + focus mgmt), Kare (CSS classes). Completion criteria: all 3 gaps closed = Wave 4 done.
- **Cross-agent updates:** Woz delivered Wave 5 SWA deployment + CI pipeline refinement (418 tests passing). Kare delivered Wave 6 fonts/a11y (436 tests passing). Hertzfeld delivered Wave 6 test expansion (91 new tests, suite 509 total passing). All orchestration logs written. Decision inbox merged into decisions.md (6 new entries: Jobs gaps, Kare Apple2e overlays/CRT/C64/CSP, Woz audio). All inbox files deleted. Ready for next wave.

### 2026-04-13: GitHub Copilot CLI Remote Feature—Architectural Pivot Required
- **Context:** GitHub shipped `copilot --remote` (native remote CLI access) today. Completely eliminates squad-uplink's Remote Control value prop. No custom UI hook—GitHub.com owns the viewer. DevTunnel/JWT auth infrastructure is now obsolete.
- **Research findings:** (1) GitHub handles all auth/tunneling natively—`ConnectionManager` subprotocol auth nightmares irrelevant. (2) No documented API—cannot hook our xterm.js into GitHub's viewer. (3) Enterprise policy OFF by default. (4) Local session chrome remains strategic asset.
- **Obsolete code identified:** `ConnectionManager.ts`, `commands.ts`, `squad-rc.ts`, `squad-rc-launch.mjs` no longer have function. Delete.
- **Retained code:** xterm.js, theme engine, audio, TelemetryDrawer (repurpose to local process metrics).
- **Pivot path selected:** Option 1 (Launcher/Dashboard). squad-uplink becomes retro-themed **session launcher** for `copilot --remote`. Users start sessions in our UI, monitor on GitHub. Preserves 100% UI investment, 2-week MVP.
- **Alternative paths evaluated:** Option 2 (reverse-engineer GitHub's streaming endpoint) rejected—undocumented, fragile, policy risk. Option 3 (wait for public API) rejected—product becomes dead in water for 3–6 months.
- **Decision inbox entry:** `.squad/decisions/inbox/jobs-copilot-cli-remote-pivot.md` captures full analysis, options with pros/cons, recommendation, execution plan.
- **Action items:** (1) Delete obsolete remote-control code. (2) Implement LocalProcessManager for `copilot` CLI spawning. (3) Add dashboard panel for session launching/monitoring. (4) Update marketing positioning. (5) Confirm with Brady: Remote Control policy enabled in GitHub org?


## 2026-04-27: Feature Parity Audit - v0.5.7 to v0.5.13 Sync

**Summary:** Completed upstream feature parity audit. Identified 5 gaps, fixed all 7 bugs, verified with E2E testing.

**Status:** Complete - All fixes verified, no regressions.

**Key Gaps Fixed:**
- F1 (CRITICAL): server.ts url ReferenceError
- F2 (MODERATE): tool_complete content not propagated  
- F3 (MODERATE): ask_user timeout 5min to 30min
- F4 (MODERATE): reconnectWithCwd missing titleChangedCallback
- F5 (MODERATE): reconnectWithCwd doesn't restore agent/model
- F6 (MODERATE): agent source detection missing .github/agents
- F7 (MINOR): dynamic agent placeholder

**Testing:** E2E 52/53 passed, verification complete, 523 tests passing.
