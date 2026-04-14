using System.Diagnostics;
using System.Management;
using System.Text.RegularExpressions;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public partial class ProcessScanner : IProcessScanner
{
    private readonly ILogger _logger;
    private readonly Func<IEnumerable<ProcessInfoSnapshot>> _processProvider;

    internal static readonly string[] CopilotProcessNames = ["copilot", "github-copilot-cli"];

    /// <summary>
    /// Process names that should always be excluded — they are not GitHub Copilot CLI sessions.
    /// </summary>
    internal static readonly string[] ExcludedProcessNames =
    [
        "copilot-language-server",  // VS Code extension
        "M365Copilot",              // Microsoft 365 Copilot
    ];

    /// <summary>
    /// Command-line indicators that signal an interactive Copilot CLI session.
    /// A bare copilot.exe with no args is a background daemon and should be skipped.
    /// </summary>
    internal static readonly string[] InteractiveSessionIndicators =
    [
        "--remote",
        "--resume",
        "--continue",
    ];

    [GeneratedRegex(@"github\.com/([^/\s]+)/([^/\s]+)/tasks/(\d+)")]
    internal static partial Regex TaskUrlPattern();

    public ProcessScanner() : this(Log.Logger) { }

    public ProcessScanner(ILogger logger) : this(logger, GetSystemProcesses) { }

    internal ProcessScanner(ILogger logger, Func<IEnumerable<ProcessInfoSnapshot>> processProvider)
    {
        _logger = logger;
        _processProvider = processProvider;
    }

    public Task<IReadOnlyList<SessionState>> ScanAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var results = new List<SessionState>();

        try
        {
            var processes = _processProvider();
            foreach (var proc in processes)
            {
                ct.ThrowIfCancellationRequested();

                var (isMatch, reason) = ClassifyCopilotProcess(proc);
                _logger.Debug("Process {Name} (PID {Pid}): {Result} — {Reason}",
                    proc.ProcessName, proc.Pid, isMatch ? "INCLUDED" : "EXCLUDED", reason);

                if (!isMatch)
                    continue;

                var session = BuildSessionState(proc);
                if (session is not null)
                    results.Add(session);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Warning(ex, "Process scan encountered an error");
        }

        return Task.FromResult<IReadOnlyList<SessionState>>(results.AsReadOnly());
    }

    /// <summary>
    /// Returns (isMatch, reason) for detailed diagnostics on why a process was included or excluded.
    /// </summary>
    internal static (bool IsMatch, string Reason) ClassifyCopilotProcess(ProcessInfoSnapshot proc)
    {
        // 1. Always exclude non-GitHub-Copilot processes by name
        if (ExcludedProcessNames.Contains(proc.ProcessName, StringComparer.OrdinalIgnoreCase))
            return (false, $"Excluded process name: {proc.ProcessName}");

        // 2. github-copilot-cli is always the interactive CLI (never a daemon)
        if (string.Equals(proc.ProcessName, "github-copilot-cli", StringComparison.OrdinalIgnoreCase))
            return (true, "github-copilot-cli is always an interactive session");

        // 3. copilot.exe — must distinguish daemon from interactive session
        if (string.Equals(proc.ProcessName, "copilot", StringComparison.OrdinalIgnoreCase))
        {
            return IsInteractiveSession(proc);
        }

        // 4. Node processes running Copilot CLI (npm/npx scenarios)
        if (string.Equals(proc.ProcessName, "node", StringComparison.OrdinalIgnoreCase)
            && proc.CommandLine?.Contains("copilot", StringComparison.OrdinalIgnoreCase) == true)
        {
            return (true, "Node process running Copilot CLI");
        }

        return (false, $"Not a Copilot process: {proc.ProcessName}");
    }

    /// <summary>
    /// Determines if a copilot.exe process is an interactive session vs a background daemon.
    /// Background daemons run as bare "copilot.exe" with no meaningful args.
    /// Interactive sessions have prompt text, --remote, --resume, --continue, etc.
    /// </summary>
    internal static (bool IsMatch, string Reason) IsInteractiveSession(ProcessInfoSnapshot proc)
    {
        var cmdLine = proc.CommandLine;

        // No command line available at all — be conservative, include it
        // (WMI fallback may not have command line info)
        if (cmdLine is null)
            return (false, "No command line available — assumed daemon");

        // Strip the executable path/name to isolate the arguments.
        // Command lines look like: "C:\...\copilot.exe" --remote
        // or: copilot --remote
        var args = StripExecutablePath(cmdLine);

        // Bare executable with no arguments = background daemon
        if (string.IsNullOrWhiteSpace(args))
            return (false, "Bare copilot.exe with no args — background daemon");

        // Check for known interactive indicators
        foreach (var indicator in InteractiveSessionIndicators)
        {
            if (args.Contains(indicator, StringComparison.OrdinalIgnoreCase))
                return (true, $"Interactive session: found {indicator}");
        }

        // Any other non-empty args (prompt text, flags) = interactive session
        return (true, $"Interactive session: has args [{Truncate(args, 80)}]");
    }

    /// <summary>
    /// Backward-compatible wrapper used by existing tests.
    /// </summary>
    internal static bool IsCopilotProcess(ProcessInfoSnapshot proc)
    {
        return ClassifyCopilotProcess(proc).IsMatch;
    }

    private static string StripExecutablePath(string commandLine)
    {
        var trimmed = commandLine.Trim();

        // Quoted path: "C:\...\copilot.exe" args
        if (trimmed.StartsWith('"'))
        {
            var closingQuote = trimmed.IndexOf('"', 1);
            if (closingQuote >= 0 && closingQuote + 1 < trimmed.Length)
                return trimmed[(closingQuote + 1)..].Trim();
            return string.Empty;
        }

        // Unquoted: copilot.exe args  or  copilot args
        var firstSpace = trimmed.IndexOf(' ');
        if (firstSpace >= 0)
            return trimmed[(firstSpace + 1)..].Trim();

        return string.Empty;
    }

    private static string Truncate(string value, int maxLength)
    {
        return value.Length <= maxLength ? value : value[..maxLength] + "…";
    }

    internal static SessionState? BuildSessionState(ProcessInfoSnapshot proc)
    {
        var commandLine = proc.CommandLine ?? string.Empty;
        var isRemote = commandLine.Contains("--remote", StringComparison.OrdinalIgnoreCase);
        var workDir = ExtractWorkingDirectory(commandLine) ?? proc.WorkingDirectory ?? string.Empty;
        var taskUrl = ExtractTaskUrl(commandLine);

        return new SessionState
        {
            Id = $"scan-{proc.Pid}",
            ProcessId = proc.Pid,
            WorkingDirectory = workDir,
            Status = SessionStatus.Discovered,
            StartedAt = proc.StartTime ?? DateTime.UtcNow,
            IsRemoteEnabled = isRemote,
            CommandLineArgs = commandLine,
            GitHubTaskUrl = taskUrl
        };
    }

    internal static string? ExtractWorkingDirectory(string commandLine)
    {
        // Handle both quoted and unquoted paths:
        // --cwd="C:\my projects\app" or --cwd=C:\projects\app
        var match = Regex.Match(commandLine, @"--(?:cwd|working-directory)[=\s]+(?:""([^""]+)""|(\S+))");
        if (!match.Success) return null;
        return match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
    }

    internal static string? ExtractTaskUrl(string text)
    {
        var match = TaskUrlPattern().Match(text);
        return match.Success
            ? $"https://github.com/{match.Groups[1].Value}/{match.Groups[2].Value}/tasks/{match.Groups[3].Value}"
            : null;
    }

    private static IEnumerable<ProcessInfoSnapshot> GetSystemProcesses()
    {
        var snapshots = new List<ProcessInfoSnapshot>();

        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, Name, CommandLine, ExecutablePath FROM Win32_Process " +
                "WHERE (Name LIKE '%copilot%' OR Name LIKE '%node%' OR Name LIKE '%github-copilot%') " +
                "AND Name NOT LIKE '%copilot-language-server%' AND Name NOT LIKE '%M365Copilot%'");

            foreach (ManagementObject obj in searcher.Get())
            {
                try
                {
                    var pid = Convert.ToInt32(obj["ProcessId"]);
                    var name = obj["Name"]?.ToString() ?? string.Empty;
                    var cmdLine = obj["CommandLine"]?.ToString();

                    if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        name = name[..^4];

                    DateTime? startTime = null;
                    try
                    {
                        using var proc = Process.GetProcessById(pid);
                        startTime = proc.StartTime;
                    }
                    catch { /* Process may have exited or access denied */ }

                    snapshots.Add(new ProcessInfoSnapshot(pid, name, cmdLine, null, startTime));
                }
                catch
                {
                    // Individual process query failed — skip
                }
            }
        }
        catch
        {
            // WMI not available — fall back to Process API
            foreach (var procName in CopilotProcessNames)
            {
                try
                {
                    foreach (var proc in Process.GetProcessesByName(procName))
                    {
                        try
                        {
                            snapshots.Add(new ProcessInfoSnapshot(
                                proc.Id,
                                proc.ProcessName,
                                null,
                                null,
                                proc.StartTime));
                        }
                        catch { /* Access denied for some process properties */ }
                        finally { proc.Dispose(); }
                    }
                }
                catch { /* Process enumeration failed */ }
            }
        }

        return snapshots;
    }
}

internal record ProcessInfoSnapshot(
    int Pid,
    string ProcessName,
    string? CommandLine,
    string? WorkingDirectory,
    DateTime? StartTime);
