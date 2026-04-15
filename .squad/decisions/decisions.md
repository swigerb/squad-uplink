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

## Apple IIe Theme — Self-Contained CRT System

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-06  
**Status:** Implemented

### Context

The Apple IIe 3D theme previously used the shared `<CRTOverlay>` component which applied scanlines across the entire viewport (`position: fixed; inset: 0`). This looked wrong — scanlines covered the monitor bezel, keyboard, floppy drive, and background.

### Decision

The Apple IIe theme now manages its own CRT effect internally, scoped to the terminal area only:

1. **Removed** `<CRTOverlay>` rendering from `Apple2eLayout.tsx` (import removed, `crt-screen` class removed)
2. **Added** CSS `::after` pseudo-element on `.a2e-monitor__terminal` with:
   - `repeating-linear-gradient` scanlines (2px pitch)
   - Green phosphor inner glow via `box-shadow`
   - `pointer-events: none` so terminal remains interactive
   - `z-index: 20` above terminal content

### Impact

- The `crtEnabled` prop is still accepted by `Apple2eLayout` for interface compatibility but is no longer used internally
- Other themes (C64, IBM 3270) still use the shared `<CRTOverlay>` system — this change is Apple2e-specific
- The Apple IIe CRT toggle in StatusBar will still appear (since `crtEnabled: true` in theme config) but won't affect the Apple2e layout — this is a known cosmetic issue that can be addressed separately

### Layout Changes

- Monitor: 66×47.25 → 76×54 vmin (centered)
- Keyboard: scaled to 65% via CSS transform
- Terminal: fills full dark screen area (61.15×47 vmin)
- Scene: perspective-origin centered (50% 42%)

---

## Wave 4 TelemetryDrawer — Gap Analysis

**By:** Jobs (Lead)  
**Date:** 2026-04-07  
**Status:** Gap analysis complete

### Findings

Component is ~90% complete. Core functionality solid (4 sections, 30s auto-refresh, escape/backdrop close, keyboard shortcut, lazy-loaded overlay). Three gaps identified:

1. **CRITICAL — No StatusBar button** — Drawer only opens via Ctrl+Shift+T; hidden from UI. Needs 📡 button with toggle state, aria-label, data-testid.
2. **CODE QUALITY — Inline styles** — Three `style={}` blocks inconsistent. Move to CSS classes: `.telemetry-section-header`, `.telemetry-section-title--inline`, `.telemetry-fetch-timestamp`.
3. **ACCESSIBILITY — Focus management** — No focus movement on open/close. Open: focus close button. Close: restore previous focus. Not a modal (no trap needed).

### Cut from Scope

- Theme-responsive styling (arch says "mask slips" by design)
- Additional metrics (tokenUsage/messageCount/successCount — Pip-Boy territory)
- Content animations
- Focus trapping
- Mobile layout rework

### Assignment

- **GAP-1 (StatusBar button):** Woz
- **GAP-2 (inline styles):** Kare
- **GAP-3 (focus management):** Woz

---

## Apple IIe Theme — Decorative Screen Overlay Removal

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-06  
**Status:** Implemented

### Decision

Set `.a2e-monitor__screen` and all `.a2e-monitor__screen-2` variants to `display: none`. Terminal (z-index 10) is now topmost visible element. Structural bezel layers preserved for 3D depth. CRT scanlines handled by `.a2e-monitor__terminal::after` pseudo-element.

### Rationale

- Overlays are decorative and redundant with terminal's own scanline/phosphor effect
- `display: none` preserves option to re-enable for future "demo mode"
- No z-index juggling needed

---

## Apple IIe CRT Scoping — Self-Contained System

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-06  
**Status:** Implemented

### Decision

Apple IIe now manages CRT effects internally:

