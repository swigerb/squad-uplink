# Squad Decisions

## Active Decisions

### 2026-04-08T030500Z: WebSocket Auth via Subprotocol for Dev Tunnel Compatibility
**By:** Woz (Lead Dev)
**Date:** 2026-04-08
**Status:** Implemented

## What

Switched WebSocket authentication from query parameter (`?token=<JWT>`) to the WebSocket subprotocol method (`access_token-<JWT>`). Also added trailing-slash stripping on URLs and diagnostic close-code logging.

## Why

Private Microsoft Dev Tunnels strip query parameters during the WebSocket Upgrade handshake. The `access_token-<JWT>` subprotocol is the official Dev Tunnel method for passing auth tokens — it survives relay proxies and enterprise network intermediaries that rewrite URLs.

Additionally:
- **Trailing slashes** cause the Dev Tunnel relay to interpret the request as an HTTP GET for a directory listing instead of a WebSocket Upgrade. Stripping them fixes silent connection failures.
- **Close code diagnostics** were missing — `ws.onclose` didn't log `event.code`, `event.reason`, or `event.wasClean`, making it impossible to distinguish auth failures (4xx) from relay issues (1006) from clean shutdowns (1000).

## Changes

- `src/lib/ConnectionManager.ts`: Subprotocol auth, trailing-slash strip, close/error diagnostics
- `src/__mocks__/websocket.ts`: MockWebSocket now accepts `protocols` parameter
- `src/lib/__tests__/ConnectionManager.test.ts`: Updated 13 tests to verify subprotocol auth instead of query params

## Risk

Low. The ticket-exchange path still uses query params for the short-lived ticket (by design). Only the long-lived auth token moves to subprotocol. All 524 tests pass (13 new tests added by Hertzfeld).

---

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

### 2026-04-05T15:44:00Z: Pip-Boy Full Device Chrome
**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Brady directed building the Pip-Boy 3000 theme as 6th skin with full hardware device chrome. Previous work (Wave 6) created the bare theme with tabs and data components. This work adds the physical device aesthetics.

## Decisions

### 1. CSS Grid 3-Column Device Layout
The device body uses a 3-column grid: left grip (15% width) | center screen bezel (70%) | right panel (15%). Top and bottom rows add decorative clip and band elements. Device fills ~95% of viewport with safe margins.

### 2. Screen Bezel Inset Shadow Effect
Center column (screen bezel) uses deep `box-shadow: inset` to create a recessed 3D CRT well. All tab content and terminal render inside this bezel. The effect simulates the physical depth of a CRT monitor.

