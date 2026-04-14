# Woz Medium & Low Priority Fixes
**Date:** 2026-04-14T0300Z  
**Agent:** Woz (claude-opus-4.6)  
**Mode:** background  
**Status:** SUCCESS  

## Outcome
Medium and low priority service layer findings fixed. **12 fixes** applied:

### Fixes Applied
1. **InMemorySink dequeue logic** (PERF-022, Medium) — Changed O(n) trim loop to single `TryDequeue` per emit
2. **TelemetryService unbounded ConcurrentBag** (PERF-024, Medium) — Added 10,000-record retention limit
3. **TelemetryService LINQ passes** (PERF-025, Medium) — Replaced 3 separate .Min/.Max/.Sum with single `.Aggregate()`
4. **ThemeService fire-and-forget** (PERF-026, Medium) — Added error continuation for theme persist logging
5. **DateTime.Parse format safety** (PERF-027, Medium) — Changed to `ParseExact` with invariant culture
6. **BurnRateWidget RemoveAt(0)** (PERF-028, Medium) — Replaced List<double> with Queue<double>
7. **MarkdownParser chained Replace** (PERF-030, Medium) — Converted to StringBuilder for intermediate string reduction
8. **TimelineScrubber format calls** (PERF-031, Medium) — Added caching for FormatTime results
9. **OtlpListener timer management** (PERF-013, High) — Made Stop() async to avoid UI thread blocking
10. **CommandPalette allocation** (PERF-020, High) — Reuse filtered list buffer instead of allocating per keystroke
11. **SquadFileWatcher timer churn** (PERF-023, Medium) — Reuse timer via Change() instead of allocating new Timer
12. **Bare catch with logging** (ERR-011, High/ERR-008 High, ProcessScanner High) — Multiple bare catches upgraded to typed catches with contextual logging

## Files Modified
- `src/SquadUplink.Core/Logging/InMemorySink.cs`
- `src/SquadUplink/Services/TelemetryService.cs`
- `src/SquadUplink/Services/ThemeService.cs`
- `src/SquadUplink/Services/DataService.cs`
- `src/SquadUplink/Controls/BurnRateWidget.xaml.cs`
- `src/SquadUplink.Core/Services/MarkdownParser.cs`
- `src/SquadUplink/Controls/TimelineScrubber.xaml.cs`
- `src/SquadUplink/Services/OtlpListener.cs`
- `src/SquadUplink/Controls/CommandPalette.xaml.cs`
- `src/SquadUplink/Services/SquadFileWatcher.cs`
- `src/SquadUplink/Services/ProcessScanner.cs`
- `src/SquadUplink/Services/TrayIconService.cs`

## Testing
All unit tests pass. No regressions.

## Metrics
12 medium/low findings addressed with targeted performance improvements across:
- Collection allocation/reuse patterns
- Database query optimization
- Async/task error handling
- Timer lifecycle management
