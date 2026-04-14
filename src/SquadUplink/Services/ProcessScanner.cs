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

    public async Task<IReadOnlyList<SessionState>> ScanAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        return await Task.Run(() =>
        {
            var results = new List<SessionState>();

            try
            {
                var processes = _processProvider().ToList();

                // Build set of all copilot.exe PIDs for parent-child detection.
                // Root copilot.exe (parent = shell) is the session; child (parent = copilot) is a daemon.
                var copilotPids = new HashSet<int>(
                    processes
                        .Where(p => p.ProcessName.Equals("copilot", StringComparison.OrdinalIgnoreCase))
                        .Select(p => p.Pid));

                foreach (var proc in processes)
                {
                    ct.ThrowIfCancellationRequested();

                    var (isMatch, reason) = ClassifyCopilotProcess(proc, copilotPids);
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

            return (IReadOnlyList<SessionState>)results.AsReadOnly();
        }, ct);
    }

    /// <summary>
    /// Returns (isMatch, reason) for detailed diagnostics on why a process was included or excluded.
    /// </summary>
    internal static (bool IsMatch, string Reason) ClassifyCopilotProcess(
        ProcessInfoSnapshot proc, ISet<int>? copilotPids = null)
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
            return IsInteractiveSession(proc, copilotPids);
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
    /// The Copilot CLI spawns child copilot.exe daemons for each session — the root process
    /// (whose parent is a shell, not another copilot.exe) is the actual user session.
    /// Interactive sessions may also have explicit args like --remote, --resume, --continue.
    /// </summary>
    internal static (bool IsMatch, string Reason) IsInteractiveSession(
        ProcessInfoSnapshot proc, ISet<int>? copilotPids = null)
    {
        var cmdLine = proc.CommandLine;
        var args = cmdLine is not null ? StripExecutablePath(cmdLine) : null;

        // Has meaningful command-line arguments → interactive session
        if (!string.IsNullOrWhiteSpace(args))
        {
            foreach (var indicator in InteractiveSessionIndicators)
            {
                if (args.Contains(indicator, StringComparison.OrdinalIgnoreCase))
                    return (true, $"Interactive session: found {indicator}");
            }
            return (true, $"Interactive session: has args [{Truncate(args, 80)}]");
        }

        // Bare copilot.exe or no command line — use parent process tree.
        // The Copilot CLI runs as a bare "copilot.exe" with flags consumed internally.
        // Root copilot.exe (parent is a shell) = the user's session.
        // Child copilot.exe (parent is another copilot.exe) = background daemon helper.
        if (proc.ParentProcessId.HasValue && copilotPids is not null)
        {
            if (copilotPids.Contains(proc.ParentProcessId.Value))
                return (false, "Child daemon: parent is another copilot.exe");

            return (true, "Root copilot session: launched from shell (parent is not copilot.exe)");
        }

        // No parent info and no command line — conservative exclusion
        if (cmdLine is null)
            return (false, "No command line or parent info — assumed daemon");

        return (false, "Bare copilot.exe with no args — background daemon");
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

        var repoName = !string.IsNullOrEmpty(workDir) ? Path.GetFileName(workDir) : null;

        return new SessionState
        {
            Id = $"scan-{proc.Pid}",
            ProcessId = proc.Pid,
            WorkingDirectory = workDir,
            RepositoryName = repoName,
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

    /// <summary>
    /// Retrieves command line and parent PID for a single process via CIM.
    /// Used as a fallback when the broad WMI query fails.
    /// </summary>
    private static (string? CommandLine, int? ParentProcessId) GetProcessDetailsForPid(int pid)
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                $"SELECT CommandLine, ParentProcessId FROM Win32_Process WHERE ProcessId = {pid}");
            foreach (ManagementObject obj in searcher.Get())
            {
                using (obj)
                {
                    var cmdLine = obj["CommandLine"]?.ToString();
                    var parentPid = obj["ParentProcessId"] is not null
                        ? Convert.ToInt32(obj["ParentProcessId"])
                        : (int?)null;
                    return (cmdLine, parentPid);
                }
            }
        }
        catch { /* CIM not available for this process */ }
        return (null, null);
    }

    private static IEnumerable<ProcessInfoSnapshot> GetSystemProcesses()
    {
        var snapshots = new List<ProcessInfoSnapshot>();

        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT ProcessId, Name, CommandLine, ExecutablePath, ParentProcessId FROM Win32_Process " +
                "WHERE (Name LIKE 'copilot%' OR Name LIKE 'github-copilot%') " +
                "AND Name NOT LIKE '%copilot-language-server%' AND Name NOT LIKE '%M365Copilot%'");

            foreach (ManagementObject obj in searcher.Get())
            {
                using (obj)
                {
                    try
                    {
                        var pid = Convert.ToInt32(obj["ProcessId"]);
                        var name = obj["Name"]?.ToString() ?? string.Empty;
                        var cmdLine = obj["CommandLine"]?.ToString();
                        var parentPid = obj["ParentProcessId"] is not null
                            ? Convert.ToInt32(obj["ParentProcessId"])
                            : (int?)null;

                        if (name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                            name = name[..^4];

                        DateTime? startTime = null;
                        try
                        {
                            using var proc = Process.GetProcessById(pid);
                            startTime = proc.StartTime;
                        }
                        catch (InvalidOperationException) { /* process exited */ }
                        catch (System.ComponentModel.Win32Exception) { /* access denied */ }
                        catch (ArgumentException) { /* process not found */ }

                        snapshots.Add(new ProcessInfoSnapshot(pid, name, cmdLine, null, startTime, parentPid));
                    }
                    catch (Exception ex)
                    {
                        Log.Debug(ex, "Failed to read WMI process entry");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "WMI not available, falling back to Process API");
            // WMI not available — fall back to Process API with per-process CIM for details
            foreach (var procName in CopilotProcessNames)
            {
                try
                {
                    foreach (var proc in Process.GetProcessesByName(procName))
                    {
                        try
                        {
                            var (cmdLine, parentPid) = GetProcessDetailsForPid(proc.Id);
                            snapshots.Add(new ProcessInfoSnapshot(
                                proc.Id,
                                proc.ProcessName,
                                cmdLine,
                                null,
                                proc.StartTime,
                                parentPid));
                        }
                        catch (InvalidOperationException) { /* process exited */ }
                        catch (System.ComponentModel.Win32Exception) { /* access denied */ }
                        finally { proc.Dispose(); }
                    }
                }
                catch (Exception enumEx) { Log.Debug(enumEx, "Process enumeration failed for {Name}", procName); }
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
    DateTime? StartTime,
    int? ParentProcessId = null);
