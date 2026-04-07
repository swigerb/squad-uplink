# Session: DevTunnel Browser WebSocket Auth v2

**By:** Woz  
**Date:** 2026-04-07 16:10  
**Status:** Complete

## Changes

- Made `/connect <url> [token]` token optional via empty string (no interface change)
- Added 1006 diagnostic hint after 2+ reconnect failures
- Supports anonymous tunnel (`--allow-anonymous`) and cookie-based auth flows
- 529 tests pass, build clean

## Decision

See `.squad/decisions/decisions.md` — "DevTunnel Browser WebSocket Auth — Optional Token + 1006 Diagnostics"
