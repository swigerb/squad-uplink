# kare — History Summary

**Archived:** 2026-04-27T08:45:13Z (UTC)
**Previous Size:** 55.1 KB
**Archive Path:** history-archive.md

## Recent Activity (Last Entry)

See archive for full history. Recent work captured in decisions.md and orchestration-log/.

## Key Responsibilities

- Test planning and quality assurance
- E2E verification across all features
- CI/CD integration and automation

## Learnings

- **2026-05-01T13:42:55.643-04:00 — Frontend code review of `webui/src/`:** Reviewed App.tsx, extracted component files, hooks, utility clipboard code, and theme CSS. Key findings: App.tsx still owns most UI/state and duplicates extracted components; `ApprovalCard`, `ChatMessageList`, `GuidesModal`, `InputBar`, `SessionPicker`, `useSessionManager`, and `useWebSocket` appear orphaned; session picker markup nests a copy button inside a session button; SquadPanel uses cookie auth while App uses URL/localStorage token flow; clipboard helpers report success even on failed copy paths; several interactive overlays need stronger dialog/keyboard semantics; Pip-Boy scanline animation animates `top`; frontend build passes.
- **2026-04-27T08:44:59.669-04:00 — README rewrite with images and feature docs:** Rewrote README.md to replace the rocket emoji header with the `docs/logo.png` image, replaced the ASCII architecture diagram with `docs/architecture.png`, added comprehensive feature documentation for all v0.5.7–v0.5.13 upstream features (Working Directory, Agent Picker, Tool Error Surfacing, Copy Improvements, ask_user, SDK Auto-Detection, Security), reorganized features into Portal Features and Squad Features sections, and removed the closing centered div. Kept Getting Started, Themes, Credits, Built with Squad, and License sections intact.
- **2026-04-27T09:41:44.938-04:00 — Comprehensive frontend code review of webui:** Reviewed App.tsx (3,652 lines / 167 KB monolith), main.tsx, useTheme.tsx, theme CSS files, vite.config.ts, and package.json. Found 28 findings across 8 categories. Key issues: (1) App.tsx is a 3.6K-line monolith with 13 inline components, 92 useState, 29 useRef, 0 useMemo — needs decomposition into ~10 modules; (2) no error boundaries anywhere; (3) zero useMemo on expensive message list processing; (4) only 8 ARIA attributes across 3,652 lines; (5) WebSocket onmessage handler is a 500-line if/else chain; (6) duplicate copy-to-clipboard logic in 3 places; (7) win95.css defines custom properties (--fg, --win95-*) that don't map to the shared variable scheme; (8) ThoughtBubble component is defined but never used in the render tree. Produced severity-grouped findings with a decomposition plan.
- **2026-04-28 — Ported v0.6.1 upstream features (Image Support, Context Usage Bar, Notification Accumulation):** Added full image support across App.tsx, InputBar.tsx, and ChatMessageList.tsx — including pendingImages state, addImageFiles callback, paste/drag-drop handlers, image preview strip, file picker button, lightbox overlay (new Lightbox.tsx component), and image rendering in user messages. Created ContextUsageBar.tsx showing system/messages/free token usage as a segmented progress bar, wired into SessionDrawer above the model picker. Updated notification handler with count accumulation (duplicate warnings show ×N) and changed dismiss behavior so warnings persist until next user message while info auto-dismisses. Added ImageIcon to Icons.tsx. All changes in both the inline App.tsx code and the decomposed component files. Vite build passes clean.

## Team Audit: 2026-04-27

From: Scribe (orchestration log) Scope: Frontend analysis

Your Findings (Kare, Frontend Dev)
- Critical: 175KB App.tsx monolith with 92 useState calls
- Critical: No error boundaries, 500-line WS handler, zero useMemo
- Moderate: 9 issues across state management, coupling, performance
Domain-based decomposition plan ready: SessionManager, MessageRenderer, ApprovalFlow, SettingsDrawer, GuidesPrompts.

