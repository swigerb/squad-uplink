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
    private bool _isRemoteEnabled;

    [ObservableProperty]
    private string _commandLineArgs = string.Empty;

    [ObservableProperty]
    private bool _isPinned;

    public ObservableCollection<string> OutputLines { get; } = [];
}
