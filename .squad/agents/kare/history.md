# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — A TypeScript/React/Vite front-end web app with a retro Apple IIe and Commodore 64 theme to control Squad agents remotely using the squad-rc feature and devtunnel. Will be hosted in Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, Azure Static Web Apps, devtunnel
- **Created:** 2026-04-05

## Core Context

Frontend Dev for squad-uplink. Responsible for React UI components, retro Apple IIe and Commodore 64 visual design, CSS architecture, theme system, and component library.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **5-skin theme engine** (2026-04-05): Expanded from 2 to 5 skins. TerminalTheme now has optional fields for `layout`, `crtEnabled`, `customCss`, `chromeFontFamily`, `accentColors`, `borderSize`, `borderColor`. Theme cycling order is defined in `THEME_ORDER` constant in `src/themes/index.ts`.
- **Layout modes**: Three layout modes exist — `fullscreen` (CRT skins), `windowed` (Win95 with 98.css-style chrome), `panel` (LCARS grid with pill-shaped sidebars). Layout switching happens in `App.tsx`.
- **Win95 bg split**: Win95 has different desktop bg (#008080 teal) vs terminal bg (#000080 command prompt blue). This is intentional — the cross-theme consistency test accounts for this.
- **CRT conditional rendering**: CRTOverlay returns null for themes with `crtEnabled: false`. CSS flicker animation is also scoped per-theme.
- **Audio per skin**: `useAudio(skinId)` accepts a ThemeId parameter (backward-compatible default). Each skin has its own waveform, frequency, detune, and dual-tone profiles.
- **Font files not yet downloaded**: @font-face declarations are in place for IBM 3270, W95FA, Trek, and Mx437_IBM_3270. All use web-safe fallback chains. Actual .woff2 files need to be sourced from int10h.org and other sources.
- **2026-04-05 (Cross-Agent):** Jobs locked 6 architecture decisions + 6 milestones. Key patterns: Zustand for state (works outside React), flat component tree, CSS-only CRT overlays, ConnectionManager outside React, theme engine with paired CSS props + xterm ITheme swap. MVP criteria: 5 things (xterm + CRT + WebSocket + theme toggle + HITL). Kare's 5-skin expansion (Apple, C64, IBM 3270, Win95, LCARS) will extend theme engine — foundation: CSS custom properties + ThemeContext + xterm ITheme swap. Resource links provided (typography, CSS frameworks, audio assets).
- **Wave 2 completion** (2026-04-05): 5-skin theme engine fully implemented and tested. 150 theme tests passing. All 5 themes integrate cleanly with existing hooks/components. Hertzfeld identified critical reconnect backoff bug (retry counter resets on every reconnect call, preventing exponential escalation). Bug assigned to Woz for M1 work. Font files still need external sourcing.
- **HITL features** (2026-04-05): Expanded audio from 5 to 12 sound types with `SoundSequence` for multi-step sounds (boot chords, arpeggios). MechanicalSwitch has 3 variants (lever/checkbox/pill) keyed to theme. CRT toggle state stored in localStorage, propagated via prop to CRTOverlay and `.crt-screen` class. AudioToggle mute persists in localStorage via useAudio hook. All 151 tests pass after changes.
- **Wave 6 font optimization** (2026-04-05): Moved @font-face URLs from `src/assets/fonts/` to `public/fonts/` (Vite static serving). Added robust fallback chains per theme: apple2e→Apple II, c64→PetMe, ibm3270→IBM Plex Mono, win95→Fixedsys→Courier New, lcars→Antonio. Font preload hint in `index.html` for default theme. Created `public/fonts/README.md` with download/licensing instructions. All 6 declarations use `font-display: swap`.
- **Wave 6 accessibility** (2026-04-05): Added `src/styles/accessibility.css` with focus-visible indicators per theme (phosphor glow for CRT themes, dotted outline for Win95, orange ring for LCARS), `prefers-reduced-motion` media query disabling all animations/transitions, `.sr-only` utility class, and `.skip-link`. Added `aria-label`, `aria-pressed`, `aria-live`, `role="status"`, `role="application"` across all interactive components. Terminal has `aria-roledescription="terminal"`. StatusBar has `aria-live="polite"` on connection indicator. Theme changes announced via hidden `aria-live` region. Escape key returns focus to terminal. Controls toolbar has `role="toolbar"`. 293 tests passing.
