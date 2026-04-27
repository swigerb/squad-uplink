# woz — History Summary

**Archived:** 2026-04-27T08:45:13Z (UTC)
**Previous Size:** 43.5 KB
**Archive Path:** history-archive.md

## Recent Activity (Last Entry)

See archive for full history. Recent work captured in decisions.md and orchestration-log/.

## Key Responsibilities

- Test planning and quality assurance
- E2E verification across all features
- CI/CD integration and automation

## Learnings

### 2026-04-27T09:41:44.938-04:00 — Deep Backend Code Review

Performed full security/reliability review of server.ts, session.ts, and squad.ts. Key findings:

- **Browse endpoint exposes full filesystem**: `/api/browse` allows traversal of all directories on every mounted drive. Restricted only by OS permissions — no sandboxing to project root.
- **CWD endpoint accepts arbitrary paths**: `/api/sessions/:id/cwd` validates that a path is a directory but doesn't restrict to project scope. Combined with browse, allows remote directory creation anywhere.
- **Race condition in approval handling**: `resolveApproval` and `onPermissionCompleted` both mutate `pendingApprovals` and `activeApprovalId`. Concurrent clients can hit both paths simultaneously. No locking.
- **`handlePermissionRequest` in shared mode returns a never-resolving promise**: This is a deliberate design to defer to CLI, but if the CLI never responds, the promise leaks forever with its closure.
- **`failedAuth` Map never cleaned up**: Entries accumulate forever. Need periodic GC.
- **`readBody` has no `req.on('error')` handler**: If the client disconnects mid-body, the promise never resolves or rejects.
- **`loadShields()` called as expression on line 651**: `const shields = this.loadShields()` captures the void return — shields are actually loaded as a side effect into `this.shields`. The `shields` variable is unused dead code.
- **Duplicate repair code**: `repairOrphanedToolsDirect` exists in both SessionHandle and SessionPool with near-identical logic.
- **squad.ts `isAllowedPath` doesn't block null bytes**: `path.normalize` on Windows doesn't strip embedded null bytes, which could truncate filenames at the OS level.

Full 16-finding report delivered to Brian.

## Team Audit: 2026-04-27

From: Scribe (orchestration log entry) Scope: Backend correctness + security review

Your Findings (Woz, Backend Dev)
- Critical: F1 url ReferenceError in handleMessage - FIXED
- Moderate: F2-F7 fixes (content, timeout, callbacks) - ALL FIXED
All 7 bugfixes verified. Build passes cleanly.

