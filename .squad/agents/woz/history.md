# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — A TypeScript/React/Vite front-end web app with a retro Apple IIe and Commodore 64 theme to control Squad agents remotely using the squad-rc feature and devtunnel. Will be hosted in Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, Azure Static Web Apps, devtunnel
- **Created:** 2026-04-05

## Core Context

Lead Dev for squad-uplink. Responsible for core architecture, TypeScript foundations, React component structure, Vite configuration, and devtunnel/squad-rc API integration.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- **2026-04-05:** Scaffolded Vite 8 + React 19 + TypeScript 5.9 project. xterm.js pinned to v5 because `@xterm/addon-canvas` peer dep doesn't support v6 yet. Theme system uses React Context + localStorage + xterm ITheme. CRT effects are pure CSS overlays. WebSocket hook uses exponential backoff reconnect with a ref-based self-reference pattern to satisfy React hooks lint rules. Path alias `@/` configured in both vite.config.ts and tsconfig.app.json.
- **2026-04-05 (Cross-Agent):** Jobs locked 6 architecture decisions that scaffold must support: (1) Zustand single store (works outside React, no re-render cost), (2) Flat component tree with CRTShell wrapping TerminalView + StatusBar, (3) ConnectionManager class outside React, (4) CSS overlay pattern for CRT (never modify xterm rendering), (5) Theme engine with CSS custom props + xterm ITheme, (6) Procedural Web Audio. Scaffold alignment: ✅ all decisions supported by current structure.
