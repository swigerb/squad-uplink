# 🚀 Squad Uplink

**Command Center for GitHub Copilot CLI Sessions**

![.NET 10](https://img.shields.io/badge/.NET-10-512BD4) ![C# 14](https://img.shields.io/badge/C%23-14-239120) ![WinUI 3](https://img.shields.io/badge/WinUI-3-0078D4) ![Windows 11](https://img.shields.io/badge/Windows-11+-0078D4) ![Tests 325+](https://img.shields.io/badge/Tests-325%2B-brightgreen) ![License MIT](https://img.shields.io/badge/License-MIT-green)

Squad Uplink v3 is a native Windows 11 Command Center for managing multiple GitHub Copilot CLI sessions. Launch, discover, and monitor AI agent sessions with Squad awareness — featuring MESS-style diagnostics, a command palette, retro skins, and Velopack auto-updates.

## ✨ Key Features

- 🔍 **Process Discovery** — Automatically finds running `copilot --remote` sessions and displays real-time status
- 🚀 **Session Launching** — Start new Copilot CLI sessions with one click, configurable with model overrides and custom args
- 📊 **Multi-Session Dashboard** — Monitor all sessions in configurable tab or grid layouts with live terminal output
- 🏗️ **Squad Awareness** — Detects Squad/SubSquad hierarchies from `.squad/team.md` for intelligent agent grouping
- 🩺 **MESS-Style Diagnostics** — 3-stage log filter pipeline (level → text → source), payload-aware formatting (JSON, stack traces, CLI output), and one-click diagnostic report export
- 🎨 **Retro Skins** — Fluent 2 light/dark, Apple IIe phosphor green, Commodore 64 PETSCII blue, and Pip-Boy Vault-Tec amber — with CRT scanline effects
- 🔔 **Windows Notifications** — Toast alerts for session discovery, completion, permission requests, and errors
- 📈 **Telemetry Dashboard** — Real-time CPU, memory, and session activity graphs powered by WebView2
- ⌨️ **Keyboard Shortcuts** — Ctrl+Tab, Ctrl+1-9, Ctrl+N, Ctrl+W, F11, Ctrl+R for power users
- 🔗 **GitHub Integration** — Deep-link to Copilot CLI remote task viewer for seamless workflow
- 🔄 **Velopack Auto-Updates** — Seamless background updates via GitHub Releases with delta patching
- 🗄️ **SQLite Persistence** — Session history, settings, and preferences survive between launches
- 🎵 **Audio Feedback** — Per-theme sound packs for session events (connectable, disconnectable, errors)

## Screenshots

<!-- Screenshots will be added before GA release -->

## 🚦 Getting Started

### Prerequisites

- **Windows 11** (build 22621 or later)
- **.NET 10 SDK** — [Download](https://dotnet.microsoft.com/download/dotnet)
- **Visual Studio 2026** (Community+ or Code with C# extension) — optional for development
- **GitHub Copilot CLI** — Install via `npm install -g @github/copilot-cli`

### Clone and Build

```powershell
git clone https://github.com/swigerb/squad-uplink.git
cd squad-uplink
dotnet build SquadUplink.sln -p:Platform=x64
```

### Run

```powershell
# Debug mode
dotnet run --project src/SquadUplink/SquadUplink.csproj

# Or release build
dotnet build SquadUplink.sln -p:Platform=x64 -c Release
.\src\SquadUplink\bin\x64\Release\net10.0-windows10.0.22621.0\SquadUplink.exe
```

### First Launch

On startup, Squad Uplink automatically scans for running `copilot --remote` sessions:
1. Click **Launch New** to start a fresh Copilot CLI session
2. Sessions appear in the dashboard with live terminal output
3. Switch themes via **Settings** → **Appearance** (includes retro skins)
4. Configure layout (tabs vs grid) in **Settings** → **Layout**
5. Open **Diagnostics** for MESS-style log inspection and report export
6. Check for updates in **Settings** → **About**

## 🏛️ Architecture

Squad Uplink v3 was built in five phases:

| Phase | Focus | Delivered |
|-------|-------|-----------|
| **A — Foundation** | Core services, DI, MVVM, logging, splash screen | ProcessScanner, SessionManager, DataService, ThemeService, Serilog pipeline |
| **B — Diagnostics** | MESS-style log viewer, payload formatting, diagnostic reports | DiagnosticsViewModel, InMemorySink, 3-stage filter, export |
| **C — Retro Skins** | Apple IIe, C64, Pip-Boy themes with CRT effects | RetroBase.xaml, per-theme XAML, CRT scanline toggle |
| **D — Polish** | Audio, notifications, keyboard shortcuts, grid layout | AudioService, NotificationService, GridLayoutPanel, keyboard nav |
| **E — Distribution** | Velopack packaging, end-to-end tests, README | VelopackApp bootstrap, build-release.ps1, 325+ tests |

### Layered Architecture

```
┌─────────────────────────────────────────────┐
│     Presentation (WinUI 3 / XAML)           │
│  Views, Controls, Themes, Converters        │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│    ViewModel Layer (MVVM Toolkit)           │
│ Dashboard, Session, Settings, Diagnostics   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Services Layer (Business Logic)     │
│  ProcessScanner, SessionManager, Squad-     │
│  Detector, ThemeService, AudioService,      │
│  NotificationService, OutputCapture         │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│        Data Layer (SQLite + Serilog)        │
│  DataService, InMemorySink, LogPayload-     │
│  Formatter, crash.log, rolling file logs    │
└─────────────────────────────────────────────┘
```

**Key Service Responsibilities:**
- **ProcessScanner** — WMI queries to find `copilot.exe` processes
- **SessionManager** — CRUD + scan cycle + auto-prune for active sessions
- **SquadDetector** — Parses `.squad/team.md` hierarchies and sub-squads
- **ThemeService** — Manages Fluent/retro theme switching with persistence
- **AudioService** — Per-theme sound packs for session lifecycle events
- **NotificationService** — Windows toast notifications for session events
- **OutputCapture** — Pipes process stdout/stderr to terminal control
- **DataService** — SQLite persistence for session history and settings
- **DiagnosticsViewModel** — 3-stage filter (level → search → source), payload formatting, report export
- **InMemorySink** — Circular-buffer Serilog sink bridging logs to the diagnostics UI

## 🛠️ Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | .NET | 10 |
| **Language** | C# | 14 (latest) |
| **UI Framework** | WinUI 3 | 1.7 |
| **Windows API** | Windows App SDK | 1.7 |
| **MVVM** | CommunityToolkit.Mvvm | 8.4 |
| **Logging** | Serilog (File + Debug + InMemory + Custom) | 4.3 |
| **Database** | SQLite | via Microsoft.Data.Sqlite |
| **Web Control** | WebView2 | 1.0.3856.49+ |
| **Terminal Emulation** | xterm.js | (via WebView2) |
| **Updates** | Velopack | 0.0.1251 |
| **Testing** | xUnit, Moq, Coverlet | latest |
| **Process API** | System.Management | 9.0 |

## 🎨 Theme Gallery

Squad Uplink ships with five carefully crafted themes:

### 🔵 Fluent 2 (Default)
Windows 11 native light and dark modes. Clean, modern sans-serif typography with accent color support. Perfect for corporate environments.
- Light palette: `#FFFFFF` bg, `#000000` fg
- Dark palette: `#1E1E1E` bg, `#E8E8E8` fg

### 💚 Apple IIe
Nostalgic 1984 phosphor green terminal. Classic monospace font on black background.
- Foreground: `#33FF33` (Apple IIe green)
- Background: `#000000` (black CRT)

### 💙 Commodore 64
PETSCII-inspired blue and cream palette from the legendary 8-bit computer. Chunky bitmap font emulation.
- Foreground: `#A0A0FF` (light blue)
- Background: `#4040E0` (C64 blue)

### 💛 Pip-Boy
Fallout universe amber Vault-Tec aesthetic. Retro-futuristic dials and amber text on black.
- Foreground: `#FFB000` (Vault-Tec amber)
- Background: `#0A0A0A` (deep black)

All retro themes support optional CRT scanline effects via **Settings** → **CRT Effects**.

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Tab** | Switch to next session tab |
| **Ctrl+Shift+Tab** | Switch to previous session tab |
| **Ctrl+1** to **Ctrl+9** | Jump directly to session N |
| **Ctrl+N** | Launch new session |
| **Ctrl+W** | Close current session (with confirmation) |
| **F11** | Toggle focus mode (hide UI chrome) |
| **Ctrl+, (comma)** | Open Settings |
| **Ctrl+R** | Refresh process scan |

## 🔨 Development

### Clean Build

```powershell
dotnet build SquadUplink.sln -p:Platform=x64
```

### Testing

```powershell
# Run all tests (325+ tests)
dotnet test SquadUplink.sln -p:Platform=x64

# With coverage
dotnet test SquadUplink.sln -p:Platform=x64 --collect:"XPlat Code Coverage"
```

### Release Build (Velopack)

```powershell
# Install Velopack CLI (one-time)
dotnet tool install -g vpk

# Package for distribution
.\scripts\build-release.ps1 -Version "3.0.0"
```

This generates self-contained EXE and delta update packages in `releases/`. Upload to GitHub Releases for automatic update delivery.

## 📖 Project Structure

```
squad-uplink/
├── src/
│   ├── SquadUplink/              # Main WinUI 3 app
│   │   ├── Views/                # XAML pages (Dashboard, Settings, Diagnostics)
│   │   ├── ViewModels/           # MVVM view models
│   │   ├── Services/             # Business logic (Scanner, Manager, etc.)
│   │   ├── Controls/             # Reusable controls (Terminal, Grid, SquadTree)
│   │   ├── Contracts/            # Service interfaces
│   │   ├── Models/               # Data models (SessionState, AppSettings, etc.)
│   │   ├── Themes/               # Theme definitions (Fluent, RetroBase, C64, etc.)
│   │   ├── Helpers/              # DI registration, converters
│   │   ├── Assets/               # Icons, audio, application resources
│   │   ├── wwwroot/              # Static web content for WebView2
│   │   ├── Program.cs            # Entry point: Velopack + Serilog + DI + WinUI
│   │   └── App.xaml.cs           # WinUI app: splash, service init, error handling
│   └── SquadUplink.Core/         # Shared logic library (logging, formatters)
├── tests/
│   └── SquadUplink.Tests/        # xUnit test suite (325+ tests)
│       ├── SmokeTests/           # DI, type loading, XAML binding validation
│       ├── Services/             # Unit tests for each service
│       ├── ViewModels/           # ViewModel behavior tests
│       ├── Logging/              # InMemorySink, payload formatter tests
│       └── EndToEnd/             # Bootstrap, integration, regression tests
├── scripts/
│   └── build-release.ps1         # Velopack release packaging script
├── SquadUplink.sln               # Solution file (.NET 10)
├── Directory.Build.props         # Shared build properties
└── README.md                     # This file
```

## 🔄 About

Squad Uplink v3 "Command Center" is the third major iteration. The original v1 was a React/Vite web app connecting via DevTunnels. v2 pivoted to native WinUI 3 when `copilot --remote` launched in April 2026. v3 adds MESS-style diagnostics, retro skins, audio feedback, and distribution packaging.

### v3 Highlights
- **MESS-style diagnostics**: 3-stage filter pipeline with payload-aware formatting
- **Retro skins**: Apple IIe, C64, Pip-Boy with optional CRT effects
- **Audio feedback**: Per-theme sound packs for session events
- **Velopack distribution**: Self-contained EXE with delta auto-updates
- **325+ tests**: Comprehensive coverage including end-to-end and regression suites
- **Command palette**: Quick-access keyboard shortcuts for all actions

### Built with Squad
This project was built by an AI team managed by [Squad](https://github.com/bradygaster/squad) — an intelligent agent orchestration framework for Git-native AI workflows.

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Squad Uplink v3** © 2026 | Command Center for modern Copilot CLI workflows
