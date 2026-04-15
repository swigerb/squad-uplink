# 🚀 Squad Uplink

### A portal for GitHub Copilot CLI with Squad intelligence

![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933) ![React 19](https://img.shields.io/badge/React-19-61DAFB) ![Vite](https://img.shields.io/badge/Vite-6-646CFF) ![Tailwind 4](https://img.shields.io/badge/Tailwind-4-38BDF8) ![License MIT](https://img.shields.io/badge/License-MIT-green)

---

## What is Squad Uplink?

Squad Uplink is a browser-based portal for GitHub Copilot CLI. Instead of being tied to a single terminal window, you can interact with your Copilot CLI sessions from any browser — phone, tablet, or a second monitor — all in real time over WebSocket.

The project is built on [copilot-portal](https://github.com/shannonfritz/copilot-portal) by Shannon Fritz. Shannon's architecture does the hard work: a Node.js server bridges the `@github/copilot-sdk` IPC layer to a React SPA over WebSocket, handling multi-client fan-out, approval queuing, model switching, and CLI↔Portal sync. Squad Uplink extends that foundation with Squad-specific capabilities — reading `.squad/` files, surfacing team context, and providing hooks for orchestration visibility.

The portal ships with a retro theme system. The Pip-Boy theme is live; more are on the way. Because command-line tools deserve a little personality.

---

## 🏗️ Architecture

```
Browser (React SPA)
    │  WebSocket (ws://)
    ▼
PortalServer (Node.js)        ← src/server.ts
    │  IPC / @github/copilot-sdk
    ▼
Copilot CLI (copilot.exe)
```

One `PortalServer` manages multiple Copilot sessions simultaneously. Each browser connection attaches as a listener on a `SessionHandle`, which fans events to all connected clients watching that session.

**Server:** Node.js + TypeScript, bundled with esbuild → `dist/server.js`

**Web UI:** React 19 + Vite 6 + Tailwind 4, built to `webui/dist/`

**Squad integration:** `.squad/` file API — reads `team.md`, `decisions.md`, and agent charters at runtime

| Layer | Technology |
|-------|-----------|
| Server runtime | Node.js 22+ |
| Server language | TypeScript 5 |
| SDK bridge | `@github/copilot-sdk` |
| WebSocket | `ws` |
| UI framework | React 19 |
| UI build | Vite 6 |
| UI styling | Tailwind CSS 4 |

---

## Getting Started

### Prerequisites

- **Node.js 22.5+** — [Download](https://nodejs.org/)
- **GitHub Copilot CLI** — must be installed and authenticated

### Install

```bash
git clone https://github.com/swigerb/squad-uplink.git
cd squad-uplink
npm install
cd webui && npm install && cd ..
```

### Build

```bash
# Build everything (server + UI)
npm run build

# Or build separately
npm run build:ext   # server only
npm run build:ui    # web UI only
```

### Run

```bash
# Start the portal (launches CLI window + portal server)
npm start
```

The server prints a URL and QR code on startup. Open the URL in any browser on your network.

**Dev mode** (server watches for changes, UI served by Vite dev server):

```bash
# Terminal 1 — watch server
npm run dev

# Terminal 2 — Vite dev server for UI
npm run watch:ui
```

---

## Squad Features

Squad Uplink reads your repo's `.squad/` directory and surfaces team context in the portal:

- **Team roster** — parsed from `.squad/team.md`, shows agent names, roles, and status
- **Decision log** — sourced from `.squad/decisions.md`; decisions visible without leaving the portal
- **Agent charters** — individual charter files under `.squad/agents/{name}/charter.md`
- **Orchestration visibility** — the portal is aware of which agents are active and what they're working on

The `.squad/` integration is read-only and additive — nothing in the portal writes back to Squad files.

---

## Themes 🎨

Squad Uplink includes a retro terminal theme system. The **Pip-Boy** theme is currently live — that Fallout Vault-Tec amber glow on deep black. More themes are coming (Apple IIe green phosphor, Commodore 64 blue, and others).

Themes are applied to the React SPA via Tailwind utility classes and CSS custom properties.

---

## Credits & Attribution

Squad Uplink is built on [copilot-portal](https://github.com/shannonfritz/copilot-portal) by **Shannon Fritz** ([@shannonfritz](https://github.com/shannonfritz)). The core architecture — WebSocket server, session management, approval flow, CLI↔Portal sync, and the React SPA — comes from Shannon's work. This repo extends it with Squad-specific features.

---

## 🤖 Built with Squad

This project is developed by an AI team managed by [Squad](https://github.com/bradygaster/squad) — a Git-native AI agent orchestration framework. The team (Jobs, Woz, Kare, Hertzfeld, Scribe, Ralph) lives in `.squad/` and coordinates through this repo.

---

## 📜 License

MIT License — same as the upstream [copilot-portal](https://github.com/shannonfritz/copilot-portal). See [LICENSE](LICENSE) for details.

---

<div align="center">

**Squad Uplink** — A portal for GitHub Copilot CLI with Squad intelligence

</div>
