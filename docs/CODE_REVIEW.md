# Code Review Findings — 2026-03-25

## Overview

Comprehensive review of all runtime code, scripts, and packaging. Findings
prioritized by severity. Dependencies between items are noted — fixing some
issues eliminates or simplifies others.

---

## Critical

### CR-1: Stale handle after reconnect
**File:** server.ts:219-240
**Problem:** When `session.send()` fails with "Connection is closed" and we
reconnect, the new handle is assigned in the `handleMessage` scope, but the
`ws.on('close')` handler still references the old handle. The old listener
is never removed from the new handle → memory leak and double listeners on
repeated reconnects.
**Fix:** Use a `handleRef` container or remove old listener before adding new.
**Dependencies:** None — standalone fix.

### CR-2: Orphaned approval timeouts on disconnect
**File:** session.ts:176-183
**Problem:** `removeListener()` skips `denyAllPending()` when `isTurnActive`
is true. If a client disconnects mid-turn, approval timeouts (5 min each)
accumulate and never get cleared.
**Fix:** Always clear timeouts on disconnect. Only skip resolving the promises
if the turn is active (so the turn can complete), but clear the timers.
**Dependencies:** Related to CR-5 (pending inputs). Fix both together.

### CR-3: No error handling if copilot.exe not on PATH
**File:** launcher.ts:54-68
**Problem:** On Windows, `exec()` with `pwsh Start-Process` fails silently.
On other platforms, `spawn()` has no error handler. `cliLaunched` is set to
true even if the spawn failed, so the portal proceeds to connect to a
non-existent CLI server and hangs.
**Fix:** Add error callback to exec, error listener to spawn. Only set
`cliLaunched` on confirmed start. Log clear error message with install
instructions.
**Dependencies:** Fixing this also addresses CR-8 (CLI crash undetected) for
the startup case. Runtime crash detection (CR-8) is still separate.

### CR-4: Update can leave broken installation
**File:** updater.ts:141-177
**Problem:** If `npm install` succeeds but `npm run build` fails, the server
reports success. On restart, the new dependencies may not work with the old
built code.
**Fix:** Catch build failure separately, roll back to previous versions.
**Dependencies:** Only relevant for dev installs (release packages skip build).
Lower priority in practice since most users run pre-built releases.

---

## Medium-High

### CR-5: Pending inputs never rejected during active turn
**File:** session.ts:609-614
**Problem:** Same gate as CR-2 — `denyAllPending()` clears inputs but is
gated behind `!isTurnActive`. If a client disconnects while an `ask_user`
prompt is pending during an active turn, the input promise hangs forever.
**Fix:** Always reject pending inputs on disconnect (they can't be answered
without a client). Keep the `!isTurnActive` gate only for approvals.
**Dependencies:** Fix alongside CR-2 — same code path.

### CR-6: Reconnect race in pollForChanges
**File:** session.ts:367-383
**Problem:** The poll checks `listeners.size > 0` and `pendingApprovals.size`
separately. A listener could disconnect between these checks, causing a
reconnect that orphans pending approvals.
**Fix:** Add `isReconnecting` guard (partially exists) or atomic check.
**Dependencies:** In shared mode, the poller is disabled entirely (line 359).
This issue only affects standalone mode. If we eventually deprecate standalone,
this becomes moot. **Lower priority if shared mode is the default.**

### CR-7: WS handler cleanup order
**File:** App.tsx:685-692
**Problem:** Handlers are nulled before the socket is closed. If the close
event fires between nulling `onclose` and calling `close()`, the cleanup
callback won't run.
**Fix:** Close first, then null. Or use `removeEventListener` instead.
**Dependencies:** Unlikely to cause issues in practice (the null + close
happen synchronously in the same tick). Low risk.

---

## Medium

### CR-8: CLI crash after startup goes undetected
**File:** launcher.ts:100-115
**Problem:** The launcher checks port 3848 once at startup. If the CLI server
crashes later, the portal's SDK connection fails but the launcher doesn't know.
**Fix:** Periodic health check (every 30s) with auto-relaunch.
**Dependencies:** CR-1 (stale handle) already handles the SDK-level recovery.
If CR-1 is fixed, the portal can reconnect on the next send. This health check
would handle the case where NO sends happen and the CLI is just dead.
**Recommendation:** Nice to have but not urgent if CR-1 is fixed.

