# Orchestration: Woz — DevTunnel Browser Auth v2

**Agent:** Woz (Lead Dev)  
**Timestamp:** 2026-04-07 16:10  
**Status:** Complete

## Work Completed

Fixed devtunnel browser WebSocket authentication issues. Research confirmed MS Dev Tunnels do not support `access_token` query params from browsers; relay rejects the WebSocket handshake. Implemented dual auth approaches:

1. **Anonymous tunnel access** — User configures tunnel with `--allow-anonymous`, no token needed
2. **Cookie-based auth** — User visits tunnel URL in browser first, authenticates via Microsoft login, browser sends auth cookie with subsequent WebSocket requests

### Changes Made

- `src/lib/commands.ts` — `/connect <url> [token]` with token now optional, updated help text with DevTunnel tips
- `src/lib/ConnectionManager.ts` — `access_token` param only set when token non-empty, added 1006 diagnostic hint after 2+ retries
- `src/lib/__tests__/commands.test.ts` — Added "connects without token" test, updated test suite
- `src/lib/__tests__/ConnectionManager.test.ts` — Added "omits access_token when empty" and "1006 diagnostic hint" tests

### Design Choices

- Empty string (`''`) as "no token" — keeps `SquadRcConfig.token` as `string` type, no interface change needed
- Diagnostic hint deferred to 2+ retries — avoids log spam on transient network issues
- Non-breaking — `/connect <url> <token>` still works exactly as before

### Verification

**529 tests passing**, 15 skipped (pre-existing), 0 failures  
Build clean (0 TS errors, 0 lint warnings)

## Impact

Developers can now connect Squad Uplink to Microsoft Dev Tunnels from a browser without authentication errors. Two legitimate auth paths documented and tested.

## Files Touched

- `src/lib/commands.ts`
- `src/lib/ConnectionManager.ts`
- `src/lib/__tests__/commands.test.ts`
- `src/lib/__tests__/ConnectionManager.test.ts`
