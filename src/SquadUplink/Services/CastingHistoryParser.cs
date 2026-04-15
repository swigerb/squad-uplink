using System.Text.Json;
using Serilog;
using SquadUplink.Core.Models;

namespace SquadUplink.Services;

/// <summary>
/// Parses .squad/casting/ directory files (history.json, registry.json)
/// to surface agent assignment data, universe info, and latency metrics.
/// </summary>
public class CastingHistoryParser
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    private readonly ILogger _logger;

    public CastingHistoryParser() : this(Log.Logger) { }

    public CastingHistoryParser(ILogger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Reads and parses .squad/casting/history.json.
    /// Returns null if the file doesn't exist or can't be parsed.
    /// </summary>
    public async Task<CastingHistory?> ParseHistoryAsync(string workingDirectory, CancellationToken ct = default)
    {
        var path = Path.Combine(workingDirectory, ".squad", "casting", "history.json");
        return await ParseFileAsync<CastingHistory>(path, ct);
    }

    /// <summary>
    /// Reads and parses .squad/casting/registry.json.
    /// Returns null if the file doesn't exist or can't be parsed.
    /// </summary>
    public async Task<CastingRegistry?> ParseRegistryAsync(string workingDirectory, CancellationToken ct = default)
    {
        var path = Path.Combine(workingDirectory, ".squad", "casting", "registry.json");
        return await ParseFileAsync<CastingRegistry>(path, ct);
    }

    /// <summary>
    /// Gets the most recent casting assignment ID from history.
    /// </summary>
    public async Task<string?> GetLatestAssignmentIdAsync(string workingDirectory, CancellationToken ct = default)
    {
        var history = await ParseHistoryAsync(workingDirectory, ct);
        if (history?.AssignmentCastSnapshots.Count is null or 0)
            return null;

        // Snapshots are keyed by timestamp — return the latest one's assignment_id
        var latest = history.AssignmentCastSnapshots
            .OrderByDescending(kv => kv.Key)
            .FirstOrDefault();

        return latest.Value?.AssignmentId;
    }

    /// <summary>
    /// Gets the universe name from the most recent assignment.
    /// </summary>
    public async Task<string?> GetUniverseAsync(string workingDirectory, CancellationToken ct = default)
    {
        var history = await ParseHistoryAsync(workingDirectory, ct);
        return history?.UniverseUsageHistory
            .OrderByDescending(u => u.UsedAt)
            .FirstOrDefault()?.Universe;
    }

    /// <summary>
    /// Returns all active agents from the casting registry with their roles.
    /// </summary>
    public async Task<IReadOnlyList<CastingAgent>> GetActiveAgentsAsync(string workingDirectory, CancellationToken ct = default)
    {
        var registry = await ParseRegistryAsync(workingDirectory, ct);
        if (registry is null)
            return Array.Empty<CastingAgent>();

        return registry.Agents.Values
            .Where(a => a.Status == "active")
            .ToList()
            .AsReadOnly();
    }

    private async Task<T?> ParseFileAsync<T>(string path, CancellationToken ct) where T : class
    {
        if (!File.Exists(path))
            return null;

        try
        {
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            return await JsonSerializer.DeserializeAsync<T>(stream, JsonOptions, ct);
        }
        catch (Exception ex)
        {
            _logger.Warning(ex, "Failed to parse casting file {Path}", path);
            return null;
        }
    }
}