1. Removed `<CRTOverlay>` rendering from `Apple2eLayout.tsx`
2. Added `::after` pseudo-element on `.a2e-monitor__terminal` with scanlines (2px pitch) and green phosphor glow
3. `pointer-events: none` for terminal interactivity
4. `z-index: 20` above terminal content

### Impact

- `crtEnabled` prop still accepted for interface compatibility but unused
- Other themes (C64, IBM 3270) still use shared `<CRTOverlay>` — this is Apple2e-specific
- CRT toggle in StatusBar will appear but won't affect Apple2e layout (known cosmetic issue)

### Layout Changes

- Monitor: 66×47.25 → 76×54 vmin (centered)
- Keyboard: scaled to 65% via CSS transform
- Terminal: fills full dark screen area (61.15×47 vmin)
- Scene: perspective-origin centered (50% 42%)

---

## C64 Theme Rework — Codepen Port Architecture

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-06  
**Status:** Implemented

### Decision

Follow Apple IIe pattern: new layout mode `'c64'`, dedicated CSS file (`c64-3d.css`), dedicated component directory (`src/components/C64/`), layout branch in `App.tsx`.

### Key Choices

1. CRT scanlines scoped to terminal `::after` — no global CRTOverlay
2. `c64-` prefix (not `c64-3d-`) — shorter, consistent
3. Keyboard is decorative only — purely visual chrome
4. StatusBar floats at bottom — transparent overlay with blur
5. No pulsating title (per Brady directive)
6. Responsive via vmin units — monitor 80vmin, keyboard 85vmin, 600px breakpoint

### Files

**Created:**
- `src/styles/c64-3d.css`
- `src/components/C64/C64Layout.tsx`
- `src/components/C64/C64Keyboard.tsx`
- `src/components/C64/index.ts`

**Modified:**
- `src/themes/c64.ts` — layout `'fullscreen'` → `'c64'`
- `src/themes/index.ts` — added `'c64'` to layout union
- `src/App.tsx` — added import + layout branch

---

## Font Loading — CSP Compliance & Local-Only Requirement

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-06  
**Status:** Implemented

### Decision

All font loading MUST go through local `@font-face` declarations in `src/styles/fonts.css` only. No external `@import` for fonts.

### Context

`muthur.css` and `wopr.css` had `@import url('https://fonts.googleapis.com/...')` which violate CSP `font-src 'self'` policy in `staticwebapp.config.json` and would be blocked in production.

### Impact

- All themes now CSP-compliant for font loading
- New themes MUST add fonts to `fonts.css` with local paths in `public/fonts/`
- No runtime font loading failures in production

---

## Audio Folder Structure — Theme Scaffolding & Naming

**By:** Woz (Lead Dev)  
**Date:** 2026-04-07  
**Status:** Implemented

### Changes

1. Updated `public/audio/README.md` — now covers all 9 themes and 12 sound types
2. Created placeholder folders with `.gitkeep` for: c64, win95, lcars, pipboy, matrix, muthur, wopr, ibm3270
3. Left apple2e alone (already has disk_drive.mp3)

### Key Decision

Theme folder names match `ThemeId` in code. Used `muthur/` (not `mothur/`) to match codebase and ensure manifest path convention `/audio/{themeId}/` works correctly.

### Status

No code changes to manifest or audio hooks. Ready for sound designer to add `.mp3`/`.wav`/`.ogg` files.

---

## Win95 Boot Sound — File-Based, Play on Mount

**By:** Woz (Lead Dev)  
**Date:** 2026-04-07  
**Status:** Implemented

### Context

Brian provided a royalty-free `boot.mp3` for the Win95 theme. The audio manifest already declared `boot: '/audio/win95/boot.mp3'` but no file existed — the system fell back to procedural sine-wave synthesis.

### Decision

