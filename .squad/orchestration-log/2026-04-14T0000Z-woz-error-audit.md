# Woz Error Handling & C# Best Practices Audit
**Date:** 2026-04-14T0000Z  
**Agent:** Woz (claude-opus-4.6)  
**Mode:** background  
**Status:** SUCCESS  

## Outcome
Error handling and C# best practices audit completed. **31 findings** identified:
- **3 Critical** — Unobservable async void exceptions, IHost disposal, duplicate DI registration
- **9 High** — Bare catch blocks (6), WMI disposal, icon handle leak, fire-and-forget error handling
- **13 Medium** — Input validation gaps, event subscription leaks (3), null-forgiving operators, fire-and-forget patterns
- **6 Low** — COMException logging, static dependency antipattern, null guards, record candidates

## Key Findings
1. **ERR-002** — IHost never disposed in Program.cs (critical for Serilog flushing)
2. **ERR-003/ARCH-001** — Duplicate ITelemetryService registration (DI bug)
3. **ERR-005, ERR-006, ERR-007** — Multiple bare catch blocks with zero logging (OtlpListener, SquadDetector, ProcessScanner)
4. **ERR-013/014/015/016** — Event subscription leaks in 4 controls/viewmodels (CollectionChanged, custom events)
5. **Positive:** NRT enabled, file-scoped namespaces, proper async/await patterns in most places

## Deliverable
Full audit document: `.squad/decisions/inbox/woz-error-handling-audit.md` (21 KB, 467 lines)

## Next Steps
Waiting for Woz implementation phase (critical/high fixes).
