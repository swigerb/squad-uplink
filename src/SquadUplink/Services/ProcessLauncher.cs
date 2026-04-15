using System.ComponentModel;
using System.Diagnostics;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class ProcessLauncher : IProcessLauncher
{
    private readonly ILogger _logger;
    private readonly Func<ProcessStartInfo, Process?> _processStarter;

    public ProcessLauncher() : this(Log.Logger) { }

    public ProcessLauncher(ILogger logger) : this(logger, psi => Process.Start(psi)) { }

    internal ProcessLauncher(ILogger logger, Func<ProcessStartInfo, Process?> processStarter)
    {
        _logger = logger;
        _processStarter = processStarter;
    }

    public Task<SessionState> LaunchAsync(
        string workingDirectory,
        string? initialPrompt = null,
        CancellationToken ct = default)
    {
        return LaunchAsync(new LaunchOptions
        {
            WorkingDirectory = workingDirectory,
            InitialPrompt = initialPrompt
        }, ct);
    }

    public async Task<SessionState> LaunchAsync(LaunchOptions options, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();

        if (!Directory.Exists(options.WorkingDirectory))
            throw new DirectoryNotFoundException(
                $"Working directory not found: {options.WorkingDirectory}");

        var copilotPath = ResolveCopilotPath();
        if (copilotPath is null)
            throw new FileNotFoundException(
                "Copilot CLI not found. Ensure 'copilot' is installed and available in PATH.",
                "copilot");

        var sessionId = Guid.NewGuid().ToString("N")[..12];
        var args = BuildArguments(options);

        var startInfo = new ProcessStartInfo
        {
            FileName = copilotPath,
            Arguments = args,
            WorkingDirectory = options.WorkingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            CreateNoWindow = true
        };

        if (options.EnvironmentVariables is not null)
        {
            foreach (var (key, value) in options.EnvironmentVariables)
                startInfo.EnvironmentVariables[key] = value;
        }

        // Auto-enable OTLP telemetry for Squad Uplink's built-in listener
        if (!startInfo.EnvironmentVariables.ContainsKey("COPILOT_OTEL_ENABLED"))
            startInfo.EnvironmentVariables["COPILOT_OTEL_ENABLED"] = "true";
        if (!startInfo.EnvironmentVariables.ContainsKey("OTEL_EXPORTER_OTLP_ENDPOINT"))
            startInfo.EnvironmentVariables["OTEL_EXPORTER_OTLP_ENDPOINT"] = "http://localhost:4318";

        _logger.Information("Launching copilot session {SessionId} in {Dir} with args: {Args}",
            sessionId, options.WorkingDirectory, args);

        Process process;
        try
        {
            var started = _processStarter(startInfo);
            process = started
                ?? throw new InvalidOperationException("Failed to start copilot process — Process.Start returned null");
        }
        catch (Win32Exception ex)
        {
            throw new FileNotFoundException(
                $"Failed to launch copilot: {ex.Message}. Ensure 'copilot' is installed and available in PATH.",
                copilotPath, ex);
        }

        if (!string.IsNullOrEmpty(options.InitialPrompt))
        {
            try
            {
                await process.StandardInput.WriteLineAsync(options.InitialPrompt);
                await process.StandardInput.FlushAsync();
            }
            catch (Exception ex)
            {
                _logger.Warning(ex, "Failed to send initial prompt to session {SessionId}", sessionId);
            }
        }

        // Brief pause to detect immediate crash
        try { await Task.Delay(50, ct); } catch (OperationCanceledException) { /* proceed */ }

        if (process.HasExited && process.ExitCode != 0)
        {
            var stderr = "";
            try { stderr = await process.StandardError.ReadToEndAsync(ct); }
            catch (Exception ex) { stderr = $"(stderr read failed: {ex.Message})"; }
            throw new InvalidOperationException(
                $"Copilot process exited immediately with code {process.ExitCode}: {stderr}");
        }

        return new SessionState
        {
            Id = sessionId,
            ProcessId = process.Id,
            WorkingDirectory = options.WorkingDirectory,
            Status = SessionStatus.Launching,
            StartedAt = DateTime.UtcNow,
            IsRemoteEnabled = true,
            CommandLineArgs = args
        };
    }

    internal static string BuildArguments(LaunchOptions options)
    {
        var parts = new List<string> { "--remote" };

        if (!string.IsNullOrEmpty(options.ResumeSessionId))
            parts.Add($"--resume={options.ResumeSessionId}");

        if (!string.IsNullOrEmpty(options.ModelOverride))
            parts.Add($"--model={options.ModelOverride}");

        if (options.CustomArgs is { Count: > 0 })
            parts.AddRange(options.CustomArgs);

        return string.Join(" ", parts);
    }

    internal static string? ResolveCopilotPath()
    {
        var pathDirs = Environment.GetEnvironmentVariable("PATH")?.Split(Path.PathSeparator) ?? [];

        foreach (var dir in pathDirs)
        {
            if (string.IsNullOrWhiteSpace(dir))
                continue;

            foreach (var candidate in new[] { "copilot.exe", "copilot", "copilot.cmd",
                                               "github-copilot-cli.exe", "github-copilot-cli" })
            {
                var fullPath = Path.Combine(dir, candidate);
                if (File.Exists(fullPath))
                    return fullPath;
            }
        }

        // Check npm global install location
        var npmGlobalPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm");
        if (Directory.Exists(npmGlobalPath))
        {
            foreach (var candidate in new[] { "copilot.cmd", "copilot", "github-copilot-cli.cmd" })
            {
                var fullPath = Path.Combine(npmGlobalPath, candidate);
                if (File.Exists(fullPath))
                    return fullPath;
            }
        }

        return null;
    }
}
