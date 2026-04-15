# Copilot Remote vs Copilot Portal

Comparison of [Copilot Remote](https://github.com/kubestellar/copilot-remote) and Copilot Portal — both provide web access to Copilot CLI, but through fundamentally different rendering approaches.

## What Is Copilot Remote?

Copilot Remote is a **web terminal relay** for Copilot CLI and Claude Code. It streams the raw terminal output (the same TUI you see in your terminal) into xterm.js in a browser. You see exactly what the CLI renders — colors, diffs, layouts — in tiled web terminals. It adds a task queue for dispatching work to multiple agents.

Think of it as: **your Copilot terminal, mirrored to a browser with multi-agent management.**

## What Is Copilot Portal?

Portal is a **purpose-built web UI** that renders Copilot's responses as formatted HTML — markdown, syntax-highlighted code, collapsible tool summaries, structured approval cards. It's not a terminal mirror; it's a different interface for the same agent.

Think of it as: **a mobile-first chat app designed specifically for Copilot.**

## The Core Difference

This is the fundamental distinction:

- **Copilot Remote** shows the **terminal TUI** in a browser (xterm.js rendering raw PTY output)
- **Portal** renders **structured events** from the SDK as HTML (markdown, tool cards, approvals)

Same Copilot agent underneath, completely different presentation. The terminal approach preserves fidelity; the HTML approach provides a richer mobile experience.

## Feature Comparison

| Feature | Copilot Remote | Portal |
|---|---|---|
| **Primary interface** | Web terminals (xterm.js) | Chat UI (React) |
| **Chat UI** | Basic — markdown bubbles, input box (7KB) | Rich — tool summaries, reasoning, approval cards |
| **Terminal** | Full xterm.js terminals, tiled grid | No terminal — chat only |
| **AI agents** | Copilot CLI + Claude Code | Copilot CLI only |
| **Protocol** | ACP streaming (direct) | SDK JSON-RPC (via copilot-sdk) |
| **Multi-agent** | Yes — tiled terminals, side-by-side | No — one session at a time |
| **Task queue** | Job queue with auto-dispatch to idle agents | None |
| **Recurring tasks** | Scheduled tasks on intervals | None |
| **Swarm mode** | Invite links for team task queuing | Single user only |
| **Session discovery** | Auto-discovers tmux + filesystem sessions | SDK session list |
| **Session management** | Start, resume, rename, tag, delete, purge | Create, switch, shield, delete |
| **Approval management** | N/A (handled in terminal) | Allow/Deny/Always with patterns |
| **Guides & Prompts** | None | Full guide system, import from gists |
| **Model switching** | At session start | In-session dropdown |
| **Token tracking** | None visible | Per-session input/output/reasoning |
| **Remote access** | LAN only (no tunnel built-in) | DevTunnel with `[t]` toggle |
| **Security reset** | N/A | `[T]` — rotate token, destroy tunnel |
| **PWA** | Yes | Yes |
| **Image support** | Drag images into terminals | None |
| **UI framework** | React + GitHub Primer | React + Tailwind |
| **Open source** | MIT | MIT |

## Architecture

### Copilot Remote
```
Browser (React PWA + xterm.js)
  ↕ WebSocket + REST
Node.js Server
  ↕ ACP streaming (copilot --acp) + node-pty + tmux
Copilot CLI / Claude Code (multiple instances)
```

### Portal
```
Browser (React PWA)
  ↕ WebSocket
Portal Server (Node.js)
  ↕ SDK JSON-RPC (@github/copilot-sdk)
Copilot CLI (single headless instance)
```

## Key Differences

### Scope
- **Copilot Remote** is a multi-agent dashboard. Run multiple Copilot and Claude Code sessions, tile them on screen, queue up tasks that auto-dispatch to idle agents.
- **Portal** is a single-session tool. One Copilot session at a time, with depth features (guides, approvals, tokens) rather than breadth.

### Protocol
- **Copilot Remote** uses ACP directly — spawns `copilot --acp` processes and manages the raw protocol. This gives terminal-level control.
- **Portal** uses the SDK — `@github/copilot-sdk` manages the connection. This provides higher-level abstractions but less raw control.

### Terminal vs Chat
- **Copilot Remote** is terminal-first. Their `TerminalView` component is the project's center of gravity, with significant engineering in xterm.js scroll stabilization, PTY flow control, and tile rendering. They also have a chat view with markdown message bubbles, but the terminal experience is the primary interface.
- **Portal** is chat-only. No terminal emulation. The UI renders structured SDK events as HTML — markdown with syntax highlighting, collapsible tool summaries, formatted approval cards, reasoning sections, prompt tray.

### Multi-Agent
- **Copilot Remote** is designed for running multiple agents simultaneously. The task queue auto-dispatches work. Swarm mode lets teammates add tasks.
- **Portal** manages multiple sessions but you interact with one at a time. No task queue, no auto-dispatch.

### Remote Access
- **Portal** has DevTunnel built in — press `[t]` for HTTPS remote access from anywhere.
- **Copilot Remote** is LAN-only. You'd need to add your own tunnel (Tailscale, DevTunnel, etc.).

### Copilot-Specific Features
- **Portal** has features that Copilot Remote doesn't: Allow Always approval rules, guides & prompts system, gist import, per-session token tracking, security reset.
- **Copilot Remote** has features Portal doesn't: Claude Code support, tiled terminals, task queue, recurring tasks, swarm mode, image drag-and-drop.

## Copilot Remote Strengths

1. **Multi-agent** — tile multiple AI agents, dispatch tasks automatically.
2. **Task queue** — add work items that auto-dispatch to idle agents.
3. **Claude Code support** — not just Copilot.
4. **Terminal + chat** — both interfaces available.
5. **ACP streaming** — uses the modern, officially supported protocol.
6. **Swarm mode** — team collaboration via invite links.

## Portal Strengths

1. **Approval management** — Allow Always rules with pattern matching. Huge for productivity.
2. **Guides & Prompts** — reusable context system, import from gists, prompt tray.
3. **DevTunnel built-in** — one keypress for remote access from anywhere.
4. **Token tracking** — per-session usage stats with copy button.
5. **Security reset** — `[T]` to nuke everything and start fresh.
6. **Simpler setup** — unzip and run vs cloning a repo and configuring.

## When to Use Which

| Scenario | Use |
|---|---|
| Running multiple AI agents simultaneously | **Copilot Remote** |
| Dispatching tasks to idle agents automatically | **Copilot Remote** |
| Using both Copilot and Claude Code | **Copilot Remote** |
| Want terminal + chat side by side | **Copilot Remote** |
| Team collaboration on tasks | **Copilot Remote** |
| Need approval rules (Allow Always) | **Portal** |
| Domain-specific guided workflows | **Portal** |
| Remote access from anywhere (tunnel) | **Portal** |
| Quick mobile check-in on a coding session | **Portal** |
| Tracking token usage per session | **Portal** |
| Simple setup, single Copilot user | **Portal** |

## Could They Work Together?

Interesting question. They use different connection methods (ACP vs SDK), so they'd connect to separate CLI instances. But conceptually, a developer could use Copilot Remote for multi-agent orchestration and Portal for deep single-session work with guides and approval rules.

## Summary

Copilot Remote covers **more breadth** — multiple agents, task queues, tiled terminals, Claude Code support. Portal is **more specialized** — approval rules, guides, token tracking, built-in tunnel, security controls. Copilot Remote is well suited for managing multiple AI agents simultaneously. Portal is well suited for developers who want a polished mobile experience for focused Copilot sessions with domain-specific guidance.
