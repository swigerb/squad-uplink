using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace SquadUplink.Models;

public enum SessionStatus
{
    Discovered,
    Launching,
    Running,
    Idle,
    Completed,
    Error
}

public enum HeartbeatStatus
{
    Unknown,
    Active,
    Idle,
    Waiting,
    Ended
}

public partial class SessionState : ObservableObject
{
    public string Id { get; set; } = string.Empty;

    [ObservableProperty]
    private int _processId;

    [ObservableProperty]
    private string _workingDirectory = string.Empty;

    [ObservableProperty]
    private string? _repositoryName;

    [ObservableProperty]
    private string? _gitHubTaskUrl;

    [ObservableProperty]
    private SessionStatus _status;

    [ObservableProperty]
    private DateTime _startedAt;

    [ObservableProperty]
    private SquadInfo? _squad;

    [ObservableProperty]
    private int _agentCount;

    [ObservableProperty]
    private string? _squadUniverse;

    [ObservableProperty]
    private bool _isRemoteEnabled;

    [ObservableProperty]
    private string _commandLineArgs = string.Empty;

    [ObservableProperty]
    private bool _isPinned;

    /// <summary>True when <see cref="GitHubTaskUrl"/> contains a non-empty value.</summary>
    [ObservableProperty]
    private bool _hasGitHubUrl;

    /// <summary>Parsed URI for safe x:Bind to NavigateUri (null when no URL).</summary>
    [ObservableProperty]
    private Uri? _gitHubTaskUri;

    [ObservableProperty]
    private string? _copilotSessionId;

    [ObservableProperty]
    private string? _sessionSummary;

    [ObservableProperty]
    private string? _gitBranch;

    [ObservableProperty]
    private HeartbeatStatus _heartbeat = HeartbeatStatus.Unknown;

    [ObservableProperty]
    private DateTime? _lastEventAt;

    [ObservableProperty]
    private string? _eventsJsonlPath;

    partial void OnGitHubTaskUrlChanged(string? value)
    {
        HasGitHubUrl = !string.IsNullOrEmpty(value);
        GitHubTaskUri = HasGitHubUrl && Uri.TryCreate(value, UriKind.Absolute, out var uri) ? uri : null;
    }

    partial void OnHeartbeatChanged(HeartbeatStatus value)
    {
        OnPropertyChanged(nameof(HeartbeatBrush));
        OnPropertyChanged(nameof(HeartbeatLabel));
    }

    public SolidColorBrush HeartbeatBrush => Heartbeat switch
    {
        HeartbeatStatus.Active => new SolidColorBrush(ColorHelper.FromArgb(255, 76, 175, 80)),
        HeartbeatStatus.Idle => new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7)),
        HeartbeatStatus.Waiting => new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54)),
        HeartbeatStatus.Ended => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
        _ => new SolidColorBrush(ColorHelper.FromArgb(255, 97, 97, 97))
    };

    public string HeartbeatLabel => Heartbeat switch
    {
        HeartbeatStatus.Active => "Active",
        HeartbeatStatus.Idle => "Thinking...",
        HeartbeatStatus.Waiting => "Waiting for Agent...",
        HeartbeatStatus.Ended => "Session ended",
        _ => ""
    };

    public ObservableCollection<string> OutputLines { get; } = [];
}
