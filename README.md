# 🚀 Squad Uplink

### Command Center for GitHub Copilot CLI Sessions

![.NET 10](https://img.shields.io/badge/.NET-10-512BD4) ![C# 14](https://img.shields.io/badge/C%23-14-239120) ![WinUI 3](https://img.shields.io/badge/WinUI-3-0078D4) ![Windows 11](https://img.shields.io/badge/Windows-11+-0078D4) ![Tests 665+](https://img.shields.io/badge/Tests-665%2B-brightgreen) ![License MIT](https://img.shields.io/badge/License-MIT-green)

Squad Uplink is a native Windows 11 desktop application that serves as your mission control cockpit for managing multiple GitHub Copilot CLI sessions with Squad awareness. Launch, discover, and monitor AI agent sessions — track token telemetry, visualize Squad hierarchies, and switch between 11 retro-futuristic themes.

<!-- Screenshots coming soon -->

---

## ✨ Key Features

### 🔍 Session Management

- **Process Discovery** — Finds running `copilot --remote` sessions via WMI (filters out daemons and background processes)
- **Session Launcher** — Start new sessions with repo picker, model selection, and custom arguments
- **Multi-Session Layouts** — Cards, Tabs, and Grid view with one-click layout toggle
- **GitHub Task URL Deep-Linking** — Click through to the Copilot CLI remote task viewer
- **Live Terminal Output** — Native RichTextBlock terminal with stdout/stderr capture
- **SQLite Session History** — Full session persistence with resume across app restarts

### 📊 Enterprise Telemetry

- **OTLP Listener on `:4318`** — Receives real-time `gen_ai.client.token.usage` metrics from Copilot CLI
- **Burn Rate Widget** — Live $/hr calculation with color-coded thresholds (green/amber/red)
- **Context Window Pressure** — Percentage of model context used with warning at 80%
- **Agent ROI** — Cost per decision committed across your Squad agents
- **Model Pricing for 7 models** — GPT-4o, GPT-4o-mini, Claude Opus 4.6, Claude Sonnet 4.5, Claude Haiku 4.5, o1, o1-mini

### 🏗️ Squad Awareness

- **Team Roster** — Reads `.squad/team.md` and displays agent roster with role emoji
- **Decision Feed** — Live updates parsed from `decisions.md` via Markdig
- **Orchestration Timeline** — Visual history from `orchestration-log/` entries
- **FileSystemWatcher with Debounce** — Real-time `.squad/` directory monitoring
- **Markdig Markdown Parsing** — Rich rendering of Squad config files

### 📋 Diagnostics & Logging

- **Expandable Footer Log Panel** — ▶/▼ toggle for quick log inspection without leaving your workflow
- **Full Diagnostics View** — 3-stage filtering pipeline: log level → text search → source context
- **Source-Generated Structured Logging** — 30+ `[LoggerMessage]` definitions, zero-allocation hot paths
- **Circular-Buffer Log Sink** — Custom Serilog sink that bridges real-time logs to the diagnostics UI
- **Smart Log Formatting** — Auto-detects JSON, stack traces, and CLI output for syntax-aware display
- **Runtime Log Level Switching** — Change verbosity without restarting
- **Markdown Diagnostic Report Export** — One-click export of filtered logs for sharing

### 🎨 11 Retro-Futuristic Themes

| # | Theme | Description |
|---|-------|-------------|
| 1 | **Fluent** (Default) | Windows 11 native light and dark modes |
| 2 | **Apple IIe** | 1984 phosphor green terminal (`#33FF33` on black) |
| 3 | **Commodore 64** | PETSCII blue and cream palette (`#A0A0FF` on `#4040E0`) |
| 4 | **Pip-Boy** | Fallout Vault-Tec amber (`#FFB000` on deep black) |
| 5 | **MU-TH-UR 6000** | Nostromo AI — *Alien* mainframe aesthetic |
| 6 | **W.O.P.R.** | NORAD war simulation — *WarGames* green on black |
| 7 | **The Matrix** | Digital rain green cascade |
| 8 | **Windows 95** | Classic chrome, 3D borders, and system fonts |
| 9 | **LCARS** | *Star Trek* bridge console — orange/blue panels |
| 10 | **Star Wars** | Imperial/Rebel holographic blue glow |
| 11 | **RetroBase** | Shared foundation for all retro themes (CRT scanline effects) |

All themes are switchable at runtime, persisted across sessions, and support optional CRT scanline effects.

### ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Ctrl+Tab** | Next session |
| **Ctrl+Shift+Tab** | Previous session |
| **Ctrl+1** to **Ctrl+9** | Jump to session N |
| **Ctrl+N** | New session |
| **Ctrl+W** | Close session |
| **Ctrl+Shift+U** | Command palette |
| **F11** | Toggle focus mode |
| **Ctrl+,** | Open Settings |
| **Ctrl+R** | Refresh process scan |

### 🔔 Additional Features

- **Command Palette** (Ctrl+Shift+U) — Quick access to all actions
- **Token Gauge Control** — Visual token budget with cost tracking
- **Timeline Scrubber** — Scrub through session history and replay events
- **SQLite Session History** — Full persistence with resume support
- **Velopack Auto-Updates** — Delta patching via GitHub Releases
- **Windows Toast Notifications** — Alerts for session discovery, completion, and errors
- **Splash Screen** — Branded startup experience
- **Audio Feedback** — Per-theme sound packs for session lifecycle events

---

## 📡 How to Enable Copilot CLI Telemetry

```bash
export COPILOT_OTEL_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
copilot --remote "your prompt here"
```

Squad Uplink will receive token usage in real-time and update the Burn Rate, Context Pressure, and Agent ROI dashboard widgets automatically.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│              Squad Uplink                          │
│          (WinUI 3 / .NET 10 / C# 14)            │
├──────────────────────────────────────────────────┤
│  PRESENTATION    Views, Controls, Themes          │
│  VIEWMODEL       CommunityToolkit.Mvvm            │
│  SERVICES        Scanner, Launcher, Telemetry     │
│  LOGGING         Serilog (InMemory+File+Debug)    │
│  DATA            SQLite, Markdig, FileWatcher     │
│  TELEMETRY       OTLP Listener, ModelPricing      │
└──────────────────────────────────────────────────┘
```

### Key Services

| Service | Responsibility |
|---------|---------------|
| **ProcessScanner** | WMI queries to find `copilot.exe` processes with `--remote` flag |
| **SessionManager** | CRUD + scan cycle + auto-prune for active sessions |
| **ProcessLauncher** | Spawns new Copilot CLI processes with configurable arguments |
| **OutputCapture** | Pipes process stdout/stderr to the native terminal control |
| **SquadDetector** | Parses `.squad/team.md` hierarchies and sub-squads |
| **SquadFileWatcher** | FileSystemWatcher with debounce for `.squad/` directory changes |
| **TelemetryService** | Aggregates token usage records, calculates burn rate and ROI |
| **OtlpListener** | HTTP listener on `:4318` accepting OTLP JSON metric payloads |
| **ThemeService** | Manages 11 theme XAML dictionaries with persistence |
| **AudioService** | Per-theme sound packs for session lifecycle events |
| **NotificationService** | Windows toast notifications for session events |
| **DataService** | SQLite persistence for session history, settings, and telemetry |
| **LoggingService** | Serilog pipeline configuration with multiple sinks |

### Custom Controls (13)

| Control | Purpose |
|---------|---------|
| `BurnRateWidget` | Live $/hr display with color-coded thresholds |
| `ContextPressureWidget` | Context window % usage gauge |
| `AgentRoiWidget` | Cost per decision committed |
| `TokenGaugeControl` | Visual token budget indicator |
| `TimelineScrubber` | Session history replay scrubber |
| `SessionTerminalControl` | Native XAML terminal output display |
| `SessionLayoutControl` | Tab/Card/Grid layout switcher |
| `GridLayoutPanel` | Responsive grid for multi-session view |
| `SquadTreeControl` | TreeView for Squad agent hierarchy |
| `SquadStatusPanel` | Squad state summary panel |
| `OrchestrationTimelineControl` | Visual timeline from orchestration logs |
| `DecisionFeedControl` | Live decision stream from `decisions.md` |
| `CommandPalette` | Fuzzy-search command launcher |

---

## 🛠️ Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | .NET | 10 | Latest LTS runtime |
| **Language** | C# | 14 (latest) | Source generators, pattern matching |
| **UI Framework** | WinUI 3 | 1.7 | Windows App SDK XAML |
| **Windows API** | Windows App SDK | 1.7.250513003 | Native Windows integration |
| **MVVM** | CommunityToolkit.Mvvm | 8.4.0 | Source-generated ObservableObject/RelayCommand |
| **Logging** | Serilog | 4.3.0 | File + Debug + InMemory + Custom sinks |
| **Database** | Microsoft.Data.Sqlite | 10.0 preview | Session history, settings, telemetry |
| **Markdown** | Markdig | 0.38.0 | Squad file parsing, diagnostic report export |
| **Terminal** | Native WinUI XAML | — | RichTextBlock-based terminal output |
| **Updates** | Velopack | 0.0.1251 | Self-contained EXE with delta patching |
| **Process API** | System.Management | 9.0.5 | WMI-based process discovery |
| **DI** | Microsoft.Extensions.DependencyInjection | 10.0 preview | Constructor injection throughout |
| **Hosting** | Microsoft.Extensions.Hosting | 10.0 preview | App lifecycle management |
| **Testing** | xUnit + Moq + Coverlet | latest | Unit, integration, UX, smoke, regression |

---

## 🚀 Getting Started

### Prerequisites

- **Windows 11** (build 22621 or later)
- **.NET 10 SDK** — [Download](https://dotnet.microsoft.com/download/dotnet)
- **GitHub Copilot CLI** — Install via `npm install -g @github/copilot-cli`
- **Visual Studio 2026** (optional) — Community or higher with the WinUI workload

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

# Release build
dotnet build SquadUplink.sln -p:Platform=x64 -c Release
.\src\SquadUplink\bin\x64\Release\net10.0-windows10.0.22621.0\SquadUplink.exe
```

### First Launch

1. Squad Uplink automatically scans for running `copilot --remote` sessions
2. Click **Launch New** to start a fresh Copilot CLI session
3. Sessions appear in the dashboard with live terminal output
4. Switch themes via **Settings → Appearance** (11 themes available)
5. Toggle layout (tabs/cards/grid) in **Settings → Layout**
6. Open **Diagnostics** for log inspection and report export
7. Enable OTLP telemetry for real-time token tracking widgets

---

## 🧪 Testing

Squad Uplink has **665+ tests** across 44 test files organized into 6 categories:

| Category | Files | Coverage |
|----------|-------|----------|
| **Smoke Tests** | DI, type loading, XAML binding, service construction | Bootstrap validation |
| **Service Tests** | ProcessScanner, SessionManager, SquadDetector, OtlpListener, Theme, Data, etc. | Core business logic |
| **ViewModel Tests** | Dashboard, Session, Settings, Diagnostics, Telemetry widgets | UI behavior |
| **UX Tests** | Command palette, navigation, null safety, binding safety | User experience flows |
| **Logging Tests** | InMemorySink, LogPayloadFormatter | Diagnostics pipeline |
| **End-to-End** | App bootstrap, integration, regression | Full-stack validation |

```powershell
# Run all tests
dotnet test SquadUplink.sln -p:Platform=x64

# With code coverage
dotnet test SquadUplink.sln -p:Platform=x64 --collect:"XPlat Code Coverage"
```

---

## 📦 Distribution

Squad Uplink uses [Velopack](https://velopack.io) for self-contained packaging with delta auto-updates.

```powershell
# Install Velopack CLI (one-time)
dotnet tool install -g vpk

# Package for distribution
.\scripts\build-release.ps1 -Version "3.0.0"
```

This generates a self-contained EXE and delta update packages in `releases/`. Upload to GitHub Releases for automatic update delivery to users.

---

## 📖 Project Structure

```
squad-uplink/
├── src/
│   ├── SquadUplink/                    # Main WinUI 3 application
│   │   ├── Views/                      # 5 XAML pages (Dashboard, Session, Settings, Launch, Diagnostics)
│   │   ├── ViewModels/                 # 5 MVVM view models
│   │   ├── Services/                   # 13 services (Scanner, Launcher, Telemetry, OTLP, etc.)
│   │   ├── Controls/                   # 13 custom controls (Widgets, Terminal, CommandPalette, etc.)
│   │   ├── Contracts/                  # Service interfaces (ITelemetryService, IProcessScanner)
│   │   ├── Models/                     # 15 data models (SessionState, ModelPricing, TokenUsage, etc.)
│   │   ├── Themes/                     # 11 theme XAML dictionaries
│   │   ├── Converters/                 # Value converters (Bool, Level, Status, TimeAgo)
│   │   ├── Helpers/                    # DI registration extensions
│   │   ├── Assets/                     # Icons, audio, application resources
│   │   ├── Program.cs                  # Entry point: Velopack + Serilog + DI + WinUI
│   │   └── App.xaml.cs                 # WinUI app: splash, service init, error handling
│   └── SquadUplink.Core/              # Shared library
│       ├── Logging/                    # InMemorySink, LogPayloadFormatter, 30+ LogMessages
│       ├── Models/                     # Shared models (SquadInfo, DecisionEntry)
│       └── Services/                   # MarkdownParser (Markdig-based)
├── tests/
│   └── SquadUplink.Tests/             # xUnit test suite (665+ tests)
│       ├── SmokeTests/                 # DI, type loading, XAML binding validation
│       ├── Services/                   # Unit tests for all 13 services
│       ├── ViewModels/                 # ViewModel behavior + telemetry widget tests
│       ├── UxTests/                    # Command palette, navigation, null/binding safety
│       ├── Logging/                    # InMemorySink, LogPayloadFormatter tests
│       ├── Integration/                # Real Squad file tests
│       └── EndToEnd/                   # Bootstrap, integration, regression tests
├── scripts/
│   └── build-release.ps1               # Velopack release packaging
├── SquadUplink.sln                     # Solution file
├── Directory.Build.props               # Shared build properties
└── README.md                           # You are here
```

---

## 🤖 Built with Squad

This project was built by an AI team managed by [Squad](https://github.com/bradygaster/squad) — an intelligent agent orchestration framework for Git-native AI workflows. The team includes Jobs (Lead), Woz (Lead Dev), Kare (Frontend), Hertzfeld (Tester), Scribe, and Ralph.

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**Squad Uplink** © 2026 — Command Center for modern Copilot CLI workflows

</div>
