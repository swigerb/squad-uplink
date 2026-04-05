# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — A TypeScript/React/Vite front-end web app with a retro Apple IIe and Commodore 64 theme to control Squad agents remotely using the squad-rc feature and devtunnel. Will be hosted in Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, Azure Static Web Apps, devtunnel
- **Created:** 2026-04-05

## Core Context

Frontend Dev for squad-uplink. Responsible for React UI components, retro Apple IIe and Commodore 64 visual design, CSS architecture, theme system, and component library.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- **2026-04-05 (Cross-Agent):** Jobs locked 6 architecture decisions + 6 milestones. Key patterns: Zustand for state (works outside React), flat component tree, CSS-only CRT overlays, ConnectionManager outside React, theme engine with paired CSS props + xterm ITheme swap. MVP criteria: 5 things (xterm + CRT + WebSocket + theme toggle + HITL). Kare's 5-skin expansion (Apple, C64, IBM 3270, Win95, LCARS) will extend theme engine — foundation: CSS custom properties + ThemeContext + xterm ITheme swap. Resource links provided (typography, CSS frameworks, audio assets).
