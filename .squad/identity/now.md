---
updated_at: 2026-05-01T13:42:55.643-04:00
focus_area: Full code review complete — findings pending triage
active_issues: 
  - Kare: App.tsx decomposition fork + auth token consistency
  - Jobs: TypeScript gates, CI alignment, bundle size
  - Woz: Path validation security, strict mode, retry payloads
  - Hertzfeld: Test coverage gaps (0% WebUI, critical backend/hooks gaps)
---

# What We're Focused On

All 6 waves shipped. Four comprehensive code reviews completed (Kare frontend, Jobs architecture, Woz backend, Hertzfeld test coverage). Findings merged to decisions.md. **Next: Prioritize which gaps to address first — architecture gates (TypeScript, CI) vs. security (path validation) vs. test coverage.**

Key decision points:
- Complete App.tsx decomposition or delete orphaned modules (Kare)
- Standardize frontend auth token handling (Kare)
- Fix accessibility nesting in session picker (Kare)
- Lock down TypeScript as quality gate (Jobs)
- Align CI workflows + package manifest (Jobs)
- Fix file-management path validation (Woz)
- Build test infrastructure for WebUI and server integration (Hertzfeld)
