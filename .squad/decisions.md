# Squad Decisions

## Active Decisions

### 2026-04-05T03:19:17Z: Squad-Uplink Architecture Specification
**By:** Brady (via Copilot)
**Status:** Approved — Founding Architecture

**Visual Specs ("The Chassis"):**
- Engine: xterm.js with Canvas Renderer for high-performance visual filtering
- Apple IIe Theme: #33ff33 text on #000000, CRT scanline overlay, text-shadow phosphor glow, CSS/SVG curvature (bulge), pixel-perfect fonts (PrintChar21 or Apple II)
- C64 Theme: #706ce4 text on #3528be, enforced 40-column mode, massive screen-border effect, C64 Pro Mono font

**Integration & Hosting:**
- Azure Static Web App (SWA)
- Microsoft Dev Tunnels + WebSockets to mirror Squad PTY stream
- Microsoft/GitHub OAuth via Dev Tunnel API to discover active sessions

**Operational Features ("The UX"):**
- Theme toggle: Apple IIe (Logical/Clean) ↔ C64 (Creative/Chunky)
- HITL "Mechanical Switch" to toggle CRT filters off for high-readability
- Hidden "Modern Telemetry" panel for Azure Monitor charts
- Audio Feedback (Web Audio API): 5.25" floppy seek on success/start, SID chip glitch/buzz on error

**Agent Personas:**
- Apple IIe view → Architect tasks (system design, infrastructure, deep logs)
- C64 view → Creative/Tinkerer tasks (prototyping, UX design, rapid experimentation)

**Success Metric:** Must feel like a 1984 secret military terminal while providing real-time control over modern Azure AI agents.

---

### 2026-04-05T03:25:00Z: Architecture Decision Record v1 — Jobs
**By:** Jobs (Lead)
**Status:** Locked

**Key Decisions:**
1. **State Management:** Zustand (single store). Works outside React — WebSocket messages arrive outside component lifecycle. React Context rejected (re-render cost on message traffic), Jotai rejected (unnecessary indirection).
2. **Component Tree:** Flat, single-screen. No routing. `CRTShell` wraps `TerminalView` + `StatusBar`. `TelemetryDrawer` and `AudioEngine` are siblings.
3. **xterm.js Integration:** CSS overlay pattern. xterm owns rendering; CRT effects (scanlines, glow, curvature) are pure CSS/SVG layered on container. Never touch xterm's rendering pipeline.
4. **WebSocket Connection:** `ConnectionManager` class lives outside React, pushes to Zustand. Handles auth handshake, reconnection (exp backoff: 1s–30s), replay buffer, rate limiting.
5. **Theme Engine:** Paired objects — CSS custom properties for shell + xterm `ITheme` for terminal colors. C64 enforces 40-col via `terminal.resize()`. HITL switch = CSS class toggle.
6. **Audio System:** Procedural Web Audio API oscillators. No sample files. Event-driven from Zustand state transitions. Two profiles: Apple IIe (sine/square), C64 (SID sawtooth/pulse).

**Cut from Scope:** Agent persona routing (theme ≠ work), OAuth tunnel discovery (use URL), Azure Monitor chart embedding (defer), multi-terminal tabs.

**MVP Criteria:** xterm.js + CRT effects + WebSocket + theme toggle + HITL switch. 6 milestones: Scaffold → Terminal Core → Chassis → Connection Resilience → Audio → Telemetry → Ship.

---

### 2026-04-05T03:25:00Z: Scaffold Architecture Decisions — Woz
**By:** Woz (Lead Dev)
**Status:** Implemented

**Key Decisions:**
1. **xterm.js v5 (not v6):** Pinned to `^5.5.0`. `@xterm/addon-canvas` peer dep doesn't support v6 yet.
2. **Theme via React Context + localStorage:** xterm needs programmatic theme application via `ITheme` interface. Context lets us push changes to both CSS and xterm simultaneously.
3. **Path aliases:** `@/` → `src/` in both Vite and tsconfig. Avoids `../../../` chains.
4. **CRT Effects:** Pure CSS overlays with `pointer-events: none`. GPU-efficient, no interference with xterm canvas.
5. **Audio:** Procedural Web Audio API. Zero asset weight, instant playback, easily tunable per theme.
6. **WebSocket Reconnect:** Auto-reconnect with exponential backoff (1s base, 30s max, 10 retries).
7. **React 19 + Vite 8:** Greenfield project, no legacy constraints. Latest versions for best tooling.

**Scaffold Status:** Vite 8 + React 19 + TS 5.9 delivered. 74 files committed. Build + lint pass clean.

---

### 2026-04-05T03:25:00Z: Test Strategy — Hertzfeld
**By:** Hertzfeld (Tester)
**Status:** Proposed

**Key Decisions:**
1. **Test Runner:** Vitest + jsdom (not Jest). Native Vite integration, Jest-compatible API.
2. **Co-located Tests:** `*.test.ts(x)` next to source. Integration/edge cases in `src/__tests__/`.
3. **Behavior Tests:** React Testing Library. No snapshots (brittle, trains blind updates).
4. **WebSocket Mocking:** Custom `MockWebSocket` class (not library). Need precise control over lifecycle/timing/errors.
5. **Coverage Floor:** 80% overall, 95% for hooks. Hooks contain core logic (WebSocket, auth, rate limiting).
6. **Edge Cases:** Dedicated test category. Protocol constraints (rate limits, replay buffer, session TTL) are production fire starters.
7. **Audio Mocking:** Hand-roll AudioContext/OscillatorNode mocks. No real audio in CI.

**Test Categories:** 60+ cases across unit, component, integration, edge cases.

---

### 2026-04-05T03:25:00Z: User Directive — Multi-Skin Theme Extension
**By:** Brady (via Copilot)
**Status:** Pending Implementation (Wave 2: Kare)

**Expansion:** From 2 skins to 5 distinct hardware skins with unique CSS, audio, and grid layouts.

**New Skins:**
| Skin | Name | CSS Basis | Audio | Persona |
|------|------|-----------|-------|---------|
| SKIN_APPLE | The Cupertino 83 | Phosphor Green/CRT Warp | Disk Drive II Mechanical | Architect |
| SKIN_C64 | The Breadbin | Blue 40-col Border | SID Chip Glitch/Tape Load | Creative |
| SKIN_IBM | The Amber 3270 | High-Contrast Amber (#ffb000) | Solenoid Keyboard Click | Security/Log Analysis |
| SKIN_WIN95 | Chicago '95 | Teal Desktop (#008080)/16-color | "Ta-Da" Startup/HDD Whir | Management |
| SKIN_LCARS | The Bridge | Pastel Geometric/No Border | "Chirp"/Warp Core Hum | Multi-Agent Squad |

**Implementation:** ThemeContext swapping CSS variables. `useSquadAudio()` hook mapping lifecycle events to skin-specific SFX. SVG filters for curvature. Typography resources linked (oldschool PC fonts, CSS frameworks, royalty-free audio).

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
