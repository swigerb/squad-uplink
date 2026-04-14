# Orchestration Log: 2026-04-05T03:25 — Hertzfeld Test Strategy

## Agent Completion

**Hertzfeld** (Tester, claude-opus-4.6)
- **Task:** Develop test strategy from architecture specification
- **Duration:** ~7 minutes
- **Mode:** background (completed)

## Work Product

### Test Strategy Document
- Written to `.squad/agents/hertzfeld/test-strategy.md`
- Covers 60+ test cases across 4 categories

### 7 Key Testing Decisions

1. **Test Runner:** Vitest + jsdom
   - Native Vite integration (zero config for path aliases, TypeScript, ESM)
   - Watch mode uses Vite's HMR for instant feedback
   - Jest-compatible API (existing team knowledge transfers)

2. **Test File Organization:** Co-located with source + integration folder
   - Unit tests: `*.test.ts(x)` next to source files
   - Integration & edge cases: `src/__tests__/`

3. **Testing Approach:** Behavior tests, no snapshots
   - React Testing Library for component tests
   - Snapshot tests are brittle (train blind updates)
   - Focus on user-visible behavior (production reality)

4. **WebSocket Mocking:** Custom `MockWebSocket` class
   - Not a library like `mock-socket`
   - Precise control over connection lifecycle, message timing, error simulation
   - Tests can script exact scenarios (disconnect mid-message, rapid reconnect)

5. **Coverage Floor:** 80% overall, 95% for hooks
   - Hooks contain core business logic (WebSocket management, auth, rate limiting)
   - Bugs in hooks are catastrophic in production
   - 95% achievable because hooks are pure logic
   - 80% realistic for UI-heavy app

6. **Edge Cases:** First-class test category
   - Dedicated `src/__tests__/edge-cases/` directory
   - Not afterthoughts
   - Protocol constraints are production fire starters:
     - 20 msg/min WebSocket rate limit
     - 500-message replay buffer
     - 4-hour session TTL
     - One-time ticket auth

7. **Audio Mocking:** Hand-rolled mocks
   - Mock `AudioContext`, `OscillatorNode`, `GainNode` manually
   - jsdom has no Web Audio API
   - Never play real audio in CI (no noise)
   - Verify oscillator params and lifecycle

### Test Categories (60+ cases)

**Unit Tests:**
- Zustand store reducers and selectors
- Theme switching logic
- WebSocket message parsing
- Audio event mapping
- Rate limiting calculations

**Component Tests:**
- `<CRTShell>` — CSS overlay presence, theme class switching
- `<TerminalView>` — xterm instance lifecycle, message display
- `<StatusBar>` — connection indicator, theme toggle, HITL switch UI
- `<TelemetryDrawer>` — slide-out visibility, data display

**Integration Tests:**
- Theme toggle → xterm color update → CSS class swap (full flow)
- WebSocket connect → terminal.write() → screen update
- Disconnect → reconnect → replay buffer consumed
- Message buffering and replay

**Edge Cases:**
- Rate limit exceeded → message queued
- Replay buffer overflow → oldest messages discarded
- Session TTL expired → graceful reconnect
- C64 40-column resize → line wrapping behavior
- Rapid theme switches → no display glitches
- Audio on systems without Web Audio API support (graceful degradation)
- Zero-length message handling
- Malformed xterm escape codes

### Aligned with Architecture

Test strategy matches Jobs' MVP and milestones:
- ✅ Zustand store (reducers testable, pure logic)
- ✅ Flat component tree (components are isolated, no routing complexity)
- ✅ CSS overlays (test class presence, not rendered pixels)
- ✅ ConnectionManager (WebSocket hook, mock socket, auth flow)
- ✅ Theme engine (switching logic, prop application)
- ✅ Audio system (event mapping, no playback noise)

### CI Integration

- Vitest configured in Woz's scaffold (`vitest.config.ts`)
- Thresholds: 80% overall, 95% hooks
- CI pipeline needs: `npm run test:coverage` step before merge

## Status

✅ Complete. Test strategy locked. Ready for implementation.

## Handoff

- **To Woz:** Scaffold includes Vitest config; team can start writing tests immediately
- **To Kare:** (Wave 2) Test strategy applies to new theme expansion; same patterns
- **CI/CD:** Need test + coverage validation gate
