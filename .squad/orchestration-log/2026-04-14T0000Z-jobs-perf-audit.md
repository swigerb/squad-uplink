# Jobs Performance & Architecture Audit
**Date:** 2026-04-14T0000Z  
**Agent:** Jobs (claude-opus-4.6)  
**Mode:** background  
**Status:** SUCCESS  

## Outcome
Performance & architecture audit completed. **39 findings** identified:
- **9 Critical** — Event handler leaks, GDI handle leak, WMI disposal, background-thread UI updates, async/await issues
- **14 High** — Resource management, N+1 patterns, brush allocation churn, timer issues, fire-and-forget errors
- **12 Medium** — Collection performance, duplicate logic, unbounded growth, DateTime parsing
- **4 Low** — Minor optimizations and capacity hints

## Key Findings
1. **PERF-002/003/004/008** — Four event handler memory leaks (CollectionChanged) across DecisionFeedControl, OrchestrationTimelineControl, SquadTreeControl, GridLayoutPanel
2. **PERF-014/015/016/017** — Four brush allocation hot spots in converters and controls (per-call SolidColorBrush creation)
3. **PERF-005** — Critical threading issue: background threads update UI-bound ObservableProperties without marshaling to UI thread (will crash WinUI3 under load)
4. **PERF-001** — GDI handle leak in TrayIconService (5 leaks per app lifetime)
5. **ARCH-001** — Duplicate ITelemetryService DI registration

## Deliverable
Full audit document: `.squad/decisions/inbox/jobs-perf-audit.md` (22 KB, 462 lines)

## Next Steps
Waiting for Woz to prioritize critical/high fixes.
