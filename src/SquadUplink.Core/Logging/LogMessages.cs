using Microsoft.Extensions.Logging;

namespace SquadUplink.Core.Logging;

/// <summary>
/// High-performance source-generated log messages for hot paths.
/// Uses [LoggerMessage] to avoid heap allocations from boxing and string interpolation.
/// </summary>
public static partial class LogMessages
{
    // ─── App lifecycle ──────────────────────────────────────────

    [LoggerMessage(EventId = 1001, Level = LogLevel.Information,
        Message = "Application starting — version {Version}")]
    public static partial void AppStarting(this ILogger logger, string version);

    [LoggerMessage(EventId = 1002, Level = LogLevel.Information,
        Message = "Application shutdown complete")]
    public static partial void AppShutdown(this ILogger logger);

    [LoggerMessage(EventId = 1003, Level = LogLevel.Information,
        Message = "Application activated — kind={ActivationKind}")]
    public static partial void AppActivated(this ILogger logger, string activationKind);

    // ─── Session management ─────────────────────────────────────

    [LoggerMessage(EventId = 2001, Level = LogLevel.Information,
        Message = "Session discovered: PID={ProcessId} repo={Repository} remote={IsRemote}")]
    public static partial void SessionDiscovered(this ILogger logger, int processId, string repository, bool isRemote);

    [LoggerMessage(EventId = 2002, Level = LogLevel.Information,
        Message = "Session launched: PID={ProcessId} dir={WorkingDirectory}")]
    public static partial void SessionLaunched(this ILogger logger, int processId, string workingDirectory);

    [LoggerMessage(EventId = 2003, Level = LogLevel.Warning,
        Message = "Session terminated unexpectedly: PID={ProcessId} exitCode={ExitCode}")]
    public static partial void SessionTerminated(this ILogger logger, int processId, int exitCode);

    [LoggerMessage(EventId = 2004, Level = LogLevel.Information,
        Message = "Session reconnected: PID={ProcessId} after {DowntimeMs}ms")]
    public static partial void SessionReconnected(this ILogger logger, int processId, long downtimeMs);

    // ─── Process scanning ───────────────────────────────────────

    [LoggerMessage(EventId = 3001, Level = LogLevel.Debug,
        Message = "Process scan completed: found={Found} new={New} removed={Removed} duration={DurationMs}ms")]
    public static partial void ScanCompleted(this ILogger logger, int found, int @new, int removed, long durationMs);

    [LoggerMessage(EventId = 3002, Level = LogLevel.Debug,
        Message = "Process scan skipped — previous scan still running")]
    public static partial void ScanSkipped(this ILogger logger);

    // ─── Squad detection ────────────────────────────────────────

    [LoggerMessage(EventId = 4001, Level = LogLevel.Information,
        Message = "Squad detected: team={TeamName} members={MemberCount} universe={Universe}")]
    public static partial void SquadDetected(this ILogger logger, string teamName, int memberCount, string? universe);

    [LoggerMessage(EventId = 4002, Level = LogLevel.Information,
        Message = "Squad config loaded: path={ConfigPath}")]
    public static partial void SquadConfigLoaded(this ILogger logger, string configPath);

    // ─── Navigation / UI ────────────────────────────────────────

    [LoggerMessage(EventId = 5001, Level = LogLevel.Debug,
        Message = "Navigated to {PageName}")]
    public static partial void NavigatedTo(this ILogger logger, string pageName);

    [LoggerMessage(EventId = 5002, Level = LogLevel.Information,
        Message = "Theme changed to {ThemeName}")]
    public static partial void ThemeChanged(this ILogger logger, string themeName);

    [LoggerMessage(EventId = 5003, Level = LogLevel.Information,
        Message = "Settings saved: {SettingKey}={SettingValue}")]
    public static partial void SettingSaved(this ILogger logger, string settingKey, string settingValue);

    // ─── GitHub integration ─────────────────────────────────────

    [LoggerMessage(EventId = 6001, Level = LogLevel.Information,
        Message = "GitHub auth completed: user={UserName}")]
    public static partial void GitHubAuthCompleted(this ILogger logger, string userName);

    [LoggerMessage(EventId = 6002, Level = LogLevel.Warning,
        Message = "GitHub API rate limited: remaining={Remaining} reset={ResetSeconds}s")]
    public static partial void GitHubRateLimited(this ILogger logger, int remaining, int resetSeconds);

    [LoggerMessage(EventId = 6003, Level = LogLevel.Debug,
        Message = "GitHub repo resolved: {Owner}/{Repo} branch={Branch}")]
    public static partial void GitHubRepoResolved(this ILogger logger, string owner, string repo, string branch);

    // ─── Session cockpit ────────────────────────────────────────

    [LoggerMessage(EventId = 7001, Level = LogLevel.Information,
        Message = "GitHub task URL extracted: {Url} from session {SessionId}")]
    public static partial void GitHubTaskUrlExtracted(this ILogger logger, string url, string sessionId);

