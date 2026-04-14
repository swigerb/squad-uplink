using System.Collections.ObjectModel;
using System.Diagnostics;
using SquadUplink.Models;

namespace SquadUplink.Contracts;

public interface IProcessScanner
{
    Task<IReadOnlyList<SessionState>> ScanAsync(CancellationToken ct = default);
}

public interface IProcessLauncher
{
    Task<SessionState> LaunchAsync(string workingDirectory, string? initialPrompt = null, CancellationToken ct = default);
    Task<SessionState> LaunchAsync(LaunchOptions options, CancellationToken ct = default);
}

public interface IOutputCapture
{
    IAsyncEnumerable<string> CaptureAsync(Process process, CancellationToken ct = default);
}

public interface ISessionManager
{
    ObservableCollection<SessionState> Sessions { get; }
    Task StartScanningAsync(CancellationToken ct = default);
    Task<SessionState> LaunchSessionAsync(string workingDirectory, string? initialPrompt = null);
    Task StopSessionAsync(string sessionId);
}

public interface ISquadDetector
{
    Task<SquadInfo?> DetectAsync(string workingDirectory, CancellationToken ct = default);
}

public interface IThemeService
{
    string CurrentThemeId { get; }
    void ApplyTheme(string themeId);
    Task LoadSavedThemeAsync();
    IReadOnlyList<string> AvailableThemes { get; }
    event Action<string>? ThemeChanged;
}

public enum SoundEvent
{
    SessionConnected,
    SessionDisconnected,
    AgentActivity,
    Error,
    Notification
}

public interface IAudioService
{
    bool IsEnabled { get; set; }
    double Volume { get; set; }
    string SoundPack { get; set; }
    void PlaySound(SoundEvent soundEvent);
    void SetMuted(bool muted);
    bool IsMuted { get; }
}

public interface IDataService
{
    Task InitializeAsync();
    Task SaveSessionHistoryAsync(SessionHistoryEntry entry);
    Task<IReadOnlyList<SessionHistoryEntry>> GetRecentSessionsAsync(int count = 20);
    Task<AppSettings> GetSettingsAsync();
    Task SaveSettingsAsync(AppSettings settings);

    // Token telemetry persistence
    Task SaveTokenUsageAsync(TokenUsageRecord record);
    Task<IReadOnlyList<TokenUsageRecord>> GetTokenUsageAsync(int limit = 1000);
    Task<IReadOnlyList<TokenUsageRecord>> GetTokenUsageBySessionAsync(string sessionId);
}

public interface INotificationService
{
    Task InitializeAsync();
    Task ShowSessionCompletedAsync(string repoName, TimeSpan duration);
    Task ShowPermissionRequestAsync(string repoName, string sessionId);
    Task ShowErrorAsync(string repoName, string errorMessage);
    Task ShowSessionDiscoveredAsync(string repoName, string sessionId);
}
