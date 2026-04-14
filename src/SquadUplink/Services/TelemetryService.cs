using System.Collections.Concurrent;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class TelemetryService : ITelemetryService
{
    private readonly IDataService _dataService;
    private readonly ConcurrentBag<TokenUsageRecord> _records = [];

    public TelemetryService(IDataService dataService)
    {
        _dataService = dataService;
    }

    public async Task RecordTokenUsageAsync(TokenUsageRecord record)
    {
        _records.Add(record);
        try
        {
            await _dataService.SaveTokenUsageAsync(record);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to persist token usage record");
        }
    }

    public TokenMetrics GetCurrentMetrics()
    {
        var snapshot = _records.ToArray();
        return BuildMetrics(snapshot);
    }

    public TokenMetrics GetSessionMetrics(string sessionId)
    {
        var snapshot = _records.Where(r => r.SessionId == sessionId).ToArray();
        return BuildMetrics(snapshot);
    }

    public IReadOnlyList<AgentTokenSummary> GetAgentBreakdown()
    {
        return _records
            .GroupBy(r => r.AgentName)
            .Select(g => new AgentTokenSummary
            {
                AgentName = g.Key,
                TotalTokens = g.Sum(r => r.InputTokens + r.OutputTokens),
                TotalCost = g.Sum(r => r.EstimatedCost),
                DecisionsCommitted = g.Count()
            })
            .OrderByDescending(a => a.TotalCost)
            .ToList()
            .AsReadOnly();
    }

    public decimal GetBurnRatePerHour()
    {
        var snapshot = _records.ToArray();
        if (snapshot.Length == 0) return 0;

        var oldest = snapshot.Min(r => r.Timestamp);
        var newest = snapshot.Max(r => r.Timestamp);
        var span = newest - oldest;

        if (span.TotalHours < 0.01)
            return 0;

        var totalCost = snapshot.Sum(r => r.EstimatedCost);
        return totalCost / (decimal)span.TotalHours;
    }

    public double GetContextPressure(string modelName, int currentTokens)
    {
        var contextWindow = ModelPricing.GetContextWindow(modelName);
        if (contextWindow <= 0) return 0;
        return (double)currentTokens / contextWindow * 100.0;
    }

    /// <summary>Load persisted records into memory on startup.</summary>
    internal async Task LoadFromDatabaseAsync()
    {
        try
        {
            var persisted = await _dataService.GetTokenUsageAsync();
            foreach (var record in persisted)
            {
                _records.Add(record);
            }
            Log.Information("Loaded {Count} token usage records from database", persisted.Count);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load token usage records from database");
        }
    }

    private static TokenMetrics BuildMetrics(TokenUsageRecord[] records)
    {
        if (records.Length == 0)
            return new TokenMetrics();

        var totalInput = records.Sum(r => r.InputTokens);
        var totalOutput = records.Sum(r => r.OutputTokens);
        var totalCost = records.Sum(r => r.EstimatedCost);

        var oldest = records.Min(r => r.Timestamp);
        var newest = records.Max(r => r.Timestamp);
        var span = newest - oldest;

        var burnRate = span.TotalHours >= 0.01
            ? totalCost / (decimal)span.TotalHours
            : 0m;

        return new TokenMetrics
        {
            TotalInputTokens = totalInput,
            TotalOutputTokens = totalOutput,
            TotalCost = totalCost,
            BurnRatePerHour = burnRate,
            RequestCount = records.Length
        };
    }
}
