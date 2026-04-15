# CLI Remote Access vs Copilot Portal

Comparison of GitHub's new `/remote` feature with Copilot Portal's approach to remote CLI access.

## What Is `/remote`?

GitHub announced a first-party remote access feature for Copilot CLI (public preview, April 2026). It turns GitHub.com (and GitHub Mobile) into a web portal for your running CLI session — conceptually the same thing Copilot Portal does, but hosted on GitHub's infrastructure.

**How it works:**
- Start a session with `copilot --remote` or type `/remote` during a session
- The CLI streams session events to GitHub.com in real time
- You access it via `https://github.com/OWNER/REPO/tasks/TASK_ID`
- GitHub.com renders the session as a web UI where you can interact
- Both local terminal and remote interface are active simultaneously
- Remote commands are polled by the CLI from GitHub and injected into the local session

**The key insight:** `/remote` and Portal solve the same core problem — accessing your local CLI session from another device. The difference is self-hosted (Portal) vs cloud-hosted (GitHub.com).

## Feature Comparison

| Capability | Portal | `/remote` |
|---|---|---|
| **Remote access** | DevTunnel (self-hosted) | GitHub.com relay (cloud) |
| **Mobile access** | Any browser + PWA | GitHub Mobile (beta, TestFlight) |
| **Send messages** | ✅ | ✅ |
| **Approve/deny permissions** | ✅ | ✅ |
| **Answer questions** | ✅ | ✅ |
| **View streaming output** | ✅ Real-time WebSocket | ✅ Real-time |
| **Cancel operations** | ✅ | ✅ |
| **Multiple sessions** | ✅ Session picker, create/switch/delete | ❌ One session per remote link |
| **Session management** | ✅ Shield, delete, name | ❌ Limited |
| **Guides & Prompts** | ✅ Full guide system, import from gists | ❌ Not available |
| **Approval rules** | ✅ Allow Always with patterns | ❌ Per-request only |
| **Model switching** | ✅ In-session model picker | ❌ Set at start |
| **QR code access** | ✅ With token, instant | ✅ Via Ctrl+E toggle |
| **Add to Home Screen** | ✅ PWA with icon | ❌ GitHub Mobile app |
| **Token tracking** | ✅ Per-session accumulation | ❌ Not in remote view |
| **Purpose-built UI** | ✅ Dark theme, tool summaries, reasoning | GitHub.com standard UI |
| **Offline/local use** | ✅ Works without internet | ❌ Requires GitHub.com connection |
| **Self-update** | ✅ Built-in | N/A (it's GitHub.com) |

## Architecture Comparison

### Portal
```
Browser/PWA ──ws://──▶ Portal Server ──SDK──▶ Copilot CLI
                         (your machine)
Phone ──wss://──▶ DevTunnel ──▶ Portal Server
```
- Everything runs on your machine
- DevTunnel provides HTTPS relay for remote access
- Portal server is the intermediary (adds guides, rules, sessions, UI)
- No data leaves your network unless tunnel is active

### `/remote`
```
Terminal ──▶ Copilot CLI ──streams events──▶ GitHub.com (web UI + relay)
Browser/Mobile ──▶ GitHub.com ──polls commands──▶ Copilot CLI
```
- GitHub.com IS the web portal (like Portal, but cloud-hosted)
- CLI streams session activity to GitHub in real time
- Remote commands are polled by the CLI and injected locally
- The repo provides the URL namespace (`/OWNER/REPO/tasks/ID`)
- All remote interaction goes through GitHub's infrastructure

## Key Differences

### Data Flow
- **Portal**: session data stays on your machine. The tunnel is a dumb pipe — GitHub/Microsoft never sees your session content.
- **`/remote`**: session events are sent to GitHub.com servers. GitHub can see conversation messages, tool execution events, and permission requests.

### Prerequisites
- **Portal**: Node.js + Copilot CLI. Works in any directory.
- **`/remote`**: Must be in a GitHub repository. Enterprise/org owners must enable the "Remote Control" policy (off by default).

### Enterprise Control
- **Portal**: No organizational policy controls. Anyone with the CLI can use it.
- **`/remote`**: Governed by enterprise/organization policies. "Remote Control" policy is off by default — must be explicitly enabled by an admin.

### Session Limits
- **`/remote`**: 60 MB limit on session output sent to remote interface. Long-running sessions with large output may have reduced performance remotely. Local terminal is unaffected.
- **Portal**: No output limits. DevTunnel has 5 GB/month bandwidth cap but that's rarely hit for text-based chat.

### Mobile Experience
- **Portal**: Any mobile browser, PWA installable. Works today on any phone.
- **`/remote`**: GitHub Mobile app only (currently in TestFlight/Play beta). Not widely available yet.

### Keep-Alive
- **`/remote`**: Has `/keep-alive` command to prevent machine sleep (on/off/busy/duration).
- **Portal**: No built-in keep-alive. Machine sleep policies are the user's responsibility.

## Implications for Portal

### Is Portal obsolete?

**The core use case overlaps, but the tools serve different needs.** Accessing your CLI from another device is now solved by GitHub natively. Portal's value is in the additional capabilities:

1. **Guides & Prompts** — the entire guide system, import from gists, prompt tray. `/remote` has none of this.
2. **Approval rules** — Allow Always patterns that persist. `/remote` is per-request only.
3. **Session management** — picker, shield, create/delete multiple sessions. `/remote` is one session per link.
4. **Token tracking** — per-session usage stats with copy. Not in `/remote`.
5. **Works anywhere** — no GitHub repo required, no org policy needed, works in any directory.
6. **Data sovereignty** — session data stays on your machine. `/remote` streams everything through GitHub.
7. **Purpose-built UI** — dark theme optimized for mobile, tool summaries, reasoning display.

If GitHub adds guides, approval rules, or session management to their remote UI, Portal's unique value shrinks further. Worth monitoring closely.

### What `/remote` does better

1. **Zero setup** — no Portal install, no DevTunnel, no tunnel configuration. Just `--remote`.
2. **GitHub.com integration** — sessions appear in your Copilot dashboard alongside other activity.
3. **GitHub Mobile** — native mobile app experience (once out of beta).
4. **Reconnection** — built into GitHub's infrastructure, handles sleep/network drops gracefully.
5. **`/keep-alive`** — prevents machine sleep while session is active. Portal has no equivalent.
6. **No bandwidth limits** — unlike DevTunnel's 5 GB/month cap.

### Could they work together?

Potentially interesting: run Portal locally for the rich UI + guides + rules, AND enable `/remote` for the GitHub Mobile monitoring. They use the same CLI session. The question is whether `/remote`'s event streaming conflicts with Portal's SDK connection — needs testing.

## Recommendations

1. **Keep building Portal** — its value proposition (guides, prompts, rules, custom UI, data sovereignty) is orthogonal to `/remote`.
2. **Consider `/keep-alive` equivalent** — if users are leaving the portal running while away, preventing machine sleep would be useful.
3. **Monitor `/remote` evolution** — if GitHub adds guides, approval rules, or session management to the remote interface, the overlap increases.
4. **Test coexistence** — verify that Portal and `/remote` can run on the same session simultaneously without conflicts.
5. **Document the choice** — help users understand when to use Portal vs `/remote` vs both.
