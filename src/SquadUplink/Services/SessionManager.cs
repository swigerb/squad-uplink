using System.Collections.ObjectModel;
using Microsoft.UI.Dispatching;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class SessionManager : ISessionManager
{
    private readonly IProcessScanner _scanner;
    private readonly IProcessLauncher _launcher;
    private readonly ISquadDetector _squadDetector;
    private readonly IDataService _dataService;
    private readonly INotificationService _notificationService;
    private readonly ICopilotSessionService? _copilotSessionService;
    private readonly ILogger _logger;
    private readonly DispatcherQueue? _dispatcherQueue;
    private readonly object _sessionsLock = new();
    private readonly HashSet<int> _trackedPids = [];
    private readonly int _scanIntervalMs;

    public ObservableCollection<SessionState> Sessions { get; } = [];

    public SessionManager(
        IProcessScanner scanner,
        IProcessLauncher launcher,
        ISquadDetector squadDetector,
        IDataService dataService,
        INotificationService notificationService,
        ICopilotSessionService? copilotSessionService = null)
        : this(scanner, launcher, squadDetector, dataService, notificationService, Log.Logger, copilotSessionService: copilotSessionService)
    {
    }

    public SessionManager(
        IProcessScanner scanner,
        IProcessLauncher launcher,
        ISquadDetector squadDetector,
        IDataService dataService,
        INotificationService notificationService,
        ILogger logger,
        int scanIntervalSeconds = 5,
        DispatcherQueue? dispatcherQueue = null,
        ICopilotSessionService? copilotSessionService = null)
    {
        _scanner = scanner;
        _launcher = launcher;
        _squadDetector = squadDetector;
        _dataService = dataService;
        _notificationService = notificationService;
        _copilotSessionService = copilotSessionService;
        _logger = logger;
        _scanIntervalMs = scanIntervalSeconds * 1000;
        _dispatcherQueue = dispatcherQueue ?? ResolveDispatcherQueue();
    }

    private static DispatcherQueue? ResolveDispatcherQueue()
    {
        try { return DispatcherQueue.GetForCurrentThread(); }
        catch (System.Runtime.InteropServices.COMException) { return null; }
    }

    /// <summary>
    /// Runs an action on the UI thread if a dispatcher is available,
    /// or directly if there is no dispatcher (unit-test context).
    /// </summary>
    private void RunOnUIThread(Action action)
    {
        if (_dispatcherQueue is null || _dispatcherQueue.HasThreadAccess)
            action();
        else
            _dispatcherQueue.TryEnqueue(() => action());
    }

    public async Task StartScanningAsync(CancellationToken ct = default)
    {
        _logger.Information("Starting session scanning (interval: {Interval}ms)", _scanIntervalMs);

        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ScanAndMergeAsync(ct);
                await PruneExitedSessionsAsync();
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.Error(ex, "Session scan cycle failed");
            }

            try { await Task.Delay(_scanIntervalMs, ct); }
            catch (OperationCanceledException) { break; }
        }

        _logger.Information("Session scanning stopped");
    }

    internal async Task ScanAndMergeAsync(CancellationToken ct)
    {
        var discovered = await _scanner.ScanAsync(ct);

        foreach (var session in discovered)
        {
            lock (_sessionsLock)
            {
                if (_trackedPids.Contains(session.ProcessId))
                    continue;
            }

            try
            {
                session.Squad = await _squadDetector.DetectAsync(session.WorkingDirectory, ct);
                session.RepositoryName = session.Squad?.TeamName ?? session.RepositoryName;
                session.AgentCount = session.Squad?.Members.Count ?? 0;
                session.SquadUniverse = session.Squad?.Universe;
                session.Status = SessionStatus.Running;
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Squad detection failed for session {Id}", session.Id);
                session.Status = SessionStatus.Running;
            }

            // Enrich with Copilot session-state data (summary, branch, events path)
            if (_copilotSessionService is not null)
            {
                try
                {
                    await _copilotSessionService.EnrichSessionAsync(session, ct);
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Copilot session enrichment failed for {Id}", session.Id);
                }
            }

            lock (_sessionsLock)
            {
                // Double-check after async gap (another scan cycle may have added it)
                if (!_trackedPids.Add(session.ProcessId))
                    continue;
            }

            RunOnUIThread(() =>
            {
                lock (_sessionsLock)
                {
                    Sessions.Add(session);
                }
            });

            _logger.Information("Discovered session {Id} (PID {Pid}) in {Dir}",
                session.Id, session.ProcessId, session.WorkingDirectory);

            // Notify about discovered session
            try
            {
                await _notificationService.ShowSessionDiscoveredAsync(
                    session.RepositoryName ?? Path.GetFileName(session.WorkingDirectory),
                    session.Id);
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to send discovery notification for {Id}", session.Id);
            }
        }
    }

    private async Task PruneExitedSessionsAsync()
    {
        List<SessionState> toRemove;
        lock (_sessionsLock)
        {
            toRemove = new List<SessionState>();
            foreach (var session in Sessions.ToList())
            {
                if (session.Status is not (SessionStatus.Running or SessionStatus.Idle or SessionStatus.Launching or SessionStatus.Discovered))
                    continue;

                try
                {
                    using var proc = System.Diagnostics.Process.GetProcessById(session.ProcessId);
                    if (proc.HasExited)
                    {
                        session.Status = SessionStatus.Completed;
                        toRemove.Add(session);
                    }
                }
                catch (ArgumentException)
                {
                    session.Status = SessionStatus.Completed;
                    toRemove.Add(session);
                }
                catch (Exception ex)
                {
                    _logger.Warning(ex, "Error checking process status for session {Id}", session.Id);
                }
            }

            // Update _trackedPids synchronously on background thread
            foreach (var session in toRemove)
                _trackedPids.Remove(session.ProcessId);
        }

        // Dispatch collection removal to UI thread
        foreach (var session in toRemove)
        {
            RunOnUIThread(() =>
            {
                lock (_sessionsLock)
                {
                    Sessions.Remove(session);
                }
            });
            _logger.Information("Pruned completed session {Id}", session.Id);
        }

        // Auto-save history and notify for pruned (completed) sessions
        foreach (var session in toRemove)
        {
            await SaveCompletedSessionAsync(session);
        }
    }

    private async Task SaveCompletedSessionAsync(SessionState session)
    {
        try
        {
            var duration = DateTime.UtcNow - session.StartedAt;
            await _dataService.SaveSessionHistoryAsync(new SessionHistoryEntry
            {
                SessionId = session.Id,
                RepositoryName = session.RepositoryName,
                WorkingDirectory = session.WorkingDirectory,
                FinalStatus = session.Status,
                StartedAt = session.StartedAt,
                EndedAt = DateTime.UtcNow,
                DurationSeconds = (int)duration.TotalSeconds,
                ProcessId = session.ProcessId,
                GitHubTaskUrl = session.GitHubTaskUrl
            });
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to save session history for {Id}", session.Id);
        }

        try
        {
            var elapsed = DateTime.UtcNow - session.StartedAt;
            var repoName = session.RepositoryName ?? Path.GetFileName(session.WorkingDirectory);
            if (session.Status == SessionStatus.Error)
            {
                await _notificationService.ShowErrorAsync(repoName, "Session ended with an error");
            }
            else
            {
                await _notificationService.ShowSessionCompletedAsync(repoName, elapsed);
            }
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to send completion notification for {Id}", session.Id);
        }
    }

    public async Task<SessionState> LaunchSessionAsync(string workingDirectory, string? initialPrompt = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(workingDirectory);

        _logger.Information("Launching session in {Dir}", workingDirectory);

        var session = await _launcher.LaunchAsync(workingDirectory, initialPrompt);

        try
        {
            session.Squad = await _squadDetector.DetectAsync(workingDirectory);
            session.RepositoryName = session.Squad?.TeamName ?? session.RepositoryName;
            session.AgentCount = session.Squad?.Members.Count ?? 0;
            session.SquadUniverse = session.Squad?.Universe;
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Squad detection failed for new session");
        }

        lock (_sessionsLock)
        {
            _trackedPids.Add(session.ProcessId);
        }

        RunOnUIThread(() =>
        {
            lock (_sessionsLock)
            {
                Sessions.Add(session);
            }
        });

        try
        {
            await _dataService.SaveSessionHistoryAsync(new SessionHistoryEntry
            {
                SessionId = session.Id,
                RepositoryName = session.RepositoryName,
                WorkingDirectory = session.WorkingDirectory,
                FinalStatus = session.Status,
                StartedAt = session.StartedAt,
                ProcessId = session.ProcessId,
                GitHubTaskUrl = session.GitHubTaskUrl
            });
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to save session history for {Id}", session.Id);
        }

        return session;
    }

    public async Task StopSessionAsync(string sessionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sessionId);

        SessionState? session;
        lock (_sessionsLock)
        {
            session = Sessions.FirstOrDefault(s => s.Id == sessionId);
        }

        if (session is null)
        {
            _logger.Warning("Cannot stop session {Id}: not found", sessionId);
            return;
        }

        var pid = session.ProcessId;
        _logger.Information("Stopping session {Id} (PID {Pid}) — attempting graceful interrupt", sessionId, pid);

        try
        {
            using var proc = System.Diagnostics.Process.GetProcessById(pid);
            if (proc.HasExited)
            {
                session.Status = SessionStatus.Completed;
                await SaveCompletedSessionAsync(session);
                return;
            }

            // Phase 1: Graceful interrupt via Ctrl+C (GenerateConsoleCtrlEvent)
            session.Status = SessionStatus.Idle;
            bool interrupted = false;

            try
            {
                if (Helpers.NativeMethods.AttachConsole((uint)pid))
                {
                    Helpers.NativeMethods.SetConsoleCtrlHandler(null, true);
                    try
                    {
                        interrupted = Helpers.NativeMethods.GenerateConsoleCtrlEvent(0, 0);
                    }
                    finally
                    {
                        Helpers.NativeMethods.FreeConsole();
                        Helpers.NativeMethods.SetConsoleCtrlHandler(null, false);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Graceful interrupt failed for PID {Pid}", pid);
            }

            if (interrupted)
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                try
                {
                    await proc.WaitForExitAsync(cts.Token);
                    _logger.Information("Session {Id} exited gracefully", sessionId);
                    session.Status = SessionStatus.Completed;
                    await SaveCompletedSessionAsync(session);
                    return;
                }
                catch (OperationCanceledException)
                {
                    _logger.Information("Session {Id} did not exit in 3s, force killing", sessionId);
                }
            }

            // Phase 2: Force kill
            session.Status = SessionStatus.Error;
            proc.Kill(entireProcessTree: true);
            await proc.WaitForExitAsync();
            session.Status = SessionStatus.Completed;
            _logger.Information("Session {Id} force-killed", sessionId);
        }
        catch (ArgumentException)
        {
            _logger.Information("Session {Id} already exited", sessionId);
            session.Status = SessionStatus.Completed;
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Failed to stop session {Id}", sessionId);
            session.Status = SessionStatus.Error;
        }

        await SaveCompletedSessionAsync(session);
    }
}