    [LoggerMessage(EventId = 7002, Level = LogLevel.Debug,
        Message = "Scan cycle started")]
    public static partial void ScanCycleStarted(this ILogger logger);

    [LoggerMessage(EventId = 7003, Level = LogLevel.Warning,
        Message = "Scan cycle failed: {ErrorMessage}")]
    public static partial void ScanCycleFailed(this ILogger logger, string errorMessage);

    [LoggerMessage(EventId = 7004, Level = LogLevel.Information,
        Message = "Layout mode changed to {LayoutMode}")]
    public static partial void LayoutModeChanged(this ILogger logger, string layoutMode);

    [LoggerMessage(EventId = 7005, Level = LogLevel.Debug,
        Message = "Launch dialog opened with workingDirectory={WorkingDirectory}")]
    public static partial void LaunchDialogOpened(this ILogger logger, string workingDirectory);

    [LoggerMessage(EventId = 7006, Level = LogLevel.Information,
        Message = "Session output line captured: session={SessionId} lineCount={LineCount}")]
    public static partial void SessionOutputCaptured(this ILogger logger, string sessionId, int lineCount);

    // ─── Squad awareness ─────────────────────────────────────────

    [LoggerMessage(EventId = 4003, Level = LogLevel.Information,
        Message = "Squad state changed: team={TeamName} decisions={DecisionCount}")]
    public static partial void SquadStateChanged(this ILogger logger, string teamName, int decisionCount);

    [LoggerMessage(EventId = 4004, Level = LogLevel.Debug,
        Message = "Decision feed updated: {Count} new decisions from {Source}")]
    public static partial void DecisionFeedUpdated(this ILogger logger, int count, string source);

    [LoggerMessage(EventId = 4005, Level = LogLevel.Debug,
        Message = "Orchestration log parsed: agent={AgentName} outcome={Outcome}")]
    public static partial void OrchestrationLogParsed(this ILogger logger, string agentName, string outcome);

    [LoggerMessage(EventId = 4006, Level = LogLevel.Debug,
        Message = "Squad file watcher triggered: {ChangeType} {FilePath}")]
    public static partial void SquadFileWatcherTriggered(this ILogger logger, string changeType, string filePath);

    // ─── Errors ─────────────────────────────────────────────────

    [LoggerMessage(EventId = 9001, Level = LogLevel.Error,
        Message = "Service initialization failed: {ServiceName}")]
    public static partial void ServiceInitFailed(this ILogger logger, string serviceName, Exception ex);

    [LoggerMessage(EventId = 9002, Level = LogLevel.Error,
        Message = "Process launch failed: command={Command}")]
    public static partial void ProcessLaunchFailed(this ILogger logger, string command, Exception ex);

    [LoggerMessage(EventId = 9003, Level = LogLevel.Error,
        Message = "Unhandled exception in {ComponentName}")]
    public static partial void UnhandledException(this ILogger logger, string componentName, Exception ex);

    [LoggerMessage(EventId = 9004, Level = LogLevel.Warning,
        Message = "Operation timed out: {OperationName} after {TimeoutMs}ms")]
    public static partial void OperationTimedOut(this ILogger logger, string operationName, long timeoutMs);

    // ─── Telemetry ──────────────────────────────────────────────

    [LoggerMessage(EventId = 8001, Level = LogLevel.Information,
        Message = "Token usage recorded: session={SessionId} agent={AgentName} model={ModelName} tokens={TotalTokens}")]
    public static partial void TokenUsageRecorded(this ILogger logger, string sessionId, string agentName, string modelName, int totalTokens);

    [LoggerMessage(EventId = 8002, Level = LogLevel.Information,
        Message = "OTLP listener started on {Endpoint}")]
    public static partial void OtlpListenerStarted(this ILogger logger, string endpoint);

    [LoggerMessage(EventId = 8003, Level = LogLevel.Warning,
        Message = "OTLP listener failed to start: {Reason}")]
    public static partial void OtlpListenerFailed(this ILogger logger, string reason);

    [LoggerMessage(EventId = 8004, Level = LogLevel.Debug,
        Message = "OTLP metrics received: {RecordCount} records extracted")]
    public static partial void OtlpMetricsReceived(this ILogger logger, int recordCount);

    [LoggerMessage(EventId = 8005, Level = LogLevel.Information,
        Message = "Telemetry loaded from database: {RecordCount} records")]
    public static partial void TelemetryLoaded(this ILogger logger, int recordCount);

    [LoggerMessage(EventId = 8006, Level = LogLevel.Debug,
        Message = "Telemetry widgets refreshed: burnRate=${BurnRate}/hr totalCost=${TotalCost}")]
    public static partial void TelemetryWidgetsRefreshed(this ILogger logger, decimal burnRate, decimal totalCost);

    [LoggerMessage(EventId = 4007, Level = LogLevel.Debug,
        Message = "Squad file change processed: type={ChangeType} file={FileName} isTeam={IsTeam} isDecisions={IsDecisions}")]
    public static partial void SquadFileChangeProcessed(this ILogger logger, string changeType, string fileName, bool isTeam, bool isDecisions);
}
