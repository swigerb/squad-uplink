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
**Status:** Implemented (Wave 2: Kare)

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

---

### 2026-04-05T03:47:00Z: 5-Skin Theme Engine Expansion
**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

**Context**

Brady directed expanding the theme system from 2 skins (Apple IIe, C64) to 5 skins, adding IBM 3270, Windows 95, and LCARS. Each skin has a distinct visual identity, layout mode, and audio profile.

**Decisions Made**

**1. TerminalTheme Interface Extensions**
Added optional fields to `TerminalTheme`: `borderSize`, `borderColor`, `layout` (fullscreen | windowed | panel), `crtEnabled`, `customCss`, `chromeFontFamily`, and `accentColors`. Existing themes default to `layout: 'fullscreen'` and `crtEnabled: true`.

**2. Layout Architecture**
Three distinct layout modes render in App.tsx:
- **Fullscreen** (apple2e, c64, ibm3270): Terminal fills viewport with CRT overlay
- **Windowed** (win95): Teal desktop with a 98.css-style window frame containing the terminal
- **Panel** (lcars): Grid layout with geometric pill-shaped sidebar panels flanking the terminal

**3. Win95 Terminal Background ≠ Desktop Background**
Win95 intentionally has `bg: '#008080'` (teal desktop) but `xtermTheme.background: '#000080'` (command prompt blue). The cross-theme test was updated to only assert bg match for non-windowed themes.

**4. CRT Effects are Conditional**
CRTOverlay returns `null` when `theme.crtEnabled === false` (win95, lcars). Flicker animation in CSS is scoped to CRT-enabled theme selectors only.

**5. Audio Profiles per Skin**
`useAudio` now accepts a `skinId` parameter (defaults to `'apple2e'`). Each skin has distinct waveform types, frequencies, and optional dual-tone/detune parameters. The signature is backward-compatible.

**6. Font Strategy**
All new fonts (IBM 3270, W95FA, Trek) use web-safe fallback chains. @font-face declarations are in place; actual font files will be sourced separately.

**7. Theme Cycling Order**
`THEME_ORDER` constant defines the cycle: apple2e → c64 → ibm3270 → win95 → lcars → apple2e. ThemeToggle shows a color swatch dot next to the current skin name.

**Files Changed**
- `src/themes/index.ts` — Expanded ThemeId union, new interface fields, THEME_ORDER
- `src/themes/ibm3270.ts` — New: Amber mainframe theme
- `src/themes/win95.ts` — New: Windows 95 windowed theme
- `src/themes/lcars.ts` — New: LCARS panel theme
- `src/themes/apple2e.ts`, `c64.ts` — Added new optional fields
- `src/hooks/useTheme.tsx` — 5-theme cycling, map-based lookup
- `src/hooks/useAudio.ts` — Skin-specific audio profiles
- `src/components/ThemeToggle/ThemeToggle.tsx` — Color swatch, 5 labels
- `src/components/CRTOverlay/CRTOverlay.tsx` — Conditional rendering
- `src/App.tsx` — Layout switching (fullscreen, windowed, panel)
- `src/styles/crt-effects.css` — Theme-scoped CRT effects
- `src/styles/global.css` — Body styles for all 5 themes
- `src/styles/fonts.css` — 4 new @font-face declarations
- `src/styles/win95-chrome.css` — New: Win95 window chrome CSS
- `src/styles/lcars-panels.css` — New: LCARS geometric panels CSS

---

### 2026-04-05T03:47:00Z: WebSocket Reconnect Backoff Bug
**By:** Hertzfeld (Tester)
**Date:** 2026-04-05
**Status:** Identified, Assigned to Woz

**Issue**

The `useWebSocket` hook's `connect()` function unconditionally resets `retriesRef.current = 0`. Since the reconnect timer calls `connect()` on each retry, the retry counter never accumulates. This means:

1. **Exponential backoff never escalates** — delay is always `2^0 * 1000ms = 1s`
2. **`maxRetries` is never reached** — retries resets to 0 before each check

**Recommendation**

Separate user-initiated connect (should reset retries) from internal reconnect (should preserve retry count). Either:
- Add an internal `_reconnect()` that skips the retry reset
- Add a parameter `connect(config, { isReconnect: boolean })`

**Test Impact**

Current tests verify the actual behavior (1s reconnection delay, reconnect:false disabling). Once Woz fixes the backoff logic, exponential delay and maxRetries tests should be added.

