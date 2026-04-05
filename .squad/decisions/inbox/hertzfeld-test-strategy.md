# Decision: Test Strategy for squad-uplink

**Proposed by:** Hertzfeld (Tester)
**Date:** 2026-04-05
**Status:** Proposed

## Context

squad-uplink needs a test architecture before implementation begins. Decisions here lock in tooling and conventions so Woz's scaffold and Hertzfeld's tests align from day one.

## Decisions

### 1. Test Runner: Vitest with jsdom

**Choice:** Vitest over Jest.
**Why:** Native Vite integration means zero config for path aliases, TypeScript, and ESM. Watch mode uses Vite's HMR for instant feedback. API is Jest-compatible so the team's existing knowledge transfers.

### 2. Co-located Test Files

**Choice:** `*.test.ts(x)` files live next to source files. Integration and edge-case tests go in `src/__tests__/`.
**Why:** Co-location makes it obvious when a file is untested. Separate folders for integration/edge tests keep them from cluttering component directories.

### 3. Behavior Testing, Not Snapshots

**Choice:** React Testing Library for component tests. No snapshot tests.
**Why:** Snapshot tests are brittle — they break on any markup change and train developers to blindly update them. RTL tests user-visible behavior, which is what actually matters.

### 4. Custom WebSocket Mock Over Library Mocks

**Choice:** Hand-rolled `MockWebSocket` class instead of using a library like `mock-socket`.
**Why:** We need precise control over connection lifecycle, message timing, and error simulation. A custom mock lets tests script exact scenarios (disconnect mid-message, rapid reconnect) without fighting a library's API. Fewer dependencies = fewer maintenance surprises.

### 5. Coverage Floor: 80% Overall, 95% for Hooks

**Choice:** Enforced in CI via Vitest thresholds. Build fails below floor.
**Why:** Hooks contain core business logic (WebSocket management, auth, rate limiting) — bugs there are catastrophic. 95% is achievable because hooks are pure logic. 80% overall is realistic for a UI-heavy app while still catching regressions.

### 6. Edge Case Tests Are First-Class

**Choice:** Dedicated `src/__tests__/edge-cases/` directory. Edge cases are not afterthoughts.
**Why:** The protocol has real constraints (rate limits, replay buffers, session TTL) that will absolutely break in production if untested. Treating edge cases as a test category keeps them visible and maintained.

### 7. Audio Mocking Strategy

**Choice:** Mock `AudioContext`, `OscillatorNode`, and `GainNode` manually. Never play real audio in tests.
**Why:** jsdom has no Web Audio API. Real audio would make CI noisy (literally). Mocks verify the right oscillator params and lifecycle without side effects.

## Impact

- Woz should ensure scaffold includes `vitest.config.ts` with the jsdom environment and setup file path
- All team members should co-locate tests with source files
- CI pipeline needs a test + coverage step

## Open Questions

- Should we add Playwright/Cypress for E2E testing of the full WebSocket flow? (Defer until MVP is stable)
- Do we need visual regression testing for CRT effects? (Probably not — CSS-based, tested via class presence)
