# Termote vs Copilot Portal

Comparison of [Termote](https://github.com/lamngockhuong/termote) and Copilot Portal — both provide remote terminal access from mobile, but with different approaches.

## What Is Termote?

Termote (Terminal + Remote) is a **tmux-based remote terminal** built with Go and React. It wraps any CLI tool in a web-accessible terminal using ttyd and tmux, with a PWA frontend designed for mobile. You get a real terminal in your browser with gesture controls, virtual keyboard, and session management.

Think of it as: **tmux in your browser, optimized for phones.**

## Key Difference

Like cli-tunnel, Termote mirrors the raw terminal. Portal provides a purpose-built chat UI. But Termote adds tmux-powered session persistence — sessions survive disconnects and server restarts, which neither Portal nor cli-tunnel do natively.

## Feature Comparison

| Feature | Termote | Portal |
|---|---|---|
| **What you see** | Raw terminal (ttyd + xterm.js) | Rich markdown, tool cards, approvals |
| **Works with** | Any CLI (via tmux) | GitHub Copilot CLI only |
| **Session persistence** | tmux — survives disconnects, server restarts | WebSocket — reconnects but no terminal replay |
| **Multiple sessions** | tmux sessions with tabs, create/edit/delete | Session picker with shield/delete |
| **Mobile input** | Virtual keyboard toolbar, gesture controls (swipe for Ctrl+C, Tab) | Chat-style message box, prompt tray |
| **Remote access** | Tailscale HTTPS, LAN, localhost | DevTunnel, LAN QR code |
| **Auth** | Basic auth with brute-force protection | Token-based |
| **Deployment** | Docker, native, one-liner install | Unzip + run script |
| **Backend** | Go server + ttyd | Node.js server + Copilot SDK |
| **Approval management** | N/A (manual in terminal) | Allow/Deny/Always with patterns |
| **Guides & Prompts** | None | Full guide system, import from gists |
| **PWA** | Yes — offline-capable | Yes |
| **Security** | AES-256 encrypted config, rate limiting | CSP, HSTS, token rotation |
| **Platform** | macOS, Linux, Windows (experimental) | Windows, macOS, Linux |
| **Open source** | MIT | MIT |

## Termote Strengths

1. **Session persistence via tmux** — sessions survive everything. Disconnect, sleep, restart — tmux keeps it alive.
2. **Gesture controls** — swipe for Ctrl+C, Tab, history navigation. Purpose-built for phone terminal use.
3. **Tailscale integration** — automatic HTTPS via Tailscale without DevTunnel overhead.
4. **Docker deployment** — `docker run` and done. Container mode isolates everything.
5. **Universal** — any CLI tool, not just Copilot.

## Portal Strengths

1. **Rich Copilot UI** — markdown rendering, tool summaries, reasoning display.
2. **Approval management** — Allow Always rules that persist per-session.
3. **Guides & Prompts** — reusable guide system, import from gists.
4. **Token tracking** — per-session input/output/reasoning token counts.
5. **Designed for chat** — message box with prompt tray is better than typing commands in a phone terminal.

## When to Use Which

| Scenario | Use |
|---|---|
| Need persistent terminal sessions that survive disconnects | **Termote** |
| Want Copilot-specific UI with approvals and guides | **Portal** |
| Using Copilot + other CLI tools, want one interface | **Termote** |
| Want gesture controls for terminal on phone | **Termote** |
| Docker/container deployment | **Termote** |
| Approving many Copilot tool actions from phone | **Portal** |
| Domain-specific guided Copilot workflows | **Portal** |

## Summary

Termote is a polished **remote tmux client** — persistent sessions, gesture controls, Docker deployment. Portal is a **Copilot-specific chat UI** — formatted output, approval rules, guides. Termote is the better choice for general terminal access. Portal is better for Copilot-specific workflows where approval management and guides matter.
