# 🚀 Squad Uplink

**Mission Control for GitHub Copilot CLI Sessions**

![.NET 10](https://img.shields.io/badge/.NET-10-512BD4) ![C# 14](https://img.shields.io/badge/C%23-14-239120) ![WinUI 3](https://img.shields.io/badge/WinUI-3-0078D4) ![Windows 11](https://img.shields.io/badge/Windows-11+-0078D4) ![License MIT](https://img.shields.io/badge/License-MIT-green)

Squad Uplink is a native Windows 11 desktop application that serves as your cockpit for managing multiple GitHub Copilot CLI sessions. Launch, discover, and monitor AI agent sessions with Squad awareness — all from a retro-themed mission control interface.

## ✨ Key Features

- 🔍 **Process Discovery** — Automatically finds running `copilot --remote` sessions and displays real-time status
- 🚀 **Session Launching** — Start new Copilot CLI sessions with one click, configurable with custom arguments
- 📊 **Multi-Session Dashboard** — Monitor all sessions in configurable tab or grid layouts with live output capture
- 🏗️ **Squad Awareness** — Detects Squad/SubSquad hierarchies from `.squad/team.md` for intelligent agent grouping
- 🎨 **Retro Themes** — Fluent 2 default light/dark mode plus Apple IIe, C64, and Pip-Boy retro skins
- 🔔 **Windows Notifications** — Toast alerts for session startup, completion, and error events
- 📈 **Telemetry Dashboard** — Real-time CPU, memory, and session activity graphs powered by WebView2
- ⌨️ **Keyboard Shortcuts** — Ctrl+Tab, Ctrl+1-9, Ctrl+N, F11 for power users and accessibility
- 🔗 **GitHub Integration** — Deep-link to Copilot CLI remote task viewer for seamless workflow
- 🔄 **Auto-Updates** — Velopack-powered seamless background updates without restart friction

## Screenshots

<!-- Screenshots coming soon -->

## 🚦 Getting Started

### Prerequisites

- **Windows 11** (build 22621 or later)
- **.NET 10 SDK** — [Download](https://dotnet.microsoft.com/download/dotnet)
- **Visual Studio 2026** (Community+ or Code with C# extension) — optional for development
- **GitHub Copilot CLI** — Install via `npm install -g @github/copilot-cli`

### Clone and Build

```bash
git clone https://github.com/swigerb/squad-uplink.git
cd squad-uplink
dotnet build SquadUplink.sln -p:Platform=x64
```

### Run

```bash
# Debug mode
dotnet run -p src/SquadUplink/SquadUplink.csproj

# Or release build
dotnet build SquadUplink.sln -p:Platform=x64 -c Release
.\bin\x64\Release\net10.0-windows10.0.22621.0\SquadUplink.exe
```

### First Launch

On startup, Squad Uplink automatically scans for running `copilot --remote` sessions:
1. Click **"Launch New"** to start a fresh Copilot CLI session
2. Sessions appear in the dashboard with real-time output
3. Switch themes via **Settings** → **Appearance**
4. Configure layout (tabs vs grid) in **Settings** → **Layout**

## 🏛️ Architecture

Squad Uplink follows a clean layered architecture:

```
┌─────────────────────────────────────────────┐
│     Presentation (WinUI 3 / XAML)           │
│  Views: DashboardPage, SessionPage, etc.    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│    ViewModel Layer (MVVM Toolkit)           │
│ DashboardViewModel, SessionViewModel, etc.  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Services Layer (Business Logic)     │
│  ProcessScanner, SessionManager, Squad-     │
│  Detector, ThemeService, NotificationSvc   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│        Data Layer (SQLite + Files)          │
│   Serilog logging, session state, config    │
└─────────────────────────────────────────────┘
```

**Key Service Responsibilities:**
- **ProcessScanner** — WMI queries to find `copilot.exe` processes
- **SessionManager** — CRUD operations on active sessions
- **SquadDetector** — Parses `.squad/team.md` hierarchies
- **ThemeService** — Manages Fluent/retro theme switching
- **NotificationService** — Delivers Windows 10+ toast notifications
- **OutputCapture** — Pipes process stdout/stderr to terminal control
- **DataService** — SQLite persistence for session history and preferences
- **LoggingService** — Structured Serilog with file + debug output

## 🛠️ Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | .NET | 10 |
| **Language** | C# | 14 (latest) |
| **UI Framework** | WinUI 3 | 1.7 |
| **Windows API** | Windows App SDK | 1.7 |
| **MVVM** | CommunityToolkit.Mvvm | 8.4 |
| **Logging** | Serilog | 4.3 |
| **Database** | SQLite | via Microsoft.Data.Sqlite |
| **Web Control** | WebView2 | 1.0 |
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

### Building

```bash
# Debug build for current platform
dotnet build SquadUplink.sln -p:Platform=x64

# Release build (optimized)
dotnet build SquadUplink.sln -p:Platform=x64 -c Release

# Build for ARM64
dotnet build SquadUplink.sln -p:Platform=ARM64 -c Release
```

### Testing

```bash
# Run all tests with coverage
dotnet test SquadUplink.sln -p:Platform=x64

# Run with detailed coverage report (Coverlet)
dotnet test SquadUplink.sln -p:Platform=x64 \
  /p:CollectCoverageRangeInfo=true \
  /p:CoverageDirectory=./coverage
```

### Release Packaging

```bash
# Package for distribution (requires Velopack)
.\scripts\build-release.ps1 -Platform x64 -Configuration Release
```

This generates MSIX, portable EXE, and delta update packages in `dist/`.

## 📖 Project Structure

```
squad-uplink/
├── src/
│   ├── SquadUplink/              # Main WinUI 3 app
│   │   ├── Views/                # XAML pages (Dashboard, Settings, etc.)
│   │   ├── ViewModels/           # MVVM view models
│   │   ├── Services/             # Business logic (ProcessScanner, etc.)
│   │   ├── Controls/             # Reusable XAML controls
│   │   ├── Themes/               # Theme definitions (Fluent, C64, etc.)
│   │   ├── Styles/               # Global styles and resource dictionaries
│   │   ├── Assets/               # Icons, audio, application resources
│   │   ├── wwwroot/              # Static web content for WebView2
│   │   └── app.manifest          # Windows app capabilities
│   ├── SquadUplink.Core/         # Shared logic library
│   └── SquadUplink.Tests/        # xUnit tests + mocks
├── tests/
│   └── SquadUplink.Tests/        # Integration and unit tests
├── scripts/
│   ├── build-release.ps1         # Release packaging script
│   └── sign-release.ps1          # Code signing (if applicable)
├── SquadUplink.sln               # Solution file (.NET 10)
├── Directory.Build.props          # Shared build properties
└── README.md                      # This file
```

## 🔄 About

Squad Uplink v2 is a complete pivot from the original React/Vite web app that connected to Squad Remote Control via DevTunnels. With GitHub's April 2026 launch of native `copilot --remote`, the project evolved into a native Windows cockpit for managing Copilot CLI sessions locally.

### v2 Highlights
- Native performance: no Electron overhead
- Direct process access: monitor CPU/memory in real-time
- Squad integration: automatic agent hierarchy discovery
- Windows-first: native notifications, keyboard shortcuts, themes
- Instant startup: zero cold-start latency
- Offline capable: works without internet after launch

### Built with Squad
This project was built by an AI team managed by [Squad](https://github.com/bradygaster/squad) — an intelligent agent orchestration framework for Git-native AI workflows.

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

**Squad Uplink v2** © 2026 | Built for modern Copilot CLI workflows
