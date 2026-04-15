using Serilog;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class CastingHistoryParserTests : IDisposable
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();
    private readonly string _tempRoot;

    public CastingHistoryParserTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"casting-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, true); } catch { }
    }

    [Fact]
    public void Parser_CanBeConstructed()
    {
        var parser = new CastingHistoryParser(TestLogger);
        Assert.NotNull(parser);
    }

    [Fact]
    public async Task ParseHistoryAsync_ReturnsNull_WhenNoFile()
    {
        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.ParseHistoryAsync(_tempRoot);
        Assert.Null(result);
    }

    [Fact]
    public async Task ParseRegistryAsync_ReturnsNull_WhenNoFile()
    {
        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.ParseRegistryAsync(_tempRoot);
        Assert.Null(result);
    }

    [Fact]
    public async Task ParseHistoryAsync_ParsesValidJson()
    {
        var castingDir = Path.Combine(_tempRoot, ".squad", "casting");
        Directory.CreateDirectory(castingDir);
        await File.WriteAllTextAsync(Path.Combine(castingDir, "history.json"), """
        {
            "universe_usage_history": [
                {
                    "universe": "test-universe",
                    "used_at": "2025-01-15T10:00:00Z",
                    "project": "my-project",
                    "reason": "initial cast"
                }
            ],
            "assignment_cast_snapshots": {
                "2025-01-15T10:00:00Z": {
                    "assignment_id": "abc-123",
                    "universe": "test-universe",
                    "agents": {
                        "lead": "agent-lead",
                        "dev": "agent-dev"
                    }
                }
            }
        }
        """);

        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.ParseHistoryAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Single(result!.UniverseUsageHistory);
        Assert.Equal("test-universe", result.UniverseUsageHistory[0].Universe);
        Assert.Single(result.AssignmentCastSnapshots);
        Assert.Equal("abc-123", result.AssignmentCastSnapshots.Values.First().AssignmentId);
    }

    [Fact]
    public async Task GetLatestAssignmentIdAsync_ReturnsLatest()
    {
        var castingDir = Path.Combine(_tempRoot, ".squad", "casting");
        Directory.CreateDirectory(castingDir);
        await File.WriteAllTextAsync(Path.Combine(castingDir, "history.json"), """
        {
            "universe_usage_history": [],
            "assignment_cast_snapshots": {
                "2025-01-15T10:00:00Z": {
                    "assignment_id": "old-id",
                    "universe": "u1",
                    "agents": {}
                },
                "2025-01-16T10:00:00Z": {
                    "assignment_id": "new-id",
                    "universe": "u1",
                    "agents": {}
                }
            }
        }
        """);

        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.GetLatestAssignmentIdAsync(_tempRoot);
        Assert.Equal("new-id", result);
    }

    [Fact]
    public async Task GetUniverseAsync_ReturnsLatestUniverse()
    {
        var castingDir = Path.Combine(_tempRoot, ".squad", "casting");
        Directory.CreateDirectory(castingDir);
        await File.WriteAllTextAsync(Path.Combine(castingDir, "history.json"), """
        {
            "universe_usage_history": [
                {
                    "universe": "old-universe",
                    "used_at": "2025-01-14T10:00:00Z",
                    "project": "p1"
                },
                {
                    "universe": "new-universe",
                    "used_at": "2025-01-15T10:00:00Z",
                    "project": "p1"
                }
            ],
            "assignment_cast_snapshots": {}
        }
        """);

        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.GetUniverseAsync(_tempRoot);
        Assert.Equal("new-universe", result);
    }

    [Fact]
    public async Task ParseRegistryAsync_ParsesAgents()
    {
        var castingDir = Path.Combine(_tempRoot, ".squad", "casting");
        Directory.CreateDirectory(castingDir);
        await File.WriteAllTextAsync(Path.Combine(castingDir, "registry.json"), """
        {
            "agents": {
                "agent-lead": {
                    "persistent_name": "lead",
                    "universe": "test-universe",
                    "role": "Lead",
                    "created_at": "2025-01-15T10:00:00Z",
                    "status": "active"
                },
                "agent-dev": {
                    "persistent_name": "dev",
                    "universe": "test-universe",
                    "role": "Developer",
                    "created_at": "2025-01-15T10:00:00Z",
                    "status": "inactive"
                }
            }
        }
        """);

        var parser = new CastingHistoryParser(TestLogger);
        var agents = await parser.GetActiveAgentsAsync(_tempRoot);
        Assert.Single(agents);
        Assert.Equal("Lead", agents[0].Role);
    }

    [Fact]
    public async Task ParseHistoryAsync_ReturnsNull_OnInvalidJson()
    {
        var castingDir = Path.Combine(_tempRoot, ".squad", "casting");
        Directory.CreateDirectory(castingDir);
        await File.WriteAllTextAsync(Path.Combine(castingDir, "history.json"), "not json");

        var parser = new CastingHistoryParser(TestLogger);
        var result = await parser.ParseHistoryAsync(_tempRoot);
        Assert.Null(result);
    }
}
