# Changelog

All notable changes to Copilot Portal are documented here.

## v0.5.0

### Guides & Prompts Redesign
- Catalog-based model: examples are read-only templates, user files live in `data/`
- Click a list item to open a detail view with Guide/Prompts tabs (no accidental apply)
- Apply and Edit buttons in the detail view
- Full-height editor with rename support (live filepath preview)
- \+ New flow: browse example catalog, preview content, choose which files to include, customize name
- Overwrite confirmation when a name conflicts with an existing item
- Unsaved changes guard: inline Discard/Keep Editing banner on navigation, tab switch, or backdrop click
- File path display with copy button; dimmed "(not created)" for missing files
- OS-consistent path separators

### Examples Overhaul
- Removed: my-dev-environment, system-explorer, common-prompts, choose-your-own-adventure
- Renamed: test-context → set-personality-quirks, 20-questions → play-20-questions
- New guides: storytime-bedtime-tales, storytime-pick-your-path, guide-builder
- New prompt sets: storytelling, trivia-and-research
- Added companion prompts for: portal-tour, copilot-portal-dev, set-personality-quirks, play-20-questions, storytime-bedtime-tales
- Portal tour fully rewritten for accuracy and first-impression quality
- Copilot Portal Dev guide updated with current architecture, all key files, directory structure

### Console Keys
- Rebound `[t]` to `[c]` for CLI Console (frees `[t]` for future tunnel support)

### Documentation
- Split `uplink-comparison.md` into three focused docs:
  - `uplink-comparison.md` — architecture comparison and patterns
  - `acp-protocol.md` — protocol reference, wire format, migration path
  - `dev-tunnels.md` — installation, usage, access control, integration plan

## v0.4.0

### Instructions
- Reusable reusable guides: drop `.md` files into `data/guides/`
- Top bar button with picker modal (tri-fold map icon)
- View guide content (eye icon), delete with confirmation (trash icon)
- Instructions applied via file-read prompt — Copilot reads the file natively
- Title from first line of `.md` used as session opener for better auto-naming
- Self-updating instructions: files can prompt user and write back answers
- Example instructions included:
  - Test Context, 20 Questions, Choose Your Own Adventure
  - My Preferences (self-updating), My Dev Environment (discover + ask)
  - Copilot Portal Dev (project briefing), System Explorer

### Per-Message Tool Summaries
- Tools collapse into summaries on the message that dispatched them
- Progressive collapse: each message's tools collapse when all complete
- Empty messages (tool-dispatch-only) render as summary-only rows
- Consistent rendering between live streaming and history replay

### Message Rendering
- Reasoning shown as collapsed "Thought" section inside message bubble
- Messages and tool events interleaved by timestamp (single timeline)
- ask_user questions show in chat with collapsed options summary
- ask_user excluded from tool summaries
- Freeform input preserved during probe re-broadcasts
- Message input hidden when ask_user prompt is active
- Skip button on ask_user prompts
- Error events clear all turn state (no stuck thinking indicator)

### CLI TUI Integration
- Console command `[t]` to open CLI TUI with session picker
- Switches from headless to --ui-server mode with confirmation
- Portal auto-reloads when CLI server mode changes
- Full bidirectional sync when in --ui-server mode

### Connection Reliability
- Auto-restart SDK client on idle connection drop
- Wait for CLI server port before reconnecting
- Create fresh CopilotClient on reconnect (preserves cliUrl config)
- Reduced auth failure retries (3 vs 5) to prevent self-blocking

### Security
- Rate limiting on failed auth: 15 attempts per 60s per IP
- Applied to both HTTP and WebSocket endpoints
- Failed attempts and blocks logged to console

### Code Quality
- 8 code review items fixed (CR-1 through CR-16)
- Path traversal hardened (resolve instead of normalize)
- Approval/input cleanup on disconnect
- Stale handle fix after reconnect
- Noisy delta events suppressed from console log
- Stale UI banner when server build changes

### Console & Startup
- `[u]` Update command, `[t]` CLI TUI launcher, `[l]` Launch browser
- Session labels truncated with ID prefix in CLI picker
- Improved start-portal.cmd with step numbers and descriptions
- Console title set to "Copilot Portal"

## v0.3.0

### Shared CLI Server Mode
- Portal now connects to a headless Copilot CLI server (`--server` mode) by default
- CLI launches automatically in the background — no extra terminal window
- Bidirectional sync: messages sent from portal or CLI are immediately visible to both
- `--standalone` flag available for fallback to the old subprocess model
- CLI server PID tracked and cleaned up on portal shutdown
- Graceful handling: CLI stays alive across portal restarts, killed on exit

