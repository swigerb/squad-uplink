using Microsoft.Data.Sqlite;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class DataServiceTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DataService _service;

    public DataServiceTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"squad-uplink-test-{Guid.NewGuid()}.db");
        _service = new DataService(_dbPath);
    }

    public void Dispose()
    {
        try { File.Delete(_dbPath); } catch { }
    }

    [Fact]
    public async Task InitializeAsync_CreatesSchema()
    {
        await _service.InitializeAsync();

        await using var conn = new SqliteConnection(_service.ConnectionString);
        await conn.OpenAsync();

        // Verify session_history table exists
        var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='session_history'";
        var count = (long)(await cmd.ExecuteScalarAsync())!;
        Assert.Equal(1, count);

        // Verify app_settings table exists
        cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='app_settings'";
        count = (long)(await cmd.ExecuteScalarAsync())!;
        Assert.Equal(1, count);
    }

    [Fact]
    public async Task InitializeAsync_IsIdempotent()
    {
        await _service.InitializeAsync();
        await _service.InitializeAsync(); // Should not throw
    }

    [Fact]
    public async Task SaveAndGetSessionHistory_RoundTrips()
    {
        await _service.InitializeAsync();

        var entry = new SessionHistoryEntry
        {
            SessionId = "sess-1",
            RepositoryName = "squad-uplink",
            WorkingDirectory = @"C:\repos\squad-uplink",
            FinalStatus = SessionStatus.Completed,
            StartedAt = new DateTime(2025, 1, 15, 10, 0, 0, DateTimeKind.Utc),
            EndedAt = new DateTime(2025, 1, 15, 10, 30, 0, DateTimeKind.Utc),
            DurationSeconds = 1800,
            ProcessId = 42,
            AgentCount = 3,
            GitHubTaskUrl = "https://github.com/swigerb/squad-uplink/issues/1"
        };

        await _service.SaveSessionHistoryAsync(entry);
        var results = await _service.GetRecentSessionsAsync(10);

        Assert.Single(results);
        var loaded = results[0];
        Assert.Equal("sess-1", loaded.SessionId);
        Assert.Equal("squad-uplink", loaded.RepositoryName);
        Assert.Equal(SessionStatus.Completed, loaded.FinalStatus);
        Assert.Equal(1800, loaded.DurationSeconds);
        Assert.Equal(3, loaded.AgentCount);
        Assert.Equal(42, loaded.ProcessId);
        Assert.NotNull(loaded.GitHubTaskUrl);
    }

    [Fact]
    public async Task GetRecentSessions_ReturnsOrderedByStartedAtDesc()
    {
        await _service.InitializeAsync();

        for (int i = 0; i < 5; i++)
        {
            await _service.SaveSessionHistoryAsync(new SessionHistoryEntry
            {
                SessionId = $"sess-{i}",
                WorkingDirectory = @"C:\test",
                FinalStatus = SessionStatus.Completed,
                StartedAt = new DateTime(2025, 1, 1 + i, 12, 0, 0, DateTimeKind.Utc),
                ProcessId = 100 + i
            });
        }

        var results = await _service.GetRecentSessionsAsync(3);

        Assert.Equal(3, results.Count);
        Assert.Equal("sess-4", results[0].SessionId); // Most recent first
        Assert.Equal("sess-3", results[1].SessionId);
        Assert.Equal("sess-2", results[2].SessionId);
    }

    [Fact]
    public async Task GetRecentSessions_HandlesNullableFields()
    {
        await _service.InitializeAsync();

        await _service.SaveSessionHistoryAsync(new SessionHistoryEntry
        {
            SessionId = "nullable-test",
            WorkingDirectory = @"C:\test",
            FinalStatus = SessionStatus.Running,
            StartedAt = DateTime.UtcNow,
            ProcessId = 1
            // RepositoryName, EndedAt, DurationSeconds, GitHubTaskUrl are all null
        });

        var results = await _service.GetRecentSessionsAsync(1);
        Assert.Single(results);
        Assert.Null(results[0].RepositoryName);
        Assert.Null(results[0].EndedAt);
        Assert.Null(results[0].DurationSeconds);
        Assert.Null(results[0].GitHubTaskUrl);
    }

    [Fact]
    public async Task SaveAndGetSettings_RoundTrips()
    {
        await _service.InitializeAsync();

        var settings = new AppSettings
        {
            ThemeId = "PipBoy",
            ScanIntervalSeconds = 10,
            AudioEnabled = false,
            NotifySessionCompleted = false,
            NotifyError = true,
            DefaultWorkingDirectory = @"C:\repos"
        };

        await _service.SaveSettingsAsync(settings);
        var loaded = await _service.GetSettingsAsync();

        Assert.Equal("PipBoy", loaded.ThemeId);
        Assert.Equal(10, loaded.ScanIntervalSeconds);
        Assert.False(loaded.AudioEnabled);
        Assert.False(loaded.NotifySessionCompleted);
        Assert.True(loaded.NotifyError);
        Assert.Equal(@"C:\repos", loaded.DefaultWorkingDirectory);
    }

    [Fact]
    public async Task SaveSettings_UpsertsExistingKeys()
    {
        await _service.InitializeAsync();

        var settings1 = new AppSettings { ThemeId = "FluentDark" };
        await _service.SaveSettingsAsync(settings1);

        var settings2 = new AppSettings { ThemeId = "AppleIIe" };
        await _service.SaveSettingsAsync(settings2);

        var loaded = await _service.GetSettingsAsync();
        Assert.Equal("AppleIIe", loaded.ThemeId);
    }

    [Fact]
    public async Task GetSettings_ReturnsDefaultsWhenEmpty()
    {
        await _service.InitializeAsync();

        var settings = await _service.GetSettingsAsync();

        Assert.Equal("FluentDark", settings.ThemeId);
        Assert.Equal(5, settings.ScanIntervalSeconds);
        Assert.True(settings.AudioEnabled);
        Assert.True(settings.NotifySessionCompleted);
    }

    [Fact]
    public async Task SaveSessionHistory_AutoComputesDuration()
    {
        await _service.InitializeAsync();

        var start = new DateTime(2025, 6, 1, 12, 0, 0, DateTimeKind.Utc);
        var end = new DateTime(2025, 6, 1, 12, 5, 30, DateTimeKind.Utc);

        await _service.SaveSessionHistoryAsync(new SessionHistoryEntry
        {
            SessionId = "duration-test",
            WorkingDirectory = @"C:\test",
            FinalStatus = SessionStatus.Completed,
            StartedAt = start,
            EndedAt = end,
            ProcessId = 1
            // DurationSeconds not set — should be auto-computed
        });

        var results = await _service.GetRecentSessionsAsync(1);
        Assert.Equal(330, results[0].DurationSeconds); // 5 minutes 30 seconds
    }
}