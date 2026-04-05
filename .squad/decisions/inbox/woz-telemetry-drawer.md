# Decision: TelemetryDrawer Architecture (Wave 4)

**By:** Woz (Lead Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Brady's M5 spec calls for a hidden telemetry panel that intentionally breaks the retro aesthetic — the "mask slips" moment revealing the modern system underneath.

## Decisions

### 1. TelemetryMetrics in connectionStore (not separate store)
Extended the existing Zustand `connectionStore` with a nested `telemetry: TelemetryMetrics` object rather than creating a separate store. Rationale: telemetry data is tightly coupled to connection state, and Zustand selectors let consumers subscribe to just what they need.

### 2. fetchStatus() on ConnectionManager
Added `fetchStatus()` as a public method on the ConnectionManager singleton. It derives the HTTP base URL from the configured `wsUrl`, calls `/status`, measures round-trip latency via `performance.now()`, and pushes results directly to the Zustand store. This keeps the data flow consistent: ConnectionManager → Zustand → React.

### 3. Rolling Message Rate via Timestamp Arrays
Inbound/outbound message rates are tracked by pushing `Date.now()` into arrays on each send/receive, then computing rates over a 10s rolling window every 2s. This avoids the complexity of a circular buffer while staying lightweight for typical message volumes.

### 4. CSS Overlay Pattern (z-index 9999)
The drawer is a fixed-position overlay with backdrop, completely independent of the layout system. Renders as a React sibling *outside* all three layout components (Fullscreen, Win95, LCARS). This means it works in all 5 skins without any layout-specific code.

### 5. Modern Design System Isolation
The drawer uses `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif` font stack and its own CSS namespace (`telemetry-*`). No CSS custom properties from the theme system. This is intentional — the panel should look jarring next to the retro terminal.

## Files Changed
- `src/types/squad-rc.ts` — Added `StatusResponse`, `TelemetryMetrics` interfaces
- `src/store/connectionStore.ts` — Extended with `drawerOpen`, `telemetry`, and actions
- `src/lib/ConnectionManager.ts` — Added `fetchStatus()`, metrics tracking, reconnect counting
- `src/components/TelemetryDrawer/TelemetryDrawer.tsx` — New component
- `src/components/TelemetryDrawer/TelemetryDrawer.css` — Modern dark glass styling
- `src/components/TelemetryDrawer/index.ts` — Barrel export
- `src/App.tsx` — TelemetryDrawer integration, Ctrl+Shift+T keyboard shortcut