---

### 2026-04-05T04:01:00Z: Integration Decision: WebSocket ↔ Terminal Wiring
**By:** Woz (Lead Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Jobs specified ConnectionManager as an external singleton (Decision 4) and Zustand for connection state (Decision 1). Hertzfeld identified a backoff bug in useWebSocket. This work implements the full integration layer.

## Decisions Made

**1. ConnectionManager as External Singleton**
`src/lib/ConnectionManager.ts` — Class-based singleton instantiated outside React. Owns WebSocket lifecycle, auth ticket exchange, rate limiting, and reconnection. Not a hook, not tied to component lifecycle.

**2. Backoff Bug Fix**
The critical bug: `connect()` was resetting `retriesRef.current = 0`, preventing exponential backoff from escalating. Fix: `connect()` does NOT reset retries. Only a successful `ws.onopen` resets `retries = 0`. Added `connectFresh()` for user-initiated connections that should reset the counter.

**3. Zustand for Connection State Only**
Per Jobs' recommendation, Zustand manages connection state (`status`, `tunnelUrl`, `agentCount`, `crtEnabled`, `audioEnabled`). Theme state stays in React Context (Kare's ThemeProvider). No conflict between the two systems.

**4. Rate Limiting Strategy**
Track outbound messages per 60s window. Below threshold (16/min): send immediately. Between threshold and hard limit (20/min): queue. Drain timer at 3s intervals re-checks the window and sends queued messages when safe.

**5. Terminal Ref Handle (forwardRef + useImperativeHandle)**
Terminal exposes `write()`, `writeln()`, `clear()` via `TerminalHandle` ref. This lets App.tsx (and ConnectionManager callbacks) write directly to xterm without re-rendering through React state. The old `output` prop pattern (string → useEffect → writeln) was removed.

**6. Command System**
Built-in commands (`/status`, `/agents`, `/connect`, `/disconnect`, `/help`, `/clear`) parsed in `src/lib/commands.ts`. Commands access Zustand store directly via `getState()` — no React dependency.

**7. Skin-Aware Boot Messages**
Each theme shows a period-appropriate boot sequence. Apple IIe shows `]CALL -151`, C64 shows `**** COMMODORE 64 BASIC V2 ****`, etc. Implemented in `src/lib/bootMessages.ts`.

**8. StatusBar Component**
Bottom bar using Zustand for connection state and ThemeContext for theme info. Shows connection indicator, tunnel URL, theme name, CRT toggle, and audio toggle.

**9. CRT Toggle Migration**
CRT toggle state moved from `useState` + localStorage in App.tsx to Zustand `connectionStore`. This lets the StatusBar and MechanicalSwitch both read/write the same state without prop drilling.

---

### 2026-04-05T04:01:00Z: HITL Mechanical Switch, Audio Lifecycle, and Toggles
**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

**Context**

Brady requested HITL (Human-in-the-Loop) readability features and expanded audio system to map Squad agent lifecycle events to skin-specific sounds.

**Decisions Made**

**1. Audio System Expansion (12 Sound Types)**
`SoundType` expanded from 5 to 12: added `agent_started`, `agent_triage`, `agent_success`, `agent_error`, `boot`, and `crt_toggle`. Each skin has distinct sound character:
- **apple2e**: Sine/square — floppy spin-up boot, mechanical clicks
- **c64**: Sawtooth with SID-style detune — tape warble boot, arpeggios
- **ibm3270**: Square wave solenoid — clatter boot, terminal bell
- **win95**: Sine chords — iconic 4-note boot, "ta-da" success
- **lcars**: High sine chirps — sci-fi sweep boot, communicator chirps

**2. Sound Sequences**
New `SoundSequence` type enables multi-step sound events (boot chords, arpeggios, klaxons) using timed oscillator scheduling. Single `SoundProfile` still used for simple sounds.

**3. Mute State in useAudio**
`useAudio` now returns `{ play, muted, toggleMute }`. Mute preference persists in localStorage (`squad-uplink-audio-muted`). When muted, `play()` is a no-op.

**4. MechanicalSwitch Component**
Three visual variants based on theme:
- **Lever/Rocker** (apple2e, c64, ibm3270): Chunky toggle with sliding knob
- **Checkbox** (win95): Native Windows-style checkbox
- **Pill** (lcars): LCARS-style pill button that changes color

