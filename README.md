# Squad Uplink

> Retro terminal frontend for [Squad Remote Control](https://github.com/brswig/squad-rc). A 1984-era CRT interface for controlling modern AI agents.

![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![Azure SWA](https://img.shields.io/badge/Azure-Static_Web_Apps-0078D4)

## Tech Stack

- **React 19** + **TypeScript 5.9** + **Vite 8**
- **xterm.js** — terminal emulation with canvas renderer
- **Zustand** — connection/telemetry state (works outside React)
- **Web Audio API** — hybrid audio: sample files with procedural fallback
- **Azure Static Web Apps** — hosting + CI/CD

## Prerequisites

- Node.js 22 LTS
- npm 10+

## Local Dev

```bash
npm install
npm run dev        # http://localhost:5173
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_TUNNEL_URL` | WebSocket URL for squad-rc devtunnel (e.g. `wss://xxx.devtunnels.ms`) | _(none — enter via `/connect`)_ |

Set in a `.env` file at the project root:

```env
VITE_TUNNEL_URL=wss://your-tunnel.devtunnels.ms
```

When set, `/connect <token>` uses it automatically. Otherwise: `/connect <url> <token>`.

## Build

```bash
npm run build      # tsc + vite build → dist/
npm run preview    # serve the build locally
```

## Deploy

**Auto-deploy:** Push to `main` → GitHub Actions builds + deploys to Azure SWA.

**Manual:** Use the [Azure SWA CLI](https://aka.ms/swa/cli):

```bash
npx @azure/static-web-apps-cli deploy dist/ --env production
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check + production build |
| `npm run lint` | ESLint |
| `npm test` | Run Vitest suite |
| `npm run preview` | Preview production build |

## Themes

Six hardware-authentic terminal skins:

| Skin | Vibe | Layout |
|------|------|--------|
| **Apple IIe** | Phosphor green CRT, floppy-drive audio | Fullscreen |
| **Commodore 64** | Blue 40-col, SID chip sounds | Fullscreen |
| **IBM 3270** | Amber mainframe, solenoid clicks | Fullscreen |
| **Windows 95** | Teal desktop + windowed terminal | Windowed |
| **LCARS** | Star Trek bridge panels, sci-fi chirps | Panel |
| **Pip-Boy 3000** | Fallout retro-futuristic CRT device | Pip-Boy |

Cycle themes with the **Theme** button in the toolbar.

### Pip-Boy 3000 (Uplink-Gamma)

A Fallout-inspired retro-futuristic CRT device skin, faithfully ported from a [Codepen reference](https://codepen.io/stix/pen/KdJEwB). The entire UI is wrapped in a full hardware device frame — tan metal casing, decorative screws, speaker grilles, dials, and a glowing amber power button.

**Color palette:**

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#1bff80` | Text, borders, glow effects |
| Muted | `#145b32` | Inactive elements, secondary text |
| Background | `#000500` | CRT screen background |
| Alert | `#ffb641` | Power button, warning indicators |

**Layout:** Fixed 630×400 `.pip` container scaled to fit viewport via CSS `transform: scale()`. Three-column CSS grid — left speaker/grip, center CRT screen bezel, right panel with RADS dial and tune wheel.

**Tab navigation:**

| Tab | Content |
|-----|---------|
| **STAT** | Agent health metrics (S.P.E.C.I.A.L. stats) + Walking Vault Boy animation |
| **INV** | Tools and MCP server inventory |
| **DATA** | Terminal (xterm.js) — default active tab |
| **MAP** | Agent topology view |
| **RADIO** | Command console with history and quick buttons |

**Special features:**

- **CRT transitions** — Authentic phosphor persistence, scanline sweep, and static burst effects when switching tabs or connecting
- **Functional dials** — Spike wheel rotates to select tabs; tune wheel scrolls content within the active tab
- **Hardware feedback** — RADS needle spikes on errors; power light pulses amber when an agent is thinking
- **Walking Vault Boy** — Animated GIF with phosphor glow, flanked by limb health bars derived from telemetry metrics
- **Responsive** — Side panels (speakers, dials) hide on screens ≤768px

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+T` | Toggle telemetry drawer |
| `Escape` | Close telemetry / focus terminal |

## Architecture

```
src/
├── App.tsx              # Layout switching (fullscreen/windowed/panel)
├── components/          # Terminal, StatusBar, TelemetryDrawer, toggles
├── hooks/               # useTheme, useAudio, useWebSocket
├── lib/                 # ConnectionManager (singleton), commands, formatters
├── store/               # Zustand connection/telemetry store
├── themes/              # 6 theme definitions (CSS vars + xterm ITheme)
├── styles/              # Global CSS, CRT effects, fonts, layout chrome
└── types/               # squad-rc protocol types
```

**Key patterns:**
- `ConnectionManager` lives outside React — manages WebSocket, auth tickets, rate limiting, exponential backoff reconnection
- Zustand store for connection state; React Context for theme
- CRT effects are pure CSS overlays (never touch xterm rendering)
- TelemetryDrawer is lazy-loaded (hidden panel, not needed at boot)
- Audio uses hybrid model: sample files from `public/audio/{skinId}/` with procedural Web Audio fallback

## Fonts

Retro fonts are not bundled (licensing). See `public/fonts/README.md` for download instructions. All declarations use `font-display: swap` with web-safe fallbacks.

## Audio Customization

Squad Uplink uses a **hybrid audio system**: real audio sample files are preferred, with procedural Web Audio oscillators as fallback.

### Adding Custom Sound Files

1. Drop `.mp3`, `.wav`, or `.ogg` files into `public/audio/{skinId}/` (e.g., `public/audio/c64/boot.mp3`)
2. File names must match the sound type: `boot.mp3`, `connect.mp3`, `disconnect.mp3`, `error.mp3`, `keystroke.mp3`, `toggle.mp3`, `agent_started.mp3`, `agent_triage.mp3`, `agent_success.mp3`, `agent_error.mp3`, `crt_toggle.mp3`
3. The manifest at `src/audio/manifest.ts` maps each skin + sound to its file path
4. If a file is missing or fails to load, the procedural oscillator fallback plays instead
5. Files are preloaded per-skin (only the active skin's files are fetched)

See `public/audio/README.md` for sourcing instructions and recommended search terms per skin.
