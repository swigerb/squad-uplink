using Microsoft.Data.Sqlite;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class DataService : IDataService
{
    private readonly string _dbPath;
    internal string ConnectionString => $"Data Source={_dbPath}";

    public DataService()
    {
        var appDataDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink");
        Directory.CreateDirectory(appDataDir);
        _dbPath = Path.Combine(appDataDir, "data.db");
    }

    /// <summary>Internal constructor for testing with custom db path.</summary>
    internal DataService(string dbPath)
    {
        _dbPath = dbPath;
    }

    public async Task InitializeAsync()
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            CREATE TABLE IF NOT EXISTS session_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                repo_name TEXT,
                working_directory TEXT NOT NULL,
                github_task_url TEXT,
                started_at TEXT NOT NULL,
                ended_at TEXT,
                duration_seconds INTEGER,
                status INTEGER NOT NULL,
                agent_count INTEGER NOT NULL DEFAULT 0,
                process_id INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS token_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                model_name TEXT NOT NULL,
                input_tokens INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                estimated_cost REAL NOT NULL,
                timestamp TEXT NOT NULL
            );
            """;
        await command.ExecuteNonQueryAsync();

        Log.Information("Database initialized at {Path}", _dbPath);
    }

    public async Task SaveSessionHistoryAsync(SessionHistoryEntry entry)
    {
        ArgumentNullException.ThrowIfNull(entry);

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        // Compute duration if both start/end are set
        int? duration = entry.DurationSeconds;
        if (duration is null && entry.EndedAt.HasValue)
        {
            duration = (int)(entry.EndedAt.Value - entry.StartedAt).TotalSeconds;
        }

        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO session_history (session_id, repo_name, working_directory, github_task_url, started_at, ended_at, duration_seconds, status, agent_count, process_id)
            VALUES ($sessionId, $repoName, $workDir, $taskUrl, $startedAt, $endedAt, $duration, $status, $agentCount, $pid)
            """;
        command.Parameters.AddWithValue("$sessionId", entry.SessionId);
        command.Parameters.AddWithValue("$repoName", (object?)entry.RepositoryName ?? DBNull.Value);
        command.Parameters.AddWithValue("$workDir", entry.WorkingDirectory);
        command.Parameters.AddWithValue("$taskUrl", (object?)entry.GitHubTaskUrl ?? DBNull.Value);
        command.Parameters.AddWithValue("$startedAt", entry.StartedAt.ToString("O"));
        command.Parameters.AddWithValue("$endedAt", entry.EndedAt?.ToString("O") ?? (object)DBNull.Value);
        command.Parameters.AddWithValue("$duration", (object?)duration ?? DBNull.Value);
        command.Parameters.AddWithValue("$status", (int)entry.FinalStatus);
        command.Parameters.AddWithValue("$agentCount", entry.AgentCount);
        command.Parameters.AddWithValue("$pid", entry.ProcessId);

        await command.ExecuteNonQueryAsync();
    }

    public async Task<IReadOnlyList<SessionHistoryEntry>> GetRecentSessionsAsync(int count = 20)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT id, session_id, repo_name, working_directory, github_task_url,
                   started_at, ended_at, duration_seconds, status, agent_count, process_id
            FROM session_history
            ORDER BY started_at DESC
            LIMIT $count
            """;
        command.Parameters.AddWithValue("$count", count);

        var results = new List<SessionHistoryEntry>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new SessionHistoryEntry
            {
                Id = reader.GetInt32(0),
                SessionId = reader.GetString(1),
                RepositoryName = reader.IsDBNull(2) ? null : reader.GetString(2),
                WorkingDirectory = reader.GetString(3),
                GitHubTaskUrl = reader.IsDBNull(4) ? null : reader.GetString(4),
                StartedAt = DateTime.Parse(reader.GetString(5)),
                EndedAt = reader.IsDBNull(6) ? null : DateTime.Parse(reader.GetString(6)),
                DurationSeconds = reader.IsDBNull(7) ? null : reader.GetInt32(7),
                FinalStatus = (SessionStatus)reader.GetInt32(8),
                AgentCount = reader.GetInt32(9),
                ProcessId = reader.GetInt32(10)
            });
        }

        return results.AsReadOnly();
    }

    public async Task<AppSettings> GetSettingsAsync()
    {
        var settings = new AppSettings();

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT key, value FROM app_settings";

        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var key = reader.GetString(0);
            var value = reader.GetString(1);
            switch (key)
            {
                case "ThemeId": settings.ThemeId = value; break;
                case "ScanIntervalSeconds": settings.ScanIntervalSeconds = int.Parse(value); break;
                case "DefaultWorkingDirectory": settings.DefaultWorkingDirectory = value; break;
                case "AudioEnabled": settings.AudioEnabled = bool.Parse(value); break;
                case "AutoScanOnStartup": settings.AutoScanOnStartup = bool.Parse(value); break;
                case "CrtEffectsEnabled": settings.CrtEffectsEnabled = bool.Parse(value); break;
                case "FontSize": settings.FontSize = double.Parse(value); break;
                case "Volume": settings.Volume = double.Parse(value); break;
                case "SoundPack": settings.SoundPack = value; break;
                case "DefaultModel": settings.DefaultModel = value; break;
                case "AlwaysUseRemote": settings.AlwaysUseRemote = bool.Parse(value); break;
                case "LayoutMode": settings.LayoutMode = value; break;
                case "GridSize": settings.GridSize = value; break;
                case "NotifySessionCompleted": settings.NotifySessionCompleted = bool.Parse(value); break;
                case "NotifyPermissionRequest": settings.NotifyPermissionRequest = bool.Parse(value); break;
                case "NotifyError": settings.NotifyError = bool.Parse(value); break;
                case "NotifySessionDiscovered": settings.NotifySessionDiscovered = bool.Parse(value); break;
            }
        }

        return settings;
    }

    public async Task SaveSettingsAsync(AppSettings settings)
    {
        ArgumentNullException.ThrowIfNull(settings);

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await UpsertSetting(connection, "ThemeId", settings.ThemeId);
        await UpsertSetting(connection, "ScanIntervalSeconds", settings.ScanIntervalSeconds.ToString());
        await UpsertSetting(connection, "DefaultWorkingDirectory", settings.DefaultWorkingDirectory);
        await UpsertSetting(connection, "AudioEnabled", settings.AudioEnabled.ToString());
        await UpsertSetting(connection, "AutoScanOnStartup", settings.AutoScanOnStartup.ToString());
        await UpsertSetting(connection, "CrtEffectsEnabled", settings.CrtEffectsEnabled.ToString());
        await UpsertSetting(connection, "FontSize", settings.FontSize.ToString());
        await UpsertSetting(connection, "Volume", settings.Volume.ToString());
        await UpsertSetting(connection, "SoundPack", settings.SoundPack);
        await UpsertSetting(connection, "DefaultModel", settings.DefaultModel);
        await UpsertSetting(connection, "AlwaysUseRemote", settings.AlwaysUseRemote.ToString());
        await UpsertSetting(connection, "LayoutMode", settings.LayoutMode);
        await UpsertSetting(connection, "GridSize", settings.GridSize);
        await UpsertSetting(connection, "NotifySessionCompleted", settings.NotifySessionCompleted.ToString());
        await UpsertSetting(connection, "NotifyPermissionRequest", settings.NotifyPermissionRequest.ToString());
        await UpsertSetting(connection, "NotifyError", settings.NotifyError.ToString());
        await UpsertSetting(connection, "NotifySessionDiscovered", settings.NotifySessionDiscovered.ToString());

        Log.Debug("Settings saved");
    }

    private static async Task UpsertSetting(SqliteConnection connection, string key, string value)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO app_settings (key, value) VALUES ($key, $value)
            ON CONFLICT(key) DO UPDATE SET value = $value
            """;
        command.Parameters.AddWithValue("$key", key);
        command.Parameters.AddWithValue("$value", value);
        await command.ExecuteNonQueryAsync();
    }

    public async Task SaveTokenUsageAsync(TokenUsageRecord record)
    {
        ArgumentNullException.ThrowIfNull(record);

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            INSERT INTO token_usage (session_id, agent_name, model_name, input_tokens, output_tokens, estimated_cost, timestamp)
            VALUES ($sessionId, $agentName, $modelName, $inputTokens, $outputTokens, $estimatedCost, $timestamp)
            """;
        command.Parameters.AddWithValue("$sessionId", record.SessionId);
        command.Parameters.AddWithValue("$agentName", record.AgentName);
        command.Parameters.AddWithValue("$modelName", record.ModelName);
        command.Parameters.AddWithValue("$inputTokens", record.InputTokens);
        command.Parameters.AddWithValue("$outputTokens", record.OutputTokens);
        command.Parameters.AddWithValue("$estimatedCost", (double)record.EstimatedCost);
        command.Parameters.AddWithValue("$timestamp", record.Timestamp.ToString("O"));

        await command.ExecuteNonQueryAsync();
    }

    public async Task<IReadOnlyList<TokenUsageRecord>> GetTokenUsageAsync(int limit = 1000)
    {
        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT session_id, agent_name, model_name, input_tokens, output_tokens, estimated_cost, timestamp
            FROM token_usage
            ORDER BY timestamp DESC
            LIMIT $limit
            """;
        command.Parameters.AddWithValue("$limit", limit);

        return await ReadTokenUsageRecords(command);
    }

    public async Task<IReadOnlyList<TokenUsageRecord>> GetTokenUsageBySessionAsync(string sessionId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(sessionId);

        await using var connection = new SqliteConnection(ConnectionString);
        await connection.OpenAsync();

        await using var command = connection.CreateCommand();
        command.CommandText = """
            SELECT session_id, agent_name, model_name, input_tokens, output_tokens, estimated_cost, timestamp
            FROM token_usage
            WHERE session_id = $sessionId
            ORDER BY timestamp DESC
            """;
        command.Parameters.AddWithValue("$sessionId", sessionId);

        return await ReadTokenUsageRecords(command);
    }

    private static async Task<IReadOnlyList<TokenUsageRecord>> ReadTokenUsageRecords(SqliteCommand command)
    {
        var results = new List<TokenUsageRecord>();
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new TokenUsageRecord
            {
                SessionId = reader.GetString(0),
                AgentName = reader.GetString(1),
                ModelName = reader.GetString(2),
                InputTokens = reader.GetInt32(3),
                OutputTokens = reader.GetInt32(4),
                EstimatedCost = (decimal)reader.GetDouble(5),
                Timestamp = DateTime.Parse(reader.GetString(6))
            });
        }
        return results.AsReadOnly();
    }
}