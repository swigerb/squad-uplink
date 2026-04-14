# Remote Relay Architecture Proposal

> **Phase 8 · Status: Deferred** — Interface stub added for forward compatibility.
> Local-first focus for v1.0; remote relay targeted for a future release.

## Problem Statement

Squad Uplink currently monitors only local Copilot CLI sessions via filesystem
access (`FileSystemWatcher`) and WMI process scanning (`IProcessScanner`).
Users running squads on remote machines — dev VMs, cloud workstations, GitHub
Codespaces, CI runners — cannot monitor those sessions from their local
Command Center.

This limits visibility for Solution Engineers who demo or operate squads across
multiple environments.

## Proposed Solution: Azure SignalR Relay

### Architecture Overview

```
[Remote Machine]                    [Azure]                    [Local Machine]
┌─────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│  Uplink Agent   │───▶│  Azure SignalR       │◀───│  Squad Uplink       │
│  (headless)     │    │  (serverless mode)   │    │  (WinUI 3 app)      │
│                 │    │                      │    │                     │
│  - FileWatcher  │    │  - Zero infra        │    │  - IRemoteRelay     │
│  - ProcessScan  │    │  - Auto-scale        │    │  - Unified UI       │
│  - Push deltas  │    │  - <100ms latency    │    │  - Local + Remote   │
└─────────────────┘    └─────────────────────┘    └─────────────────────┘
```

### Transport Layer

- Azure SignalR Service in **serverless mode** for zero-infrastructure relay.
- WebSocket connections (`WSS`) for real-time streaming.
- JSON message format matching existing internal models (`SquadInfo`,
  `DecisionEntry`, `TokenUsageRecord`).
- MessagePack upgrade path for bandwidth-sensitive scenarios.

### Authentication

| Concern | Mechanism |
|---------|-----------|
| User identity | GitHub token pass-through (same token used for CLI auth) |
| SignalR access | Azure AD service principal for agents; user tokens for clients |
| New credentials? | **None.** No new credential management required for end users. |

### Message Types

| # | Type | Direction | Description |
|---|------|-----------|-------------|
| 1 | `SquadStateUpdate` | Agent → Client | Full `SquadInfo` snapshot (team name, members, status) |
| 2 | `DecisionAppend` | Agent → Client | Incremental `DecisionEntry` (single entry, not full file) |
| 3 | `TelemetryRecord` | Agent → Client | Token usage event (mirrors `TokenUsageRecord`) |
| 4 | `SessionLifecycle` | Agent → Client | Session started / stopped / error events |
| 5 | `InterruptCommand` | Client → Agent | Upstream command: graceful stop or force-stop |

### Data Flow

- **Push frequency:** File changes are debounced (500 ms) and pushed as deltas.
- **Reconnection:** Automatic reconnect with exponential backoff
  (1 s → 2 s → 4 s → 8 s → max 30 s).
- **Offline buffer:** Agent queues up to 100 events while disconnected;
  oldest events are dropped when the buffer is full.
- **Heartbeat:** 30-second heartbeat to detect stale connections.
- **Idempotency:** Each message carries a monotonic sequence number so the
  client can deduplicate after reconnect.

### Security Considerations

- All data in transit via WSS (TLS 1.3).
- SignalR groups scoped per-user — no cross-user data leakage.
- Agent validates GitHub token on startup before opening the relay.
- No secrets stored in `.squad/` committed files (enforced by existing
  `secret-handling` skill).
- Connection strings stored in user-scoped `appsettings.json`, never committed.

## Interface Design

The `IRemoteRelay` interface lives in `Contracts/IRemoteRelay.cs` and
references existing models from `SquadUplink.Models`.

```csharp
public interface IRemoteRelay : IAsyncDisposable
{
    Task ConnectAsync(string connectionString, string authToken, CancellationToken ct = default);
    Task DisconnectAsync();
    bool IsConnected { get; }

    IAsyncEnumerable<SquadInfo> SubscribeToSquadStateAsync(CancellationToken ct = default);
    IAsyncEnumerable<DecisionEntry> SubscribeToDecisionsAsync(CancellationToken ct = default);
    IAsyncEnumerable<TokenUsageRecord> SubscribeToTelemetryAsync(CancellationToken ct = default);

    Task SendInterruptAsync(string sessionId, CancellationToken ct = default);
    Task SendForceStopAsync(string sessionId, CancellationToken ct = default);

    event EventHandler<RemoteConnectionState>? ConnectionStateChanged;
}
```

### Design Rationale

- **`IAsyncEnumerable`** over events: composable with LINQ, back-pressure
  aware, and consistent with the `IAsyncDisposable` lifetime.
- **`CancellationToken` everywhere**: aligns with existing contract patterns
  (see `IProcessScanner.ScanAsync`).
- **Separate Subscribe methods** (not a single `IObservable<object>`): keeps
  each stream strongly typed for compile-time safety.

## Implementation Phases

| Phase | Scope | Deliverable |
|-------|-------|-------------|
| **A** | Interface + local passthrough | `IRemoteRelay` interface, `LocalRelay` no-op implementation |
| **B** | Headless Uplink Agent | Console app (.NET 10) that watches files and pushes to relay |
| **C** | Azure SignalR integration | `SignalRRelay` implementation, serverless Azure Function hub |
| **D** | UI integration | Remote session indicators, connection status bar, unified session list |

## Cost Estimate

| Tier | Connections | Messages/day | Monthly Cost |
|------|-------------|--------------|--------------|
| Free | 20 | 20,000 | $0 |
| Standard | Unlimited | Unlimited | ~$50 |

The Free tier is sufficient for 1–2 remote machines during development and
demos. Standard tier is recommended for production multi-machine setups.

## Decision

**Deferred to future release.** Local-first focus for v1.0.

The `IRemoteRelay` interface stub is added now so that:

1. Future `SignalRRelay` can be registered via DI without changing consumers.
2. The model types (`SquadInfo`, `DecisionEntry`, `TokenUsageRecord`) are
   validated as relay-compatible today.
3. A `LocalRelay` passthrough can be wired in immediately if needed for testing.