### 3. Left Grip Ventilation Grille
Repeating-linear-gradient vertical stripes simulate ventilation slots. Darker brown (#6b5344) for shadowing. Pure CSS — no SVG or img elements.

### 4. Right Panel with Dials & Knobs
- **RADS dial:** CSS circle with needle pointer (rotates on mouse hover or telemetry state)
- **TUNE knob:** Conic-gradient ridges to simulate mechanical knob grooves
- **Toggles:** 3-state lever switches (up/off/down)
- **Indicator strip:** Small LED indicators showing status lights

All CSS-only, no SVG.

### 5. Decorative Elements: Screws, Label, Power Button
- **Screws:** 6 CSS screws using ::before and ::after pseudo-elements with cross-slot styling. No extra DOM nodes.
- **"PIP-BOY" label:** CSS text-shadow embossing on tan metal
- **Top clip & latch:** Horizontal CSS border bar
- **Bottom band:** Ventilation slots + glowing amber POWER button
- **Power button:** #ffb641 LED with pulse animation (2s cycle)

### 6. Tan/Brown Metal Aesthetic
Device body: #8B7355 (tan-brown) with CSS gradients for 3D shading. Top-left lighter gradient (highlight), bottom-right darker gradient (shadow). Creates metallic appearance without images.

### 7. VaultBoy SVG Component
Dedicated `VaultBoy.tsx` component renders a standing Vault Boy figure with thumbs-up pose. Limbs (head, L-arm, R-arm, L-leg, R-leg) each have 5-segment health bars. Colors: green (healthy) → yellow (medium) → red (critical).

Health derived from ConnectionStore telemetry:
- Latency → strength (physical durability)
- Throughput → endurance (sustained load)
- Uptime → perception (observability)
- Success count → luck (reliability)

### 8. Idle Animation
VaultBoy has continuous idle animation: vertical bounce (2s cycle, ease-in-out) and subtle chest glow pulse. Keeps the component "alive" visually without being distracting.

### 9. Responsive: Hide Side Panels on Mobile
Media query at ≤768px hides left/right panels (`display: none`), centers screen bezel to full width. Mobile-friendly without losing core terminal functionality.

### 10. Terminal Mount Location
xterm.js terminal stays mounted inside `.pipboy-screen-bezel` div. Tab switches use `display: none` on non-active tab wrappers, not conditional rendering. Preserves terminal scroll position, selection, and command history across tab switches.

## Files Changed
- `src/components/layouts/PipBoyLayout.tsx` — Device chrome CSS grid, decorative elements, responsive logic
- `src/styles/pipboy.css` — Device body colors, animations, grid layout, responsive breakpoints
- `src/components/PipBoy/VaultBoy.tsx` — New: SVG component with health bars and idle animation
- `src/themes/pipboy.ts` — Theme definition (no changes for chrome)

---

### 2026-04-05T15:44:00Z: HMR Fix — Split useTheme Hook & ThemeProvider
**By:** Woz (Lead Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Fast Refresh HMR console warning: "ThemeProvider is not exported from React." Caused by single file exporting both hook and component, confusing React's HMR system.

---

### 2026-04-06T01:30:00Z: Consolidate All Controls to StatusBar
**By:** Kare (Frontend Dev)
**Status:** Implemented — Production Ready

**Problem:** Duplicate control buttons existed in two locations:
1. Upper-right toolbar in App.tsx (`MechanicalSwitch` + `AudioToggle` + `ThemeToggle`)
2. StatusBar (lower-right) with separate CRT and Audio toggles

Additionally, two audio mute systems conflicted: `useAudio().toggleMute` (real, localStorage-backed) and `connectionStore.toggleAudio` (dead flag, did nothing to actual playback).

**Decision:** StatusBar is the single source of truth for all controls.

**Implementation:**
- Removed upper-right toolbar entirely from App.tsx
- Removed `header` prop from all 4 layout components and their TypeScript interfaces
- StatusBar now contains: CRT toggle (plays `crt_toggle` sound all 6 themes), Audio toggle (wired to real `useAudio().toggleMute`), ThemeToggle
- CRT toggle confirmed: audible on every click across all themes (apple2e, c64, ibm3270, win95, lcars, pipboy)
- Audio toggle uses localStorage-backed mute state
- `/status` command reads audio mute from localStorage (not `connectionStore.audioEnabled`)
- `MechanicalSwitch` and `AudioToggle` components deprecated (tests skipped) but retain for future reuse

**Rationale:** Single control location eliminates user confusion and state synchronization bugs. StatusBar is persistent across all themes and always accessible.

**Impact:** 380 tests passing, 15 skipped (deprecated components). Build clean. Zero breaking changes.

## Decision

Split `src/hooks/useTheme.tsx` into two files:
- **`src/hooks/useTheme.tsx`** — Hook + context (functions only, no components)
- **`src/hooks/ThemeProvider.tsx`** — Provider component (React component)

React Fast Refresh treats hooks-only files and component-only files differently for HMR. Separation enables correct reload strategies.

## Implementation

### useTheme.tsx (After)
```typescript
export const ThemeContext = createContext<TerminalTheme | undefined>(undefined);
export const useTheme = (): TerminalTheme => { ... };
```

### ThemeProvider.tsx (New)
```typescript
export const ThemeProvider = ({ children, theme }: ThemeProviderProps) => (
  <ThemeContext.Provider value={theme}>
    {children}
  </ThemeContext.Provider>
);
```

---

### 2026-04-07: Avoid CSS `background` shorthand on generic selectors
**By:** Kare (Frontend Dev)
**Status:** Approved

**Decision:** When a CSS rule only needs to set `background-color`, use `background-color:` explicitly — never the `background` shorthand. The shorthand resets `background-image`, `background-size`, `background-repeat`, and `background-position` to initial values, which can silently break image backgrounds set by less-specific selectors.

**Context:** `.pipboy-info-bar span` rule used `background: rgba(0,255,0,0.02)` — a shorthand that implicitly reset `background-image` to `none`. This silently clobbered the `background: url(...)` declarations on icon-specific classes (`.pipboy-weapon`, `.pipboy-aim`, etc.) because the generic selector had higher CSS specificity.

**Impact:** Applies to all theme CSS files. Especially important for generic selectors that match elements which may also have icon/image backgrounds from more specific class rules.

---

### 2026-04-07: Link "Squad Remote Control" to official docs in README
**By:** Woz (Lead Dev)
**Status:** Approved

**Decision:** Update README.md to link "Squad Remote Control" to the official documentation instead of the GitHub repo, with a "Related" section at the bottom preserving the repo link for contributors.

**Context:** README.md linked "Squad Remote Control" to `github.com/brswig/squad-rc`. The official documentation lives at `bradygaster.github.io/squad/docs/features/remote-control/`.

**Implementation:**
1. Updated the hero link (line 3) to point to the official docs
2. Added a "Related" section at the bottom with links to both official docs and GitHub repo
3. Did not over-link — other `squad-rc` mentions (env var table, architecture types) remain as technical references

**Rationale:** First mention is highest-visibility; it should point users to documentation, not raw source. GitHub repo link preserved for contributors.

---

## Import Updates
- **Components using hook:** `import { useTheme } from '@/hooks/useTheme'` (no change)
- **Components using provider:** `import { ThemeProvider } from '@/hooks/ThemeProvider'` (updated)
- **10 import sites** updated: App.tsx, 3 layouts, and others

## Verification
✓ HMR warnings eliminated
✓ Fast Refresh works cleanly
✓ All 399 tests passing
✓ Build clean, no TypeScript errors
✓ No breaking changes to public API

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
### 2026-04-05T15:58:00Z: User Directive — Pip-Boy Transition Logic & Hardware Feedback
**By:** Brady (via Copilot)
**Status:** Proposed — Queued for Implementation

**Specification:** Pip-Boy tab transitions must feel authentic to 1950s vacuum-tube CRT technology — NOT modern slides/fades.

**Key Requirements:**
1. **Navigation:** onClick on tab headers + mechanical click sound on state change
2. **Phosphor Persistence:** Old content stays visible briefly with blur + opacity drop on tab switch
3. **Horizontal Scanline Sweep:** Vertical refresh line sweeps new data top-to-bottom
4. **Static Burst:** Single-frame glitch/white noise during transition to hide loading latency
5. **RADS Needle:** Twitches/spikes on critical errors or API rate-limit warnings
6. **Power Light:** Pulses when an agent is in "Thinking" state
7. **Tab Content Mapping:**
   - STAT = agent pool health (S.P.E.C.I.A.L. metrics from ConnectionStore)
   - INV = tool/MCP inventory (tools list from store)
   - DATA = console stream (message history with raw JSON toggle)
   - MAP = agent topology node graph (activeAgent + relationships)
   - RADIO = command center with override buttons (commandHistory + uplink controls)

**Rationale:** Authentic Pip-Boy transition feel is "the secret sauce" — vacuum-tube technology persistence/scanning/noise creates distinctive CRT aesthetic.

**Dependency Chain:** Codepen CSS port (Kare, complete ✓) → Transition logic (next sprint) → Tab content binding (existing)

---

### 2026-04-05T15:55:00Z: Decision — Pip-Boy Codepen Exact Port
**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Brady requested (twice) that the Pip-Boy implementation match the Codepen reference (https://codepen.io/stix/pen/KdJEwB) exactly. The previous implementation used a CSS grid layout with custom device chrome that didn't match the reference.

## Decision

Complete replacement of `src/styles/pipboy.css` and the `PipBoyLayout` component in `src/App.tsx` with a faithful port of the Codepen's CSS and HTML structure.

## Key Choices

1. **Fixed dimensions + transform scaling**: Kept the Codepen's 630x400px design and used `transform: scale()` with a viewport-responsive scale factor (via `usePipBoyScale` hook) instead of making everything fluid/responsive. This preserves pixel-perfect fidelity.

2. **Class namespacing**: All Codepen classes prefixed with `pipboy-` (e.g., `.pip` → `.pipboy-pip`) and scoped under `[data-theme='pipboy']` to avoid conflicts with other themes.

3. **Tab label strategy**: Used `pipboy-lbl-*` class names for CSS `::before` content labels (avoiding conflicts with existing `pipboy-stat`/`pipboy-inv` component classes). Nav tabs use `aria-label` for accessibility while `::before` provides visible text.

4. **Content integration**: Codepen decorative elements (supplies, info-bar icons, HUD bar) rendered alongside functional tab content. The screen inner area uses absolute-fill flexbox for tab panels.

5. **Three Codepen animations preserved**: `pipboy-flicker` (power button glow), `pipboy-meter` (RADS needle oscillation), `pipboy-scan` (green scan line sweep).

## Impact

- `src/styles/pipboy.css`: Complete replacement (~650 lines)
- `src/App.tsx` PipBoyLayout: Complete replacement (~170 lines)
- All 399 tests passing, build clean
- No changes to other themes or components

---

### 2026-04-05T16:28:00Z: Decision — Pip-Boy Physical Dials — Hardware-to-UI Navigation
**Date:** 2026-04-05
**Author:** Woz
**Status:** Implemented

## Context

The Pip-Boy 3000 theme has two decorative dials from the Codepen port: a spiked wheel (upper-right) and a tune wheel (bottom-right). Brady requested these be made functional with rotation animation, audio feedback, and accessibility.

## Decision

### Spike Wheel → Tab Navigation
- Click/wheel/keyboard all navigate tabs via `nextTab()`/`prevTab()` from the `usePipBoyTransition` hook
- Rotation: `10deg base + tabIndex * 15deg`, 200ms CSS ease-out transition
- Single source of truth: `activeTab` from `usePipBoyTransition` — if user clicks nav bar or side labels, spike wheel rotation updates automatically

### Tune Wheel → Content Scrolling
- Mousewheel scrolls active tab panel ±40px per tick
- Click-and-drag for analog feel (mousemove delta → scrollTop)
- Rotation: `45deg base + accumulated_scroll * 0.5deg`, 100ms CSS ease-out transition

### Hook Changes
- `PIPBOY_TABS` exported from `usePipBoyTransition` (was local constant in App.tsx)
- Added `tabIndex`, `nextTab()`, `prevTab()` to the hook return interface

### Accessibility
- Both dials: `role="slider"`, `aria-label`, `aria-valuenow/min/max`, `tabIndex={0}`
- Spike wheel: ArrowLeft/Up = prev tab, ArrowRight/Down = next tab, Enter/Space = next
- Tune wheel: ArrowUp/Down = scroll ±40px
- Focus-visible outline: 2px solid `#1bff80`
- Reduced motion: dial transitions disabled

### Audio
- Both dials play `toggle` sound type via existing `useAudio('pipboy')` hook

## Files Changed
- `src/hooks/usePipBoyTransition.ts` — exported PIPBOY_TABS, added tabIndex/nextTab/prevTab
- `src/App.tsx` — wired dial event handlers, inline rotation styles, refs
- `src/styles/pipboy.css` — cursor, hover, focus-visible, reduced-motion for dials

## Verification
- `npm run build` — clean (0 errors)
- `npm test` — 399/399 passing

---

### 2026-04-05T16:28:00Z: User Directive — Pip-Boy Navigation Logic & Visual Fidelity
**By:** Brady (via Copilot)
**Status:** Implemented

**What:** 
1. Upper right spiked dial = Primary Tab Navigation (15-degree rotational snap per tab)
2. Bottom right tune dial = Sub-Navigation/List Scrolling (onWheel → scrollTop of active content)
3. Walking Vault Boy MUST be present on STAT page — use the Codepen's animated GIF (https://s3-us-west-2.amazonaws.com/s.cdpn.io/184191/vaultboy2.gif)
   - Walking state = idle/polling
   - Static/thinking state = agent processing
   - Must inherit phosphor glow (text-shadow + drop-shadow)
   - Must sit behind CRT scanline overlay but in front of background
4. Fix text overlapping issues in Pip-Boy theme

**Why:** User request — Pip-Boy visual fidelity is critical. The "soul" of the interface is the Vault Boy animation.

**Implementation Status:** ✅ COMPLETE
- Spike wheel functional (click/wheel/keyboard navigation)
- Tune wheel functional (mousewheel/drag/keyboard scrolling)
- Walking Vault Boy GIF integrated with phosphor glow
- Text overlap completely resolved
- Thinking pulse animation (connection-aware visual state)
- All 399 tests passing

---

### 2026-04-07: Decision — README TypeScript 6.0 + Theme Coverage + Shortcut Cleanup
**By:** Woz
**Status:** Implemented

**Context**

README.md had several stale references: TypeScript listed as 5.9 (actual: 6.0.2), only 6 of 9 themes documented, Ctrl+Shift+T shortcut conflicts with browser reopen-tab, and Pip-Boy section included implementation details (color palette, layout) better suited for code comments than user docs.

**Decision**

1. Updated all TypeScript version references to 6.0 (badges + tech stack line).
2. Expanded theme table to all 9 skins with descriptions matching source theme definitions.
3. Replaced Ctrl+Shift+T shortcut with reference to 📡 button in floating control bar.
4. Stripped color palette table and layout description from Pip-Boy section (kept tab nav + special features).

**Rationale**

- README should reflect what's actually installed (	ypescript@^6.0.2).
- All shipped themes deserve documentation — users shouldn't have to discover 3 themes by accident.
- Browser shortcut conflicts are a UX trap; the 📡 button is the canonical telemetry toggle now.
- Pip-Boy color palette and CSS layout details are implementation internals, not user-facing docs.

---

### 2026-04-07: Decision — Remove Ctrl+Shift+T Keyboard Shortcut for TelemetryDrawer
**By:** Kare (Frontend Dev)
**Status:** Implemented

**Context**

The TelemetryDrawer had a Ctrl+Shift+T keyboard shortcut to toggle it open/closed. This conflicts with the browser's native "reopen closed tab" shortcut — pressing it opens a new browser tab instead of toggling the drawer.

**Decision**

Removed the keyboard shortcut entirely rather than replacing it with an alternative. The 📡 button in the StatusBar floating control bar is now the sole way to toggle the TelemetryDrawer (plus Escape/backdrop to close).

**Rationale**

- Brian's preference: discoverability via UI button over hidden keyboard shortcuts
- The 📡 button is always visible in the StatusBar across all themes
- No need for a replacement shortcut — the button is more discoverable and avoids future browser conflicts
- Fewer keybinding collisions = fewer user surprises

**Changes**

- App.tsx: Removed Ctrl+Shift+T handler from keydown listener, removed unused 	oggleDrawer binding
- TelemetryDrawer.tsx: Footer text changed from "Ctrl+Shift+T to toggle" → "📡 button to toggle"
- TelemetryDrawer.test.tsx: Updated docblock comment

**Impact**

None — Escape key still closes the drawer, 📡 button still toggles it, all 509 tests pass.

---

### 2026-04-07T12:38: User Directive — PWA Implementation ("Uplink-PWA")
**By:** Brian Swiger (via Copilot)
**Status:** Implemented

**Requirements:**
- registerType: 'autoUpdate'
- display: 'standalone' (removes browser UI)
- theme_color: #000000
- PWA icons: 192x192 and 512x512 (pixel-art satellite/terminal)
- Workbox caching for CSS theme files (offline themes)
- SW update notification: retro-themed ">>> SYSTEM UPDATE AVAILABLE. REBOOT? [Y/N]" in xterm.js
- Theme persistence: Zustand store saves activeTheme to localStorage, default to Apple IIe
- Optional: BIOS boot screen on first visit

**Rationale:** User request — enables "Add to Home Screen" on iOS/Android/Desktop for full-screen terminal experience.

---

### 2026-04-07T12:38: Decision — PWA via vite-plugin-pwa with Vite 8 Override
**By:** Woz (Lead Dev)
**Status:** Implemented

**Context**
vite-plugin-pwa@1.2.0 declares `peerDependency: vite ^3–7` but the project uses Vite 8. Plugin API surface is stable; compatibility maintained.

**Key Decisions**
1. **Vite 8 Installation:** Use `--legacy-peer-deps` to override peer dep constraint. Plugin API surface stable; tested with 523 passing tests.
2. **Manifest Generation:** Deleted static `public/manifest.json`. Plugin generates manifest.json from config at build time.
3. **SW Registration:** Dynamic `import('virtual:pwa-register')` guarded by `'serviceWorker' in navigator` to prevent jsdom test breakage.
4. **Font Caching:** CacheFirst with 1-year expiry (fonts are immutable versioned assets).
5. **devOptions.enabled: false** by default — must manually opt-in for local SW debugging to avoid interference with development.
6. **Theme Persistence:** Existing localStorage-based system (ThemeContext + useTheme) works as-is. No Zustand integration needed.

**Implementation Details**
- vite.config.ts: VitePWA plugin config with autoUpdate + manifest paths
- src/pwa.d.ts: Type definitions for `virtual:pwa-register` virtual module
- index.html: Manifest link + apple-touch-icon + theme-color meta tags
- SW registration guarded: `if ('serviceWorker' in navigator) { import('virtual:pwa-register') }`

**Impact**
- `--legacy-peer-deps` required for all future `npm install` until vite-plugin-pwa releases Vite 8 support
- `@testing-library/dom` may need manual reinstall if npm prunes during legacy-peer-deps installs
- `public/icons/` needs actual 192×192 and 512×512 PNG icons before PWA install prompt works on iOS/Android

**Team Notes**
- Kare: No CSS/theme changes. Icons need design specs when ready.
- Hertzfeld: 14 PWA tests written; pwa.d.ts added for type safety. All tests passing (523/523).

---

### 2026-04-07T12:38: Decision — PWA Configuration Tests
**By:** Hertzfeld (Tester)
**Status:** Implemented

**Coverage (14 tests, all passing)**
1. VitePWA config validation (registerType: autoUpdate, manifest paths, cache strategies)
2. index.html meta tags (theme-color, display: standalone, apple-touch-icon)
3. pwa.d.ts type definitions for virtual module imports
4. SW registration guard (`'serviceWorker' in navigator`)
5. Font caching: Workbox CacheFirst with 1yr expiry
6. Theme color validation across all 6 themes

**Design Decisions**
1. **Type Safety:** pwa.d.ts virtual module types ensure IDE support for `import('virtual:pwa-register')`
2. **jsdom Compat:** SW registration tests verify guard prevents jsdom errors
3. **Skipped Tests:** Theme persistence tests already covered by `useTheme` suite

**Impact**
- 523 total tests passing (no regressions)
- Ready for PWA install prompt (pending icon generation)

---

### 2026-04-07: Connection Error Telemetry for TelemetryDrawer
**By:** Woz (Lead Dev)
**Status:** Implemented

## Context

WebSocket reconnect loop provides no visibility into failure causes. The TelemetryDrawer showed "Connect to view status" with no error details, making it impossible to diagnose why connections fail (anti-phishing blocks, auth failures, network issues, etc.).

## Decisions

### 1. Error Log as Ring Buffer in TelemetryMetrics
Added `connectionErrors: ConnectionError[]` to the existing `TelemetryMetrics` interface rather than a separate store field. Capped at 10 entries (oldest evicted). Rationale: errors are telemetry data, and the ring buffer prevents unbounded memory growth during extended reconnect loops.

### 2. Four Capture Points in ConnectionManager
Errors captured at: `ws.onerror`, `ws.onclose` (with close code/reason), `connect()` catch, and `fetchStatus()` catch. Each tagged with a `type` discriminant for filtering/display.

### 3. Token Masking in Stored URLs
All URLs stored in error entries have `access_token` values replaced with `***` before storage. This prevents token leakage through telemetry state, React DevTools, or serialized store snapshots.

### 4. Stable Zustand Selector Fallback
Used a module-level `EMPTY_ERRORS` constant instead of inline `?? []` for the Zustand selector. Inline `[]` creates a new reference per render, causing infinite re-render loops when the field is undefined (e.g., in tests with incomplete store resets).

## Files Changed
- `src/types/squad-rc.ts` — New `ConnectionError` interface, extended `TelemetryMetrics`
- `src/store/connectionStore.ts` — `addConnectionError` action, ring buffer impl
- `src/lib/ConnectionManager.ts` — Error capture at 4 WebSocket/fetch failure points
- `src/components/TelemetryDrawer/TelemetryDrawer.tsx` — Connection Log section, improved empty states
- `src/components/TelemetryDrawer/TelemetryDrawer.css` — Error log styling
- `src/lib/commands.ts` — URL + anti-phishing debug logging in `/connect`
- `src/store/__tests__/connectionStore.test.ts` — Added `connectionErrors` to telemetry fixture
- `src/components/__tests__/TelemetryDrawer.test.tsx` — Added `connectionErrors` to telemetry fixture
- `src/components/__tests__/PipBoyLayout.test.tsx` — Added `connectionErrors` to telemetry fixture

---

## 2026-04-14T0000Z: Performance & Architecture Audit
**By:** Jobs (Lead)  
**Date:** 2026-04-14  
**Status:** Implemented

### Summary
Comprehensive performance and architecture audit of 68 `.cs` files in `src/SquadUplink/` and `src/SquadUplink.Core/`. **39 findings** identified: 9 Critical, 14 High, 12 Medium, 4 Low.

### Critical Findings Implemented
1. **PERF-005: Background-thread UI updates** — DashboardViewModel now marshals all property updates to UI thread via DispatcherQueue
2. **PERF-001: GDI handle leak** — TrayIconService now properly destroys HICON handles via P/Invoke after Icon.FromHandle
3. **ARCH-001: Duplicate ITelemetryService** — Removed second registration from ServiceCollectionExtensions
4. **PERF-002/003/004/008: Event handler leaks** — All four CollectionChanged subscription patterns now properly unsubscribe via named handlers

### High Priority Implemented
- **PERF-009**: SqliteCommand disposal — all `CreateCommand()` calls now wrapped in `await using`
- **PERF-010**: WMI ManagementObject disposal — ProcessScanner now disposes each object in foreach
- **PERF-013**: OtlpListener Stop() blocking — Made StopAsync() to avoid UI thread hangs
- **PERF-014/015/016/017**: Brush allocation churn — Converters and controls now cache SolidColorBrush instances
- **PERF-020**: CommandPalette allocation — Reuse filtered list buffer instead of per-keystroke allocation

### Medium/Low Optimizations
- **PERF-022/023/024/025/026/027/028/030/031**: Collection optimizations, timer reuse, LINQ single-pass aggregates, StringBuilder usage
- **ERR-005/006/007/011**: Bare catch blocks upgraded to typed catches with Debug logging

### Files Modified
Core service layer and infrastructure fixes across 12 files for thread safety, resource management, and error observability.

---

## 2026-04-14T0000Z: Error Handling & C# Best Practices Audit
**By:** Woz (Lead Dev)  
**Date:** 2026-04-14  
**Status:** Implemented

### Summary
Comprehensive error handling audit of all `.cs` files. **31 findings** identified: 3 Critical, 9 High, 13 Medium, 6 Low.

### Critical Findings Implemented
1. **ERR-002: IHost disposal** — Program.cs now uses `using var host =` pattern to ensure Serilog flushing and DI disposal
2. **ERR-003: Duplicate DI registration** — ITelemetryService duplicate removed
3. **ERR-001: async void safety** — SquadDetector async void documented as intentional with full try-catch coverage

### High Priority Implemented
- **ERR-004/008/012**: Fire-and-forget and disposal patterns — Exception continuations added, resources properly cleaned
- **ERR-005/006/007/009/010/011**: Bare catch blocks — Upgraded to typed catches with contextual logging
- **ERR-013/014/015/016**: Event subscription leaks — Named handlers with proper unsubscribe logic

### Medium Priority Implemented
- **ERR-017/019/020/021**: Input validation — ArgumentNullException/ArgumentException guards added to public methods
- **ERR-022**: Null-forgiving operator — Replaced with null-conditional guards and explicit exceptions

### Positive Findings
- NRT enabled project-wide ✓
- File-scoped namespaces used consistently ✓
- Record types used appropriately ✓
- Pattern matching throughout ✓

---

## 2026-04-14T0000Z: WinUI 3 / Fluent 2 / XAML Best Practices Audit
**By:** Kare (Frontend Dev)  
**Date:** 2026-04-14  
**Status:** Implemented

### Summary
Comprehensive XAML and UI audit of all `.xaml`, `.xaml.cs`, and ViewModel files. **31 findings** identified: 2 Critical, 11 High, 13 Medium, 5 Low.

### Critical Findings Implemented
1. **UI-002: DiagnosticsDialog {Binding} migration** — 20+ {Binding} expressions converted to compiled {x:Bind} with x:DataType
2. **MVVM-001: SettingsViewModel brush removal** — SolidColorBrush properties replaced with Color properties + ColorToBrushConverter

### High Priority Implemented
- **UI-001/003**: MainWindow and CommandPalette {Binding} → {x:Bind} with x:DataType
- **MVVM-002/003**: DashboardViewModel Visibility enum → bool properties; extracted MainWindow diagnostics logic to ViewModel
- **MVVM-005**: Background-thread property updates — DispatcherQueue marshaling added
- **UI-005/006/007**: Event subscription cleanup — Unsubscribe in OnNavigatedFrom and ContentDialog.Closing
- **FLUENT-005**: Responsive layout — VisualStateManager with AdaptiveTrigger breakpoints (1200px/860px/0px)
- **FLUENT-006/007**: Accessibility — Session cards converted to Button; CommandPalette focus trapping and automation properties

### Medium Priority Implemented
- **UI-004**: Diagnostics panel deferred loading — Changed to x:Load="False"
- **UI-008/009**: Brush caching — SessionTerminalControl and MainWindow status brush optimization
- **FLUENT-002/003/004**: Hardcoded colors → theme resources (TimelineScrubber, SessionPage, CommandPalette)
- **FLUENT-008/009**: Accessibility enhancements (AutomationProperties)
- **MVVM-004**: LaunchSessionDialog MVVM — Manual Bindings.Update() → ObservableProperty

### Low Priority Implemented
- **FLUENT-010**: ThemeShadow elevation to CockpitPanelStyle
- **FLUENT-011**: Page transition animations with SlideNavigationTransitionInfo
- **UI-010**: SquadStatusPanel opacity layering fixed

---

## Dead Code & Dependency Cleanup
**By:** Woz (Lead Dev)  
**Date:** 2026-04-14  
**Status:** Implemented

### What
Removed all dead code, orphaned files, and unused dependencies from the project. **137 files deleted** (~31,900 lines).

### Key Changes
1. **WebView2 removed** — No `.cs` or `.xaml` file uses `Microsoft.Web.WebView2`. SessionTerminalControl uses native WinUI XAML, not WebView2.
2. **wwwroot/ deleted** — `terminal.html` and `terminal.js` were from abandoned xterm.js plan. Content glob removed from `.csproj`.
3. **React/Vite v1 source removed** — Entire old web app (React 19, Vite 8, TypeScript, xterm.js, Zustand, CSS, themes, hooks, tests) deleted alongside WinUI 3 project.
4. **Old scripts removed** — `squad-rc-launch.mjs` and `generate-icons.mjs` for old web app. `build-release.ps1` (WinUI Velopack) retained.
5. **README updated** — xterm.js/WebView2/wwwroot references replaced with native XAML equivalents.
6. **Tests updated** — WebView2 presence assertion flipped to absence assertion.

### Why
Project migrated from React SPA to WinUI 3 desktop app but carried ~32K lines of dead code, unused NuGet packages, and orphaned web artifacts.

### Risk
Low. WebView2 was only pinned for transitive CsWinRT crash workaround — removing it with 0 build errors confirms Windows App SDK 1.7 resolved the issue. All tests pass.


---

# Decision: Architectural Pivot — GitHub Copilot CLI Remote vs Squad RC

**By:** Jobs (Lead)  
**Date:** 2026-04-13  
**Status:** Inbox — Pending Team Review  
**Impact:** Foundational—Reframes entire product positioning from Remote Control tool to Dashboard/Launcher

---

## Executive Summary

GitHub shipped a native `copilot --remote` feature today (April 13, 2026) that provides real-time remote access to CLI sessions via `github.com/OWNER/REPO/tasks/TASK_ID`. This **eliminates the core value prop of squad-uplink's current Remote Control architecture**, but it **preserves the retro terminal UI as a strategic asset**. We must pivot immediately to remain relevant.

**Recommendation:** Pursue **Option 1 (Launcher/Dashboard)** as the primary path forward. It preserves our UI investment, delivers immediate value to users, and positions us to support GitHub's ecosystem natively.

---

## Research Findings: GitHub Copilot CLI Remote Feature

### What It Does

- **Command:** `copilot --remote` or `/remote` slash command streams CLI session to GitHub
- **UI Location:** Real-time interface at `github.com/OWNER/REPO/tasks/TASK_ID`
- **Session Model:** Session runs **locally** on developer's machine; remote is viewer/controller only
- **Mobile Support:** Works on GitHub Mobile (iOS/Android beta)
- **Permission Model:** User can monitor, steer, approve system access, send prompts, switch modes
- **Privacy:** Private to session owner only (no sharing model yet)
- **Enterprise Policy:** For Copilot Business/Enterprise, "Remote Control" policy is **OFF by default**—admin must explicitly enable

### Critical Limitations

1. **No Custom UI Hook:** GitHub streams to its own interface only. No documented API or WebSocket endpoint for custom frontends.
2. **xterm.js Terminal Cannot Overlay:** Our retro UI (Apple IIe / Commodore 64 themes, xterm.js) cannot hook into GitHub.com's viewer to provide a themed terminal overlay.
3. **DevTunnel WebSocket Auth Obsolete:** The entire `ConnectionManager.ts` authentication nightmare (subprotocol JWT handling, relay proxies, trailing-slash stripping) is irrelevant. GitHub handles auth natively.
4. **Policy Risk for Enterprise:** Brady's GitHub org may not have the Remote Control policy enabled yet. We cannot assume access.

### Strategic Value

- GitHub's remote feature **solves the auth/tunneling/relay problem** that consumed months of our engineering effort.
- Our retro terminal UI is **not redundant**—it is a differentiator for local session chrome/dashboarding/launching/monitoring.
- The remote feature **validates the market** for CLI session observation and control.

---

## What's Obsolete in Current Codebase

### Tier 1: Remove Immediately

These components **no longer have a function** in the new architecture:

1. **`src/lib/ConnectionManager.ts`** — WebSocket connection to Squad RC via DevTunnels
   - Was: Handled auth handshake, reconnection, replay buffer, rate limiting
   - Now: GitHub handles all auth and stream delivery natively
   - Action: Delete or pivot to manage local process connections instead

2. **`src/lib/commands.ts`** — `/connect`, `/auth`, `/probe` commands
   - Was: User-driven authentication and tunnel discovery
   - Now: Not applicable—GitHub provides session URIs directly
   - Action: Delete

3. **`src/types/squad-rc.ts`** — Squad RC message type definitions
   - Was: Message contract for WebSocket protocol
   - Now: Not applicable
   - Action: Delete

4. **`scripts/squad-rc-launch.mjs`** — Squad RC launch helper
   - Was: Bootstrapped the squad-rc connection
   - Now: Not applicable
   - Action: Delete

### Tier 2: Repurpose for New Architecture

These components **remain valuable** if retargeted:

1. **`src/components/TerminalView.tsx` + xterm.js integration** — Keep
   - Still displays CLI sessions locally or from GitHub task URLs
   - Repurpose to embed GitHub session viewer or display local `copilot --remote` output

2. **`src/themes/AppleIIe.ts` + `src/themes/C64.ts`** — Keep
   - Retro UI is now a **differentiator for local dashboard**, not just a remote control viewer
   - C64's 40-column constraint remains relevant for terminal history panels

3. **`src/components/TelemetryDrawer.tsx`** — Keep but repurpose
   - Current: Displays Azure Monitor metrics for remote session
   - New: Displays local process metrics, pending task queue, session history

4. **`src/lib/AudioEngine.ts`** — Keep
   - Procedural Web Audio API is efficient and delightful for UI feedback
   - Works in dashboard context (task completed = SID buzz, etc.)

---

## Pivot Options Analysis

### Option 1: Launcher/Dashboard (RECOMMENDED)

**Positioning:** squad-uplink becomes a retro-themed **launcher and dashboard** for GitHub Copilot CLI sessions. Users start `copilot --remote` sessions from our UI and monitor them via GitHub's native viewer (embedded in a webview or linked).

**Scope:**
- Replace `ConnectionManager` with a local process manager (`LocalProcessManager`) that spawns and monitors `copilot` CLI processes
- Add a "My Sessions" dashboard panel showing active tasks, recent sessions, pending approvals
- Embed GitHub task viewer in a webview (e.g., `<iframe src="github.com/OWNER/REPO/tasks/TASK_ID">`) or deep-link to it
- Repurpose `TelemetryDrawer` to show local process status, memory, CPU
- Keep all retro UI/theme logic intact

**Pros:**
- ✅ Preserves 100% of existing UI/theme investment (xterm.js, scanlines, glow, audio)
- ✅ Ships immediately—minimal new code required
- ✅ Increases user engagement—users stay in our UI to launch and monitor
- ✅ Differentiator: No other tool offers a retro CLI dashboard for `copilot`
- ✅ GitHub native—no auth risk, no policy blocker
- ✅ Positions us as the **local session chrome** for Copilot CLI

**Cons:**
- ❌ Webview/iframe embedding may have CSP/auth restrictions on GitHub.com
- ❌ Requires new process spawning/monitoring code (small scope, medium risk)
- ❌ Less "wowza remote control"—repositioning needed in marketing

**Implementation Cost:** ~2 weeks (LocalProcessManager + dashboard + process monitoring)

---

### Option 2: API Investigation (Exploratory)

**Positioning:** Reverse-engineer the GitHub task streaming endpoint to connect our xterm.js terminal directly to GitHub's session stream, bypassing GitHub's UI entirely.

**Scope:**
- Analyze network traffic to `github.com/OWNER/REPO/tasks/TASK_ID` to find WebSocket/EventSource endpoint
- Implement xterm.js client to consume GitHub's session stream
- Maintain full retro UI with our theme engine
- Customers use squad-uplink as the "premium terminal" for remote sessions

**Pros:**
- ✅ Keeps retro UI as the primary interface (no GitHub.com UI in iframe)
- ✅ Highest differentiation—we're the *only* themed terminal for Copilot remote sessions
- ✅ Customers never leave our UI
- ✅ If GitHub ships an official API, we're already integrated

**Cons:**
- ❌ **GitHub has not documented the endpoint.** Reverse-engineering is brittle—GitHub can change the protocol without notice.
- ❌ Breaking changes = product breaks for our users (unacceptable for production)
- ❌ Policy risk: GitHub may explicitly forbid reverse-engineering in ToS
- ❌ High execution risk: Unknown timeline, unknown complexity
- ❌ **Cannot guarantee enterprise org access** (policy must be enabled by admin)
- ❌ Implementation cost: 4–6 weeks if spec is discoverable; undefined if not

**Recommendation:** Do NOT pursue this path unless GitHub publishes an official API. Too much technical debt and user-facing risk.

---

### Option 3: Pause and Wait for Public API

**Positioning:** Hold the current architecture in maintenance mode while GitHub stabilizes the remote feature and publishes an official API/SDK.

**Scope:**
- Freeze feature development on squad-uplink
- Maintain current deployments (Azure SWA)
- Monitor GitHub's documentation and announcements
- Revisit once API lands (target: Q2 2026?)

**Pros:**
- ✅ Zero risk of building on undocumented/changing interfaces
- ✅ Allows GitHub to stabilize the feature
- ✅ Official API will be higher quality and supported

**Cons:**
- ❌ Squad-uplink becomes **irrelevant for 3–6 months** (product is dead in the water)
- ❌ Team context/momentum lost—code rot, technical debt accumulation
- ❌ Competitor opportunity: Another team ships a Dashboard/Launcher first
- ❌ Sunk cost on Squad RC architecture is never recouped
- ❌ User frustration: "Why does squad-uplink still exist?" (no clear value prop)

**Recommendation:** Do NOT pursue this path. The market has moved; we must move too.

---

## Architectural Recommendation: Option 1 (Launcher/Dashboard)

### Why This Path

1. **Immediate Relevance:** Users get value on day 1—a retro-themed launcher for `copilot --remote` sessions.
2. **Minimal Rework:** We keep the entire visual layer (xterm.js, themes, audio). We delete obsolete remote-control code and add simple process management.
3. **De-Risks User Adoption:** Users are already in our UI. Clicking "Launch Remote Session" is natural and preserves context.
4. **Differentiator:** No other tool provides a retro CLI dashboard for Copilot. This is marketing gold.
5. **Positions Us for GitHub Integration:** When GitHub publishes an API, we're already positioned as a premium dashboard—Option 2 becomes a natural extension.
6. **Respects Resource Constraints:** 2-week MVP vs. 4–6 week exploratory API path.

### Execution Plan (High Level)

**Phase 1: Cleanup (Days 1–2)**
- Delete `ConnectionManager.ts`, `commands.ts`, `squad-rc.ts`, `squad-rc-launch.mjs`
- Remove Squad RC auth/tunneling tests
- Update `TerminalView` to accept local process input instead of WebSocket
- All tests pass, zero regressions

**Phase 2: Local Process Manager (Days 3–5)**
- Implement `LocalProcessManager` class to spawn/monitor `copilot` CLI processes
- Handle process lifecycle (spawn, kill, cleanup)
- Capture stdout/stderr and push to Zustand store
- Implement basic error handling and reconnection

**Phase 3: Dashboard Panel (Days 6–7)**
- Add "My Sessions" card to main UI
- List active processes, process status (running/idle/completed)
- "Launch New Session" button
- GitHub task URL deep-linking or webview embedding

**Phase 4: Integration & Polish (Days 8–10)**
- Repurpose `TelemetryDrawer` to show process metrics
- Audio feedback for process state changes
- Update documentation and marketing copy
- QA and regression testing

**Phase 5: Rollout & Monitoring (Days 11–14)**
- Deploy to Azure SWA staging
- Smoke tests in production-like environment
- Release notes emphasizing new positioning
- Monitor adoption and user feedback

### Risk Mitigation

- **Webview CSP Issues:** Test iframe embedding early (Phase 3). Fallback is simple URL deep-linking (no embed).
- **Process Spawning Edge Cases:** Implement comprehensive error handling and process cleanup. Test on Windows + macOS + Linux.
- **User Confusion:** Marketing must clearly position this as "Local Session Launcher" not "Remote Control Tool."

---

## Decision

**Squad-uplink is pivoting from Remote Control Tool to Launcher/Dashboard for GitHub Copilot CLI Sessions.**

- **Obsolete Code:** Delete `ConnectionManager.ts`, `commands.ts`, `squad-rc.ts`, `squad-rc-launch.mjs`
- **Retained Code:** Keep all xterm.js, theme engine, audio engine, telemetry drawer (repurposed)
- **New Code:** LocalProcessManager, dashboard panel, process monitoring
- **Timeline:** 2 weeks for MVP, Gates-style shipping
- **Success Metric:** Users launch `copilot --remote` sessions from squad-uplink, monitor them on GitHub, and perceive squad-uplink as the **premium retro dashboard** for Copilot CLI

**Approval Required From:**
- Brady (Product/Vision)
- Woz (Feasibility & Dev Lead)
- Team (Consensus)

---

## Appendix: Why Not Option 2?

**Short answer:** Until GitHub publishes an official API, reverse-engineering is a liability masquerading as a feature.

The `github.com/OWNER/REPO/tasks/TASK_ID` endpoint (if it exists) is:
- Undocumented
- Subject to change without notice (GitHub can reorganize their UI anytime)
- Potentially against ToS
- Unknown complexity—could be REST, GraphQL, WebSocket, Server-Sent Events, or proprietary

**If GitHub publishes an official API (e.g., REST endpoint to fetch session stream), we pivot to Option 2 immediately.** Until then, this path is a sinkhole.

---

## Appendix: Org Policy Check

**Action Item:** Confirm with Brady whether the GitHub org has "Remote Control" policy enabled.

- If **YES**: Copilot Business/Enterprise users get native remote feature. squad-uplink Dashboard becomes a **local launching/monitoring surface**.
- If **NO** (default): Policy must be enabled by org admin. squad-uplink Dashboard still provides value as a local session manager—we just market it differently.

Either way, **Option 1 (Launcher/Dashboard) remains the path forward.**

---

## System Tray (NotifyIcon) Support via H.NotifyIcon.WinUI

**By:** Woz (Lead Dev)  
**Date:** 2026-04-14  
**Status:** Implemented

### What

Added Windows system tray (notification area) support using the `H.NotifyIcon.WinUI` NuGet package (v2.4.1). Squad Uplink can now minimize to tray instead of exiting, with animated radar-sweep icons that indicate session activity.

### Why

Users who run Squad Uplink as a long-lived session manager need the app to stay alive in the background without occupying taskbar space. The tray icon provides quick access to restore the window, launch new sessions, or exit — matching the behavior of similar tools like Move Mouse.

### Key Decisions

1. **H.NotifyIcon.WinUI over raw P/Invoke** — Mature WinUI 3 wrapper for `Shell_NotifyIcon`, handles message windows and DPI scaling. Avoids maintaining fragile Win32 interop code.
2. **Programmatic icon generation (System.Drawing)** — Icons are 16×16 radar-sweep PNGs generated at runtime instead of shipping .ico assets. This avoids resolution issues and keeps the asset footprint zero.
3. **`TrayIconWithContextMenu`** (not base `TrayIcon`) — The derived class from H.NotifyIcon that supports Win32 popup context menus.
4. **Animation via `System.Timers.Timer`** — 300ms interval, 4-frame rotation. Timer ticks on a thread-pool thread; icon updates are marshalled to the UI thread via `DispatcherQueue.TryEnqueue`.
5. **`MinimizeToTray` setting defaults to `true`** — Users who don't want tray behavior can disable it in Settings → System Tray.
6. **Window close intercepted via `AppWindow.Hide()`** — When minimize-to-tray is enabled, `Window.Closed` sets `args.Handled = true` and hides the window. Real exit goes through `App.ExitApplication()` which disposes the tray icon and calls `Environment.Exit(0)`.

### Changes

- `src/SquadUplink/SquadUplink.csproj` — Added `H.NotifyIcon.WinUI` and `System.Drawing.Common` packages
- `src/SquadUplink/Contracts/ITrayIconService.cs` — New interface
- `src/SquadUplink/Services/TrayIconService.cs` — Full implementation with icon generation, animation, context menu, events
- `src/SquadUplink/Models/AppSettings.cs` — Added `MinimizeToTray` property
- `src/SquadUplink/App.xaml.cs` — Tray icon initialization, session count wiring, `ExitApplication()` method
- `src/SquadUplink/MainWindow.xaml.cs` — Close handler that hides window instead of exiting
- `src/SquadUplink/ViewModels/SettingsViewModel.cs` — `MinimizeToTray` binding
- `src/SquadUplink/Views/SettingsPage.xaml` — System Tray settings section
- `src/SquadUplink/Helpers/ServiceCollectionExtensions.cs` — DI registration
- `tests/SquadUplink.Tests/Services/TrayIconServiceTests.cs` — 12 unit tests

### Risk

Low. The tray feature is additive. If `H.NotifyIcon.WinUI` fails to initialize (e.g., no desktop session), the app continues without tray support — logged as a warning.

---

## Token Telemetry Architecture Directive

**By:** Brian Swiger (via Copilot)  
**Date:** 2026-04-14T12:48Z  
**Status:** Directive (pending implementation)

Implement OpenTelemetry-based token telemetry:
1. Local OTLP listener in WinUI app (OpenTelemetry.Exporter.OpenTelemetryProtocol) for `gen_ai.client.token.usage` metrics
2. GitHub Copilot Usage Metrics REST API for enterprise/org/user level data
3. `COPILOT_OTEL_ENABLED=true` environment variable to enable CLI telemetry emission
4. TelemetryService tracking model name + token count per agent task into SQLite
5. Dashboard vitals: Burn Rate (USD/hr), Context Window Pressure (% of 128k filled), Agent ROI (cost vs decisions committed)
6. Azure APIM gateway integration for Squad model calls (input_tokens/output_tokens from response headers)

**Rationale:** User directive—transforms Squad Uplink from dashboard to enterprise observability tool.

---

## UX Vision — Command & Control Features

**By:** Brian Swiger (via Copilot)  
**Date:** 2026-04-14T12:40Z  
**Status:** Directive (pending implementation)

Five advanced UX features for Squad Uplink:

1. **Squad Topology Graph** — Force-directed or radial hub-and-spoke diagram with glowing pulse lines showing agent-to-agent communication from decisions.md
2. **Time-Travel Scrubbing** — Timeline slider for "debugger for vibe coding" that reverts decisions.md/team.md views to historical state
3. **Integrated Steering Console** — Split-screen: raw STDOUT left, high-level intent input right, with suggested steering commands from decisions.md context
4. **Agent Vitals & Token Telemetry** — Sentiment/confidence gauge from decisions.md language, token burn rate line graph per agent
5. **Multi-Session Mission Control** — Grid/tiled layout like security camera monitor, each tile is a mini-uplink, double-click drills down

Tab layout evolution: Tactical (current activity), Topology (relationship mapping), Archives (historical analysis with time-scrubbing), Telemetry (resource monitoring).

Competitive advantage: native WinUI 3 + Uno Platform vs browser-based Electron competitors (LangGraph Studio, Project IDX).

**Rationale:** User directive—product vision for differentiation.

---

## Architecture Directives — Uno Platform, Markdig, FileSystemWatcher

**By:** Brian Swiger (via Copilot)  
**Date:** 2026-04-14T12:35Z  
**Status:** Directive (pending implementation)

Use Uno Platform for cross-platform (WinUI 3 desktop + iOS mobile). Use Markdig for parsing team.md/decisions.md. Use FileSystemWatcher with debounce for .squad/ monitoring. Use ItemsRepeater for high-frequency feeds. Consider Win2D/Microsoft.Graphics.Canvas for retro glow/scanline effects. Consider Azure SignalR or gRPC bridge for mobile remote monitoring. Wrap copilot CLI execution with System.Diagnostics.Process and redirect STDOUT for remote session capture.

**Rationale:** User directive—architecture guidance for production implementation.


---

## Settings Page Redesign: Expanders → MESS-style NavigationView

**By:** Kare (Frontend Dev)
**Date:** 2026-04-08
**Status:** Implemented

### What

Replaced the SettingsPage's 7 stacked `Expander` controls with a `NavigationView` sidebar + card-based content layout, matching the Microsoft Edge Settings (MESS) pattern. Added an opaque page background to fix translucency/readability issues.

### Why

Two user-reported problems: (1) Settings text was hard to read because the page inherited the MainWindow's translucent Mica background — no explicit `Background` was set on the Page. (2) All settings categories were stacked vertically in Expanders, requiring users to expand/collapse to navigate — no clear grouping or navigation.

### Changes

- `src/SquadUplink/Views/SettingsPage.xaml` — Full redesign. NavigationView with `PaneDisplayMode="Left"`, 220px sidebar with 7 icon+label categories. Content area shows one category at a time with card-style borders. All x:Bind expressions preserved exactly.
- `src/SquadUplink/Views/SettingsPage.xaml.cs` — Added `ShowSection()` method for panel visibility toggling, `SettingsNav_Loaded` for initial selection, `SettingsNav_SelectionChanged` handler.
- No changes to `SettingsViewModel.cs` or `AppSettings.cs`.

### Risk

Low. All existing bindings preserved. Build: 0 errors, 0 warnings. 661 tests pass (20 pre-existing scanner failures unrelated).

---

## Marshal ObservableCollection mutations to UI thread in SessionManager

**Author:** Woz (Lead Dev)
**Date:** 2026-04-14
**Status:** Implemented

### Context

Two "Session scan cycle failed" errors occur at app startup. The root cause is cross-thread `ObservableCollection` modification. `App.xaml.cs` starts scanning via `Task.Run(() => sessionManager.StartScanningAsync(...))`, so `Sessions.Add()` and `Sessions.Remove()` execute on a background thread. WinUI XAML bindings (ItemsRepeater on `DashboardPage.xaml`) subscribe to `CollectionChanged` and throw `COMException (RPC_E_WRONG_THREAD)` when the event fires off the UI thread.

### Decision

All `ObservableCollection<SessionState>` mutations in `SessionManager` are dispatched to the UI thread via `DispatcherQueue.TryEnqueue`. A `HashSet<int> _trackedPids` provides synchronous, race-safe PID tracking on the background thread since `Sessions.Add` is now asynchronously dispatched.

### Key Design Choices

1. **RunOnUIThread helper** — Direct call when no dispatcher (test context) or `HasThreadAccess` is true; `TryEnqueue` otherwise.
2. **_trackedPids** — Prevents duplicate-add races between scan cycles when `Sessions.Add` dispatch hasn't executed yet.
3. **Constructor chain** — Production constructor resolves dispatcher via `DispatcherQueue.GetForCurrentThread()` (matching `DashboardViewModel` pattern); test constructor accepts optional `DispatcherQueue? dispatcherQueue = null`.
4. **Snapshot iteration** — `PruneExitedSessionsAsync` uses `Sessions.ToList()` to avoid iterating and removing in the same collection simultaneously.

### Alternatives Considered

- **BindingOperations.EnableCollectionSynchronization** — Not available in WinUI 3 (WPF-only API).
- **Dispatcher in ViewModel only** — Would still leave `SessionManager.Sessions` modified on background thread; any direct subscriber would still crash.
- **Replace ObservableCollection with custom thread-safe collection** — Higher complexity, breaks existing XAML binding patterns.

### Risk

Low. Pattern matches existing codebase conventions (`DashboardViewModel`, `TrayIconService`). No new dependencies. All 12 SessionManager tests pass.
