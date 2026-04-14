using Microsoft.Data.Sqlite;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class TelemetryServiceTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DataService _dataService;
    private readonly TelemetryService _service;

    public TelemetryServiceTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"squad-uplink-telem-test-{Guid.NewGuid()}.db");
        _dataService = new DataService(_dbPath);
        _service = new TelemetryService(_dataService);
    }

    public void Dispose()
    {
        try { File.Delete(_dbPath); } catch { }
    }

    private static TokenUsageRecord MakeRecord(
        string session = "sess-1",
        string agent = "Woz",
        string model = "gpt-4o",
        int input = 1000,
        int output = 500,
        decimal cost = 0.01m,
        DateTime? timestamp = null)
    {
        return new TokenUsageRecord
        {
            SessionId = session,
            AgentName = agent,
            ModelName = model,
            InputTokens = input,
            OutputTokens = output,
            EstimatedCost = cost,
            Timestamp = timestamp ?? DateTime.UtcNow
        };
    }

    [Fact]
    public async Task RecordAndGetCurrentMetrics_AggregatesCorrectly()
    {
        await _dataService.InitializeAsync();

        await _service.RecordTokenUsageAsync(MakeRecord(input: 1000, output: 500, cost: 0.10m));
        await _service.RecordTokenUsageAsync(MakeRecord(input: 2000, output: 1000, cost: 0.20m));

        var metrics = _service.GetCurrentMetrics();

        Assert.Equal(3000, metrics.TotalInputTokens);
        Assert.Equal(1500, metrics.TotalOutputTokens);
        Assert.Equal(4500, metrics.TotalTokens);
        Assert.Equal(0.30m, metrics.TotalCost);
        Assert.Equal(2, metrics.RequestCount);
    }

    [Fact]
    public async Task GetSessionMetrics_FiltersCorrectly()
    {
        await _dataService.InitializeAsync();

        await _service.RecordTokenUsageAsync(MakeRecord(session: "sess-A", input: 1000, output: 500, cost: 0.10m));
        await _service.RecordTokenUsageAsync(MakeRecord(session: "sess-B", input: 2000, output: 1000, cost: 0.20m));
        await _service.RecordTokenUsageAsync(MakeRecord(session: "sess-A", input: 500, output: 200, cost: 0.05m));

        var metricsA = _service.GetSessionMetrics("sess-A");
        Assert.Equal(1500, metricsA.TotalInputTokens);
        Assert.Equal(700, metricsA.TotalOutputTokens);
        Assert.Equal(0.15m, metricsA.TotalCost);
        Assert.Equal(2, metricsA.RequestCount);

        var metricsB = _service.GetSessionMetrics("sess-B");
        Assert.Equal(2000, metricsB.TotalInputTokens);
        Assert.Equal(1, metricsB.RequestCount);
    }

    [Fact]
    public async Task GetAgentBreakdown_GroupsByAgent()
    {
        await _dataService.InitializeAsync();

        await _service.RecordTokenUsageAsync(MakeRecord(agent: "Woz", input: 1000, output: 500, cost: 0.10m));
        await _service.RecordTokenUsageAsync(MakeRecord(agent: "Woz", input: 2000, output: 1000, cost: 0.20m));
        await _service.RecordTokenUsageAsync(MakeRecord(agent: "Ada", input: 500, output: 200, cost: 0.05m));

        var breakdown = _service.GetAgentBreakdown();

        Assert.Equal(2, breakdown.Count);

        var woz = breakdown.First(a => a.AgentName == "Woz");
        Assert.Equal(4500, woz.TotalTokens);
        Assert.Equal(0.30m, woz.TotalCost);
        Assert.Equal(2, woz.DecisionsCommitted);
        Assert.Equal(0.15m, woz.CostPerDecision);

        var ada = breakdown.First(a => a.AgentName == "Ada");
        Assert.Equal(700, ada.TotalTokens);
        Assert.Equal(0.05m, ada.TotalCost);
    }

    [Fact]
    public async Task GetBurnRatePerHour_CalculatesCorrectly()
    {
        await _dataService.InitializeAsync();

        var baseTime = new DateTime(2025, 6, 1, 12, 0, 0, DateTimeKind.Utc);

        await _service.RecordTokenUsageAsync(MakeRecord(cost: 1.00m, timestamp: baseTime));
        await _service.RecordTokenUsageAsync(MakeRecord(cost: 1.00m, timestamp: baseTime.AddHours(1)));

        var rate = _service.GetBurnRatePerHour();
        Assert.Equal(2.00m, rate);
    }

    [Fact]
    public void GetBurnRatePerHour_EmptyRecords_ReturnsZero()
    {
        Assert.Equal(0m, _service.GetBurnRatePerHour());
    }

    [Fact]
    public void GetContextPressure_CalculatesPercentage()
    {
        // gpt-4o has 128k context
        var pressure = _service.GetContextPressure("gpt-4o", 64_000);
        Assert.Equal(50.0, pressure, 0.1);
    }

    [Fact]
    public void GetContextPressure_ClaudeModel_UsesCorrectWindow()
    {
        // claude-opus-4.6 has 200k context
        var pressure = _service.GetContextPressure("claude-opus-4.6", 100_000);
        Assert.Equal(50.0, pressure, 0.1);
    }

    [Fact]
    public void GetCurrentMetrics_Empty_ReturnsZeros()
    {
        var metrics = _service.GetCurrentMetrics();

        Assert.Equal(0, metrics.TotalInputTokens);
        Assert.Equal(0, metrics.TotalOutputTokens);
        Assert.Equal(0, metrics.TotalTokens);
        Assert.Equal(0m, metrics.TotalCost);
        Assert.Equal(0, metrics.RequestCount);
        Assert.Equal(0.0, metrics.AverageTokensPerRequest);
    }

    [Fact]
    public async Task AverageTokensPerRequest_CalculatesCorrectly()
    {
        await _dataService.InitializeAsync();

        await _service.RecordTokenUsageAsync(MakeRecord(input: 1000, output: 500));
        await _service.RecordTokenUsageAsync(MakeRecord(input: 3000, output: 1500));

        var metrics = _service.GetCurrentMetrics();
        // Total: (1000+500) + (3000+1500) = 6000, count=2, avg=3000
        Assert.Equal(3000.0, metrics.AverageTokensPerRequest);
    }

    [Fact]
    public async Task DataPersistence_SaveAndReload()
    {
        await _dataService.InitializeAsync();

        var record = MakeRecord(input: 5000, output: 2500, cost: 0.50m);
        await _service.RecordTokenUsageAsync(record);

        // Create a new service instance pointing to the same DB
        var service2 = new TelemetryService(_dataService);
        await service2.LoadFromDatabaseAsync();

        var metrics = service2.GetCurrentMetrics();
        Assert.Equal(5000, metrics.TotalInputTokens);
        Assert.Equal(2500, metrics.TotalOutputTokens);
        Assert.Equal(0.50m, metrics.TotalCost);
    }

    [Fact]
    public async Task AgentBreakdown_OrderedByCostDescending()
    {
        await _dataService.InitializeAsync();

        await _service.RecordTokenUsageAsync(MakeRecord(agent: "CheapAgent", cost: 0.01m));
        await _service.RecordTokenUsageAsync(MakeRecord(agent: "ExpensiveAgent", cost: 10.00m));
        await _service.RecordTokenUsageAsync(MakeRecord(agent: "MidAgent", cost: 1.00m));

        var breakdown = _service.GetAgentBreakdown();

        Assert.Equal("ExpensiveAgent", breakdown[0].AgentName);
        Assert.Equal("MidAgent", breakdown[1].AgentName);
        Assert.Equal("CheapAgent", breakdown[2].AgentName);
    }
}
