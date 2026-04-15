using System.Globalization;
using System.Text.RegularExpressions;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public partial class CopilotSessionService : ICopilotSessionService
{
    private static readonly string SessionStatePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        ".copilot", "session-state");

    private readonly ILogger _logger = Log.ForContext<CopilotSessionService>();

    [GeneratedRegex(@"^inuse\.(\d+)\.lock$", RegexOptions.IgnoreCase)]
    private static partial Regex LockFileRegex();

    public Task<IReadOnlyList<CopilotSessionInfo>> GetActiveSessionsAsync(CancellationToken ct = default)
    {
        var results = new List<CopilotSessionInfo>();

        if (!Directory.Exists(SessionStatePath))
            return Task.FromResult<IReadOnlyList<CopilotSessionInfo>>(results);

        foreach (var dir in Directory.EnumerateDirectories(SessionStatePath))
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                var info = ReadSessionDirectory(dir);
                if (info is not null)
                    results.Add(info);
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Failed to read session directory {Dir}", dir);
            }
        }

        return Task.FromResult<IReadOnlyList<CopilotSessionInfo>>(results);
    }

    public Task EnrichSessionAsync(SessionState session, CancellationToken ct = default)
    {
        ArgumentNullException.ThrowIfNull(session);

        // Skip if already enriched
        if (!string.IsNullOrEmpty(session.CopilotSessionId))
            return Task.CompletedTask;

        if (session.ProcessId <= 0 || !Directory.Exists(SessionStatePath))
            return Task.CompletedTask;

        foreach (var dir in Directory.EnumerateDirectories(SessionStatePath))
        {
            ct.ThrowIfCancellationRequested();

            try
            {
                var pid = FindOwnerPid(dir);
                if (pid != session.ProcessId)
                    continue;

                var info = ReadSessionDirectory(dir);
                if (info is null)
                    continue;

                session.CopilotSessionId = info.SessionId;
                session.SessionSummary = info.Summary;
                session.GitBranch = info.Branch;
                session.EventsJsonlPath = info.EventsJsonlPath;

                // Backfill working directory from workspace.yaml if not already known
                if (string.IsNullOrEmpty(session.WorkingDirectory))
                {
                    session.WorkingDirectory = !string.IsNullOrEmpty(info.GitRoot)
                        ? info.GitRoot
                        : !string.IsNullOrEmpty(info.Cwd)
                            ? info.Cwd
                            : session.WorkingDirectory;
                }

                // Backfill repository name if not already set
                if (string.IsNullOrEmpty(session.RepositoryName) && !string.IsNullOrEmpty(info.Repository))
                    session.RepositoryName = info.Repository;

                _logger.Information("Enriched session {Id} with Copilot session {CopilotId}",
                    session.Id, info.SessionId);
                break;
            }
            catch (Exception ex)
            {
                _logger.Debug(ex, "Error during enrichment scan of {Dir}", dir);
            }
        }

        return Task.CompletedTask;
    }

    private CopilotSessionInfo? ReadSessionDirectory(string dir)
    {
        var workspacePath = Path.Combine(dir, "workspace.yaml");
        if (!File.Exists(workspacePath))
            return null;

        var info = new CopilotSessionInfo
        {
            SessionId = Path.GetFileName(dir),
            EventsJsonlPath = Path.Combine(dir, "events.jsonl")
        };

        // Parse workspace.yaml (flat key: value format)
        var yaml = ReadFileShared(workspacePath);
        if (yaml is not null)
        {
            foreach (var line in yaml.Split('\n'))
            {
                var trimmed = line.Trim();
                if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
                    continue;

                var colonIdx = trimmed.IndexOf(':');
                if (colonIdx <= 0)
                    continue;

                var key = trimmed[..colonIdx].Trim();
                var value = trimmed[(colonIdx + 1)..].Trim().Trim('"');

                switch (key)
                {
                    case "id": info.SessionId = value; break;
                    case "cwd": info.Cwd = value; break;
                    case "git_root": info.GitRoot = value; break;
                    case "repository": info.Repository = value; break;
                    case "branch": info.Branch = value; break;
                    case "summary": info.Summary = value; break;
                    case "host_type": info.HostType = value; break;
                    case "created_at":
                        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var created))
                            info.CreatedAt = created;
                        break;
                    case "updated_at":
                        if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var updated))
                            info.UpdatedAt = updated;
                        break;
                }
            }
        }

        // Find owner PID from lock file
        info.OwnerPid = FindOwnerPid(dir);

        return info;
    }

    private int? FindOwnerPid(string dir)
    {
        try
        {
            foreach (var lockFile in Directory.EnumerateFiles(dir, "inuse.*.lock"))
            {
                var fileName = Path.GetFileName(lockFile);
                var match = LockFileRegex().Match(fileName);
                if (match.Success && int.TryParse(match.Groups[1].Value, out var pid))
                    return pid;

                // Fallback: read file content for PID
                var content = ReadFileShared(lockFile);
                if (content is not null && int.TryParse(content.Trim(), out var contentPid))
                    return contentPid;
            }
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Error finding owner PID in {Dir}", dir);
        }

        return null;
    }

    private static string? ReadFileShared(string path)
    {
        try
        {
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        }
        catch
        {
            return null;
        }
    }
}
