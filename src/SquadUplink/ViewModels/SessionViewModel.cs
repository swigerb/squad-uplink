using System.Collections.ObjectModel;
using System.Text.RegularExpressions;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.ViewModels;

public partial class SessionViewModel : ViewModelBase
{
    private readonly ISessionManager _sessionManager;
    private readonly Microsoft.UI.Dispatching.DispatcherQueue? _dispatcherQueue;
    private System.Threading.Timer? _refreshTimer;

    [ObservableProperty]
    private string _statusText = "No session selected";

    [ObservableProperty]
    private string _processIdText = string.Empty;

    [ObservableProperty]
    private string _workingDirectoryText = string.Empty;

    [ObservableProperty]
    private string _repositoryName = "No Session";

    [ObservableProperty]
    private SessionStatus _currentStatus;

    [ObservableProperty]
    private string _sessionAge = "—";

    [ObservableProperty]
    private int _outputLineCount;

    [ObservableProperty]
    private string _lastActivityText = "—";

    [ObservableProperty]
    private string _squadName = "—";

    [ObservableProperty]
    private string _errorLogSummary = "0 errors";

    [ObservableProperty]
    private Uri? _gitHubUri;

    [ObservableProperty]
    private bool _hasGitHubUrl;

    [ObservableProperty]
    private string _terminalContent = string.Empty;

    [ObservableProperty]
    private string _gitBranch = "—";

    [ObservableProperty]
    private string _sessionSummary = "—";

    [ObservableProperty]
    private int _agentCount;

    [ObservableProperty]
    private string _heartbeatText = "—";

    [ObservableProperty]
    private string _copilotSessionId = "—";

    [ObservableProperty]
    private string _squadUniverse = "—";

    [ObservableProperty]
    private string _memberRoster = "—";

    public ObservableCollection<string> OutputLines { get; } = [];

    private SessionState? _currentSession;

    internal static readonly Regex GitHubUrlPattern = new(
        @"https?://github\.com/[^\s]+(?:/tasks/[^\s]+|/issues/[^\s]+|/pull/[^\s]+)",
        RegexOptions.Compiled);

    public SessionViewModel(ISessionManager sessionManager, ILogger<SessionViewModel> logger)
        : base(logger)
    {
        _sessionManager = sessionManager;
        try { _dispatcherQueue = Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread(); }
        catch (System.Runtime.InteropServices.COMException) { _dispatcherQueue = null; }
    }

    public void LoadSession(SessionState session)
    {
        _currentSession = session;
        CurrentStatus = session.Status;
        StatusText = session.Status.ToString();
        ProcessIdText = $"PID {session.ProcessId}";
        WorkingDirectoryText = session.WorkingDirectory;
        RepositoryName = session.RepositoryName ?? "Unknown";
        GitHubUri = session.GitHubTaskUrl is not null ? new Uri(session.GitHubTaskUrl) : null;
        HasGitHubUrl = session.GitHubTaskUrl is not null;
        OutputLineCount = session.OutputLines.Count;

        // Rich session data from CopilotSessionService enrichment
        GitBranch = session.GitBranch ?? "—";
        SessionSummary = !string.IsNullOrEmpty(session.SessionSummary)
            ? session.SessionSummary
            : "—";
        AgentCount = session.AgentCount;
        CopilotSessionId = !string.IsNullOrEmpty(session.CopilotSessionId)
            ? session.CopilotSessionId[..Math.Min(8, session.CopilotSessionId.Length)] + "…"
            : "—";
        SquadUniverse = session.SquadUniverse ?? "—";

        // Use actual team name + agent count
        SquadName = session.Squad is not null
            ? $"{session.Squad.TeamName} ({session.Squad.Members.Count} agents)"
            : "—";

        // Member roster as compact string
        MemberRoster = session.Squad is not null
            ? string.Join(" · ", session.Squad.Members.Select(m => $"{m.Emoji}{m.Name}"))
            : "—";

        // Heartbeat from session state
        HeartbeatText = session.Heartbeat switch
        {
            HeartbeatStatus.Active => "🟢 Active",
            HeartbeatStatus.Idle => "🟡 Idle",
            HeartbeatStatus.Waiting => "🟠 Waiting",
            HeartbeatStatus.Ended => "🔴 Ended",
            _ => "⚪ Unknown"
        };

        // Sync output lines to our observable collection
        OutputLines.Clear();
        foreach (var line in session.OutputLines)
            OutputLines.Add(line);

        // Extract GitHub URL from output if not already set
        if (!HasGitHubUrl)
        {
            ExtractGitHubUrlFromOutput(session);
        }

        var elapsed = DateTime.UtcNow - session.StartedAt;
        SessionAge = elapsed.TotalMinutes < 60
            ? $"{(int)elapsed.TotalMinutes}m"
            : $"{(int)elapsed.TotalHours}h {(int)(elapsed.TotalMinutes % 60)}m";

        // Fix Last Activity — use LastEventAt if available, fall back to session summary
        LastActivityText = session.LastEventAt is not null
            ? FormatTimeAgo(session.LastEventAt.Value)
            : session.OutputLines.Count > 0
                ? "Active"
                : !string.IsNullOrEmpty(session.SessionSummary)
                    ? "Running (no events captured)"
                    : "Awaiting first event";

        ErrorLogSummary = session.Status == SessionStatus.Error ? "1 error" : "0 errors";

        // Start periodic refresh for live data (age, heartbeat, last activity)
        _refreshTimer?.Dispose();
        _refreshTimer = new System.Threading.Timer(_ =>
        {
            _dispatcherQueue?.TryEnqueue(RefreshLiveData);
        }, null, TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(5));
    }

