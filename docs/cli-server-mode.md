# Shared CLI Server Mode

## Overview

Switch from spawning a private CLI subprocess to connecting to the CLI's
built-in JSON-RPC server (`--ui-server`). This gives true bidirectional sync
between CLI and portal — messages sent from either side are immediately
visible to both.

## Validation

**Tested 2026-03-21 on CLI v1.0.9:**
- `copilot --ui-server --port 9090` — works, TUI is fully interactive
- `CopilotClient({ cliUrl: 'localhost:9090' })` — connects, sees all sessions
- `getForegroundSessionId()` — returns the active TUI session
- `listSessions()` — returns all sessions
- Sending a message via SDK → appears in CLI TUI immediately
- `--ui-server` flag present in all versions from 0.0.407 through 1.0.10+
- Flag is hidden from `--help` but referenced in SDK type definitions

## Ports

- **3847** — Portal HTTP/WebSocket server (serves web UI, browser connections)
- **3848** — CLI RPC server (JSON-RPC, portal backend connects to CLI)
- No precedent for a default CLI RPC port — both CLI and SDK default to "random available port"
- We pick 3848 (portal + 1) for determinism; launcher always passes `--port 3848` explicitly

## Default Startup Flow

```
npm start (runs launcher.ts)
  1. Check if port 3848 is already listening (user has CLI running)
     → If yes, skip to step 3
  2. Launch CLI in a new window:
     Windows: start "Copilot CLI" copilot --ui-server --port 3848
     macOS:   open -a Terminal -- copilot --ui-server --port 3848
     Linux:   (best-effort: xterm, gnome-terminal, etc.)
  3. Wait for port 3848 to accept connections (poll with timeout)
  4. Start portal server with --cli-url localhost:3848
  5. Portal server connects via CopilotClient({ cliUrl: 'localhost:3848' })
```

Fallback: `npm start -- --standalone` uses the old subprocess model (no CLI window).

## Code Changes

**launcher.ts** (moderate changes):
- Add CLI process management: detect, launch, wait-for-port
- Platform-specific window launch (start/open/xterm)
- Monitor CLI process — if it exits, notify portal or relaunch
- Pass `--cli-url` to server process when CLI is available
- Support `--standalone` flag to skip CLI launch

**session.ts — SessionPool** (~10 lines changed):
- Constructor accepts optional `cliUrl` parameter
- `new CopilotClient({ cliUrl })` when provided, `new CopilotClient()` otherwise
- `start()` skips subprocess spawn when using cliUrl (just connects)

**session.ts — Sync Poller** (~100 lines removed):
- The sync poller (`pollTimer`, `lastSyncedCount`, `syncNewMessages`, etc.)
  exists to detect CLI-side changes when using a separate subprocess
- With shared process, events flow through the same connection — poller is unnecessary
- Guard with `if (!cliUrl)` so it still works in standalone mode

**session.ts — Orphan Repair** (keep but less critical):
- Connect-time repair still useful as a safety net
- Runtime repair less likely to trigger since single process handles tool
  execution lifecycle cleanly

**main.ts** (minor):
- Accept `--cli-url <host:port>` flag
- Pass to PortalServer constructor

**server.ts** (minor):
- Pass cliUrl through to SessionPool
- Log which mode is active on startup

**UI** (no changes needed):
- Everything works the same — the transport is abstracted by the SDK

## What Gets Removed
- Sync poller in SessionHandle (~100 lines) — guarded, not deleted, for standalone mode
- Subprocess stderr logging (CLI manages its own output in TUI window)

## What Gets Added
- CLI process management in launcher (~50 lines)
- Port detection/wait logic (~20 lines)
- `--cli-url` and `--standalone` flag handling (~10 lines)

## Edge Cases

1. **User closes CLI window** — Portal loses RPC connection
   - Detect disconnect, show banner: "CLI disconnected — relaunch?"
   - Offer to relaunch CLI window or switch to standalone mode

2. **CLI crashes** — Same as #1 but unintentional
   - Launcher could auto-relaunch after brief delay

3. **Port already in use** — Another process on 3848
   - Check before launching CLI, fail with clear message

4. **User wants standalone** — `npm start -- --standalone`
   - Bypasses CLI launch, uses subprocess model
   - All existing behavior preserved

5. **CLI already running without --ui-server** — Port 3848 not listening
   - Launcher detects this, offers to launch a second CLI instance with --ui-server
   - Or falls back to standalone

## Testing Plan

### Basic
1. Fresh start: `npm start` → CLI window opens, portal connects, send messages both ways
2. Pre-running CLI: start `copilot --ui-server --port 3848` manually, then `npm start` → portal connects
3. Standalone: `npm start -- --standalone` → old behavior, no CLI window
4. Close CLI window while portal is running → portal shows disconnect, relaunch works
5. Send message from portal → visible in CLI TUI immediately
6. Send message from CLI → visible in portal immediately (no polling delay)

