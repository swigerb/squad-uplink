# Copilot Portal Development

This is the copilot-portal project — a mobile-friendly web portal for GitHub Copilot CLI sessions.

## Quick Reference

- **Build:** `npm run build` (esbuild for server, vite for UI)
- **Server-only build:** `node esbuild.cjs --production`
- **Package release:** `npm run package` (creates zip in releases/)
- **Start server:** `npm start` (runs launcher which starts CLI server + portal)
- **Create GitHub release:** `gh release create vX.Y.Z releases/copilot-portal-vX.Y.Z-build-*.zip --title "vX.Y.Z"`

## Read These Docs

Before making changes, read the relevant docs in `docs/`:
- `ARCHITECTURE.md` — system overview
- `ROADMAP.md` — planned features and priorities
- `CODE_REVIEW.md` — known issues and deferred fixes
- `PACKAGING.md` — how releases are built and distributed
- `cli-server-mode.md` — how the CLI server connection works
- `compare-uplink.md` — comparison with uplink project
- `compare-cli-remote.md` — comparison with GitHub's /remote feature
- `compare-openclaw.md` — comparison with OpenClaw platform
- `acp-protocol.md` — ACP protocol reference and migration path
- `dev-tunnels.md` — remote access via Microsoft Dev Tunnels
- `guides-prompts-redesign.md` — guides & prompts feature spec

## Key Files

| File | What it does |
|------|-------------|
| `src/server.ts` | HTTP + WebSocket server, all API endpoints (guides, prompts, examples, sessions, updates) |
| `src/session.ts` | Session management, SDK event handling, approval/input queuing, reconnect logic |
| `src/launcher.ts` | Process launcher, CLI server detection/startup, restart support (exit code 75) |
| `src/main.ts` | Entry point, console key commands ([c] CLI, [l] launch, [q] QR, [u] update, [r] restart, [x] exit) |
| `src/updater.ts` | SDK package updates (npm registry) + portal self-update (GitHub Releases API) |
| `src/rules.ts` | Per-session approval rules ("Allow Always" patterns) |
| `webui/src/App.tsx` | Entire React UI (~2900 lines, single file) |
| `webui/src/styles.css` | CSS with semantic color variables, scrollbar styles |
| `package.mjs` | Release packaging script (bump BUILD, build, stage, zip) |
| `start-portal.cmd` | User entry point (Windows) — installs deps, checks prereqs, starts server |
| `start-portal.sh` | User entry point (macOS/Linux) |

## Directory Structure

```
src/                  Server TypeScript source
webui/src/            React UI source
dist/                 Compiled output (server + UI)
examples/
  guides/             Read-only example guides (shipped with updates)
  prompts/            Read-only example prompts (shipped with updates)
data/                 User runtime data (gitignored)
  guides/             User's working guide files
  prompts/            User's working prompt files
  rules/              Per-session approval rules
  token.txt           Auth token
  session-prompts.json  Per-session loaded prompts
docs/                 Design docs, specs, research
releases/             Packaged zip files (gitignored)
patches/              SDK compatibility patches (if needed)
```

## Conventions

- Commit messages: include `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`
- Use ASCII only in .cmd files (no em dashes, special chars)
- Use `pwsh` not `powershell` for PowerShell 7 commands
- Full build: `npm run build` (server + UI)
- Test by restarting the server and hard-refreshing the portal (Ctrl+Shift+R)
- The BUILD file stores `YYMMDD-NN` format, auto-incremented by package.mjs
- Don't push to GitHub until changes are tested and ready

## Architecture Summary

```
Browser (React SPA)
  ↕ WebSocket (portal events)
Portal Server (Node.js, port 3847)
  ↕ JSON-RPC via @github/copilot-sdk
Copilot CLI (copilot --server --port 3848)
```

1. Launcher finds/starts `copilot` CLI in server mode on port 3848
2. Portal server connects via SDK (`CopilotClient({ cliUrl })`)
3. Browser clients connect via WebSocket (port 3847)
4. Events flow bidirectionally: CLI ↔ SDK ↔ Portal ↔ WebSocket ↔ Browser

## Key Features

- **Guides & Prompts** — reusable `.md` files with + New, edit, examples catalog
- **Canned Prompts** — per-session prompt tray with stacking, persistence, delete
- **Self-Update** — checks GitHub Releases, downloads zip, extracts in place, restart
- **Approval Management** — Allow/Deny/Always rules, queued display
- **Session Management** — create, switch, delete, shield, auto-naming
- **Tool Visibility** — intention summaries, tool cards, collapsed summaries
- **Console Keys** — [c] CLI, [l] browser, [q] QR, [u] update, [r] restart, [x] exit

## Current State

Check `docs/ROADMAP.md` for what's done and what's planned.
Run `git log --oneline -20` to see recent changes.
