# Copilot Portal — Architecture

A mobile-friendly web portal for GitHub Copilot CLI sessions. Connects to running Copilot sessions via the `@github/copilot-sdk` IPC layer and exposes them over WebSocket so any browser (phone, tablet, PC) can participate.

---

## Overview

```
CLI (copilot.exe)
    │  IPC (named pipe / SDK)
    ▼
PortalServer (Node.js)          ← src/server.ts
    │  WebSocket (ws://)
    ▼
Browser (React SPA)             ← webui/src/App.tsx
```

One `PortalServer` process manages multiple Copilot sessions simultaneously via `SessionPool`. Each browser connection attaches as a listener on a `SessionHandle`, which fans events out to all connected clients watching that session.

---

## Key Files

| File | Purpose |
|------|---------|
| `src/server.ts` | HTTP + WebSocket server, auth token, session routing, WS message dispatch |
| `src/session.ts` | `SessionHandle` (wraps one CopilotSession, fans events to N listeners), `SessionPool` (manages pool under one CopilotClient) |
| `src/rules.ts` | `RulesStore` — per-session always-allow approval rules, persisted to `data/rules/{sessionId}.json` |
| `webui/src/App.tsx` | React SPA — all UI state, WebSocket management, event rendering |
| `esbuild.cjs` | Server build script (bundles `src/` → `dist/server.js`) |
| `data/` | Runtime data: `session-shields.json`, `rules/{sessionId}.json`, `token.txt` |
| `debug/` | Auth token, connection info, server logs |

---

## Build & Run

```bash
# Build server
node esbuild.cjs

# Build UI
cd webui && npx vite build

# Start (serves UI + WebSocket on same port)
node dist/server.js
```

Server URL is printed with a QR code on startup. Token is persisted in `debug/token.txt`.

---

## SessionHandle

Central abstraction. One per active Copilot session.

**Responsibilities:**
- Wraps a `CopilotSession` from the SDK
- Broadcasts SDK events to all registered WebSocket listeners
- Buffers active turn state (thinking/streaming/reasoning) for late-joining clients
- Queues approval requests (one shown at a time, sequenced)
- Handles CLI→Portal sync via `modifiedTime` polling

**Key fields:**
```
listeners          Set<fn>        — active WS clients watching this session
pendingApprovals   Map<id, {...}>  — queued permission requests + their promises
activeApprovalId   string|null    — which approval is currently shown to clients
isTurnActive       bool           — true from send() until session.idle
lastSyncedCount    number         — filtered message count at last sync
lastKnownModTime   Date|null      — used to detect CLI activity
```

**CLI→Portal sync flow:**
1. `pollForChanges()` runs every 2s (only when listeners > 0 and no active turn)
2. Fetches `modifiedTime` from `listSessions()` — if newer than `lastKnownModTime`, CLI sent a message
3. `reconnectFromCli()`: disconnects old IPC, opens fresh `resumeSession()` (new cursor = sees all messages), calls `syncMessages()` to broadcast new messages as `sync` events
4. After turn completes (`session.idle`), re-seeds `lastKnownModTime` to prevent spurious reconnects

**Guards that prevent reconnect:**
- `isTurnActive` — set at start of `send()`, cleared on `session.idle`
- `pendingApprovals.size > 0` — never disconnect while approvals are in flight
- `isReconnecting` — prevents concurrent reconnects

---

## Approval Flow

```
SDK fires onPermissionRequest()
    → handlePermissionRequest()
        → check RulesStore.matchesRequest() → auto-approve if rule exists
        → add to pendingApprovals Map
        → broadcastNextApproval() → sends approval_request to ONE client at a time

Client clicks Allow / Deny / Allow Always
    → WS message: approval_response | approval_response_always
    → resolveApproval() → resolve the Promise → SDK proceeds
    → if Allow Always: addRule() → sweeps remaining queue for matches → auto-resolves any
    → broadcastNextApproval() → next queued approval shown automatically
```

---

## WS Protocol

### Server → Client events

| type | fields | description |
|------|--------|-------------|
| `session_switched` | `sessionId`, `context` | Confirmed session + cwd/git info |
| `history_start` / `history_end` | — | Wraps history replay on connect |
| `sync` | `role`, `content` | CLI-originated message synced to portal |
| `thinking` | `content` | Turn started / intent label |
| `intent` | `content` | Agent's stated intent |
| `delta` | `content` | Streaming assistant text |
| `reasoning_delta` | `content` | Streaming reasoning/thinking text |
| `idle` | — | Turn complete |
| `tool_start` | `toolCallId`, `toolName`, `mcpServerName` | Tool invocation started |
| `tool_complete` | `toolCallId` | Tool finished |
| `tool_call` | `toolCallId`, `content` | Partial tool output |
| `approval_request` | `requestId`, `approval` | Permission request (one at a time) |
| `approval_resolved` | `requestId` | Approval resolved — dismiss UI |
| `input_request` | `requestId`, `inputRequest` | User input needed |
| `rules_list` | `rules` | Current always-allow rules for this session |
| `model_changed` | `model` | Active model changed |
| `error` | `content` | Session error |

### Client → Server messages

| type | fields | description |
|------|--------|-------------|
| `prompt` | `content` | Send a message |
| `stop` | — | Abort current turn |
| `set_model` | `content` | Change model |
| `approval_response` | `requestId`, `approved` | Allow / Deny once |
| `approval_response_always` | `requestId`, `kind`, `pattern` | Allow + save rule |
| `rule_delete` | `ruleId` | Remove a rule |
| `rules_clear` | — | Remove all rules for this session |
| `input_response` | `requestId`, `answer`, `wasFreeform` | Answer user input prompt |

---

## Always-Allow Rules

Persisted per session in `data/rules/{sessionId}.json`.

**Pattern computation** (from `RulesStore.computePattern()`):

| Kind | Pattern | Example |
|------|---------|---------|
| `shell` | `{base command} *` | `ping *` |
| `read` / `write` | exact path | `/src/session.ts` |
| `mcp` | `{server}/{tool}` | `filesystem/read_file` |
| `url` | hostname | `api.github.com` |
| other | tool name | `custom-tool` |

Pattern matching uses prefix matching for shell (command starts with base), exact match for others.

> **Backlog:** Revisit pattern proposals — smarter wildcards, directory-level matching, user-editable patterns.

---

## Portal Features

- **Multi-client:** Multiple browsers can connect to the same session simultaneously. Approval resolved by any client is dismissed on all others.
- **Session shield:** Prevents accidental deletion of important sessions.
- **CLI↔Portal sync:** Messages sent from the CLI appear in the portal within ~2s.
- **Disconnect safety:** Locking phone (portal disconnect) doesn't abort active turns or pending approvals.
- **Approval queuing:** Multiple simultaneous approvals are shown one at a time; "Allow Always" creates a persisted rule and auto-resolves matching queued approvals.
- **Model switching:** Change active model per-session from the portal.

---

## Known Limitations / Backlog

- CLI doesn't see messages sent from the portal (IPC cursor limitation — portal turns only visible on the portal's own connection)
- History cap not implemented — long sessions load all messages on connect (tracked: `history-pagination` todo)
- Approval pattern proposals are simple; smarter matching planned (tracked: `approval-pattern-revisit` todo)
- Session rename not yet implemented
- Arrow-up prompt history not yet implemented
