using SquadUplink.Models;

namespace SquadUplink.Contracts;

/// <summary>
/// Abstraction for remote squad monitoring relay.
/// Current implementation: local passthrough (deferred — Phase 8).
/// Future: Azure SignalR relay for remote session monitoring.
/// </summary>
public interface IRemoteRelay : IAsyncDisposable
{
    /// <summary>Connect to the relay service.</summary>
    Task ConnectAsync(string connectionString, string authToken, CancellationToken ct = default);

    /// <summary>Disconnect from the relay service.</summary>
    Task DisconnectAsync();

    /// <summary>Whether the relay is currently connected.</summary>
    bool IsConnected { get; }

    /// <summary>Subscribe to squad state updates from remote agents.</summary>
    IAsyncEnumerable<SquadInfo> SubscribeToSquadStateAsync(CancellationToken ct = default);

    /// <summary>Subscribe to decision feed updates from remote agents.</summary>
    IAsyncEnumerable<DecisionEntry> SubscribeToDecisionsAsync(CancellationToken ct = default);

    /// <summary>Subscribe to token usage telemetry from remote agents.</summary>
    IAsyncEnumerable<TokenUsageRecord> SubscribeToTelemetryAsync(CancellationToken ct = default);

    /// <summary>Send an interrupt (graceful stop) command to a remote session.</summary>
    Task SendInterruptAsync(string sessionId, CancellationToken ct = default);

    /// <summary>Send a force-stop command to a remote session.</summary>
    Task SendForceStopAsync(string sessionId, CancellationToken ct = default);

    /// <summary>Raised when connection state changes.</summary>
    event EventHandler<RemoteConnectionState>? ConnectionStateChanged;
}

/// <summary>Remote relay connection states.</summary>
public enum RemoteConnectionState
{
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed
}
