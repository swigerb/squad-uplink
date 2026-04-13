using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.ViewModels;

public partial class SessionViewModel : ObservableObject
{
    private readonly ISessionManager _sessionManager;

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

    private SessionState? _currentSession;

    public SessionViewModel(ISessionManager sessionManager)
    {
        _sessionManager = sessionManager;
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
        SquadName = session.Squad?.TeamName ?? "—";

        // Extract GitHub URL from output if not already set
        if (!HasGitHubUrl)
        {
            foreach (var line in session.OutputLines)
            {
                var match = System.Text.RegularExpressions.Regex.Match(
                    line, @"https?://github\.com/[^\s]+(?:/tasks/[^\s]+|/issues/[^\s]+|/pull/[^\s]+)");
                if (match.Success)
                {
                    session.GitHubTaskUrl = match.Value;
                    GitHubUri = new Uri(match.Value);
                    HasGitHubUrl = true;
                    break;
                }
            }
        }

        var elapsed = DateTime.UtcNow - session.StartedAt;
        SessionAge = elapsed.TotalMinutes < 60
            ? $"{(int)elapsed.TotalMinutes}m"
            : $"{(int)elapsed.TotalHours}h {(int)(elapsed.TotalMinutes % 60)}m";

        LastActivityText = session.OutputLines.Count > 0 ? "Active" : "No output yet";
        ErrorLogSummary = session.Status == SessionStatus.Error ? "1 error" : "0 errors";
    }

    [RelayCommand]
    private async Task StopAsync()
    {
        if (_currentSession is null) return;
        await _sessionManager.StopSessionAsync(_currentSession.Id);
        CurrentStatus = _currentSession.Status;
        StatusText = _currentSession.Status.ToString();
        Log.Information("Session {Id} stopped via UI", _currentSession.Id);
    }

    [RelayCommand]
    private async Task RestartAsync()
    {
        if (_currentSession is null) return;

        var dir = _currentSession.WorkingDirectory;
        await _sessionManager.StopSessionAsync(_currentSession.Id);
        var newSession = await _sessionManager.LaunchSessionAsync(dir);
        LoadSession(newSession);
        Log.Information("Session restarted in {Dir}", dir);
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
                // Fallback to Process.Start
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
}