    private void RefreshLiveData()
    {
        if (_currentSession is null) return;

        var elapsed = DateTime.UtcNow - _currentSession.StartedAt;
        SessionAge = elapsed.TotalMinutes < 60
            ? $"{(int)elapsed.TotalMinutes}m"
            : $"{(int)elapsed.TotalHours}h {(int)(elapsed.TotalMinutes % 60)}m";

        HeartbeatText = _currentSession.Heartbeat switch
        {
            HeartbeatStatus.Active => "🟢 Active",
            HeartbeatStatus.Idle => "🟡 Idle",
            HeartbeatStatus.Waiting => "🟠 Waiting",
            HeartbeatStatus.Ended => "🔴 Ended",
            _ => "⚪ Unknown"
        };

        if (_currentSession.LastEventAt is not null)
            LastActivityText = FormatTimeAgo(_currentSession.LastEventAt.Value);

        OutputLineCount = _currentSession.OutputLines.Count;
    }

    private static string FormatTimeAgo(DateTime utcTime)
    {
        var elapsed = DateTime.UtcNow - utcTime;
        return elapsed.TotalSeconds switch
        {
            < 10 => "Just now",
            < 60 => $"{(int)elapsed.TotalSeconds}s ago",
            < 3600 => $"{(int)elapsed.TotalMinutes}m ago",
            _ => $"{(int)elapsed.TotalHours}h {(int)(elapsed.TotalMinutes % 60)}m ago"
        };
    }

    internal void ExtractGitHubUrlFromOutput(SessionState session)
    {
        foreach (var line in session.OutputLines)
        {
            var url = ExtractGitHubUrl(line);
            if (url is not null)
            {
                session.GitHubTaskUrl = url;
                GitHubUri = new Uri(url);
                HasGitHubUrl = true;
                Log.Information("GitHub task URL extracted: {Url}", url);
                break;
            }
        }
    }

    internal static string? ExtractGitHubUrl(string text)
    {
        var match = GitHubUrlPattern.Match(text);
        return match.Success ? match.Value : null;
    }

    [RelayCommand]
    private async Task StopAsync()
    {
        if (_currentSession is null) return;
        await RunBusyAsync(async () =>
        {
            await _sessionManager.StopSessionAsync(_currentSession.Id);
            CurrentStatus = _currentSession.Status;
            StatusText = _currentSession.Status.ToString();
            StatusMessage = "Session stopped";
            Log.Information("Session {Id} stopped via UI", _currentSession.Id);
        }, "Stop session");
    }

    [RelayCommand]
    private async Task RestartAsync()
    {
        if (_currentSession is null) return;
        await RunBusyAsync(async () =>
        {
            var dir = _currentSession.WorkingDirectory;
            await _sessionManager.StopSessionAsync(_currentSession.Id);
            var newSession = await _sessionManager.LaunchSessionAsync(dir);
            LoadSession(newSession);
            StatusMessage = "Session restarted";
            Log.Information("Session restarted in {Dir}", dir);
        }, "Restart session");
    }

    [RelayCommand]
    private async Task OpenInGitHubAsync()
    {
        if (_currentSession?.GitHubTaskUrl is { } url)
        {
            Log.Debug("Opening GitHub URL: {Url}", url);
            try
            {
                await Windows.System.Launcher.LaunchUriAsync(new Uri(url));
            }
            catch (Exception ex)
            {
                Log.Warning(ex, "Failed to launch GitHub URL");
                var psi = new System.Diagnostics.ProcessStartInfo(url)
                {
                    UseShellExecute = true
                };
                System.Diagnostics.Process.Start(psi);
            }
        }
    }

    [RelayCommand]
    private void CopyTaskUrl()
    {
        if (_currentSession?.GitHubTaskUrl is { } url)
        {
            var package = new Windows.ApplicationModel.DataTransfer.DataPackage();
            package.SetText(url);
            Windows.ApplicationModel.DataTransfer.Clipboard.SetContent(package);
            Log.Debug("Task URL copied to clipboard");
        }
    }

    public override void Dispose()
    {
        _refreshTimer?.Dispose();
        base.Dispose();
    }
}