Shows "CRT" when effects on, "CLEAR" when off. Plays `crt_toggle` sound.

**5. CRT Toggle State**
CRT enabled/disabled state lives in `AppContent` (React state + localStorage). Propagated to `CRTOverlay` via `crtEnabled` prop and to `FullscreenLayout` which conditionally applies `.crt-screen` class. When CRT is off, phosphor text-shadow is stripped via inline style override.

**6. AudioToggle Component**
Simple 🔊/🔇 button that delegates to `useAudio.toggleMute()`. Styled to match current theme.

**7. CRTOverlay Prop Extension**
`CRTOverlay` now accepts optional `crtEnabled` prop. Returns `null` when theme doesn't support CRT OR when HITL switch disables it.

### 2026-04-05T14:35:00Z: TelemetryDrawer Architecture (Wave 4)
**By:** Woz (Lead Dev)
**Status:** Implemented

## Context

Brady's M5 spec calls for a hidden telemetry panel that intentionally breaks the retro aesthetic — the "mask slips" moment revealing the modern system underneath.

## Decisions

### 1. TelemetryMetrics in connectionStore (not separate store)
Extended the existing Zustand `connectionStore` with a nested `telemetry: TelemetryMetrics` object rather than creating a separate store. Rationale: telemetry data is tightly coupled to connection state, and Zustand selectors let consumers subscribe to just what they need.

### 2. fetchStatus() on ConnectionManager
Added `fetchStatus()` as a public method on the ConnectionManager singleton. It derives the HTTP base URL from the configured `wsUrl`, calls `/status`, measures round-trip latency via `performance.now()`, and pushes results directly to the Zustand store. This keeps the data flow consistent: ConnectionManager → Zustand → React.

### 3. Rolling Message Rate via Timestamp Arrays
Inbound/outbound message rates are tracked by pushing `Date.now()` into arrays on each send/receive, then computing rates over a 10s rolling window every 2s. This avoids the complexity of a circular buffer while staying lightweight for typical message volumes.

### 4. CSS Overlay Pattern (z-index 9999)
The drawer is a fixed-position overlay with backdrop, completely independent of the layout system. Renders as a React sibling *outside* all three layout components (Fullscreen, Win95, LCARS). This means it works in all 5 skins without any layout-specific code.

