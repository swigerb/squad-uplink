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
- **2026-04-05 (Cross-Agent):** Scaffold ready for test implementation. Vitest config included (`vitest.config.ts`), path alias `@/` synchronized between vite and tsconfig, structure supports co-located tests. Woz's 74 files deliver foundation for 60+ test cases. Start writing tests against M0 scaffold immediately.
- **2026-04-05:** Implemented test suite — 151 tests across 6 test files (3 hooks, 2 components, 1 theme config). All passing. MockWebSocket and MockAudioContext utilities created in `src/__mocks__/`. Key finding: WebSocket `connect()` resets `retriesRef` to 0 on every call including reconnect — this means exponential backoff delay never actually escalates and maxRetries is never reached through the reconnect timer path. Filed as a known behavior issue for Woz.
- **2026-04-05:** Kare expanded themes from 2→5 mid-session. Tests needed immediate adjustment: toggle cycle is now 5-step, title text changed, labels record expanded. localStorage pollution between test files was a real issue — every component test file wrapping in ThemeProvider must `localStorage.clear()` in `beforeEach`. jsdom doesn't reliably convert hex colors in inline styles to rgb — use structural assertions (element presence) over computed style checks.
- **Wave 2 completion** (2026-04-05): All 151 tests passing. Comprehensive coverage of hooks, components, and theme configs. Critical bug identified: WebSocket reconnect backoff never escalates (connect() resets retry counter on every call). Bug assigned to Woz for M1. Test suite is stable and effective — caught real production risk. localStorage clearing pattern established, jsdom color conversion workaround documented.
