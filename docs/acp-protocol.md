# ACP (Agent Client Protocol)

Reference for the Agent Client Protocol as it relates to Copilot Portal.

See also:
- [Uplink Comparison](compare-uplink.md) — how uplink uses ACP as a raw pipe
- [Dev Tunnels](dev-tunnels.md) — remote access for ACP or portal connections

## What Is ACP?

ACP is an **open standard** for communication between AI agents and clients. Originally developed by JetBrains and Zed, it defines how a client sends prompts to an agent and receives streaming responses, tool calls, and permission requests.

- **Wire format:** JSON-RPC 2.0 over NDJSON (newline-delimited JSON)
- **Transport:** stdio (child process) or TCP socket
- **Copilot CLI support:** `copilot --acp --stdio` or `copilot --acp --port N`

## Wire Format

Each message is a single JSON object terminated by `\n`. Requests have an `id`; notifications don't.

```
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}\n
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{...}}}\n
← {"jsonrpc":"2.0","method":"session/update","params":{...}}\n
```

- **Requests** (have `id`) — expect a response with the same `id`
- **Notifications** (no `id`) — fire-and-forget, no response expected
- **Errors** — response with `error` field instead of `result`: `{"jsonrpc":"2.0","id":1,"error":{"code":-32600,"message":"..."}}`

## Key Methods

### Client → Agent (requests)

| Method | Purpose | Key Params |
|---|---|---|
| `initialize` | Negotiate protocol version and capabilities | `protocolVersion`, `clientCapabilities` |
| `session/new` | Create a new session | `workingDirectory`, `modelId` |
| `session/load` | Resume an existing session | `sessionId` |
| `session/prompt` | Send a user message | `sessionId`, `prompt` (text content) |
| `session/cancel` | Cancel an in-flight turn | `sessionId` |

### Agent → Client (notifications)

| Method | Purpose | Key Params |
|---|---|---|
| `session/update` | Streaming content delivery | `sessionId`, `update` (see update types below) |
| `session/request_permission` | Ask user to approve a tool action | `sessionId`, `tool`, `action`, `description` |

### Session Update Types

The `session/update` notification carries different update types in its `update` field:

| `sessionUpdate` value | Meaning |
|---|---|
| `agent_message_chunk` | Streaming text chunk (partial response) |
| `agent_turn_complete` | Agent finished responding |
| `tool_call_start` | Agent wants to call a tool |
| `tool_call_complete` | Tool execution finished |
| `plan_entry` | Agent's plan/thinking step |
| `session_title` | Session auto-named itself |

## CLI Flags

| Flag | Transport | Status |
|---|---|---|
| `--acp --stdio` | stdin/stdout (child process) | ✅ Current, documented |
| `--acp --port N` | TCP socket | ✅ Current, documented |
| `--server --port N` | Legacy JSON-RPC server (pre-ACP) | ⚠️ Undocumented, still works |
| `--ui-server --port N` | TUI + legacy server | ⚠️ Undocumented, still works |
| `--headless` | Used internally by SDK | ⚙️ Internal |

## ACP vs SDK

Portal currently uses `@github/copilot-sdk` which manages the CLI connection internally. Here's how the two approaches compare:

| Aspect | ACP (direct) | SDK (abstraction) |
|---|---|---|
| **Transport** | stdio or TCP | Named pipes (platform-specific) |
| **Framing** | NDJSON (one JSON per line) | Binary framing in named pipes |
| **Connection** | `copilot --acp --stdio` or `--port N` | `new CopilotClient()` manages subprocess |
| **Session mgmt** | Raw JSON-RPC calls | High-level methods (`createSession`, `resumeSession`) |
| **Events** | Parse `session/update` notifications | Event callbacks via `session.on()` |
| **Permissions** | Handle `session/request_permission` RPC | `onPermissionRequest` callback |
| **Model switching** | Include `modelId` in session/prompt | SDK method |
| **Protocol evolution** | Capabilities negotiated in `initialize` | Tied to SDK package version |
| **Error handling** | JSON-RPC error codes | SDK throws typed exceptions |

### What the SDK Gives Us (That ACP Doesn't)

The SDK handles several concerns that we'd need to reimplement if switching to raw ACP:

- **Session lifecycle** — create, resume, list, delete, compact, orphan repair
- **Model management** — list available models, switch models mid-session
- **Connection management** — subprocess lifecycle, reconnection, health checks
- **Event parsing** — typed event objects instead of raw JSON
- **Approval queuing** — SDK manages the request/response flow for permissions

## Portal's Migration Path

**Current state:** Portal uses SDK + `--server` (legacy flag).

**Decision: Not yet migrating to raw ACP.**

Reasons to wait:
- SDK provides high-level abstractions we use heavily
- Migrating means reimplementing session management, model switching, compaction
- The SDK may eventually use ACP internally, making the switch transparent

Reasons to consider it eventually:
- ACP is the **officially supported** protocol going forward
- `--server` is undocumented and could be removed
- ACP + TCP eliminates platform-specific named pipe complexity
- Version negotiation via `initialize` is more robust than SDK version pinning

**Immediate action:** Test `copilot --acp --port 3848` to see if the SDK can connect to it (the SDK might just work since it speaks JSON-RPC internally).

**Future action:** If/when the SDK wraps ACP, adopt it. If the SDK stalls, consider a thin ACP client library as a replacement.
