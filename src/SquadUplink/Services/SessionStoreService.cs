using Microsoft.Data.Sqlite;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class SessionStoreService : ISessionStoreService
{
    private readonly string _dbPath;
    private readonly ILogger _logger = Log.ForContext<SessionStoreService>();

    public SessionStoreService()
    {
        _dbPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".copilot", "session-store.db");
    }

    public async Task<IReadOnlyList<SessionStoreEntry>> GetSessionHistoryAsync(
        string repository, CancellationToken ct = default)
    {
        if (!File.Exists(_dbPath))
            return [];

        return await Task.Run(() =>
        {
            var results = new List<SessionStoreEntry>();
            try
            {
                using var connection = OpenReadOnly();
                using var cmd = connection.CreateCommand();
                cmd.CommandText = """
                    SELECT s.id, s.cwd, s.repository, s.branch, s.summary,
                           s.created_at, s.updated_at, s.host_type,
                           COUNT(t.turn_index) AS turn_count
                    FROM sessions s
                    LEFT JOIN turns t ON s.id = t.session_id
                    WHERE s.repository = @repo
                    GROUP BY s.id
                    ORDER BY s.updated_at DESC
                    """;
                cmd.Parameters.AddWithValue("@repo", repository);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(new SessionStoreEntry
                    {
                        Id = reader.GetString(0),
                        Cwd = reader.IsDBNull(1) ? null : reader.GetString(1),
                        Repository = reader.IsDBNull(2) ? null : reader.GetString(2),
                        Branch = reader.IsDBNull(3) ? null : reader.GetString(3),
                        Summary = reader.IsDBNull(4) ? null : reader.GetString(4),
                        CreatedAt = ParseTimestamp(reader, 5),
                        UpdatedAt = ParseTimestamp(reader, 6),
                        HostType = reader.IsDBNull(7) ? null : reader.GetString(7),
                        TurnCount = reader.GetInt32(8),
                    });
                }
            }
            catch (SqliteException ex)
            {
                _logger.Warning(ex, "Failed to read session history from store");
            }

            return results;
        }, ct);
    }

    public async Task<int> GetTurnCountAsync(string sessionId, CancellationToken ct = default)
    {
        if (!File.Exists(_dbPath))
            return 0;

        return await Task.Run(() =>
        {
            try
            {
                using var connection = OpenReadOnly();
                using var cmd = connection.CreateCommand();
                cmd.CommandText = "SELECT COUNT(*) FROM turns WHERE session_id = @id";
                cmd.Parameters.AddWithValue("@id", sessionId);
                return Convert.ToInt32(cmd.ExecuteScalar());
            }
            catch (SqliteException ex)
            {
                _logger.Warning(ex, "Failed to read turn count from store");
                return 0;
            }
        }, ct);
    }

    public async Task<IReadOnlyList<SessionFileChange>> GetFileChangesAsync(
        string sessionId, CancellationToken ct = default)
    {
        if (!File.Exists(_dbPath))
            return [];

        return await Task.Run(() =>
        {
            var results = new List<SessionFileChange>();
            try
            {
                using var connection = OpenReadOnly();
                using var cmd = connection.CreateCommand();
                cmd.CommandText = """
                    SELECT file_path, tool_name, turn_index, first_seen_at
                    FROM session_files
                    WHERE session_id = @id
                    ORDER BY first_seen_at
                    """;
                cmd.Parameters.AddWithValue("@id", sessionId);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(new SessionFileChange
                    {
                        FilePath = reader.GetString(0),
                        ToolName = reader.IsDBNull(1) ? string.Empty : reader.GetString(1),
                        TurnIndex = reader.GetInt32(2),
                        FirstSeenAt = ParseTimestamp(reader, 3),
                    });
                }
            }
            catch (SqliteException ex)
            {
                _logger.Warning(ex, "Failed to read file changes from store");
            }

            return results;
        }, ct);
    }

    public async Task<SessionActivitySummary> GetRecentActivityAsync(
        int days = 7, CancellationToken ct = default)
    {
        if (!File.Exists(_dbPath))
            return new SessionActivitySummary();

        return await Task.Run(() =>
        {
            try
            {
                using var connection = OpenReadOnly();

                var since = DateTime.UtcNow.AddDays(-days).ToString("o");

                using var cmd = connection.CreateCommand();
                cmd.CommandText = """
                    SELECT
                        COUNT(DISTINCT s.id) AS total_sessions,
                        COUNT(t.turn_index) AS total_turns
                    FROM sessions s
                    LEFT JOIN turns t ON s.id = t.session_id
                    WHERE s.created_at > @since
                    """;
                cmd.Parameters.AddWithValue("@since", since);

                int totalSessions = 0, totalTurns = 0;
                using (var reader = cmd.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        totalSessions = reader.GetInt32(0);
                        totalTurns = reader.GetInt32(1);
                    }
                }

                // Files changed
                using var filesCmd = connection.CreateCommand();
                filesCmd.CommandText = """
                    SELECT COUNT(DISTINCT sf.file_path)
                    FROM session_files sf
                    INNER JOIN sessions s ON sf.session_id = s.id
                    WHERE s.created_at > @since
                    """;
                filesCmd.Parameters.AddWithValue("@since", since);
                int totalFiles = Convert.ToInt32(filesCmd.ExecuteScalar());

                // Commits
                using var refsCmd = connection.CreateCommand();
                refsCmd.CommandText = """
                    SELECT COUNT(*)
                    FROM session_refs sr
                    INNER JOIN sessions s ON sr.session_id = s.id
                    WHERE sr.ref_type = 'commit' AND s.created_at > @since
                    """;
                refsCmd.Parameters.AddWithValue("@since", since);
                int totalCommits = Convert.ToInt32(refsCmd.ExecuteScalar());

                // Active repositories
                using var repoCmd = connection.CreateCommand();
                repoCmd.CommandText = """
                    SELECT DISTINCT repository
                    FROM sessions
                    WHERE created_at > @since AND repository IS NOT NULL
                    ORDER BY repository
                    """;
                repoCmd.Parameters.AddWithValue("@since", since);
                var repos = new List<string>();
                using (var reader = repoCmd.ExecuteReader())
                {
                    while (reader.Read())
                        repos.Add(reader.GetString(0));
                }

                return new SessionActivitySummary
                {
                    TotalSessions = totalSessions,
                    TotalTurns = totalTurns,
                    TotalFilesChanged = totalFiles,
                    TotalCommits = totalCommits,
                    AvgTurnsPerSession = totalSessions > 0
                        ? Math.Round((double)totalTurns / totalSessions, 1)
                        : 0,
                    ActiveRepositories = repos,
                };
            }
            catch (SqliteException ex)
            {
                _logger.Warning(ex, "Failed to read recent activity from store");
                return new SessionActivitySummary();
            }
        }, ct);
    }

    public async Task<IReadOnlyList<SessionReference>> GetSessionRefsAsync(
        string sessionId, CancellationToken ct = default)
    {
        if (!File.Exists(_dbPath))
            return [];

        return await Task.Run(() =>
        {
            var results = new List<SessionReference>();
            try
            {
                using var connection = OpenReadOnly();
                using var cmd = connection.CreateCommand();
                cmd.CommandText = """
                    SELECT ref_type, ref_value, turn_index, created_at
                    FROM session_refs
                    WHERE session_id = @id
                    ORDER BY created_at
                    """;
                cmd.Parameters.AddWithValue("@id", sessionId);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    results.Add(new SessionReference
                    {
                        RefType = reader.GetString(0),
                        RefValue = reader.GetString(1),
                        TurnIndex = reader.GetInt32(2),
                        CreatedAt = ParseTimestamp(reader, 3),
                    });
                }
            }
            catch (SqliteException ex)
            {
                _logger.Warning(ex, "Failed to read session refs from store");
            }

            return results;
        }, ct);
    }

    private SqliteConnection OpenReadOnly()
    {
        var connection = new SqliteConnection($"Data Source={_dbPath};Mode=ReadOnly");
        connection.Open();
        return connection;
    }

    private static DateTime? ParseTimestamp(SqliteDataReader reader, int ordinal)
    {
        if (reader.IsDBNull(ordinal))
            return null;

        var value = reader.GetString(ordinal);
        return DateTime.TryParse(value, out var dt) ? dt : null;
    }
}
