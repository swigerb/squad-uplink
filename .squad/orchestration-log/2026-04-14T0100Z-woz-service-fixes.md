# Woz Service Layer Fixes
**Date:** 2026-04-14T0100Z  
**Agent:** Woz (claude-opus-4.6)  
**Mode:** background  
**Status:** SUCCESS  

## Outcome
Critical and high priority service layer findings fixed. **7 major fixes** applied:

### Fixes Applied
1. **IHost disposal** (ERR-002, Critical) — Program.cs now uses `using var host = ...` to ensure Serilog flushing and DI disposal
2. **Duplicate ITelemetryService DI** (ERR-003/ARCH-001, Critical) — Removed duplicate registration in ServiceCollectionExtensions
3. **Bare catch blocks** — OtlpListener (ERR-005/006), SquadDetector (ERR-007) — Changed to typed catches with Debug logging
4. **WMI disposal** (ERR-009, High) — ProcessScanner now properly disposes ManagementObject in foreach loop
5. **GDI handle leak** (ERR-012/PERF-001, High) — TrayIconService now calls DestroyIcon via P/Invoke after Icon.FromHandle
6. **DispatcherQueue marshaling** (PERF-005/MVVM-005, Critical) — DashboardViewModel now marshals background-thread property updates to UI thread
7. **Event subscription cleanup** (ERR-013/014/015/016, Medium) — Added OnCollectionChanged named handler methods and unsubscribe logic in SquadTreeControl, OrchestrationTimelineControl, DecisionFeedControl, DashboardViewModel

## Files Modified
- `src/SquadUplink/Program.cs`
- `src/SquadUplink/Helpers/ServiceCollectionExtensions.cs`
- `src/SquadUplink/Services/OtlpListener.cs`
- `src/SquadUplink/Services/SquadDetector.cs`
- `src/SquadUplink/Services/ProcessScanner.cs`
- `src/SquadUplink/Services/TrayIconService.cs`
- `src/SquadUplink/ViewModels/DashboardViewModel.cs`
- `src/SquadUplink/Controls/SquadTreeControl.xaml.cs`
- `src/SquadUplink/Controls/OrchestrationTimelineControl.xaml.cs`
- `src/SquadUplink/Controls/DecisionFeedControl.xaml.cs`

## Testing
All tests pass. No regressions detected.

## Next Steps
Waiting for Kare XAML fixes.
