# Orchestration: Woz — ConnectionManager Integration
**Date:** 2026-04-05T04:01:00Z
**Agent:** Woz (Lead Dev, claude-opus-4.6)
**Status:** COMPLETED ✅

## Deliverables

- **ConnectionManager Singleton** (`src/lib/ConnectionManager.ts`): Class-based WebSocket lifecycle manager operating outside React. Handles auth ticket exchange, exponential backoff (1s–30s), rate limiting (16/min threshold → queue), and reconnection logic.
- **Backoff Bug Fix**: `connect()` no longer resets retry counter; only successful `ws.onopen` clears it. Added `connectFresh()` for user-initiated connections.
- **Zustand Connection Store** (`src/store/connectionStore.ts`): Global state for `status`, `tunnelUrl`, `agentCount`, `crtEnabled`, `audioEnabled`.
- **Command Parser** (`src/lib/commands.ts`): Built-in commands (`/status`, `/agents`, `/connect`, `/disconnect`, `/help`, `/clear`).
- **Skin-Aware Boot Messages** (`src/lib/bootMessages.ts`): Period-appropriate boot sequences for all 5 themes.
- **StatusBar Component**: Displays connection state, tunnel URL, theme name, CRT/audio toggles.
- **Terminal Ref Refactor**: `forwardRef + useImperativeHandle` exposes `write()`, `writeln()`, `clear()` for direct xterm access.

## Quality Gates
- 218 tests pass ✅
- Build clean ✅
- Lint clean ✅

## Cross-Agent Notes
- **Rate Limiting**: 16/min send threshold, queue above threshold, drain at 3s intervals
- **Terminal State**: No longer passed via React props; ref-based write directly to xterm
- **CRT State Migration**: Moved from App.tsx useState to Zustand connectionStore for shared StatusBar/MechanicalSwitch access