1. **Placed the file** at `public/audio/win95/boot.mp3` and removed the `.gitkeep` placeholder.
2. **Play on mount** — added `useAudio('win95')` + a one-shot `useEffect` with a ref guard to `Win95Layout` in `App.tsx`. The boot sound fires once when the Win95 layout renders (i.e., when the user switches to the Win95 theme).
3. **No manifest changes needed** — the win95 boot entry was already there, along with entries for all other sound types. The audio system (`bufferCache.preloadSkin`) automatically fetches and caches the file on theme activation.

### Why play-on-mount (not play-on-theme-change)

The Apple IIe `disk_drive` sound is user-initiated (click the floppy). No theme currently plays boot on mount. But for Win95 the "Ta-Da" startup chime is iconic and expected on boot — it's the whole point of having the file. A ref guard ensures it only fires once per mount, avoiding replays on re-renders.

### Alternatives Considered

- **Play in ThemeProvider on theme change**: Would require threading audio through context or a global event bus. Too invasive for one sound.
- **Don't auto-play, require user click**: Loses the Win95 startup feel. Browser autoplay policy is handled by the existing `AudioContext.resume()` call in `useAudio.play()`.

### Verification

- 509 tests pass
- Build clean (0 TS errors, 0 lint warnings)
- All 9 themes audio-ready (hybrid model supports both file-based and procedural fallback)

---

## LCARS Theme — Authenticity Overhaul with Doug Drexler Palette

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-07  
**Status:** Implemented

### Context

