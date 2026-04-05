# Decision: WebSocket Reconnect Backoff Bug

**By:** Hertzfeld (Tester)
**Date:** 2026-04-05
**Status:** Proposed

## Issue

The `useWebSocket` hook's `connect()` function unconditionally resets `retriesRef.current = 0`. Since the reconnect timer calls `connect()` on each retry, the retry counter never accumulates. This means:

1. **Exponential backoff never escalates** — delay is always `2^0 * 1000ms = 1s`
2. **`maxRetries` is never reached** — retries resets to 0 before each check

## Recommendation

Separate user-initiated connect (should reset retries) from internal reconnect (should preserve retry count). Either:
- Add an internal `_reconnect()` that skips the retry reset
- Add a parameter `connect(config, { isReconnect: boolean })`

## Test Impact

Current tests verify the actual behavior (1s reconnection delay, reconnect:false disabling). Once Woz fixes the backoff logic, exponential delay and maxRetries tests should be added.
