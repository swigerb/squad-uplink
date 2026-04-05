# Squad Uplink

> Retro terminal frontend for [Squad Remote Control](https://github.com/brswig/squad-rc). A 1984-era CRT interface for controlling modern AI agents.

![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue) ![Vite](https://img.shields.io/badge/Vite-8-purple) ![Azure SWA](https://img.shields.io/badge/Azure-Static_Web_Apps-0078D4)

## Tech Stack

- **React 19** + **TypeScript 5.9** + **Vite 8**
- **xterm.js** — terminal emulation with canvas renderer
- **Zustand** — connection/telemetry state (works outside React)
- **Web Audio API** — procedural retro sound effects (no audio files)
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

Five hardware-authentic terminal skins:

| Skin | Vibe | Layout |
|------|------|--------|
| **Apple IIe** | Phosphor green CRT, floppy-drive audio | Fullscreen |
| **Commodore 64** | Blue 40-col, SID chip sounds | Fullscreen |
| **IBM 3270** | Amber mainframe, solenoid clicks | Fullscreen |
| **Windows 95** | Teal desktop + windowed terminal | Windowed |
| **LCARS** | Star Trek bridge panels, sci-fi chirps | Panel |

Cycle themes with the **Theme** button in the toolbar.

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
├── themes/              # 5 theme definitions (CSS vars + xterm ITheme)
├── styles/              # Global CSS, CRT effects, fonts, layout chrome
└── types/               # squad-rc protocol types
```

**Key patterns:**
- `ConnectionManager` lives outside React — manages WebSocket, auth tickets, rate limiting, exponential backoff reconnection
- Zustand store for connection state; React Context for theme
- CRT effects are pure CSS overlays (never touch xterm rendering)
- TelemetryDrawer is lazy-loaded (hidden panel, not needed at boot)
- Audio is 100% procedural Web Audio API oscillators — zero asset weight

## Fonts

Retro fonts are not bundled (licensing). See `public/fonts/README.md` for download instructions. All declarations use `font-display: swap` with web-safe fallbacks.
