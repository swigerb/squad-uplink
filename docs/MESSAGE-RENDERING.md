# Copilot Portal — Message Rendering Model

A shared vocabulary for the entities that appear in the chat/message area, and how
they flow into one another during a turn. This is the reference we use when discussing
chat behavior (streaming, `ask_user`, reconnect/resync, reposition fixes, etc.).

All of these live in the single React component `webui/src/App.tsx`. Line numbers are
approximate anchors (the file evolves) — the **component/state names** and **driving
events** are the stable identifiers.

---

## Glossary (at a glance)

| Entity | What it is | Driven by | Key visual signature |
|--------|-----------|-----------|----------------------|
| **User Message** | `Message` with `role: 'user'` (committed) | local send + `sync role:user` ACK | Right-aligned, `--primary` fill, radius `18 18 2 18` (sharp bottom-right), single Copy button |
| **Queued User Message** | Pre-ACK variant of a User Message | local send while a turn is active | Same bubble, `opacity: 0.5` + `pulse` animation, pinned to bottom, `• queued` |
| **Assistant Message** (final) | `Message` `role: 'assistant'`, `intermediate` falsy | `message_end` / `idle` commit | Left-aligned, `--surface` fill + border, radius `18 18 18 2` (sharp bottom-left), **two** Copy buttons |
| **Intermediate Message** | `Message` `role: 'assistant'`, `intermediate: true` | `message_end` with tools following | No bubble: dashed left+bottom border, square corners, `opacity 0.75` — the "note to self" |
| **Streaming Message** | Transient live preview (not in `messages`) | `delta` events → `streamingRef` | Assistant-like bubble, **no** Copy buttons, `live` label top-right, **stream caret** bottom-left |
| **Stream Caret** | The pulsing blue square inside a Streaming Message | `isStreaming && streamingContent` | `--primary` square, `blink 1s` animation |
| **Thinking Indicator** | The three muted dots + label | `thinking` / `report_intent` / `tool_start` | Three `--text-muted` dots (`thinking 1.2s`), italic label ("Thinking…", intent, "Running <tool>…") |
| **Tool Event Box** | Live per-tool card (`ToolEventBox`) | `tool_start` / `tool_complete` | Colored box: **yellow** running, **green** done, **red** failed |
| **Tool Summary** | Collapsed "N tools ran" `<details>` | tool group collapse → `msg.toolSummary` | Disclosure folded into an Assistant/Intermediate Message |
| **Reasoning / "Thought"** | Model chain-of-thought | `reasoning_delta` → `msg.reasoning` | Collapsed `<details>` labeled "Thought" (brain icon) folded into a Message |

---

## The messages array vs. transient render state

Two categories, and the distinction matters for reconnect/resync behavior:

- **Committed entities** live in the `messages: Message[]` array — the durable, ordered,
  reload-surviving record. User Message, Assistant Message, Intermediate Message. Their
  attached metadata (**Tool Summary**, **Reasoning/Thought**) rides on the `Message`.
- **Transient entities** are live scratch state, cleared and rebuilt on every (re)connect:
  - **Streaming Message** — `streamingRef.current` / `streamingContent` (+ `isStreaming`).
  - **Thinking Indicator** — `isThinking` / `thinkingText`.
  - **Tool Event Box** — the `toolEvents: ToolEvent[]` array.

Rendering is a **pure timestamp sort** of committed messages + live tool events
(App.tsx ~5470), with **queued** User Messages pinned to the bottom (they haven't been
"heard" yet).

---

## Lifecycle of a turn

```
user sends ─► User Message committed (or Queued until sync ACK)
              │
              ▼
        Thinking Indicator (turn starting)
              │
   ┌──────────┴───────────────────────────────────────────────┐
   │  agent streams text                                        │
   │     delta ──► Streaming Message (live preview + caret)     │
   │     reasoning_delta ──► live Thought buffer                │
   │                                                            │
   │  message_end ──► commit Streaming buffer to a real Message │
   │     • tools follow  ─► Intermediate Message                │
   │     • final reply   ─► buffered (pendingMsgRef) for idle   │
   │                                                            │
   │  tool_start ──► Tool Event Box (yellow)                    │
   │  tool_complete ──► box turns green/red                     │
   │     ...2s flash, then collapse ─► Tool Summary on Message  │
   │                                                            │
   │  (loop: more deltas → new Streaming Message → ...)         │
   └────────────────────────────────────────────────────────────┘
              │
              ▼
        idle ──► commit final Assistant Message
                 (attach trailing Tool Summary + Reasoning)
                 clear Thinking Indicator + transient state
```

