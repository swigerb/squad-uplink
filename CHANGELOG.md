# Changelog

All notable changes to Copilot Portal are documented here.

## v0.8.0

### 🖼️ Inline media
- **Tool-result images render inline** — any tool that returns an image (built-in `view`, MCP `view_image`, etc.) now shows it in the conversation, both live and after refresh/resume — no special handling per tool
- **Images are tied to the tool that made them** — each image renders in its own bubble with a provenance caption (e.g. `view — render.png`), and that tool is no longer double-listed in the collapsed "N tools ran" pill; five image tools now show as five captioned images instead of an empty "5 tools ran" above a stack of orphaned thumbnails
- **Survives reload** — images are persisted via a content-addressed `session.binary_asset` pipeline keyed on `mimeType`, so they reappear in the right timeline position on history replay
- **Lightbox with metadata** — click a thumbnail for a full-size view showing dimensions, type, and file size
- **Audio-ready seam** — the binary-asset pipeline already accepts `audio/*` for future inline audio

### 🔄 Update orchestration
- **Smoother self-update flow** — update detection/apply hardened across the updater, server, and UI
- **Semver-aware update checks** — the version comparator now follows semver precedence: a final `0.8.0` correctly outranks `0.8.0-rc.N` (so rc users are offered the stable release), and pre-release identifiers sort numerically (`rc.2` before `rc.10`)
- **Pre-release update channel** — pre-release builds track the pre-release channel (newer rc's *and* the eventual final), so an rc is never stranded; stable builds continue to track stable only. Running an rc ahead of the latest stable now logs a friendly "pre-release ahead of the latest stable" note
- **Container build fix** — Docker image build updated for `@github/copilot` 1.0.65's per-platform binary layout
- **Toolchain updates track the public npm `latest` tag** — the updater now reads `@github/copilot`/`@github/copilot-sdk` versions straight from the public npmjs `latest` dist-tag and installs from that same registry, so a local registry mirror that lags npmjs can no longer make the check offer a version the install then can't fetch (the `ETARGET` / "phantom newer version" failure). Copilot Portal itself is the one exception, keeping its GitHub-Releases latest/pre-release channel
- **Self-healing install** — after applying a toolchain update the updater verifies the on-disk version actually changed; if a wedged dependency tree left the files behind their lockfile (a silent npm no-op), it re-extracts the package and re-verifies, turning a silent non-upgrade into a guaranteed one

### 🔧 Stability
- **Reconnect no longer strands the "thinking" dot** — refreshing the browser mid-turn could leave the spinner spinning if a turn-completion event arrived during history replay; the server now stamps the authoritative turn state on `history_end` so the dot is force-cleared when no turn is actually running
- **Reconnect now shows turns that completed while you were away** — locking your phone while turns ran on another device left the reconnected client showing a stale view until a manual refresh/reselect; in long sessions the capped history replay was newer but *shorter* than the local view and got wrongly rejected. The client now adopts a replay whenever its tail differs (newer content), preserving any locally-queued messages
- **Foreground-return resync** — returning to a backgrounded tab now requests a lightweight resync (history + active turn + pending state) over the existing socket as defense-in-depth, with a hardened ping so a dead socket reconnects cleanly
- **`ask_user` prompts render special characters correctly** — interactive questions/choices showed literal JSON escapes (e.g. `Profile \u2192 Security` instead of `Profile → Security`); escapes are now decoded once at ingestion, fixing the live prompt, rebroadcast, and replayed history (handles arrows, em-dashes, and emoji)
- **`ask_user` mid-stream prompts render in order** — when the agent asked a question mid-stream (the input request arrives before the streaming message finishes), your answer appeared *above* a still-live streaming box and the agent's later text appended in place; the client now flushes the in-progress streaming message into a settled assistant message before mounting the picker, so the preamble, question, and answer render in the correct order — matching how the same turn looks after a reload
- **User message no longer jumps position** — a committed user bubble could momentarily reposition when its timestamp was restamped mid-turn; a `sync` for an already-committed user message is now a no-op, so the bubble stays put
- **Mid-turn resync no longer drops the final reply** — a focus/visibility resync while a turn was still active could drop an already-emitted final assistant message until the next reload; the client now carries the final message across the resync and re-attaches it, with an active-turn guard that disables the history-shrink path while a turn is running
- **CWD picker breadcrumb fixed on Linux/containers** — clicking a breadcrumb segment of an absolute POSIX path (e.g. `work` within `/work`) in the session-drawer CWD editor reported "Path does not exist" because the leading `/` was dropped, resolving the crumb relative to the server's own directory; POSIX absolute paths now keep their root so every breadcrumb navigates correctly (Windows drive roots were already handled, so desktop was unaffected)
- **Large sessions resume instead of crashing the CLI** — resuming a very long session could drive the Copilot CLI past Node's default ~4 GB heap and kill it with an out-of-memory error (surfacing on mobile as a black screen after the new-session modal briefly flashed); the CLI is now launched with an 8 GB heap at every spawn point, so big histories load rather than taking the server-side CLI down
- **Mobile recovery overlay** — if a session URL points at a CLI that's dead or hung (e.g. the OOM case above), the client no longer sits on a black screen: a stall detector surfaces a recovery overlay to get back to the session list and retry, instead of leaving you stranded when a phone over the tunnel is your only way in
- **Consecutive assistant messages no longer merge on reconnect** — reconnecting during a mid-turn pause (such as an `ask_user` prompt) could replay already-committed text as a live delta, so the next message's text concatenated onto it — merging two bubbles into one and misplacing the question between them; the streaming buffers are now cleared at each message boundary so a reconnect can't resurrect stale text

### 💅 UI polish
- **Composer Send/Stop redesigned for thumbs** — when a turn is running (or an `ask_user` prompt is waiting) *and* you've started typing a follow-up, Send and Stop split into a vertical stack — Stop on top, Send at the baseline — so the two live actions become separated, full-size 44px touch targets instead of a cramped diagonal overlap where a mis-aimed tap could kill the turn; when the composer is empty the compact overlap (Stop prominent) is retained, and the model is unified across normal turns and `ask_user`
- **Composer grows smoothly with the stack** — the composer and its text area grow upward to make room for the stacked buttons (the text area's floor rises to match, so there's no dead space above your cursor), and every transition animates rather than snapping
- **Composer layout & sizing polish** — a batch of composer refinements: clearing the text now correctly collapses the text area back down (it could stay stuck tall after the stack closed); a freshly-loaded session and a typed single line render at the exact same height (no post-keystroke shrink); the recall button appearing after history loads no longer nudges the attach button or the composer's top edge (its slot is reserved so it just fades in); and the attach / recall / clear buttons are unified to a single box size with the recall/clear glyphs aligned to the text-area baseline
- **Canceling a restart clears its notice** — declining the "force restart anyway?" prompt when a turn is in progress now dismisses the blue "Restarting…" bar instead of leaving it stuck at the bottom
- **Startup version inventory** — every boot now logs a single `[Versions]` line with the live, runtime-actual versions of Portal, the Copilot CLI, the SDK, Node, and the agent tools (`pwsh`, `uv`, `python`) — so the zip channel shows whatever it self-updated to and the container shows exactly its pins; it's the only version readout a container gets (the in-app updater is disabled there). The collector returns a structured object for reuse by a future Settings panel
- **Container images carry version labels** — the image is stamped with `com.copilot-portal.*` OCI labels (portal/cli/sdk/node/pwsh/uv), resolved from the lockfile at build time, so `docker inspect` answers "what's baked in?" without running the container
- **Update checks always say *which* version** — a manual `[u]`pdate check now prints the installed `[Version] <pkg> <ver> (package)` line on every check (not just the first), so "All packages up to date" is qualified by the actual versions rather than left implicit
- **`report_intent` is now logged** — the agent's intent line (the purple-circle summary above a running tool) is logged as `[Intent] report_intent: "…"` with a `(repeat)` tag, making it easy to confirm cadence and spot a genuinely stale vs. simply un-re-reported intent
- **Quieter console** — the high-frequency `tool.execution_partial_result`, `session.background_tasks_changed`, and `assistant.tool_call_delta` events are dropped from the generic `[Event]` log (the former is already bracketed by tool start/complete lines, the latter has no handler); meaningful `[Event]` lines are kept for turn-sequence triage
- **Tunnel health-check logs are timestamped** — the periodic tunnel health-check and auto-restart lines were the one runtime log path still printing without the `[hh:mm:ss AM]` prefix every other server line carries; they now match, so a tunnel restart can be correlated with the events around it
- **Recovery overlay logo sized correctly** — the "Still trying to open this session…" overlay rendered its portal logo at the browser's default SVG size (oversized and clipped on the right on narrow screens); it's now given an explicit, centered size that fits the card
- **Rename a session** — a pencil icon in the session list (between the shield and delete icons) turns the title into an inline edit field (Enter to save, Esc to cancel); the new name persists and *sticks* — the CLI's periodic auto-summary no longer overwrites a name you set. Disabled while a session is shielded, exactly like delete. Built on the SDK's new writable session-name API — the portal's first editable session title
- **Prompt panel scrolls instead of pushing the composer off-screen** — a tall `ask_user` prompt or approval request (long question + many choices) is now capped at 70% of the viewport and scrolls internally (themed scrollbar), so the message composer stays visible and reachable at the bottom, including on short/mobile viewports
- **`ask_user` text renders correctly** — the question now renders as proper markdown at normal weight (it was force-bolded, flattening real emphasis), and a double-encoding hop in connected/container mode that left literal `\n`/`\uXXXX`/`\\` escapes in the question, choices, and echoed answer is now reversed at the ingestion seam — real newlines, arrows, and Windows paths all render as intended

### 🆙 Toolchain & dependencies
- **Node 24** — the container image and CI now build on Node 24 (current Active LTS); the `engines` floor stays `>=22.5.0` so the zip still runs on host Node 22+
- **Copilot CLI 1.0.70** — bundled CLI bumped to 1.0.70 (latest stable; all per-platform binaries refreshed in the lockfile)
- **Copilot SDK 1.0.6** — `@github/copilot-sdk` bumped to 1.0.6
- **Container agent tools refreshed** — the image now bakes **PowerShell 7.6.3** (was 7.4.6) and **uv 0.11.28** (was 0.11.24), keeping the baked-in agent toolchain current with upstream stable releases
- **Zip dependency floors corrected** — the distributable `package.dist.json` now inherits its runtime dependency set wholesale from the dev `package.json` at package time (single source of truth), fixing a stale `@github/copilot-sdk ^0.3.0` floor and a missing CLI entry so a fresh zip install resolves the right versions

### 🧹 Maintenance & hardening
- **`ws` bumped to 8.21** — clears the one npm-audit "high" advisory (the affected memory-disclosure path was never reachable, but the bump keeps the tree clean)
- **Rename validation tightened** — `/api/guides/rename` now validates `oldId` with the same alphanumeric/dash/underscore guard already applied to `newId`
- **Dead code removed** — dropped the unused `/api/context-templates` endpoints (superseded by `/api/examples`), a dead local assignment, and an unused `useMemo` import; renamed a few mixed-case React setters for consistency; refreshed stale code comments

### 🐳 Docker Container (experimental)
- **Run Portal as a container** — `Dockerfile`, `docker-compose.yml`, and entrypoint to run the portal + bundled Copilot CLI on headless hosts (TrueNAS SCALE, Synology, any Docker engine)
- **Runs unprivileged, fixes volumes automatically** — the entrypoint starts as root, chowns the mounted data volumes to `568:568` (TrueNAS `apps` user) on first boot, then drops to that non-root user via `gosu`; override the target with `PUID`/`PGID`
- **Real readiness signal** — unauthenticated `/healthz` probe wired to a Docker `HEALTHCHECK`
- **Graceful shutdown** — `tini` as PID 1 forwards signals and reaps the CLI subprocess
- **Persistent `/work`** — per-session workspaces live on a bind-mounted host dir with a group-writable `UMASK` so a `/work` dataset is easy to share over SMB
- **Self-healing volumes** — freshly-mounted TrueNAS ixVolumes and host bind-mounts (which arrive empty and root-owned) are chowned automatically on boot, so a Custom App "just works" with no manual `chown`; a clear, actionable error appears only if the container is *forced* to run as a non-root user (which prevents the self-heal)
- **Agent can write group-owned files on ZFS/NFSv4 shares** — two-part fix so `group@`/named-group write ACLs are honored on ZFS-on-Linux (TrueNAS SMB datasets), where the primary gid alone isn't evaluated and only the process's *supplementary* groups count: (1) the runtime user is an explicit member of its own group in the image's `/etc/group`, and (2) the entrypoint drops privileges with `gosu` by **uid only** (not `uid:gid`) so `gosu` runs `initgroups()` and actually applies those memberships — the `uid:gid` form silently set the supplementary list to just the primary gid and discarded them. Previously the agent got `EACCES` writing group-owned files under `/work` even with the group-write bit set
- **`WORK_RW_GID` for a shared `/work`** — set this env var to your SMB read-write group's gid and the entrypoint adds the runtime user to that group before dropping privileges, so the agent and your human SMB users can edit each other's files; the `docs/DOCKER.md` `/work`-sharing guide is rewritten around this with a TrueNAS-native inheriting-NFSv4-ACL recipe (the old `chmod 2775`/`UMASK` setgid trick is documented as POSIX-only, since mode bits/umask are cosmetic on NFSv4 datasets), plus a Custom-User caveat and a faithful permission-check troubleshooting note
- **Self-updater disabled in containers** — updates come from pulling a new image, not mutating a running container
- **Slimmer image** — `@github/copilot` ships its native runtime as per-platform optional dependencies, so the container installs only the `linux-x64` binary it actually loads (no foreign-platform binaries bundled)
- **Persistent home + user-tool PATH** — the container's whole `~` persists on a single `copilot-home` volume (survives image updates and supports `chmod +x`), and `~/.local/bin` is on `PATH` so tools the agent installs with `pip install --user` or `uv tool install` are runnable by name and stick around
- **Agent knows the container's constraints** — the entrypoint installs a Portal-managed `~/.copilot/instructions/copilot-portal-container.instructions.md` so the agent is told it's non-root with no `sudo`/`apt`, that system Python is PEP 668 externally-managed (use `uv`, a venv, or `pip install --user`, not `--break-system-packages`), where to put downloaded static binaries (`~/.local/bin`), what persists across updates, and that `/work` may block `chmod +x` — without touching the user's own `copilot-instructions.md`
- **Agent tooling bundled** — `python3` (+`venv`/`pip`) and `uv`/`uvx`, plus `git`, `gh`, `wget`, `zip`/`unzip`, `xz-utils`, `patch`, `make`, `jq` (and `openssh-client`, `less`) are baked into the image so the agent can run Python and Python-based MCP servers, clone/commit/diff, use the GitHub CLI, and handle archives (including `.xz`/`.tar.xz`) out of the box; tools are added at image-build time since the non-root runtime user can't `apt install` at runtime. Use `uv`, a venv, or `pip install --user` for Python packages (system Python is PEP 668 externally-managed)
- **Example Guides & Prompts now ship in the image** — the read-only starter catalog behind "New → Start from an example" is copied into the container's final runtime stage; previously it lived only in the build stage, so a container offered just *Blank* and *Import* with no templates. It's an image-managed catalog (refreshed on each image pull) — your own created, edited, and imported Guides & Prompts are separate and untouched, persisting on the `portal-data` volume across updates

### 🔐 Authentication
- **Browser sign-in is now the primary path** — both desktop and container default to GitHub browser/device-code sign-in (WAM disabled), with the device-code URL pre-filled
- **Access Token tab** — paste a fine-grained PAT as an alternative to interactive sign-in
- **Logout button** — sign out of GitHub from the portal, with token-storage logging
- **Resilient first run** — the portal stays up when the CLI has no auth yet, guiding you through sign-in instead of crashing
- **Token persistence fix** — headless sign-in now reliably persists the token (`storeTokenPlaintext` set before login)

### 🔑 Portal Session Token (web access)
- **Web claim + paste flow** — first visit with no token offers a one-time "Generate session token" (copy it once); later visits prompt to paste the existing token — consistent across desktop and container
- **Remove from the UI** — clear the session token from the portal, plus a documented host-side reset if you forget it
- **No more self-bans** — a stale/wrong token no longer lets the client hammer the server into a rate-limit ban; it drops cleanly to the token screen
- **Survives server restarts** — a transient `401` during a portal-binary/container update no longer bounces you to the "token required" screen; the client corroborates with two checks ~1.2s apart against `/api/info` + `/api/portal-token/status` and keeps a still-valid token through the restart window, dropping to the token screen only when the token is genuinely rejected or the server is truly tokenless
- **Copy button fixed on plain-HTTP LAN** — falls back to `execCommand` when `navigator.clipboard` is unavailable, with a ✓ "Copied" confirmation
- **Polished claim screen** — the first-run setup and token screens now lead with the Copilot Portal logo, show the token on its own centered line (no wrapping), and open straight to the right screen with no flash of the main UI before the token check resolves

### 🛡️ Rate-limit Logging
- **Every blocked connection is logged** — plus a single `Banned`/`Ban lifted` line per lifecycle, so it's clear when an IP is refused and when its window expires

### 🗂️ Sessions & Workspaces
- **Per-session workspaces** — each new session gets its own `YYMMDD-NN` work folder; existing sessions retain their CWD
- **Immediate CWD display** — the allocated workspace path shows the moment a session is created
- **In-UI restart controls** — restart the Copilot CLI or the portal from the web UI

### 📱 QR Codes & URLs
- **Browser-derived in-portal QR** — the Sessions → QR view now shows the URL text and a QR built from the address that actually reached the portal (`window.location`), instead of an internal IP
- **Container-aware console** — the boot QR is suppressed in containers (where an internal IP is meaningless); the desktop console keeps its Direct + Tunnel URL/QR

### 🚀 Release Pipeline
- **CI builds everything from one tag** — pushing a `v*` tag builds the distributable zip, publishes the GitHub Release with notes from this changelog, and builds + pushes an `amd64` image to GHCR
- **Pre-release safe** — `-rc` tags publish as pre-releases, never move the image `:latest` pointer, and are excluded from the in-app updater (which reads `releases/latest`)
- **Drift-free build counter** — CI stamps the committed `BUILD` value as-is; the counter is advanced only by local validation builds

### 🔄 Reconnect resilience
- **Safe to disconnect mid-turn** — a turn that finishes while a client is disconnected (e.g. you lock your phone) now renders correctly on reconnect; the final assistant message is reconciled from server history by content, not just message count, so it no longer stays invisible until a manual refresh
- **No more stranded tool spinner** — reconnecting after a tool ran no longer leaves a "Running" tool card spinning forever above the history; live tool cards are cleared on each reconnect and a genuinely active turn re-streams its in-flight tools
- **Restart-then-send works without a refresh** — pressing `[r]` to restart the portal and immediately sending no longer hangs; a client that auto-reconnects in the brief window before auth re-confirms now waits for auth to settle instead of being stranded with a session-less connection
- **Buffered first send during a slow resume** — messages sent before a (potentially slow) session resume + MCP re-init finishes are queued and flushed once the session is ready, instead of being silently dropped

### 🛡️ Approval-rule hardening
- **Prefix shell rules can't be smuggled** — a `prefix *` approval rule (e.g. `git *`) now only auto-approves a single simple command; chained, piped, redirected, or command-substituted input falls back to the human approval gate instead of being silently approved
- **Session-id validation** — websocket and rules-store paths reject malformed session ids before they can reach the filesystem
- **Hardened token + host checks** — portal-token comparison is timing-safe and disallowed hosts/paths return `403`

### 🔧 Stability & diagnostics
- **Self-update no longer falsely fails** — the updater's command buffer was raised to 64 MB so a verbose `npm ci` + build no longer aborts with a max-buffer error and reports a successful update as failed
- **Clearer pool/MCP logs** — connection logs now show `Resuming <session> — connecting N MCP server(s): …` before the resume, and per-session `[Event]` lines are tagged with their session id so multi-session activity is easy to follow
- **Crash-surviving debug log** — the previous `server.log` is preserved as `server.log.prev` across a restart so a restart-triggered issue can still be diagnosed

## v0.7.5

### 💬 Chat & Queue
- **Unified message queue** — all user messages now flow through a single queue and release in order when a turn starts, fixing mid-turn ordering and timestamps
- **Queued indicator** — messages typed mid-turn show a "queued" state and pin to the bottom of the chat until they are sent
- **Second-client hang fixed** — prompts sent from a second connected client no longer stall before the turn starts

### 🗳️ ask_user Prompts
- **Click-to-send choices** — predefined options send immediately when clicked
- **Click-and-edit freeform** — when freeform is allowed, the answer routes through the composer so you can edit before sending
- **No timeout** — the agent now waits indefinitely for your response (previously a 30-minute limit)
- **Multi-client sync** — answering a prompt on one device renders the question and answer on every connected client

### 📝 Scrolling & UI
- **Auto-scroll rewrite** — direction-based detection with an instant pin eliminates intermittent scroll stalls during rapid tool events; scrolling up disengages, returning to the bottom re-engages
- **Loading hint on resume** — reloading the browser now shows the loading counter while session history streams back
- **Icon alignment** — notification banner, PWA tip, and tool-summary SVG icons switched to flex layout for proper vertical centering

### 🔗 SDK
- **Updated Copilot CLI & SDK** — bundles `@github/copilot` 1.0.65 and `@github/copilot-sdk` 1.0.4

## v0.7.4

### 🐛 Fixes
- **TUI self-update** — `[u]` console key now correctly detects AND installs portal self-updates, not just SDK package updates

### 💬 Chat UX
- **Smart auto-scroll** — scrolling up to read during a long agent task no longer snaps back to the bottom; auto-scroll only engages when within 80px of the bottom, and sending a new message resets to follow mode
- **Animated Send/Stop button** — Send smoothly shrinks to a 20px corner button while Stop pops in at top-right with a spring animation when the agent is active; Stop removed from top header bar

## v0.7.3

### 🔧 Skills Support
- **Skills in Session Drawer** — loaded skills surface in a collapsible list with source badges, enabled indicators, and slash-invocable markers
- **Skills RPC on connect** — queries `session.rpc.skills.list()` on connect for reliable loading across page reloads and session switches
- **Click-away dismiss** — skills dropdown closes when clicking outside, matching other drawer menus
- **Scroll fade** — bottom gradient on skills list when content overflows

### 💅 Icons & Polish
- **Emoji → SVG icons** — replaced all 13 emoji instances with Lucide-style SVGs (wrench, copy, spinner, check, triangle, bubble, thought-oval, smartphone, circle-check)
- **Icon alignment** — all SVG icons use `shrink-0` to prevent flex squishing and `align-middle` for inline vertical centering
- **Intermediate turn styling** — reasoning turns render with transparent background, dashed left + bottom borders, curved bottom-left corner, and reduced opacity instead of full bubbles
- **Bubble corner sharpening** — assistant bottom-left and user bottom-right corners tightened to 2px for crisp chat-bubble tails

### 🐛 Fixes
- **Model persistence** — selected model no longer reverts on new session page reload (fixed field name mismatch: `content` → `model`)
- **Duplicate model broadcast** — removed redundant second event from `setModel()` that caused flicker
- **TUI exit crash** — fix `ReferenceError: log is not defined` in exit handler

### 🔗 SDK Compatibility
- **SDK beta.12 support** — handle `cwd` → `workingDirectory` rename
- **Dual-version layer** — works with both `copilot-sdk 0.3.x` and `1.0.0-beta.x`
- **Auto-detect SDK API** — tries new methods first, falls back to old

### 📝 Rendering
- **Markdown in messages** — assistant message history now renders with `react-markdown`
- **Prose styling** — comprehensive overrides for Tailwind v4 preflight (bullets, headings, tables, code blocks)
- **Table header fix** — use `--text-bright` for readable table headers

### 📊 Usage & Metrics
- **AI Credits display** — show token usage and credit consumption in session drawer

### 🔄 Tunnel
- **Preserve tunnel state** — auto-restart on next launch if tunnel was active
- **Timestamped CLI stderr** — prefix log lines for easier debugging

## v0.7.1

### 🔌 MCP Discovery
- **Sign in with Microsoft 365** — direct OAuth flow for M365 MCP server discovery (no temp server workaround)
- **Auto-refresh expired tokens** — silently refreshes OAuth tokens for discovery probing
- **Tool counts on active servers** — shows tool counts from `session.tools_updated` events

### 🔄 Reconnect
- **Fix missing replies** — assistant messages now show after switching away on mobile and coming back

### 🔗 Tunnel
- **Health check with auto-restart** — pings tunnel every 5 minutes, auto-restarts if stale

### 🎨 Model Picker
- **Fix 0× multiplier** — compute relative cost from token prices (API removed `billing.multiplier`)
- **Price category** — show low/medium/high with color coding (green/blue/yellow)

### 🛡️ Stability
- **WS close crash fix** — truncate close reason to 123 bytes (WebSocket protocol limit)

## v0.7.0

### 🔌 MCP Server Management
- **Featured server catalog** with one-click add for WorkIQ, Playwright, and Microsoft Learn
- **Microsoft Agent 365 discovery** — dynamically discovers available M365 MCP servers from OAuth token scopes (Teams, Calendar, Mail, Planner, Excel, Word, People, Admin Center, and more)
- **OAuth sign-in flow** — auto-triggers login for servers needing authentication; sequential sign-in for multiple servers with combined notification banner
- **Add/Remove servers** with confirmation dialog, automatic CLI restart, and page reload
- **Server status indicators** — connected (●), needs sign-in (⚠), failed (✗), pending (○)
- **Clone button** — duplicate an MCP server config to the URL/Command tab for easy cross-tenant setup
- **Retry button** for failed servers
- **Persistent Restart CLI** link in the MCP picker footer
- Descriptions and docs links for all known servers

### 🔗 Connection Indicators
- **Two-dot status indicator** — top dot for Portal server, bottom dot for CLI/Copilot server
- CLI dot follows Portal status (red when Portal disconnected)
- CLI server restart via `/api/restart-cli` endpoint with full reconnect flow

### 📐 Drawer & Layout
- **Session drawer overlays messages** instead of pushing content down
- Drawer pickers (MCP, Model, Agent) all standardized to same max height
- Scroll fade effect at bottom of picker lists (hidden when scrolled to bottom or content fits)
- Drawer order: CWD → MCP → Model → Agent
- MCP add form uses tabbed layout (Featured | Command | URL) with styled tab navigation

### 🔒 Security & Robustness
- JWT token parsing validates 3-part format before decoding
- Session connect race condition fixed with atomic evict-if-idle
- Broadcast catches send errors and terminates dead WS connections
- Heartbeat timeout properly cleared before creating new one
- MCP server name and session ID validated against regex patterns
- Removed external OAuth token probing (static catalog approach)

### 🖥️ Auto-start
- **`[s]` auto-start toggle** — cross-platform (Windows Task Scheduler, macOS Launch Agent, Linux systemd)
- Portal auto-starts at login after reboot/updates

### 🎨 UI Polish
- Full-screen modal confirm dialog for MCP changes (replaces browser `confirm()`)
- Loading spinner for MCP server list
- MCP server descriptions in active server list with docs links
- Connection indicator tooltip shows both Portal and CLI status

## v0.6.3

### 🔄 Reconnect & Sync
- Fix stale messages appearing out of order on reconnect
- Browser launch uses localhost URL (survives network changes)
- Defer heartbeat until first message (prevents timeout during slow session loads)

### 🤖 Tool Approval & Display
- YOLO (approve-all) now works during subagent turns
- Tool completion shows three states: success (✅), done (✗ green), error (✗ red)
- Failed tools show the command/path on the header line
- Info toasts include type prefix for context (e.g. `file_created`)

### 🖥️ Console Flow
- `[c]` console: auto-restart headless CLI server when TUI exits
- Pool pings SDK before reusing cached handles — evicts stale connections
- Ask-user textarea styled with themed scrollbar

### 📊 Session Loading
- Show "Loading... Xs (40.0 MB)" for large sessions with file size and timer

### 🔧 Build & Packaging
- Auto-sync `package.dist.json` version in `npm run package`
- Platform-specific devtunnel install hints (winget/brew/curl)

## v0.6.2

Superseded by v0.6.3 — heartbeat timeout caused reconnect loops on sessions with large history.

## v0.6.1

### 🖼️ Image Support
- Paste, drag & drop, or pick images to attach to messages
- Inline display with click-to-expand lightbox
- Images persist in history across reloads and reconnects

### 📊 Context Window Usage
- Visual bar showing system/tools, messages, and free space with token counts
- Integrated above the model selector in the drawer

### 🤖 Rich Model Picker
- Shows context window size, vision/thinking support, and cost multiplier per model
- Connected-edge dropdown styling for model, agent, and prompts pickers
- Click-away dismiss on all picker dropdowns

### 💬 Prompts Overlay
- Prompts tray floats above the input area (no chat window resize)
- Consistent overlay behavior matching model and agent pickers

### 🔄 Update & Restart Flow
- In-portal updates reliably restart CLI with new binary version
- Auto-login when credentials expire at startup
- Build mismatch detection between client and server
- Fire-and-forget npm install (no client timeout on long installs)
- Restart button always shown after update cycle completes
- Clear stale update banner on reconnect

### 🔌 Reconnect Improvements
- Skip redundant history replay on reconnect (no flicker or focus loss)
- Accept new history when messages arrive from another device
- Prevent duplicate connections from concurrent visibility/focus events
- Fix stale heartbeat timers on mobile (frozen timer race condition)

### 🐛 Fixes
- Tool summaries now appear correctly after page reload
- Image-only messages no longer hidden in chat history
- Short responses no longer dropped by dedup
- Model change detection handles SDK's `newModel` field
- Auth check handles camelCase keys and comments in config.json
- Session title fades gracefully when too long for drawer
- Fix package.dist.json version not synced with package.json

### 💅 UI Polish
- Input buttons in 2×2 grid (image, recall/clear, send)
- CWD copy button with clipboard fallback
- SVG chevron with rotate animation on drawer
- Session ID click-to-copy in drawer handle
- Launcher logs include timestamps
- Client IDs show full IP and tunnel indicator (`T:` prefix)

## v0.6.0

Superseded by v0.6.1 — release zip had stale version in package.json.

## v0.5.13

### Agent Picker
- Select custom agents from the session drawer (same pattern as model picker)
- Agents discovered from `~/.copilot/agents/` (personal) and `.github/agents/` (project/git root)
- Source label shown next to each agent (user/repository)
- Agent selection persists across page reloads, session switches, and server restarts
- Input placeholder shows active agent name: "Ask explain agent…"
- Scroll fade indicates more agents below the fold
- Auto-scrolls to the selected agent when picker opens
- Squad agent detected correctly from git root

### Theme Improvements
- Improved "Surprise Me" palette quality — tighter color bands, golden angle harmony
- Auto-generated theme names from palette colors (e.g., "Midnight Emerald", "Morning Coral")

## v0.5.12 (superseded by v0.5.13)

## v0.5.11

### Agent Picker
- Initial agent picker release (superseded by v0.5.12 with theme improvements)

## v0.5.10

### Tool Execution Fix (revised)
- v0.5.9 hardcoded `'approve-once'` which broke on some environments
- Portal now auto-detects the correct approval format from the SDK's own `approveAll` handler at startup
- Works with both old and new SDK versions automatically

### Per-Session Themes
- Each session can have its own theme (or fall back to the starred default)
- Starred default is the single global fallback — no more confusing active vs default
- Theme picker header matches Sessions/Guides layout (+ New, Use Default)
- Inline theme editor with pencil icon

### Working Directory
- **Staged session creation** — "+ New" opens a draft with folder browser to set CWD before creating
- **Folder browser** — navigate directories, breadcrumb path, drive letter support (Windows), create new folders
- **Change CWD on existing sessions** — click the path in the drawer to browse and apply
- **CWD preserved on session switch** — fixed critical bug where `resumeSession()` was resetting all session CWDs to Portal's install directory on every reconnect

### Tool Error Surfacing
- Failed tool boxes show red with the actual error message (not just "failed")
- Failed tools persist after turn end — no auto-collapse so errors can be reviewed
- Server console logs tool failures with ⚠ indicator

### Security
- Path traversal blocked in folder creation (`.` and `..` rejected)
- CWD paths validated (must exist, must be a directory)
- Symlinks filtered from folder browser listings

## v0.5.9 (withdrawn)

### Tool Execution Fix
- Copilot SDK v0.3.0 changed the tool approval response format from `'approved'` to `'approve-once'`
- Portal v0.5.8 and earlier used the old format, causing tool approvals to silently fail
- This release hardcoded the new format — worked on some machines but failed on others due to SDK/CLI version mismatches
- Superseded by v0.5.10 which auto-detects the correct format

## v0.5.8

### Theme System
- Custom theme editor with base, accent, and text color pickers
- WCAG contrast auto-fix: text colors shift for readability (4.5:1 ratio)
- "Surprise me" random palette generator (complementary, analogous, triadic, split-complementary)
- Per-session themes: each session can have its own theme
- Starred default: one theme is the global fallback for all sessions
- Server-side sync: themes persist across devices via `data/themes.json`
- Inline editing: pencil icon expands editor within the theme row
- Header layout matches Sessions/Guides panels (+ New, Use Default)

## v0.5.7

### Copy Improvements
- Copy formatted strips dark theme colors (clean paste into OneNote/Word/Teams)
- Clipboard API with both text/html and text/plain (paste vs paste-as-plain-text)
- Per-table copy button (top-right corner, stripped from message-level copy)
- Light theme forced on execCommand fallback (LAN IP access)

### ask_user Improvements
- Multi-line freeform input (textarea with auto-grow, Shift+Enter for new lines)
- Timeout increased from 5 minutes to 30 minutes

### Console
- Console title preserved after npm install/build during updates
- Title reset on server restart

### Documentation
- Agent integration design doc (agents vs guides, /fleet, Squad, CWD dependency)
- Comparison docs for cli-tunnel, Termote, Copilot Remote, Open WebUI, OpenClaw, /remote

## v0.5.6

### Session Usage Tracking
- Live token stats in session drawer: input/output tokens, reasoning, cached, requests
- Copy button to share usage stats
- Quota display: detects unlimited plans, shows reset date
- Shows "tbd" before first message (avoids misleading data from quota API)

### Update Reliability
- Re-poll updates 15s after reconnect (fixes race condition on server restart)

### Other
- Actionable notifications persist until dismissed (with ✕ button)
- Compact single-line usage stats display
- GitHub username links to Copilot settings page

## v0.5.5

### Security Headers
- Content-Security-Policy: script-src 'self', connect-src ws:/wss:, img-src data:, frame-ancestors 'none'
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: no-referrer (prevents token leaking in referrer)
- HSTS: enabled over tunnel (HTTPS only)
- Cache-Control: no-store on API responses
- Moved service worker registration out of inline script for CSP compliance

### Notifications
- Actionable notifications (e.g. Reload) persist until dismissed
- Added dismiss button for persistent notifications

### Other
- README rewritten with Mermaid architecture diagram
- Fixed browser warnings (deprecated meta tag, no-op service worker)
- Added id/name to message textarea

## v0.5.3

### Guide Import from GitHub Gists
- Import from URL option in +New dropdown
- Paste a gist URL, preview discovered items, select and add to portal
- Supports single pairs, prompts-only, and multi-item collections
- File convention: name_guide.md / name_prompts.md
- Import metadata tracked in data/imports.json

### UI Polish
- Two-row command key layout (Access / Server)
- Picker: back-highlight, import highlight, stable delete row height
- Import panel: fixed height, scrollable preview
- Removed cancel link from thinking indicator
- Multi-line prompt examples in dev guide

### Portal Tour
- Updated for import, tunnels, PWA, Add to Home Screen
- New prompts for import and tunnel topics

## v0.5.2

### Tunnel Improvements
- Auto-restart tunnel after server restart (wasRunning flag)
- Immediate feedback on [t] press with double-press guard
- [q] shows both local and tunnel URLs when tunnel is running

### Update Flow
- Single Update button handles both portal and package updates
- Reload button on stale build notification (essential for PWA)
- Streamlined restart/reload flow: Update → Restart → Reload

### Console
- Two-row command key layout grouped by purpose (Access / Server)

## v0.5.1

### DevTunnel Integration
- [t] Tunnel toggle: start/stop a DevTunnel for remote access
- [T] Security reset: destroys tunnel, rotates token, disconnects all clients
- Config persistence in data/tunnel.json
- Token + QR code printed on tunnel start with security warnings

### PWA Support
- Manifest, service worker, and icons for Add to Home Screen
- Standalone mode (no browser chrome) on iOS and Android
- Subtle install hint banner on 2nd+ mobile visit
- Token persists in URL for iOS PWA compatibility

### Fixes
- WebSocket uses wss:// over HTTPS (fixes tunnel connections)
- Removed server-side token gate on HTML page (APIs still authenticated)
- JSON MIME type for manifest serving

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
