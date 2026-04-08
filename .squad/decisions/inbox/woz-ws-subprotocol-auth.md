# Decision: WebSocket Auth via Subprotocol for Dev Tunnel Compatibility

**By:** Woz (Lead Dev)
**Date:** 2026-04-07
**Status:** Proposed

## What

Switched WebSocket authentication from query parameter (`?token=<JWT>`) to the WebSocket subprotocol method (`access_token-<JWT>`). Also added trailing-slash stripping on URLs and diagnostic close-code logging.

## Why

Private Microsoft Dev Tunnels strip query parameters during the WebSocket Upgrade handshake. The `access_token-<JWT>` subprotocol is the official Dev Tunnel method for passing auth tokens — it survives relay proxies and enterprise network intermediaries that rewrite URLs.

Additionally:
- **Trailing slashes** cause the Dev Tunnel relay to interpret the request as an HTTP GET for a directory listing instead of a WebSocket Upgrade. Stripping them fixes silent connection failures.
- **Close code diagnostics** were missing — `ws.onclose` didn't log `event.code`, `event.reason`, or `event.wasClean`, making it impossible to distinguish auth failures (4xx) from relay issues (1006) from clean shutdowns (1000).

## Changes

- `src/lib/ConnectionManager.ts`: Subprotocol auth, trailing-slash strip, close/error diagnostics
- `src/__mocks__/websocket.ts`: MockWebSocket now accepts `protocols` parameter
- `src/lib/__tests__/ConnectionManager.test.ts`: Updated test to verify subprotocol auth instead of query params

## Risk

Low. The ticket-exchange path still uses query params for the short-lived ticket (by design). Only the long-lived auth token moves to subprotocol. All 509 tests pass.
