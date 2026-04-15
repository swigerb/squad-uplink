# Dev Tunnels

Guide for using Microsoft Dev Tunnels to access Copilot Portal remotely.

See also:
- [Uplink Comparison](compare-uplink.md) — how uplink integrates tunnels
- [ACP Protocol](acp-protocol.md) — the underlying agent protocol

## What Are Dev Tunnels?

Microsoft Dev Tunnels create secure HTTPS/WSS tunnels from your local machine to a public URL. Think of it as ngrok, but integrated with Microsoft and GitHub identity.

- **Public URL** — access `localhost:3847` from anywhere as `https://xyz.devtunnels.ms`
- **Secure** — can require GitHub or Microsoft account authentication
- **Stable** — deterministic naming means the same URL survives restarts
- **Free** — included with Visual Studio / GitHub accounts

**Portal benefit:** access the portal from your phone on cellular, a different network, or even a different machine — not just same-WiFi like the QR code.

## Installation

```bash
# Windows
winget install Microsoft.devtunnel

# macOS
brew install --cask devtunnel

# Linux
curl -sL https://aka.ms/DevTunnelCliInstall | bash
```

## One-Time Setup

```bash
# Authenticate (opens browser, uses GitHub or Microsoft account)
devtunnel user login

# Create a persistent tunnel for portal
devtunnel create copilot-portal
devtunnel port create copilot-portal -p 3847
```

This creates a named tunnel that forwards to port 3847 (the portal's default port).

## Usage

```bash
# Start the tunnel (do this each time you start the portal)
devtunnel host copilot-portal

# Output includes:
#   Connect via browser: https://abc123.devtunnels.ms
#   Inspect network activity: https://abc123-3847.devtunnels.ms
```

Now open the tunnel URL from any device — no same-network requirement.

## Access Control

By default, tunnels require the creator's account to access them. You can change this:

```bash
# Anonymous access (anyone with the URL)
devtunnel access create copilot-portal -p 3847 --anonymous

# Organization-scoped (anyone in your GitHub org)
devtunnel access create copilot-portal -p 3847 --org my-org

# Specific users
devtunnel access create copilot-portal -p 3847 --github-user someone
```

For personal use, anonymous is fine since the URL is unguessable. For shared/team use, consider org-scoped or user-specific access.

## Deterministic Naming

Uplink uses a clever pattern: derive the tunnel name from the working directory so the URL is stable per-project:

```javascript
import { createHash } from 'crypto';
const tunnelName = `portal-${createHash('sha256').update(cwd).digest('hex').slice(0, 8)}`;
```

This means:
- Same project directory → same tunnel name → same URL
- Bookmarks and installed PWAs survive restarts
- No need to scan a new QR code each time

## CLI Commands Reference

| Command | Purpose |
|---|---|
| `devtunnel user login` | Authenticate (one-time) |
| `devtunnel create NAME` | Create a named tunnel |
| `devtunnel port create NAME -p PORT` | Add a port forwarding rule |
| `devtunnel host NAME` | Start the tunnel |
| `devtunnel show NAME --json` | Check if tunnel exists, get its URL/port |
| `devtunnel list` | List all your tunnels |
| `devtunnel delete NAME` | Remove a tunnel |
| `devtunnel access create NAME -p PORT --anonymous` | Allow anonymous access |

## Service Limits

Dev Tunnels has monthly limits per user (resets monthly):

| Resource | Limit |
|---|---|
| **Bandwidth** | 5 GB per user |
| **Tunnels** | 10 per user |
| **Active connections** | 1,000 per port |
| **Ports** | 10 per tunnel |
| **HTTP request rate** | 1,500/min per port |
| **Data transfer rate** | Up to 20 MB/s per tunnel |
| **Max HTTP request body** | 16 MB |

**Bandwidth is the main concern.** Copilot responses with tool output can be chatty. Rough estimate: a heavy coding session might use 5-10 MB/hour through the tunnel. At that rate, 5 GB lasts ~500-1000 hours — fine for mobile/remote use, but don't use the tunnel as your primary daily driver.

The `[t]` toggle design is ideal: use the tunnel when you need remote access, turn it off when you're on the same network.

## Important Notes

**Anti-phishing interstitial:** The first time you open a devtunnel URL, Microsoft shows a warning page asking you to confirm the connection. This is a one-time security feature per tunnel — you'll only see it once.

**Token in URL:** The tunnel URL includes your portal access token as a query parameter. Don't share tunnel URLs in screen recordings, screenshots, or public channels.

**Inactive tunnel cleanup:** Tunnels not used for 30 days are automatically deleted by the service. Deterministic naming means the portal will recreate it transparently on next use.

## Integration Plan for Portal

### Phase 2: `[t]` Console Key (implemented)
Press `[t]` to toggle a DevTunnel on/off:
1. Checks if `devtunnel` is installed and authenticated
2. On first use, asks about access mode (anonymous vs authenticated)
3. Creates a tunnel with deterministic naming if it doesn't exist
4. Hosts the tunnel and displays the public URL + QR code (with portal token)
5. Press `[t]` again to stop
6. Config saved in `data/tunnel.json` — delete to reconfigure

### Phase 3: Tunnel-Aware UI (future)
- Show the public tunnel URL in the portal header or session drawer
- Generate QR code from the tunnel URL instead of the local one
- Auto-detect tunnel connection and show remote access indicator

## Implementation Notes

From uplink's source:

```bash
# Check if tunnel exists
devtunnel show $NAME --json 2>/dev/null && echo "exists" || echo "create it"

# Create tunnel + port
devtunnel create $NAME
devtunnel port create $NAME -p 3847

# Start and capture URL
devtunnel host $NAME 2>&1 | grep "Connect via browser"
```

**Process cleanup:** On exit, send SIGINT to the devtunnel process. If it doesn't stop within 5 seconds, send SIGKILL. On Windows, use `Stop-Process`.

**Port binding:** Always pass `-p PORT` explicitly when creating and hosting. If omitted, devtunnel picks a random port.

**WebSocket support:** Dev Tunnels support WSS natively — no special configuration needed. The portal's WebSocket connection works through the tunnel as-is.
