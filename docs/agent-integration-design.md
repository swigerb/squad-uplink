# Agent Integration Design

## How Agents Work — Conceptual Overview

### The Session Model

A **session** owns the context: conversation history, working directory, tools, permissions, and model. The **agent** is the methodology layer on top — it defines *how* the session responds, not *what* it knows.

Think of the session as the office (desk, files, tools) and the agent as who's sitting at the desk. You can swap who's working, or call in a specialist, but the desk stays the same.

### Types of Customization

| Layer | Files | Auto-loaded? | Scope |
|-------|-------|-------------|-------|
| **Custom Instructions** | `AGENTS.md`, `.github/copilot-instructions.md` | Yes, from CWD | Shapes the default agent's behavior |
| **Custom Agents** | `.github/agents/*.agent.md`, `~/.copilot/agents/*.agent.md` | Discovered, not activated | Selectable personas with own instructions + tool restrictions |
| **Skills** | Directories of tools/prompts | Configured via `skillDirectories` | Reusable capabilities available to all agents |
| **MCP Servers** | `.mcp.json` | Discovered from CWD | External tool providers |

### Agent Lifecycle in a Session

1. **Session starts** → default Copilot agent is active. Custom instructions (`AGENTS.md`) are auto-loaded from CWD.
2. **Agents discovered** → `.agent.md` files found in CWD and `~/.copilot/agents/` are available but not active.
3. **User selects agent** → `agent.select('code-reviewer')` swaps the methodology. Same session, same history, different persona going forward.
4. **Agent delegates** → the active agent can spawn **subagents** via the `task` tool or `/fleet` for parallel work. Subagents are ephemeral — they run in a separate context, do their job, and return results.
5. **User deselects** → `agent.deselect()` returns to the default agent with all history intact.

### Subagents vs. Agent Selection

| | Selected Agent | Subagent |
|---|---|---|
| **Lifetime** | Persists until changed | One turn only |
| **Context** | Full session history | Snapshot of context |
| **Who decides** | User selects | Active agent spawns |
| **Effect** | Replaces the session's methodology | Temporary specialist for a task |
| **Examples** | "I'm doing code review" → select reviewer | "Review this and update docs" → spawns reviewer + docs-writer |

### Built-in vs. Custom Agents

The CLI has **built-in agent types** for the `task` tool:
- `explore` — lightweight research
- `task` — run commands, check results
- `code-review` — review code changes
- `general-purpose` — full capability

These are generic. **Custom agents** (`.agent.md` files) are project-specific — they know your codebase, conventions, and processes. A custom `release-manager.agent.md` for Portal would know the exact packaging steps, changelog format, and release process.

### How This Relates to Portal's Guides

Portal's Guides serve a similar purpose to custom instructions — they inject context into the session. The differences:

| | Guides | Agents |
|---|---|---|
| **Format** | Portal's `data/guides/` | `.agent.md` in repo or `~/.copilot/agents/` |
| **Portability** | Portal-only | Works in CLI, VS Code, any Copilot client |
| **Tool restrictions** | No | Yes — can limit which tools the agent uses |
| **Discovery** | Portal UI | CLI auto-discovers from CWD |
| **Selection** | Manual apply in Portal | `agent.select()` or CWD-based |

Guides are quick, session-scoped context. Agents are ecosystem-wide personas. Both are valuable — guides for ad-hoc context, agents for repeatable workflows.

### CWD is the Key

Most agent/skill/MCP discovery is CWD-based. Setting the right working directory at session creation unlocks:
- Auto-loaded instructions (`AGENTS.md`, `copilot-instructions.md`)
- Available custom agents (`.github/agents/`)
- MCP server discovery (`.mcp.json`)
- Squad state (`.squad/`)

Portal's folder browser and staged session creation (v0.5.10) make CWD selection deliberate, which is the prerequisite for all of this.

---

## Portal Integration Design

Support for Copilot CLI custom agents in the Portal UI.

## Background

Copilot CLI supports custom agents — `.agent.md` files in `.github/agents/` (repo), org-level, or `~/.copilot/agents/` (personal). Each agent is a specialized persona with defined tools, instructions, and behavior. Examples: Squad (multi-agent team), code reviewers, K8s assistants, explain-only agents.

