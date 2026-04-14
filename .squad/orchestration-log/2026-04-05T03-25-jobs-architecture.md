# Orchestration Log: 2026-04-05T03:25 — Jobs Architecture Review

## Agent Completion

**Jobs** (Lead, claude-opus-4.6)
- **Task:** Architecture review and milestone decomposition
- **Duration:** ~6 minutes
- **Mode:** background (completed)

## Work Product

### Architecture Decisions (6 decisions locked)
1. **State Management:** Zustand (single store, works outside React lifecycle)
2. **Component Tree:** Flat, single-screen, no routing
3. **xterm.js Integration:** CSS overlay pattern (never touch rendering pipeline)
4. **WebSocket Connection:** `ConnectionManager` class, outside React, exp backoff reconnect
5. **Theme Engine:** Paired CSS custom props + xterm ITheme
6. **Audio System:** Procedural Web Audio, event-driven from Zustand

### Scope Decisions (4 features cut from MVP)
- Agent persona routing (theme preference ≠ work routing)
- Dev Tunnel OAuth discovery (use URL config instead)
- Azure Monitor chart embedding (defer to M5)
- Multi-terminal tabs (out of scope entirely)

### Milestone Roadmap (6 milestones)
```
M0 Scaffold (Woz) → M1 Terminal Core → M2 Chassis (CRT effects) → 
M3 Connection Resilience → M4 Audio → M5 Telemetry → M6 Ship
```

M2 and M3 can run in parallel.

### MVP Definition
Five criteria (all-or-nothing):
1. xterm.js renders in browser
2. CRT effects (Apple IIe scanlines, glow, curvature)
3. WebSocket connects to squad-rc
4. Theme toggle (Apple IIe ↔ C64)
5. HITL switch disables CRT for readability

## Artifacts

- `.squad/decisions/inbox/jobs-architecture-v1.md` — Full ADR (245 lines, 9.7 KB)
- Milestone decomposition inline to decisions.md

## Status

✅ Complete. Architecture locked. Ready for scaffold validation and parallel work.

## Handoff

- **To Woz:** Scaffold should support Zustand, flat component tree, CSS overlays, Context for theme
- **To Hertzfeld:** Test strategy aligned with 6 milestones and 5 MVP criteria
- **To Kare:** (Wave 2) Woz's scaffold is the base for theme engine expansion
