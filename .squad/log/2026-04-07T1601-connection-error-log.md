# 2026-04-07 16:01 — Connection Error Telemetry Log

**Lead:** Woz  
**Status:** ✅ Shipped

Added ConnectionError type with ring buffer (last 10 errors), captures at 4 failure points with token-masked URLs. TelemetryDrawer shows Connection Log section. /connect logs constructed URL. 527 tests pass.