### Key transitions

1. **Streaming Message → committed Message.** Deltas accumulate in `streamingRef`. On
   `message_end`, the buffer is committed as a real `Message` and the live preview
   vanishes. If tools follow, it's an **Intermediate Message**; if it's the final reply,
   it's buffered in `pendingMsgRef` until `idle` (so the trailing Tool Summary can attach).

2. **Tool Event Box → Tool Summary.** A live colored box lives in `toolEvents`. When its
   tool group finishes, a 2s green flash plays, then `buildToolSummary()` folds the boxes
   into the owning `Message` as `msg.toolSummary` and removes them from `toolEvents`.
   Live/standalone → collapsed/attached.

3. **Reasoning → "Thought".** `reasoning_delta` accumulates in `reasoningRef`; on
   `message_end`/`idle` it's committed onto the `Message` as `msg.reasoning` and rendered
   as the collapsed "Thought" `<details>`. Only reasoning-capable models emit it.

---

## Attached metadata (folded into a Message)

**Tool Summary** and **Reasoning/Thought** are not standalone entities — they're
collapsible `<details>` sections folded **into** an Assistant or Intermediate Message:

- **Thought** (`msg.reasoning`) — the model's internal reasoning that preceded the message.
- **Tool Summary** (`msg.toolSummary`) — the tools that message dispatched.

Both survive reload because they're stored on the durable `Message`.

---

## Tool Event Box states

The same `ToolEventBox` (App.tsx ~512) renders different colors from `tc.type` + `tc.content`:

| State | Condition | Colors |
|-------|-----------|--------|
| **Running** (yellow) | `tool_start` | `--tool-call` / `--tool-call-tint` |
| **Completed** (green) | `tool_complete`, content `success`/`done` | `--success` / `--success-tint` |
| **Failed** (red) | `tool_complete`, error result | `--error` / `--error-tint` |
| Ran-but-nonzero | `tool_complete`, content `done` (`isUnsuccessful`) | green-ish, flagged |

A box may also carry an **intention line** (purple ● + italic) — the `report_intent`
summary for that tool.

---

## Reconnect / resync notes

Because transient state is cleared on every `history_start` and rebuilt, mid-turn
resyncs (foreground return, phone-lock, `{type:"resync"}`) are the source of several
subtle bugs:

- **User Message reposition** — a resync must not restamp an already-committed User
  Message to "now" (it would jump down next to the final message). Only a still-**queued**
  bubble is repositioned to its ACK point.
- **Final message drop** — a completed final message buffered in `pendingMsgRef` is
  carried across `history_start` (`carriedFinalRef`) so a mid-turn resync can't discard it
  before the server history has persisted it. History adoption also refuses to shrink to a
  lagging snapshot while the server reports the turn is still active.
- **`ask_user` mid-stream** — `user_input.requested` can arrive *before* `message_end`, so
  `streamingRef` still holds uncommitted deltas when the picker mounts. The `input_request`
  handler flushes that buffer to a committed Assistant Message first (marked
  `intermediate: false` to match the history rebuild's `followedByAskUser` rule), so the
  answer lands *below* the preamble and the continued stream starts a fresh box. Guarded by
  `flushedInputReqRef` so probe re-broadcasts of the same request don't re-flush.

See `src/session.ts` `getActiveTurnEvents()` (active-turn catch-up for late joiners) and
the `history_end` reconnect-adoption logic in `App.tsx`.

---

## See also

- `docs/ARCHITECTURE.md` — system architecture (server, WS protocol, SessionHandle).
- `docs/APPROVAL_FLOW_ANALYSIS.md` — tool approval flow.
- `webui/src/App.tsx` — all rendering logic.
- `src/session.ts` — server-side event fan-out, history build, active-turn replay.
