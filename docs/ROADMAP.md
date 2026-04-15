# Copilot Portal — Roadmap

## Planned Features

### 1. ~~Shared CLI Server Mode~~ ✅ (v0.3.0)
Portal connects to a headless CLI server (`--server` mode) by default.

### 2. CLI Server Auto-Recovery
When the CLI server crashes mid-session, the portal should automatically
relaunch it and reconnect — not just show an error.

**Current behavior:** Portal detects "Connection closed" on next send,
attempts reconnect, fails (CLI is dead), shows error to user.

**Proposed behavior:**
- Portal detects connection failure
- Checks if CLI server port is alive
- If dead: relaunch CLI server (same startup logic)
- Wait for port, reconnect session, retry the send
- Only show error if relaunch also fails

**Design considerations:**
- Move CLI launch logic from launcher.ts into a shared utility
- Retry limit to prevent crash loops
- Relaunched CLI reads sessions from disk (may need warm-up time)
- Multiple clients could trigger relaunch simultaneously — need a lock
- Consider a health-check interval as a complement (detect crash proactively)

### 3. Session Context (custom instructions per session)
Reusable context bundles that can be applied when creating a new session.
Avoids re-coaching the model on domain-specific knowledge each time.

**Use case examples:**
- "CRM & ADO" — instructions for accessing CRM records, ADO work items, auth patterns
- "Copilot Portal Dev" — packaging steps, architecture notes, conventions
- Start a new session → set context → model is immediately productive

**Implementation approach:**
- Stored as markdown files in `data/contexts/`
- UI: when creating a session, optionally pick a context from a list
- Passed to SDK via `systemMessage: { mode: 'append', content: ... }` on `createSession()`
- UI to create/edit/delete contexts (simple markdown editor or file upload)
- Complements CLI's `.copilot-instructions.md` per-repo system
  — repo instructions handle project context, session contexts handle task/domain context

**Open questions:**
- Can contexts be stacked? (e.g. "CRM" + "ADO" together)
- Should contexts be visible/editable in the session drawer after creation?
- Size limits? Large contexts eat into the model's context window

### 4. Admin Controls UI
Expose Update, Restart, and other management actions in the portal UI.
Currently only accessible via update banner or browser console.

- Settings/admin panel or gear icon
- Restart button, update controls, version info
- Possibly token management (see multi-token below)

### 5. Multi-Token
Primary token + scoped tokens with session-level access control.

- Design doc: [multi-token-plan.md](multi-token-plan.md)
- Primary token has full access
- Scoped tokens can be limited to specific sessions
- UI for token management in the admin panel

### 6. Working Directory Selection
CWD handling for new sessions — currently defaults to where server started.

- Sandbox approach vs user-selected directory
- Trust prompt handling when changing CWD mid-session
- Consider default workspace directory separate from portal source

### 7. Portal Self-Update
Check GitHub releases for new portal versions (deferred until published).

- Would complement the existing SDK/CLI update system
- Download + replace + restart flow

## Rendering Improvements (lower priority)

### Per-Message Tool Summaries (future enhancement)
Currently all tools from a turn are summarized on the final message. A better
approach would attach tools to the message that dispatched them:

- `assistant.message` events include `toolRequests` with `toolCallId` for each tool
- Empty messages (no text, only `toolRequests`) could render as tool-summary-only rows
- Each intermediate message would show its own tools below it
- Would require: forwarding `toolRequests` to client, per-message summary tracking,
  matching `tool.execution_complete` to parent message via `toolCallId`
- Currently we filter empty messages — they could instead become the tool summary host

### Other rendering items

1. **`intermediate` flag inconsistency** — live turns auto-detect via buffering;
   history uses backend flag; sync never sets it
2. **Sync messages lack metadata** — no toolSummary, no reasoning, no bytes
3. **Tool events are ephemeral** — lost after turn completes; only `toolSummary`
   on final message preserves them
4. **Extract ws.onmessage into reducer/dispatcher** — testability and maintainability
5. **`elicitation.requested/completed`** — SDK form prompts (no portal response API yet)
