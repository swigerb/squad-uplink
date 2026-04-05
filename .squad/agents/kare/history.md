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