The SDK provides full agent management:
- `session.agents.list()` — available custom agents
- `session.agents.getCurrent()` — active agent (or null = default)
- `session.agents.select({ name })` — switch agent
- `session.agents.deselect()` — back to default
- `session.agents.reload()` — refresh list

No slash commands or launcher flags needed.

## Design

### Agent Picker in Session Drawer

Add an agent selector below the model selector in the session drawer, following the same dropdown pattern.

**Components:**
- Dropdown showing: "Default" + all available custom agents
- Current agent highlighted
- Agent description shown when selected (from YAML frontmatter)
- "Default" option to deselect back to standard Copilot

**Behavior:**
- On drawer open: fetch agent list (`session.agents.list()`) and current (`session.agents.getCurrent()`)
- On selection: call `session.agents.select({ name })` or `session.agents.deselect()`
- Agent persists for the session (same as model selection)

### Drawer Handle Indicator

Show the active agent name in the drawer handle (the collapsible bar below the header) so it's always visible without opening the drawer.

**Layout:**
```
[session name or "untitled session"]
[agent-name] · session-id-prefix
```

Or if no custom agent is active, just show the session info as today.

**Considerations:**
- Keep it subtle — not every session uses a custom agent
- Only show when a non-default agent is active
- Truncate long agent names

### API Changes

#### Server

