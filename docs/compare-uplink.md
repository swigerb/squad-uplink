# Uplink Comparison

Research notes from analyzing [MattKotsenas/uplink](https://github.com/MattKotsenas/uplink) — a project with similar goals to Copilot Portal but built on ACP instead of the SDK.

See also:
- [ACP Protocol](acp-protocol.md) — detailed protocol reference
- [Dev Tunnels](dev-tunnels.md) — remote access via Microsoft Dev Tunnels

## Architecture Comparison

### Copilot Portal (current)
```
React SPA (browser)
  ↕ WebSocket (custom portal events)
Portal Server (Node.js)
  ↕ Named Pipes / JSON-RPC (via @github/copilot-sdk)
Copilot CLI
```

### Uplink
```
Preact PWA (browser)
  ↕ WebSocket (raw JSON-RPC 2.0)
Bridge Server (Node.js, lightweight relay)
  ↕ stdio / NDJSON (raw ACP messages)
Copilot CLI (copilot --acp --stdio)
```

### Key Difference
Portal uses the **SDK as an abstraction layer** — the SDK manages sessions, events, permissions, and the connection to the CLI. Our server interprets SDK events and translates them to portal-specific WebSocket events.

Uplink uses a **minimal relay** — the bridge passes raw ACP messages between WebSocket and stdio. The PWA client does all the protocol work directly. Only 6 methods are intercepted server-side.

### Tradeoffs

| | Portal | Uplink |
|---|---|---|
| **Server complexity** | Rich — rules, guides, prompts, multi-client | Minimal — ~100 lines of relay |
| **Client complexity** | Moderate — server handles protocol details | High — client speaks raw ACP |
| **Multi-session** | ✅ Full session management | ❌ Single session per instance |
| **Features** | Guides, prompts, approval rules, self-update | PWA installable, DevTunnel remote access |
| **CLI coupling** | Tied to SDK package version | Protocol-version negotiated at runtime |
| **Remote access** | QR code (same network) | DevTunnels (anywhere) |

---

## Patterns Worth Adopting

### 1. Eager Initialization
Uplink sends `initialize` to the CLI immediately on bridge start, caching the response. When the browser connects seconds later, it gets an instant response. Portal's SDK `start()` is already eager, but we could pre-warm sessions.

### 2. Server-Side Session Buffer
If a client disconnects and reconnects to the same session, a ring buffer replays all missed messages instead of re-fetching from the CLI. Elegant reconnect resilience.

### 3. Message Router Pattern
Separate routing logic into a pure function that returns action objects. Makes routing testable without running a server.

### 4. Deterministic Tunnel Naming
`sha256(cwd).slice(0,8)` means the same project always gets the same tunnel URL. Installed PWAs survive restarts. See [Dev Tunnels](dev-tunnels.md).

### 5. Ring Buffer Debugging
Fixed-capacity event logs at key points (WebSocket in/out, stdio in/out). A `/debug` endpoint exports everything as JSON for post-hoc analysis without verbose logging in production.

---

## npm Publishing Approach

Uplink publishes as a scoped npm package:
```json
{
  "name": "@mattkotsenas/uplink",
  "bin": {"uplink": "./dist/bin/cli.js"},
  "files": ["dist/bin", "dist/client", "dist/src/server", "dist/src/shared"],
  "scripts": {
    "prepack": "npm run build"
  }
}
```

Key pieces:
- **`bin` field** — makes `npx @scope/package` work
- **`files` array** — controls what's published (only dist/, not src/)
- **`prepack` hook** — auto-builds before `npm pack` / `npm publish`
- **Scoped package** — `@scope/name` avoids name collisions

Portal currently uses zip releases + self-update from GitHub Releases instead. If we ever publish to npm, this is the pattern to follow.

---

## Summary

Uplink validates our approach (web portal for Copilot CLI) but takes a fundamentally different path — raw ACP vs SDK abstraction. The projects are complementary:

- **Portal** is richer: multi-session, guides, prompts, rules, approval management, self-update
- **Uplink** is simpler: dumb pipe, single-session, but remote-capable via DevTunnels and installable as a PWA

Key things to adopt: DevTunnel support for remote access, `--acp` flag migration for the launcher, and the eager initialization pattern.
