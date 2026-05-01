# hertzfeld — History Summary

**Archived:** 2026-04-27T08:45:13Z (UTC)
**Previous Size:** 24.2 KB
**Archive Path:** history-archive.md

## Recent Activity (Last Entry)

See archive for full history. Recent work captured in decisions.md and orchestration-log/.

## Key Responsibilities

- Test planning and quality assurance
- E2E verification across all features
- CI/CD integration and automation

## Learnings

### 2026-04-27T09:41:44.938-04:00 — Test Gap Analysis Complete

**What I did:** Full codebase analysis for test strategy. Reviewed all 8 backend source files (server.ts 63KB, session.ts 85KB, squad.ts 9.5KB, main.ts 14KB, launcher.ts 6KB, rules.ts 6.5KB, tunnel.ts 5.5KB, updater.ts 16KB) plus build config (esbuild.cjs) and both package.json files. Produced comprehensive test strategy with framework recommendation, priority matrix, 20 specific test cases, architecture plan, and risk assessment.

**Key findings:**
- **Vitest is the right framework** — project is ESM-only (`"type": "module"`), builds with esbuild (no tsc), webui already uses Vite. Jest's ESM support would be a constant battle.
- **`rules.ts` and `squad.ts` are the lowest-hanging fruit** — pure logic, minimal dependencies, high security value. Start here.
- **`@github/copilot-sdk` mocking is the #1 risk** — no public type exports, version-dependent behavior (SDK 0.2.x vs 0.3.x approval formats), complex event model. The mock must be built carefully.
- **`session.ts` at 85KB/1900 lines is the hardest file to test** — 30+ event handlers, turn state machine, reconnect logic, sync cursors. Test at the seams (mock `getMessages()` return values, not the SDK itself).
- **The existing `"test"` script (`node tools/test-client.mjs`) is a manual integration test** — must be preserved as `"test:manual"` when we add Vitest.
- **27+ pre-existing type errors** mean `tsc --noEmit` would fail. Vitest's esbuild transform skips type-checking, matching the project's actual build behavior.
- **`webui/src/App.tsx` at 175KB is untestable as-is** — needs decomposition before component tests are practical. E2E with Playwright is more realistic short-term.

**Decision:** Wrote test strategy to `.squad/decisions/inbox/hertzfeld-test-strategy.md` for team review.

## Team Audit: 2026-04-27

From: Scribe (orchestration log) Scope: Test framework + gap analysis

Your Findings (Hertzfeld, Tester)
- E2E Status: 53/53 manual tests passing (build, API, SDK, WebUI verification)
- Framework: Vitest recommended (ESM-native, Vite integration, esbuild alignment)
- P0 Priority: RulesStore, SquadReader, auth. P1: session mgmt, agent selection. Coverage ceiling 55-65%.
Vitest config provided (root + webui). Mocking strategy documented.

### 2025-07-27 — Tests for Upstream v0.6.1 Port (Image, Context Bar, Notifications)

**What I did:** Wrote 96 new tests across 4 test files for the 3 features being ported from copilot-portal v0.6.1. All 169 tests pass (73 existing + 96 new).

**Test files created:**
- `tests/notification-logic.test.ts` (21 tests) — notification accumulation state machine, count display formatting, auto-dismiss behavior (info vs warning), warning persistence until send
- `tests/context-usage-bar.test.ts` (21 tests) — token percentage calculations, edge cases (0%, 100%, very small, 1M context), formatting, visibility conditions, rounding behavior
- `tests/image-support.test.ts` (44 tests) — image file processing, canSend with images, WS payload building, message image URIs, remove-by-index, visibility filter with image-only messages, history replay attachment mapping, end-to-end flow simulations
- `tests/lightbox.test.ts` (10 tests) — open/close state, backdrop vs image click handling, lifecycle transitions

**Pattern followed:** Extracted logic into standalone testable functions matching the existing project pattern (auth.test.ts, permissions.test.ts). Tests validate algorithms independently of React DOM, so they pass NOW and will continue passing as components are built by Woz and Kare.

**Key decision:** Used pure logic extraction instead of React Testing Library. Rationale: (1) webui has no test deps (no jsdom, no RTL), (2) features don't exist yet so imports would fail, (3) matches existing project convention. Component-level RTL tests should be added after UI lands.