New endpoints (pass-through to SDK):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/agents` | GET | List available agents for the active session |
| `/api/agents/current` | GET | Get currently active agent |
| `/api/agents/select` | POST | Select an agent `{ name }` |
| `/api/agents/deselect` | POST | Deselect back to default |

#### WebSocket Events

New event type to broadcast agent changes:

```json
{ "type": "agent_changed", "agent": { "name": "explain", "description": "..." } | null }
```

### Session Pool Changes

Add methods to `SessionHandle` / `SessionPool`:

```typescript
async listAgents(): Promise<Array<{ name: string; description: string }>>
async getCurrentAgent(): Promise<{ name: string; description: string } | null>
async selectAgent(name: string): Promise<void>
async deselectAgent(): Promise<void>
```

### UI Changes

#### Session Drawer
- Agent dropdown below model selector
- Same styling as model picker (border, bg, label)
- Shows description text below dropdown when agent selected
- Label: "Agent" with current name

#### Drawer Handle
- When a custom agent is active: show agent name badge
- Styled as a small pill/label, e.g. `[explain]` before the session ID
- Not shown when using default agent

#### Session Picker (list)
- Optionally show agent name next to session name in the list
- Helps identify which sessions have specialized agents

## Example UX Flow

1. User opens session drawer
2. Sees "Agent: Default" dropdown
3. Clicks dropdown → sees: Default, explain, squad, k8s-assistant
4. Selects "explain"
5. Dropdown shows "Agent: explain"
6. Description appears: "Explains code, concepts, and errors in plain English with examples"
7. Drawer handle now shows: `[explain] · 90aa1943`
8. User closes drawer, sends a message — the explain agent responds
9. User can switch back to Default anytime

## Open Questions

1. **Should agent changes broadcast to other clients?** If multiple browser tabs are open, should they all see the agent change? Probably yes, same as model changes.

2. **Agent + Guide interaction:** If a guide is applied AND an agent is selected, which takes precedence? The agent's instructions are in the system prompt; the guide is applied as a file-read. They should layer — agent defines capabilities, guide adds domain context.

3. **Session creation with agent:** When creating a new session, should we offer agent selection? Or always start with Default and let users switch?

4. **Agent availability per session:** Agents are discovered from the filesystem at session creation time. If agents change on disk (new file added), should we auto-detect? The `reload()` method handles this.

5. **Drawer handle space:** The handle is already compact. Adding agent name + session ID might be tight on mobile. May need to show agent OR session ID, not both, based on screen width.

## Working Directory Dependency

Agents discover their `.agent.md` files relative to the session's working directory.

### SDK Behavior (verified April 2026)

- `SessionConfig.workingDirectory` — set CWD at session creation ✅
- `ResumeSessionConfig.workingDirectory` — **changes CWD on resume** ✅
  - This is NOT documented but empirically confirmed to work
  - The CLI's `/cwd` command does 5 internal operations (`process.chdir`, `updateOptions`,
    `updatePrimaryDirectory`, callback, `setRootPath`). `resumeSession` appears to handle
    this via a different code path but achieves the same effect.
- **Critical bug found:** `resumeSession()` without `workingDirectory` defaults to
  `process.cwd()`, silently resetting the session's CWD to Portal's install directory.
  Fixed by always passing the session's original CWD when resuming.
- `SessionMetadata.context.cwd` — reports the CWD but is NOT updated by `resumeSession`.
  Portal must track CWD overrides if changing mid-session.

### Current State (post-fix)

- **New sessions via Portal UI** — staged creation with CWD input in drawer
- **Resumed sessions** — original CWD preserved (passed explicitly to `resumeSession`)
- **Mid-session CWD change** — possible via `resumeSession({ workingDirectory })`,
  but metadata won't reflect it. Portal can track the override.
- **Shared mode** — CWD comes from where the CLI was started

### Implementation (done)

- `POST /api/sessions` accepts `{ workingDirectory }` for new sessions
- `SessionPool.create(cwd?)` passes CWD to SDK
- `_doConnect()` fetches session's CWD from metadata and passes to `resumeSession`
- Draft mode UI: "+ New" opens drawer with editable CWD, "Create Session" button
- `GET /api/sessions` includes `context` (cwd, git info) in response

## Implementation Order

1. Server endpoints (pass-through to SDK)
2. Session drawer dropdown (agent picker)
3. Drawer handle indicator
4. WebSocket broadcast on agent change
5. Session picker annotation (optional)

## Multi-Agent: /fleet and Squad

Copilot CLI has two approaches to multi-agent work. Portal doesn't need to specifically support either — both flow through standard session events.

### /fleet (built-in)

`/fleet` is Copilot CLI's native parallel execution command (April 2026). The orchestrator splits a task into independent subtasks, runs subagents in parallel, coordinates dependencies, and synthesizes results.

- **Ephemeral** — no persistent state between sessions
- **Built-in** — no install, just `/fleet <task>` in any session
- **Monitor** — `/tasks` shows subagent progress

### Squad (third-party agent)

[Squad](https://github.com/bradygaster/squad) is a custom agent (`--agent squad`) that provides persistent, named specialist teams. Unlike `/fleet`, Squad agents have identities, accumulated knowledge, and decision logs committed to git.

- **Persistent** — team state in `.squad/`, knowledge compounds across sessions
- **Installed** — `npm install -g @bradygaster/squad-cli && squad init`
- **Activated** — `copilot --agent squad` or via Portal's agent picker

### Portal Compatibility

Portal already handles subagent events from the SDK:
- `subagent.started` — shows subagent name in tool display
- `subagent.completed` — marks completion
- `subagent.failed` — shows failure

Both `/fleet` and Squad generate these events. No special Portal support is needed — once the agent picker is built, users can select Squad (or any custom agent) and the multi-agent output renders naturally in the chat UI.

**Squad specifically:** A user would install Squad CLI, run `squad init` in their repo, then in Portal select the "squad" agent from the picker. The Squad coordinator's output — team proposals, parallel agent work, decision logging — all flows through as normal Copilot responses and tool calls.

## Lessons from Squad Uplink

[Squad Uplink](https://github.com/swigerb/squad-uplink) is a fork of Portal that adds deep Squad integration. It was built on Portal's foundation by Brian Swiger, who added Squad-specific APIs, a team state panel, retro themes, and live file watching — all in about 12 hours. It validates Portal's architecture but highlights gaps that, if filled in Portal itself, would eliminate the need to fork.

### What Squad Uplink adds (and what Portal could generalize)

| Squad Uplink feature | What it does | Portal equivalent (to build) |
|---|---|---|
| **Auto-inject team context** | Injects team roster + decisions as first message in every session | **Startup guide** — auto-apply a guide when a session starts, optionally tied to the active agent |
| **Live .squad/ file watching** | `fs.watch()` on `.squad/`, broadcasts changes via WebSocket, panel auto-refreshes | **Workspace file watcher** — generalized file watching for guides, agents, or any workspace files |
| **Auto-generated prompts** | Parses agent charters into one-click prompts automatically | **Agent-to-prompts** — when an agent is selected, auto-generate prompts from its charter/instructions |
| **Squad panel** | Shows team roster, decisions log, .squad/ file browser | **Agent state tab** — show agent-related files in the session drawer or guides panel |
| **Retro themes** | 8 switchable terminal themes | Could add theme support, but not a priority |

### Priority for eliminating the need to fork

1. **Agent picker + CWD** — lets Squad users select the agent and discover `.squad/` files without forking
2. **Auto-apply guide on agent select** — replaces auto-inject by associating a guide with an agent
3. **Auto-generate prompts from agent** — replaces charter-to-prompt parsing by reading the agent's instructions
4. **File watching** (nice-to-have) — live updates when workspace files change externally

Items 1-3 would cover the core functionality that drove the fork. Item 4 is polish that benefits everyone, not just Squad users.

### Design principle

Rather than adding Squad-specific code, Portal should add **generalized features** that happen to serve Squad's use case. Auto-apply, file watching, and agent-to-prompts are useful for any custom agent — not just Squad.

## Relationship to Guides

### The Landscape

GitHub's `agents.md` is the native, first-class way to customize Copilot's behavior. It's more powerful than Guides in some ways (tool restrictions, persona enforcement, auto-discovery, IDE integration) but Guides offer capabilities agents don't have.

### Comparison

| | Agents (`.agent.md`) | Guides (Portal) |
|---|---|---|
| **Where they live** | `.github/agents/`, `~/.copilot/agents/` | `data/guides/`, importable from gists |
| **Integration level** | System prompt (deep, enforced) | File-read context (advisory) |
| **Tool control** | ✅ Specify available tools per agent | ❌ No tool restrictions |
| **Boundaries** | ✅ Enforced (never/ask-first/always) | Advisory (guidance, not enforced) |
| **Persona** | ✅ YAML frontmatter, auto-discovered | Informal, in markdown body |
| **IDE support** | VS Code + CLI + any Copilot client | Portal only |
| **Repo-scoped** | ✅ Committed in `.github/agents/`, shared with team | Local to Portal install (`data/`) |
| **Multiple specialists** | One active per session, switchable | Additive — multiple can be applied (stacked) |
| **Companion prompts** | ❌ None | ✅ Prompt tray with stacking |
| **Self-updating** | ❌ Static files | ✅ `[DISCOVER]`/`[ASK]` patterns |
| **In-UI editing** | ❌ Edit on disk | ✅ Full editor in Portal |
| **Import/sharing** | Commit the file to repo | ✅ Import from GitHub Gists |
| **Requires git repo** | ✅ Yes (for repo-scoped) | ❌ Works in any directory |

### How They Complement Each Other

**Agents define *what Copilot can do*** — tools, persona, boundaries. An agent says "I'm a test engineer, I can write to `tests/` but never touch `src/`, I use Jest."

**Guides add *domain knowledge and workflows*** — CRM field mappings, API patterns, business rules, self-updating context. A guide says "here's how our customer database works, here are the product IDs, here's how to look up a contact."

**Prompts provide *quick-start queries*** — canned questions and tasks that are useful regardless of which agent is active. Prompts are unique to Portal and have no agents.md equivalent.

### Stacking Behavior

Guides can be stacked — applying multiple guides merges their context. This is powerful but has ordering implications: later guides can override earlier ones. This is different from agents, where only one is active at a time.

A typical workflow might be:
1. **Select agent**: `@api-agent` (defines tools, persona, boundaries)
2. **Apply guide**: `crm-guide.md` (adds domain context about the CRM system)
3. **Load prompts**: `crm-prompts.md` (quick-start queries for common CRM tasks)

Each layer adds context without replacing the others.

### Portal's Role Going Forward

Portal should **embrace agents as the primary behavior customization** and position Guides as complementary:

- **Agent picker** in the session drawer — first-class access to the agents ecosystem
- **Guides** for domain context, self-updating workflows, and anything that needs Portal's editor/import features
- **Prompts** remain Portal-exclusive — quick-start queries for any agent or guide

The goal is not to recreate agents.md in Portal, but to make Portal the best place to *use* agents while adding value they don't provide (prompts, editing, import, token tracking, mobile access).

### Migration Consideration

Some existing Guides could be converted to agents.md for better native integration. A guide that primarily defines persona and boundaries ("always use TypeScript", "never modify production configs") would be better as an agent. A guide that provides domain data ("here are the CRM fields and their meanings") stays as a guide.

Portal could potentially offer a "convert to agent" feature that generates an `.agent.md` file from a guide — but this is future work.