### Critical (test early)
7. **Approval routing with shared session:**
   - Portal has session resumed, CLI TUI has same session in foreground
   - Send message from CLI that triggers a tool approval
   - Verify: does CLI TUI get the approval prompt? Or does portal intercept it?
   - Test reverse: portal sends message, tool needs approval — does portal rules engine handle it?
   - Test with portal approveAll ON: does it auto-approve CLI-initiated turns? (it shouldn't)
   - Test with portal always-allow rules: do they only apply to portal turns?

8. **Permission handler conflict:**
   - Both CLI and portal have same session resumed
   - Trigger approval from both sides simultaneously
   - Verify no deadlocks or double-approval

9. **User input (ask_user) routing:**
   - Same shared-session setup as test 7
   - Send message from CLI that triggers ask_user → does CLI TUI get the prompt?
   - Send message from portal that triggers ask_user → does portal get the prompt?
   - Verify the non-initiating client sees the "waiting for input" banner, not the prompt itself
   - Test with choices and freeform variants

## Tradeoffs

| | Standalone (current) | Shared CLI server |
|---|---|---|
| **Sync** | One-directional (CLI→Portal via polling) | Full bidirectional |
| **Startup** | Portal works alone | CLI must be running first |
| **Independence** | Portal can run without CLI open | Portal depends on CLI process |
| **Sessions** | Can create sessions independently | Shares CLI's session list |
| **Crash isolation** | CLI crash doesn't kill portal | CLI crash disconnects portal |
| **Orphan tools** | Common (separate processes) | Rare (single process) |
| **Complexity** | Sync poller + orphan repair | Simple connection |

## Test Results (2026-03-23)

### Approval Routing — VALIDATED ✅

| Scenario | Portal handler called? | CLI TUI shows prompt? | Tool runs? |
|----------|----------------------|----------------------|-----------|
| Portal sends, tool needs approval | ✅ Yes — approves | ❌ No | ✅ Yes |
| CLI sends, tool auto-approved (trusted/yolo) | ❌ No | ❌ No | ✅ Yes |
| CLI sends, tool needs approval | ✅ Yes — denied in test | ✅ Yes | ❌ Denied (portal won race) |

**Key findings:**
- For CLI-initiated turns, BOTH the CLI TUI and portal handler receive the approval request
- Whichever responds first wins — the SDK takes the first response
- If portal denies while CLI prompt is still showing: tool is denied, CLI shows error
  `"Unhandled permission result kind: [object Object]"`
- For portal-initiated turns, only the portal handler is called — CLI TUI just shows conversation
- **DANGER: Portal yolo mode auto-approves CLI-initiated tools before CLI can show prompt**
  CLI TUI shows stale/confusing approval prompt after tool already ran

**Yolo interaction matrix:**

| Case | CLI | Portal | CLI turn | Portal turn |
|------|-----|--------|----------|-------------|
| 1 | yolo | ask | CLI auto-approves, portal not called | Portal prompts user |
| 2 | ask | yolo | ⚠️ Portal wins race, bypasses CLI prompt | Portal auto-approves |
| 3 | ask | ask | Both prompted, race condition ⚠️ | Portal prompts user |
| 4 | yolo | yolo | CLI auto-approves, portal not called | Portal auto-approves |

**Design rule for v1:** Portal must NOT respond to permission requests for CLI-initiated turns.
Use `isPortalTurn` flag — if false, let the callback hang so CLI TUI handles it.
This makes all four cases safe regardless of yolo settings on either side.

### Trust Prompt
- On first session, CLI prompts about trusting the CWD
- This happens BEFORE tool approvals and blocks the CLI TUI
- Portal's handler still works independently while trust prompt is pending
- Launcher should consider passing trusted folder or documenting this

### Firewall
- Windows prompts for a firewall rule when CLI opens the listening port
- If denied, only localhost connections work (sufficient for portal)
- Should document in setup instructions

## Phase 2: Cross-Device Approval (future)

Allow users to respond to CLI-initiated approval prompts from the portal UI
(e.g. approve a tool from your phone while away from the CLI terminal).

**How it would work:**
1. Tool approval requested → both CLI TUI and portal show the prompt
2. User approves on either side → that handler responds first, SDK accepts it
3. Other side sees `permission.completed` event → dismisses its prompt

**Why deferred:**
- Race condition risk if both respond simultaneously
- SDK shows `"Unhandled permission result kind"` error on the losing side
- May be better handled by future CLI/SDK versions (--ui-server is still
  undocumented, suggesting active development)

## Version Monitoring Note

`--ui-server` is a hidden flag (`.hideHelp()`) present since v0.0.407. Since it's
undocumented, it may be under active development. Future CLI versions could:
- Add proper multi-client approval coordination
- Change the callback routing behavior
- Add new events for cross-client communication
- Formalize the protocol and document it

**Recommendation:** When the updater detects a new CLI version, log the version
change prominently. Consider maintaining a compatibility test suite that runs
against new versions to detect behavioral changes early.
