# cli-tunnel vs Copilot Portal

Comparison of [cli-tunnel](https://github.com/tamirdresher/cli-tunnel) and Copilot Portal — two ways to use Copilot CLI from your phone.

## What Is cli-tunnel?

cli-tunnel wraps **any** CLI app (not just Copilot) in a web-based terminal you can access from your phone. It streams raw terminal output via xterm.js and lets you type back into the session. Uses Microsoft DevTunnels for remote access.

```bash
npx cli-tunnel copilot --yolo
# QR code appears → scan from phone → full terminal on your phone
```

Think of it as: **your terminal, mirrored to your phone.**

## What Is Copilot Portal?

Portal is a **purpose-built web UI** for Copilot CLI. It renders Copilot's responses as formatted markdown, provides an approval flow, manages multiple sessions, and adds features like guides and prompts.

Think of it as: **a mobile app designed for Copilot, not a terminal mirror.**

## Key Difference

cli-tunnel shows you the **raw terminal** — exactly what you'd see on your desktop, character for character. Portal gives you a **rich web interface** designed for the specific things Copilot does.

This is the fundamental tradeoff: terminal fidelity vs purpose-built UX.

## Feature Comparison

| Feature | cli-tunnel | Portal |
|---|---|---|
| **What you see** | Raw terminal (xterm.js) | Rich markdown, tool cards, approvals |
| **Works with** | Any CLI app (copilot, vim, htop, python, ssh...) | GitHub Copilot CLI only |
| **Input** | Keyboard input to terminal (key bar on mobile) | Chat-style message box |
| **Remote access** | DevTunnel (built-in, always on) | DevTunnel (opt-in via `[t]` key) |
| **Sessions** | One per cli-tunnel instance | Multi-session picker, create/switch/delete |
| **Approvals** | Approve in terminal (y/n) | Rich approval cards with Allow/Deny/Always |
| **Approval rules** | None (manual each time) | Allow Always with pattern matching |
| **Guides & Prompts** | None | Full guide system, import from gists |
| **Hub mode** | Dashboard of all active cli-tunnel sessions | Session picker with shield/delete |
| **Grid view** | Multiple terminals in tiles/tmux/focus layouts | N/A — one session at a time in chat view |
| **Recording** | Record terminal as .webm video | None |
| **Model switching** | Via CLI commands in terminal | In-session dropdown picker |
| **Token tracking** | None | Per-session input/output/reasoning tokens |
| **PWA** | Yes (installable) | Yes (installable) |
| **Security** | Ticket-based WS auth, audit logging, CSP, HSTS | Token auth, CSP, HSTS, rate limiting |
| **Self-update** | Via npm (`npx cli-tunnel@latest`) | Built-in self-update from GitHub Releases |
| **Setup** | `npx cli-tunnel copilot` (zero install) | Unzip + `start-portal.cmd` |
| **Open source** | MIT | MIT |

## Architecture

### cli-tunnel
```
Phone (xterm.js in browser)
  ↕ WebSocket (raw PTY bytes)
cli-tunnel server (Node.js + node-pty)
  ↕ PTY (pseudo-terminal)
copilot --yolo (or any CLI app)
```

### Portal
```
Phone (React SPA / PWA)
  ↕ WebSocket (structured events)
Portal Server (Node.js)
  ↕ SDK JSON-RPC
Copilot CLI (headless)
```

## cli-tunnel Strengths

1. **Universal** — works with ANY CLI app, not just Copilot. Run vim, htop, python, k9s, ssh — anything.
2. **Zero install** — `npx cli-tunnel copilot` and you're done. No server to set up.
3. **Terminal fidelity** — see exactly what the terminal shows, including colors, TUI layouts, diffs.
4. **Hub + Grid** — monitor multiple cli-tunnel sessions simultaneously in a browser dashboard.
5. **Recording** — capture terminal sessions as .webm video.
6. **Replay buffer** — reconnect and see recent terminal output instantly (256KB rolling buffer).
7. **Audit logging** — all remote keyboard input logged with timestamps and source addresses.

## Portal Strengths

1. **Rich UI** — markdown rendering, collapsible tool summaries, reasoning display, syntax highlighting.
2. **Approval management** — Allow Always rules with patterns, persistent per-session.
3. **Guides & Prompts** — reusable markdown guides that shape Copilot's behavior, canned prompts, import from gists.
4. **Session management** — create, switch, shield, delete multiple sessions from one UI.
5. **Token tracking** — see input/output/reasoning token counts per session.
6. **Model switching** — change models mid-session from the UI.
7. **Designed for mobile** — chat-style input, large buttons, prompt tray. Terminal UIs on a phone are painful.

## When to Use Which

| Scenario | Use |
|---|---|
| Quick Copilot session from phone, zero setup | **cli-tunnel** |
| Long-running Copilot session with multiple approvals | **Portal** (Allow Always rules) |
| Using Copilot for a specific domain (CRM, dev workflow) | **Portal** (guides) |
| Running non-Copilot CLI tools remotely | **cli-tunnel** (it's universal) |
| Want to see exact terminal output (diffs, TUI) | **cli-tunnel** |
| Want formatted markdown and tool summaries | **Portal** |
| Monitoring multiple CLI sessions at once | **cli-tunnel** (hub + grid) |
| Managing multiple Copilot sessions | **Portal** (session picker) |
| Need to approve many tool actions efficiently | **Portal** (Allow Always) |
| Want canned prompts for common tasks | **Portal** |

## Could They Work Together?

Yes — and it's a natural combination:

1. **cli-tunnel for the terminal, Portal for the chat.** Start Copilot with both cli-tunnel and Portal connected to the same CLI server. Use Portal for the rich chat experience and cli-tunnel when you need to see raw terminal output.

2. **cli-tunnel for non-Copilot tools.** Use Portal for Copilot sessions and cli-tunnel for other CLI tools (monitoring, ssh, etc.) — they serve different purposes.

## Summary

cli-tunnel and Portal take opposite approaches to the same problem:

- **cli-tunnel** says: "mirror the terminal to your phone, works with everything"
- **Portal** says: "build a better interface specifically for Copilot"

cli-tunnel is more versatile (any CLI app). Portal is more polished for Copilot specifically (guides, approvals, tokens, sessions). Neither replaces the other — they're complementary tools for different needs.

For Copilot-specific work, Portal provides a better mobile experience. For general CLI remote access, cli-tunnel is the better choice.