### 5. Modern Design System Isolation
The drawer uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif` font stack and its own CSS namespace (`telemetry-*`). No CSS custom properties from the theme system. This is intentional — the panel should look jarring next to the retro terminal.

## Files Changed
- `src/types/squad-rc.ts` — Added `StatusResponse`, `TelemetryMetrics` interfaces
- `src/store/connectionStore.ts` — Extended with `drawerOpen`, `telemetry`, and actions
- `src/lib/ConnectionManager.ts` — Added `fetchStatus()`, metrics tracking, reconnect counting
- `src/components/TelemetryDrawer/TelemetryDrawer.tsx` — New component
- `src/components/TelemetryDrawer/TelemetryDrawer.css` — Modern dark glass styling
- `src/components/TelemetryDrawer/index.ts` — Barrel export
- `src/App.tsx` — TelemetryDrawer integration, Ctrl+Shift+T keyboard shortcut

---

### 2026-04-05T14:35:00Z: Wave 6 Font Optimization & Accessibility
**By:** Kare (Frontend Dev)
**Status:** Implemented

## Font Optimization

### Font file location: `public/fonts/` (not `src/assets/fonts/`)
Moved @font-face URL paths from `src/assets/fonts/` to `public/fonts/`. Vite serves `public/` as static root, so URLs are `/fonts/filename.woff2`. This avoids Vite's asset pipeline processing (hashing, bundling) for fonts that may not exist yet — missing files in `public/` produce a 404 at runtime instead of a build error.

### Theme-specific fallback chains
Each theme now has a retro-accurate fallback chain before the generic family:
- **apple2e:** `'PrintChar21', 'Apple II', monospace`
- **c64:** `'C64 Pro Mono', 'PetMe', monospace`
- **ibm3270:** `'IBM 3270', 'IBM Plex Mono', monospace`
- **win95:** `'W95FA', 'Fixedsys', 'Courier New', monospace`
- **lcars:** `'Trek', 'Antonio', sans-serif` (chrome), `'Trek', 'Antonio', monospace` (terminal)

Previous chains used generic web-safe fonts (Courier New, Consolas). New chains use era-appropriate intermediate fallbacks that better match each theme's character before falling to monospace/sans-serif.

### Font preloading
`<link rel="preload">` added to `index.html` for `PrintChar21.woff2` (default apple2e theme). Other fonts are not preloaded to avoid wasted bandwidth on unused themes.

## Accessibility

### Focus indicators
Theme-specific `:focus-visible` styles in `src/styles/accessibility.css`. CRT themes get phosphor-colored glow rings. Win95 gets classic dotted outline. LCARS gets orange ring. All use outline + box-shadow double-ring pattern for contrast against any background.

### Reduced motion
`@media (prefers-reduced-motion: reduce)` disables: CRT flicker animation, phosphor glow transitions, switch slide transitions, pill hover brightness changes. Static visual styling (colors, borders, glow) is preserved — only movement is removed.

### Screen reader support
- All icon-only buttons have `aria-label`
- StatusBar has `role="status"` with `aria-live="polite"` on connection indicator
- Terminal has `role="application"` and `aria-label="Squad terminal"`
- Theme changes announced via hidden `aria-live` region
- Toggle buttons use `aria-pressed`
- Decorative emoji hidden with `aria-hidden="true"`

### Keyboard navigation
- Controls grouped in `role="toolbar"` for logical tab stops
- Escape key returns focus to terminal
- All interactive elements are natively keyboard-focusable (buttons, inputs)

## Files Changed
- `src/styles/fonts.css` — Updated paths and comment
- `src/styles/global.css` — Updated fallback chains
- `src/styles/accessibility.css` — New: focus, reduced motion, sr-only
- `src/themes/*.ts` — Updated fontFamily strings
- `src/App.tsx` — Accessibility CSS import, aria-live region, Escape handler, toolbar role
- `src/components/Terminal/Terminal.tsx` — role, aria-label, focus() method
- `src/components/StatusBar/StatusBar.tsx` — role, aria-live, aria-pressed, aria-label
- `src/components/ThemeToggle/ThemeToggle.tsx` — aria-label
- `src/components/MechanicalSwitch/MechanicalSwitch.tsx` — aria-label on all variants
- `index.html` — Font preload link
- `public/fonts/README.md` — New: font download instructions
- `src/styles/__tests__/fonts.test.ts` — Updated expectations for new chains

---

### 2026-04-05T14:35:00Z: Wave 4+6 Test Architecture
**By:** Hertzfeld (Tester)
**Status:** Implemented

## Context

Wrote tests proactively against spec for TelemetryDrawer (Wave 4) and fonts/accessibility (Wave 6) before implementations land.

## Decisions

### 1. TelemetryDrawer Tests — describe.skip Pattern
21 tests in `src/components/__tests__/TelemetryDrawer.test.tsx` wrapped in `describe.skip` blocks. Once Woz delivers the component, remove `.skip` and uncomment the render calls. Tests expect:
- `data-testid="telemetry-drawer"` on the drawer element
- `data-testid="session-token"` for masked token display
- Keyboard shortcut: Ctrl+Shift+T to open, Escape to close
- Store will need: `latency`, `messagesPerSec`, `uptimeMs`, `sessionToken` fields
- Auto-refresh: `fetch()` to `/status` every 30s when open, cleanup on close

### 2. Font Tests Use Static CSS Parsing
`src/styles/__tests__/fonts.test.ts` reads `fonts.css` via `readFileSync` and validates @font-face blocks with regex extraction. This avoids jsdom CSS limitations and tests the actual source of truth.

### 3. Zustand Store Updates Need act()
When updating Zustand store state mid-test for re-render assertions, wrap in `act()` to avoid React 19 warnings. Pattern:
```ts
act(() => { useConnectionStore.setState({ status: 'connecting' }); });
```

### 4. Font Stack Divergence from Original Spec
Theme font stacks have changed from the original architecture spec. Tests now assert actual values (e.g., Apple IIe uses "Apple II" fallback, not "Courier New"). Future font changes should update tests accordingly.

## Files Created
- `src/components/__tests__/TelemetryDrawer.test.tsx` (21 tests, all skipped)
- `src/styles/__tests__/fonts.test.ts` (32 tests, all passing)
- `src/components/__tests__/accessibility.test.tsx` (28 tests, all passing)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
