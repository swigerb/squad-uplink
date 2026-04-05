# Project Context

- **Owner:** Brady
- **Project:** squad-uplink — A TypeScript/React/Vite front-end web app with a retro Apple IIe and Commodore 64 theme to control Squad agents remotely using the squad-rc feature and devtunnel. Will be hosted in Azure Static Web Apps.
- **Stack:** TypeScript, React, Vite, Azure Static Web Apps, devtunnel
- **Created:** 2026-04-05

## Core Context

Tester for squad-uplink. Responsible for test suite architecture, unit/component/integration testing with Vitest and React Testing Library, edge case identification, and quality gates.

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **2026-04-05:** Created comprehensive test strategy (`test-strategy.md`) covering 60+ test cases across unit, component, integration, and edge-case categories. Key decisions: Vitest+jsdom, co-located test files, custom WebSocket/xterm.js/Web Audio mocks, behavior testing over snapshots, 80% coverage floor (95% for hooks). Decision submitted to inbox for team review.
- **2026-04-05:** Protocol constraints that need heavy edge-case coverage: 20 msg/min WS rate limit, 500-message replay buffer, 4-hour session TTL, one-time ticket auth. These are the production fire starters.
- **2026-04-05:** C64 40-column mode is a testing concern — need to verify line wrapping/truncation behavior when switching from 80-col Apple IIe to 40-col C64 mid-session.
