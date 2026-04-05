# Decisions

## Hybrid Audio — Sample Files with Procedural Fallback

**By:** Kare (Frontend Dev) — Brady (via Copilot directive)  
**Date:** 2026-04-05  
**Status:** Implemented

### Context

Jobs' original architecture decision (#6) specified "Procedural Web Audio API oscillators. No sample files." Brady explicitly provided audio resource URLs for each of the 5 skins and requested real audio files for sound effects. The procedural-only constraint was overly restrictive — real audio files deliver dramatically better retro authenticity.

### Decision

Rework audio system to **hybrid model**:

1. **Primary:** Load real `.mp3`/`.wav`/`.ogg` files from `public/audio/{skinId}/` using Web Audio API `fetch` + `decodeAudioData`
2. **Fallback:** Keep all existing procedural oscillator profiles intact — used when files are missing, still loading, or fail to decode

### Implementation Details

- `src/audio/manifest.ts` — Maps each skin + sound type to a file path
- `src/audio/bufferCache.ts` — `AudioBufferCache` class fetches, decodes, and caches `AudioBuffer` per skin
- `useAudio` hook API is **unchanged** (`{ play, muted, toggleMute }`)
- Preloads only current skin's files (not all 5) via `useEffect` on skin change
- Non-blocking: if a file isn't loaded yet, procedural plays as interim
- If zero audio files exist, app works exactly as before

### Supersedes

Partially supersedes Jobs' ADR v1 decision #6 ("No sample files") — procedural is retained as fallback, but sample files are now the preferred audio source. Backward compatibility maintained.

### Verification

- `npm run build` — clean
- `npm test` — 323 tests pass, 15 skipped (pending audio files)
- Zero breaking changes to public API
- All 5 skin directories created in `public/audio/`

---

## Wave 5 Ship It — Production Readiness

**By:** Woz (Lead Dev)  
**Date:** 2026-04-05  
**Status:** Implemented

### Changes

#### 1. Build Pipeline Fix
Excluded test files (`**/__tests__/**`, `*.test.ts`, `*.test.tsx`, `test-setup.ts`, `__mocks__/**`) from `tsconfig.app.json`. Tests use Node APIs incompatible with the browser-only type configuration. Type-checking for tests is handled by Vitest's own TS pipeline.

#### 2. Code Splitting
- **TelemetryDrawer** lazy-loaded via `React.lazy()` — own chunk, not in initial bundle
- **Manual chunks:** xterm vendor (92KB gzip), react-vendor (60KB gzip)
- **Result:** All chunks under 500KB. Total initial JS ~163KB gzipped.

#### 3. Environment Variables
- `VITE_TUNNEL_URL` env var for tunnel URL — `/connect <token>` uses it as default
- Type declarations in `src/vite-env.d.ts`

#### 4. SWA Config Hardening
- Font caching: `public, max-age=31536000, immutable`
- CSP `connect-src` extended to allow `https:` (needed for `/status` API calls)
- Fonts excluded from SPA navigation fallback

#### 5. CI Workflows
- `azure-static-web-apps.yml`: lint → typecheck → test → build → deploy (push to main)
- `pr-check.yml`: lint → typecheck → test → build (PRs only, no deploy)
- Both include bundle size audit step (warns on >500KB chunks)

#### 6. README
Concise setup doc covering local dev, env vars, themes, shortcuts, architecture.

### Impact
All 319 tests pass. Build clean. No new warnings.

---

## Pip-Boy 3000 Theme (Uplink-Gamma)

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-05  
**Status:** Implemented

### Context

Brady requested a 6th theme — Pip-Boy 3000 — inspired by Fallout's wrist-mounted terminal. This required a new layout mode (`'pipboy'`) since the tabbed navigation with 5 tabs (STAT/INV/DATA/MAP/RADIO) doesn't fit the existing `fullscreen`, `windowed`, or `panel` patterns.

### Decisions

1. **New layout mode `'pipboy'`** added to the `TerminalTheme.layout` union. This is a fourth layout alongside fullscreen/windowed/panel. The PipBoyLayout component lives in App.tsx alongside the other layouts.

2. **Terminal stays mounted across tab switches** via CSS `display:none` (not conditional rendering). Only the DATA tab's panel is always in the DOM; other tabs render conditionally since they're placeholder content. This preserves xterm.js state and scroll position.

3. **Pip-Boy uses its own flicker animation** (`pipboy-flicker` in pipboy.css) rather than the shared `crt-flicker`. The standard CRT flicker in crt-effects.css is explicitly disabled for `[data-theme='pipboy']` to avoid conflicts. The Pip-Boy flicker has more varied keyframe stops for a more authentic phosphor feel.

4. **VT323 + Share Tech Mono font stack** — two new @font-face declarations added to fonts.css. Both are Google Fonts, need .woff2 files sourced to `public/fonts/`.

5. **Audio profile** uses high sine chirps for messages, square wave clicks for state changes, and a rising sine sweep for boot — consistent with Geiger counter / relay aesthetic.

6. **ThemeId union expanded to 6** — required updates to: ThemeToggle labels, MechanicalSwitch variants, useTheme map, THEME_ORDER, theme tests (cycle count), and ThemeToggle tests (click count).

### Verification
- 17 files touched
- Build clean
- 374 tests passing

---

## Pip-Boy Tab Data Components

**By:** Woz (Lead Dev)  
**Date:** 2026-04-05  
**Status:** Implemented

### Context

Brady requested Pip-Boy data components to power each tab of Kare's PipBoyLayout. These components need to pull real-time data from the existing Zustand store and ConnectionManager, while adding new metrics fields for the S.P.E.C.I.A.L. display.

### Decisions

#### 1. Store Extensions
Added to `TelemetryMetrics`: `tokenUsage`, `messageCount`, `successCount` — these power the S.P.E.C.I.A.L. stat calculations (Intelligence, Luck, Perception).

Added to `ConnectionStore`: `messageHistory` (capped at 50 entries), `tools`, `mcpServers`, `activeAgent`, `commandHistory` (capped at 10), `uplinkOverride`.

New types added to `squad-rc.ts`: `MessageHistoryEntry`, `ToolInfo`, `McpServerInfo`.

#### 2. ConnectionManager Message Tracking
Wired `onmessage` and `sendImmediate` to push `MessageHistoryEntry` records into the store. Both inbound and outbound messages are tracked with timestamps, agent attribution, content preview, and full raw payload. This feeds both the Data tab log and the S.P.E.C.I.A.L. stat calculations.

#### 3. Component Architecture
All 5 components are standalone exports from `src/components/PipBoy/tabs/`:
- **PipBoyStat** — S.P.E.C.I.A.L. bars with scaling functions (latency→strength, throughput→perception, etc.)
- **PipBoyInv** — Tool/MCP inventory with `>` cursor prefix styling
- **PipBoyData** — Message history log with raw JSON toggle, auto-scroll
- **PipBoyMap** — ASCII agent topology tree with active turn indicator
- **PipBoyRadio** — Command console with input, quick buttons, history nav, uplink override

#### 4. Graceful Disconnected States
Every component handles the disconnected case with Pip-Boy-themed empty states: "NO ITEMS IN INVENTORY", "NO SIGNAL — AGENTS OFFLINE", "NO DATA", etc.

#### 5. CSS Class Convention
All styling uses `pipboy-` prefixed classes (Kare owns the CSS implementation). No inline styles except for dynamic status colors.

### Verification
- Build clean
- All components handle disconnected states gracefully
- Tests passing

---

## Archive Log
(Post-release decisions logged here).