### CR-9: Path traversal uses normalize instead of resolve
**File:** server.ts:475-487
**Problem:** `path.normalize()` doesn't fully resolve UNC paths on Windows.
`path.resolve()` is more robust for preventing directory traversal.
**Fix:** One-line change: `normalize` → `resolve`, add trailing `path.sep`.
**Dependencies:** None — standalone security fix.

### CR-10: No rate limiting on token auth
**File:** server.ts:47-59
**Problem:** No limit on failed WebSocket connection attempts. An attacker
could brute-force the 32-char hex token (unlikely but poor practice).
**Fix:** Track failed attempts by IP, block after 5 failures for 60s.
**Dependencies:** Only matters if the portal is exposed beyond the local
network. On a trusted LAN, this is very low risk.

### CR-11: Silent network errors in update checker
**File:** updater.ts:192-209
**Problem:** `fetchLatestVersion()` resolves to `null` on network error
without logging. Could show "all up to date" when registry is unreachable.
**Fix:** Pass logger, log failures.
**Dependencies:** None — simple improvement.

### CR-12: Retry loop stacking on reconnect
**File:** App.tsx:1196-1207
**Problem:** Multiple retry intervals could theoretically stack if the
component remounts rapidly.
**Fix:** Track active retry count, limit retries.
**Dependencies:** The cleanup function does clear the interval on unmount.
This is a theoretical race, not an observed bug. **Low priority.**

### CR-13: Weak message deduplication
**File:** App.tsx:932
**Problem:** Messages deduplicated by content match only. Two identical
responses would be collapsed.
**Fix:** Use server-provided message IDs instead of content comparison.
**Dependencies:** Would require server to send message IDs on sync events.
Part of a larger sync architecture change. **Defer to sync refactor.**

### CR-14: patch.mjs not called in postinstall
**File:** package.json
**Problem:** `patch.mjs` applies a fix that `patch-package` may not cover.
It's called in `start-portal.cmd` but not in `postinstall`.
**Fix:** Add `&& node patch.mjs` to postinstall script.
**Dependencies:** Only affects fresh installs. Quick fix.

---

## Low

### CR-15: App.tsx should be split into components
**File:** App.tsx (~2200 lines)
**Recommendation:** Extract into ~7 files:
- `components/ChatPanel.tsx` — message list rendering
- `components/ApprovalPanel.tsx` — approval/input request UI
- `components/UpdateBanner.tsx` — update status banner
- `components/SessionDrawer.tsx` — already defined inline, extract to file
- `hooks/useWebSocket.ts` — connection logic
- `hooks/useMessageSync.ts` — event handling
- `utils/messageParser.ts` — tool summary building
**Dependencies:** No functional impact. Improves maintainability and makes
it easier for AI to reason about the code in future sessions.

### CR-16: Log when shared mode skips polling
**File:** session.ts:356-365
**Fix:** One line: `this.log('[Session] Shared mode — polling disabled')`.
**Dependencies:** None.

---

## Dependency Analysis

### Fixing CR-1 reduces need for CR-8
The stale handle fix (CR-1) means the portal auto-recovers on the next send
after a CLI disconnect. The periodic health check (CR-8) would only matter
if the portal sits idle with a dead CLI for an extended period.

### CR-2 and CR-5 are the same fix
Both are about the `removeListener()` gate. Fix once: always clear timeouts,
conditionally skip promise resolution.

### CR-6 is less relevant in shared mode
The poll race condition only exists in standalone mode. With shared mode as
default, this is much lower priority.

### CR-4 only matters for dev installs
Release packages skip the build step, so the rollback logic would never fire.
Still worth fixing for developers, but not urgent for users.

### CR-15 would make all future fixes easier
Splitting App.tsx doesn't fix any bugs but makes every future change to the
UI less risky and faster to reason about.

---

## Recommended Fix Order

1. **CR-1** — Stale handle (critical bug, standalone fix)
2. **CR-2 + CR-5** — Approval/input cleanup (fix together)
3. **CR-3** — Copilot PATH error handling
4. **CR-9** — Path traversal (1-line security fix)
5. **CR-14** — patch.mjs postinstall (1-line fix)
6. **CR-11** — Update checker logging
7. **CR-16** — Poll skip logging
8. **CR-4** — Update rollback (dev-only)
9. **CR-8** — CLI health check (nice-to-have)
10. **CR-15** — App.tsx split (maintainability)
