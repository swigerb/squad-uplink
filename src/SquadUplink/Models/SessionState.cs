using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;

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

    partial void OnGitHubTaskUrlChanged(string? value)
    {
        HasGitHubUrl = !string.IsNullOrEmpty(value);
        GitHubTaskUri = HasGitHubUrl && Uri.TryCreate(value, UriKind.Absolute, out var uri) ? uri : null;
    }

    public ObservableCollection<string> OutputLines { get; } = [];
}
