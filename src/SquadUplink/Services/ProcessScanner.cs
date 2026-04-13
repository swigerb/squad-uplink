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

                if (!IsCopilotProcess(proc))
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

    internal static bool IsCopilotProcess(ProcessInfoSnapshot proc)
    {
        if (CopilotProcessNames.Contains(proc.ProcessName, StringComparer.OrdinalIgnoreCase))
            return true;

        if (string.Equals(proc.ProcessName, "node", StringComparison.OrdinalIgnoreCase)
            && proc.CommandLine?.Contains("copilot", StringComparison.OrdinalIgnoreCase) == true)
            return true;

        return false;
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
                "WHERE Name LIKE '%copilot%' OR Name LIKE '%node%' OR Name LIKE '%github-copilot%'");

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