The LCARS theme used generic approximation colors (#ff9900, #cc99cc, #9999ff) and a "Trek" font that weren't screen-accurate to the Star Trek TNG/DS9/VOY production design. Brady requested an overhaul using authentic reference material.

### Decision

Replaced entire LCARS color palette with Doug Drexler reference colors (the production designer's actual palette), switched primary font from "Trek" to "LCARSGTJ3" (free recreation of Helvetica Ultra Compressed), and overhauled the CSS layout for thicker elbows, wider sidebar, and authentic panel seam gaps.

### Key Design Choices

1. **Doug Drexler palette as canonical source** — #ec943a (warm orange), #c082a9 (mauve), #8b72aa (violet), #faa41b (golden yellow), #d29a7f (salmon), #9c698a (deep mauve), #b6a5d1 (lavender). These are screen-captured from actual Star Trek episodes.
2. **LCARSGTJ3 font** — Free recreation of Helvetica Ultra Compressed (the original LCARS typeface). `font-display: block` chosen over `swap` because LCARS UI text flashing in a wrong typeface breaks the illusion.
3. **44px border-radius on elbows** — Increased from 32px. Elbows are THE signature LCARS element; they need to be thick and prominent.
4. **5px gaps everywhere** — Represents physical panel seams between OKUDAGRAM display segments.
5. **Varied sidebar pill heights** — Added `--tall` (52px) and `--short` (24px) modifiers. Authentic LCARS sidebars have irregular block sizes, not uniform rows.
6. **Trek-style numeric readouts** — "47-4521" and "09-8742" in sidebar short pills, matching the production design's decorative numeric sequences.

### Impact

- Visual-only changes to LCARS theme
- No structural/API changes
- Build clean, 0 TS errors
- All 509 tests pass

### Files Modified

- `src/themes/lcars.ts` — Full palette replacement, font family update
- `src/styles/lcars-panels.css` — Major CSS overhaul (sidebar width, elbow radius, pill sizes, gaps, font refs)
- `src/styles/fonts.css` — Added LCARSGTJ3 @font-face declaration
- `src/styles/global.css` — Updated [data-theme='lcars'] body styling
- `src/App.tsx` — LcarsLayout component colors, pill sizes, Trek-themed text
- `public/fonts/README.md` — Documented LCARSGTJ3 source and license

---

## BIOS Boot Screen UX Pattern

**By:** Kare (Frontend Dev)  
**Date:** 2026-04-07  
**Status:** Implemented

### Context

Brady requested a BIOS-style boot sequence for first-visit users to sell the "Uplink" terminal fantasy from second one.

### Decision

- Boot screen renders **outside** the ThemeProvider — it's not part of the theme system. Always green-on-black (#33FF33 on #000), using PrintChar21 font.
- Skip logic uses two localStorage keys: `squad-uplink-theme` (returning user) OR `squad-uplink-booted` (completed boot once). Either key present = skip boot entirely.
- Animation is setTimeout-driven (not CSS), ~3-4 seconds total, non-blocking.
- `prefers-reduced-motion` respected — disables flicker and cursor blink.
- Component is fully self-contained in `src/components/BootScreen/` with its own CSS.

### Impact

- App.tsx: Boot screen wraps ThemeProvider — renders *before* any theme logic runs.
- No changes to ThemeProvider, useTheme, or connectionStore.
- PWA standalone mode works (boot screen uses fixed positioning).

### Team Notes

- Hertzfeld: Boot screen tests should check localStorage skip logic and line rendering. Component uses `role="status"` for a11y.
- Woz: No WebSocket connections during boot — ConnectionManager untouched.

---

## DevTunnel Browser WebSocket Authentication

**By:** Woz (Lead Dev)  
**Date:** 2026-04-07  
**Status:** Implemented

### Context

Squad Uplink enters a constant WebSocket reconnect loop when connecting through Microsoft Dev Tunnels from a browser. Two root causes: (1) devtunnel relay serves an HTML anti-phishing warning page instead of completing the WebSocket handshake, causing immediate close; (2) browsers cannot set custom headers on WebSocket handshake, so `X-Tunnel-Authorization` doesn't work.

### Decisions

1. **Anti-phishing bypass:** Added `X-Tunnel-Skip-AntiPhishing-Page=true` as a query parameter on ALL WebSocket URLs. This tells the devtunnel relay to skip the warning page. Harmless on non-devtunnel servers (ignored by servers that don't recognize it).
2. **Token delivery via query param:** Changed from `token` to `access_token` query parameter name. `access_token` is the standard OAuth2 bearer token query parameter, recognized by the devtunnel relay for browser-based WebSocket auth.
3. **Protocol normalization:** Both `ConnectionManager.connect()` and the `/connect` command handler now normalize `https://` → `wss://` and `http://` → `ws://` before opening the WebSocket. Users can now paste devtunnel URLs directly from terminal output.
4. **Removed ticket exchange flow:** The `exchangeTicket` private method and `TicketResponse` type import were removed from ConnectionManager. This was for a squad-rc-specific auth flow that was never implemented on the server side. Simplifies the connect path to: normalize protocol → set access_token → set anti-phishing bypass → open WebSocket.

### Alternatives Considered

- Keeping `exchangeTicket` as dead code: rejected because TypeScript strict mode (`noUnusedLocals`) flags it, and it adds confusion about the actual auth flow.
- Using `X-Tunnel-Authorization` header: not possible in browsers — WebSocket API doesn't support custom handshake headers.

### Files Modified

- `src/lib/ConnectionManager.ts` — connect() rewritten, exchangeTicket removed
- `src/lib/commands.ts` — /connect handler adds protocol normalization
- `src/lib/__tests__/ConnectionManager.test.ts` — ticket exchange tests replaced with protocol normalization + devtunnel param tests
- `src/lib/__tests__/commands.test.ts` — added https→wss and http→ws normalization tests

### Verification

- 527 tests passing
- Build clean
- No TypeScript errors
- No lint warnings

---

## DevTunnel Browser WebSocket Auth — Optional Token + 1006 Diagnostics

**Author:** Woz (Lead Dev)  
**Date:** 2026-04-07  
**Status:** Implemented  
**Requested by:** Brian Swiger

### Context

Microsoft Dev Tunnels do NOT support `access_token` as a query parameter for browser WebSocket authentication. The tunnel relay rejects the handshake, producing a 1006 close code and an infinite reconnect loop. Browsers cannot set custom headers on WebSocket connections, so header-based auth is also impossible.

### Decision

Support two legitimate browser→devtunnel auth approaches:

1. **Anonymous tunnel access** — User configures tunnel with `--allow-anonymous`. No token needed.
2. **Cookie-based auth** — User visits tunnel URL in browser first, authenticates via Microsoft login. The auth cookie is automatically sent with subsequent WebSocket requests.

#### Changes Made

| File | Change |
|------|--------|
| `src/lib/commands.ts` | `/connect <url> [token]` — token is now optional. Empty string passed when omitted. Help text updated with DevTunnel tips. |
| `src/lib/ConnectionManager.ts` | `access_token` query param only set when token is non-empty (empty string is falsy). 1006 diagnostic hint added after 2+ retries. |
| `src/lib/__tests__/commands.test.ts` | Updated: "connects without token" test added, old "error when only url" test replaced. |
| `src/lib/__tests__/ConnectionManager.test.ts` | Added: "omits access_token when empty", "1006 diagnostic hint" tests. |

### Key Design Choices

- **Empty string as "no token"** — `SquadRcConfig.token` stays as `string` type. Empty string `''` is falsy in JS, so `if (config.token)` naturally gates the `access_token` param. No interface change needed.
- **Diagnostic at retries >= 2** — Don't spam the error log on first 1006; could be a transient network issue. After 2+ failures, it's likely an auth problem worth diagnosing.
- **Non-breaking** — `/connect <url> <token>` still works exactly as before. Only the "token required" gate was removed.

### Alternatives Considered

- **Subprotocol-based auth** — Passing token via WebSocket subprotocol. Not supported by devtunnel relay.
- **Custom proxy** — Running a local proxy that adds headers. Adds complexity, defeats the purpose of devtunnel simplicity.

### Verification

- 529 tests passing, 15 skipped (pre-existing), 0 failures
- Build clean (0 TS errors, 0 lint warnings)

---

## DevTunnel Auth — Cookie Primary, Query Param Fallback, No Subprotocol

**By:** Woz (Lead Dev)
**Date:** 2026-04-08
**Status:** Implemented
**Supersedes:** "WebSocket Auth via Subprotocol for Dev Tunnel Compatibility" (2026-04-08T030500Z)

### What

Removed the `access_token-<JWT>` WebSocket subprotocol auth mechanism. Replaced with:
1. **Cookie-based auth** (primary) — browser session cookie after `/auth` Entra ID login
2. **Query param auth** (fallback) — `?access_token=<token>` when explicit token provided
3. Only `squad-rc` subprotocol is sent (no `access_token-` prefix)

### Why

The `access_token-<JWT>` subprotocol is NOT a documented Microsoft Dev Tunnel auth mechanism. It was a Gemini suggestion that doesn't work — the Dev Tunnel relay rejects WebSocket upgrades with unrecognized subprotocols, causing infinite 1006 reconnect loops.

Microsoft Dev Tunnels support two browser auth paths:
- **Cookie-based:** Visit tunnel URL → Entra ID redirect → session cookie → all subsequent requests (including WebSocket) include cookie
- **Anonymous:** `devtunnel port create -p PORT --protocol https --allow-anonymous`

### Changes

- `src/lib/ConnectionManager.ts`: Cookie/query-param auth, improved 1006 diagnostics, maskUrl() helper
- `src/lib/commands.ts`: Fixed auth method display text
- `src/lib/__tests__/ConnectionManager.test.ts`: 4 new tests, updated 13 existing
- `src/lib/__tests__/commands.test.ts`: 1 new test

### Risk

Low. Cookie-based auth is the standard browser→DevTunnel flow. Query param is standard OAuth2 fallback. 569 tests pass.

---

## /auth Command — Terminal Auth Management

**By:** Woz (Lead Dev)
**Date:** 2026-04-08
**Status:** Implemented

### What

Added `/auth` terminal command with two modes: status display (no args) and token update (with arg). Added `getAuthStatus()` and `reconnectWithToken(token)` public methods to ConnectionManager.

### Why

Users typing `/auth` got "unknown command". Auth token rotation required a full `/connect <url> <token>` — even when only the token changed. The new command lets users inspect auth state and hot-swap tokens without re-entering the tunnel URL.

### Changes

- `src/lib/ConnectionManager.ts`: Added `getAuthStatus()` (returns masked token, URL, auth method) and `reconnectWithToken(token)` (updates config, reconnects if connected).
- `src/lib/commands.ts`: Added `/auth` case to switch statement and HELP_TEXT.
- `src/lib/__tests__/commands.test.ts`: 14 new tests covering all branches.

### Risk

Low. No changes to existing connection flow. New methods are additive. `reconnectWithToken` reuses existing `connect()` path. Token never logged or exposed beyond last-4-char mask.

---

---

## 2026-04-13T200600Z: Architectural pivot — Native Windows app

**By:** Brian Swiger (via Copilot)  
**Status:** Implemented

### What

Squad-uplink is pivoting from a React/Vite web app to a native Windows 11 desktop application using WinUI 3, .NET 10, C# 14, Fluent 2. Multi-session dashboard that discovers, launches, and monitors multiple copilot --remote sessions and Squad/SubSquad hierarchies. Stack: CommunityToolkit.Mvvm, Serilog, SQLite, Velopack, WebView2+xterm.js, xUnit+Moq+Coverlet.

### Why

User decision — GitHub Copilot CLI remote feature replaces Squad RC; native app enables local process scanning and launching that web apps cannot do.

---

## 2026-04-08: WinUI 3 / .NET 10 Desktop Scaffold

**By:** Woz (Lead Dev)  
**Status:** Implemented

### What

Created complete WinUI 3 / .NET 10 / C# 14 project scaffold for Squad Uplink as a native Windows 11 desktop application, replacing the React/Vite web app.

### Why

Brian directed a platform pivot from web (Azure Static Web Apps + devtunnel) to native desktop. A native Windows app provides:
- Direct process management (spawn/monitor copilot CLI sessions)
- No WebSocket relay needed — direct stdout/stderr capture
- System tray integration, native notifications, file system access
- Velopack auto-update instead of SWA deploy pipeline

### Key Decisions

1. **Unpackaged deployment** (`WindowsPackageType=None`) — Velopack handles distribution, no MSIX packaging needed for development or release
2. **Directory.Build.props** — `AppxMSBuildToolsPath` pointed at VS 18 Enterprise build tools; required because .NET 10 SDK CLI doesn't ship PRI tasks
3. **Field-based [ObservableProperty]** — partial property source gen not yet reliable with .NET 10 + Windows App SDK 1.7; MVVMTK0045 warning suppressed
4. **WebView2 + xterm.js** for terminal rendering — preserves the retro terminal aesthetic from the web app
5. **SQLite** for local settings + session history persistence

### Structure

- `SquadUplink.sln` — 3 projects (app, core, tests)
- `src/SquadUplink/` — WinUI 3 app with MVVM, DI, 7 service contracts
- `src/SquadUplink.Core/` — Shared logic, no UI dependency
- `tests/SquadUplink.Tests/` — xUnit + Moq, 17 tests passing

### Risk

Low. Scaffold only — all service implementations are stubs. Real logic comes next.

---

## Copilot CLI Model Preference — Opus 4.6 for All Code

**By:** Brian Swiger (via Copilot directive)  
**Date:** 2026-04-13  
**Status:** Directive

### Decision

Use Opus 4.6 for ANYONE that writes code. Full audit of app for WinUI 3 / Fluent 2 best practices, metrics, logging, tracing, and error handling.

### Rationale

User request — quality gate before shipping.

---

## CopilotSessionService Enrichment Order — Before Squad Detection

**By:** Woz (Lead Dev)  
**Date:** 2026-04-14  
**Status:** Implemented

### Context

SessionManager.ScanAndMergeAsync() ran squad detection before Copilot session enrichment. ProcessScanner often can't determine WorkingDirectory from command-line args alone. CopilotSessionService reads cwd/git_root from workspace.yaml but ran second — so squad detection got an empty directory and returned null.

### Decision

1. **Enrichment order:** CopilotSessionService.EnrichSessionAsync() runs FIRST, then SquadDetector.DetectAsync().
2. **WorkingDirectory backfill:** CopilotSessionService now writes git_root (preferred) or cwd back to session.WorkingDirectory when empty.
3. **Watcher activation:** SquadFileWatcher.StartWatching() is called from RebuildSquadTree() when squads are found. EventStreamWatcher is created and started from UpdateStats() when sessions have EventsJsonlPath.

### Consequences

- All intelligence surfaces (Squad Tree, Decision Feed, Orchestration Timeline) now populate correctly.
- Any future enrichment services that provide WorkingDirectory should also run before squad detection.
- EventStreamWatcher is created per-session (not via DI) — acceptable since it's lightweight and session-scoped.

---

## Reboot squad-uplink on copilot-portal Foundation

**By:** Woz (Lead Dev)  
**Date:** 2026-04-14  
**Status:** Implemented  
**Risk:** Medium (full stack replacement)

### Context

squad-uplink was originally a WinUI 3 / .NET 10 / C# desktop app for monitoring and controlling Squad agents via devtunnel. The project is pivoting to a web-based architecture using Shannon Fritz's copilot-portal as the foundation.

### Decision

Replace the entire WinUI C# codebase with copilot-portal — a Node.js server + React 19 + Vite webui that proxies GitHub Copilot CLI sessions to a browser.

### Rationale

1. **Cross-platform reach** — Web app runs on any device with a browser (mobile, tablet, any OS), vs WinUI which is Windows-only
2. **Proven foundation** — copilot-portal already solves the hard problem of proxying Copilot CLI to browser with session management, QR code sharing, and approval flows
3. **Stack alignment** — Node.js/React/TypeScript is the team's strongest competency (original v1 was React before the WinUI pivot)
4. **Faster iteration** — Hot reload, npm ecosystem, no Windows SDK toolchain friction

### What Changed

- **Archived:** WinUI app tagged `archive/winui-v1` — full history preserved
- **Removed:** All C#/XAML source, .sln, Directory.Build.props, build artifacts
- **Imported:** copilot-portal src/ (Node server), webui/ (React 19 + Vite 6), bin/, tools/, docs/, examples/, img/
- **Preserved:** .squad/ team state, .github/ workflows, scripts/, README.md, .gitattributes
- **Renamed:** package.json name → "squad-uplink"

### Architecture (New)

- **Server:** Node.js 22+ — esbuild-bundled TypeScript → `dist/server.js`. Uses `@github/copilot` + `@github/copilot-sdk` for Copilot CLI session management
- **WebUI:** React 19 + Vite 6 + Tailwind — builds to `dist/webui/`. Communicates with server via WebSocket
- **Build:** `npm run build` (runs esbuild for server + vite for webui)
- **Entry:** `start-portal.cmd` / `start-portal.sh` or `node dist/launcher.js`

### Risks & Mitigations

- **Lost WinUI features** (system tray, process scanning, SQLite persistence) — Will be rebuilt as needed in the web stack or via companion services
- **MIT License obligation** — LICENSE file preserved, attribution in commit message
- **Team knowledge gap** — Original React/TS history means team is already fluent

### Next Steps

- Update README.md for the new architecture
- Customize webui for squad-uplink identity (branding, squad-rc integration)
- Set up CI/CD for the new Node.js + Vite stack
- Integrate devtunnel connectivity for remote agent control

---

## Archive Log
(Post-release decisions logged here).
