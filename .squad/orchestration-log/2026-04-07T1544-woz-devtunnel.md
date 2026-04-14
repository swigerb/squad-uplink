# Orchestration: 2026-04-07 15:44 — Woz DevTunnel Auth Fix

**Agent:** Woz (claude-opus-4.6)  
**Status:** ✅ Complete  
**Tests:** 527 passing

## Changes Summary

Fixed critical browser WebSocket reconnect loop when connecting through Microsoft Dev Tunnels:

1. **Anti-phishing bypass**: Added `X-Tunnel-Skip-AntiPhishing-Page=true` query param to all WebSocket URLs
2. **Auth token param**: Switched from `token` to `access_token` (OAuth2 standard)
3. **Protocol normalization**: `https://` → `wss://` and `http://` → `ws://` in ConnectionManager and /connect command
4. **Cleanup**: Removed dead `exchangeTicket` code and `TicketResponse` import

## Files Modified

- `src/lib/ConnectionManager.ts` — connect() rewritten, exchangeTicket removed
- `src/lib/commands.ts` — /connect handler adds protocol normalization
- `src/lib/__tests__/ConnectionManager.test.ts` — ticket exchange tests replaced
- `src/lib/__tests__/commands.test.ts` — added normalization tests

## Verification

- Build clean
- 527 tests pass
- No TypeScript errors
- No lint warnings
