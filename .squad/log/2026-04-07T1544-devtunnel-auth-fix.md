# 2026-04-07 15:44 — DevTunnel WebSocket Auth Loop Fix

**Lead:** Woz  
**Status:** ✅ Shipped

Fixed browser WebSocket reconnect loop with Dev Tunnels. Added anti-phishing bypass param, switched token→access_token, added protocol normalization (https→wss), removed dead ticket exchange code. 527 tests pass.
