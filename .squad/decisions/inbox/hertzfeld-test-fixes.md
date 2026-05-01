# Decision: WebUI Test Infrastructure and Coverage

**Author:** Hertzfeld (Tester)
**Date:** 2026-05-01T13:57:52-04:00
**Status:** Implemented

## Context

The code review found ZERO WebUI test coverage. The webui package had no test dependencies, no test config, and no test files. Root-level tests (169) covered backend logic only.

## Decision

Built complete WebUI test infrastructure and wrote 51 component/utility tests:

### Infrastructure
- **vitest.config.ts** (separate from vite.config.ts) — jsdom environment, globals, v8 coverage at 50% thresholds
- **test-setup.ts** — jest-dom matchers + mocks for matchMedia, WebSocket, clipboard, execCommand
- **Dependencies** — @vitest/coverage-v8, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom

### Test Coverage (51 tests, 7 files)
| File | Tests | What's Covered |
|------|-------|----------------|
| ConfirmDialog.test.tsx | 11 | render, callbacks, Escape, focus |
| Lightbox.test.tsx | 6 | image, close, propagation |
| SquadPanel.test.tsx | 10 | fetch, tabs, a11y, errors |
| ContextUsageBar.test.tsx | 8 | percentages, edge cases |
| ErrorBoundary.test.tsx | 4 | catch, fallback, recovery |
| clipboard.test.ts | 5 | API, fallback, rich copy |
| constants.test.ts | 4 | timing invariants |

### Key Patterns Established
1. **Mock react-markdown** in component tests (remark plugins fail in jsdom)
2. **Mock global fetch** not internal helpers — tests real auth header logic
3. **Separate vitest.config.ts** from vite.config.ts — avoids Node imports breaking jsdom
4. **Behavior-based assertions** — resilient to parallel refactors by other agents

## What's Still Missing
- App.tsx integration tests (175KB file, needs decomposition first)
- Hook tests for remaining hooks (useTheme)
- E2E tests with Playwright
- Coverage measurement and enforcement in CI