### Startup & Console
- Single entry point: `start-portal.cmd` handles install, auth, and server launch
- PowerShell 7 check in installer with optional auto-install via winget
- Console key commands: `[q]` QR code, `[u]` URL, `[r]` Restart, `[x]` Exit
- Terminal tab title set to "Copilot Portal"
- Port conflict detection on startup
- Version and update status logged on startup

### Message Rendering Redesign
- Intermediate messages shown as full message bubbles with dashed border (was collapsed)
- Messages and tool events interleaved by timestamp (was separate blocks)
- Intermediate detection uses SDK `toolRequests` property (reliable, consistent live/history)
- ask_user questions show in chat with collapsed "📋 N options" summary
- ask_user excluded from tool summaries (represented by prompt UI instead)
- Empty assistant messages (tool-dispatch-only) filtered from rendering

### Update Management
- `npm install @latest` for updates (was `npm update` which couldn't cross semver boundaries)
- Skip build step on release packages (pre-built, no build script)
- Force restart banner after update apply (client-side override)

### Packaging & Releases
- Output directory renamed from `builds/` to `releases/`
- Daily build counter resets (BUILD file stores YYMMDD-NN format)
- CHANGELOG.md included in release zip
- Favicon (Copilot logo SVG)
- Fixed zip packaging to include all files (not just dist/)

### Documentation
- `docs/ROADMAP.md` — prioritized feature list
- `docs/cli-server-mode.md` — research, test results, implementation plan
- `docs/PACKAGING.md` — how to build and distribute releases

## v0.2.0

### Setup & Distribution
- Streamlined install: only Node.js required as a prerequisite
- SDK bundles the Copilot CLI binary — no separate `winget install` needed
- Install script handles npm install, SDK patching, and GitHub sign-in automatically
- `npm run package` creates versioned distributable zips (`copilot-portal-v0.2.0-build-YYMMDD-NN.zip`)
- Build versioning: `YYMMDD-NN` build number shown in portal title bar alongside semver

### Session Management
- Bidirectional CLI ↔ Portal sync: messages, tool events, and thinking state stay in sync
  when switching between CLI and portal on the same session
- Session picker with live session list, creation, and switching
- History pagination: default 50 messages with dynamic load-more (+150 / half / ALL)
- Persist approveAll (yolo) toggle per session alongside approval rules
- Custom model selection per session

### Approvals & Permissions
- Approval queuing: one approval at a time, auto-advance on resolve
- "Allow Always" rules with computed patterns (shell commands, file paths, MCP tools, URLs)
- Rules drawer: view, delete individual, or clear all; header button shows rule count
- Batch auto-resolve: "Allow Always" sweeps matching queued approvals

### ask_user Interactive Prompts
- Questions render as normal messages (not intermediate thought bubbles)
- Multiple-choice rendering with ●/○ indicators for selected/unselected options
- Collapsible "👉 Selected" header showing the user's answer
- Freeform text input support
- Full history reconstruction of ask_user interactions

### Tool Events
- Expandable tool call boxes with name, arguments, and result
- Tool summaries attached to completed messages (history and live)
- `report_intent` meta-tool filtered from summaries
- Persistent thinking indicator during tool execution gaps
- Failed tool styling (red border)

### Rendering & UI
- CSS variables for all colors (18 semantic variables)
- Markdown rendering with syntax-highlighted code blocks, tables, and lists
- Copy button on all messages (clipboard API + execCommand fallback for HTTP)
- KiB byte counter on completed messages
- Auto-grow textarea for multi-line input
- Notification banners for context events (truncation, compaction, snapshot rewind)
- Auto-scroll to notifications and new content

### Connection Reliability
- WebSocket heartbeat (ping/pong every 30s) to detect stale connections
- Immediate ping on page visibility/focus change — no more false "connected" state
- Auto-reconnect on disconnect with exponential backoff
- iOS Safari reconnect on visibility change and page show events
- Connection status indicator (green/amber/red dot) in header

### Security
- Token-based access control on all WebSocket and HTTP API endpoints
- Token generated on first run, persisted to `data/token.txt`
- QR code printed in terminal for easy mobile access

## v0.1.0

### Initial Release
- Standalone Node.js server bridging the GitHub Copilot SDK to a browser via WebSocket
- Mobile-friendly responsive web UI (React + Tailwind CSS)
- Real-time streaming of assistant responses
- Session history loading and display
- Basic approval flow for tool execution permissions
- QR code for local network access
- Originally derived from a VS Code extension prototype, rebuilt as a standalone server
