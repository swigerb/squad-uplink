using System.Collections.Concurrent;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class TelemetryService : ITelemetryService
{
    private readonly IDataService _dataService;
    private readonly ConcurrentQueue<TokenUsageRecord> _records = new();
    private const int MaxRetainedRecords = 10_000;

    public TelemetryService(IDataService dataService)
    {
        _dataService = dataService;
    }

    public async Task RecordTokenUsageAsync(TokenUsageRecord record)
    {
        ArgumentNullException.ThrowIfNull(record);

        _records.Enqueue(record);
        // Trim oldest when over retention limit
        while (_records.Count > MaxRetainedRecords)
            _records.TryDequeue(out _);

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

        // Single-pass aggregate for oldest, newest, and total cost
        var oldest = snapshot[0].Timestamp;
        var newest = snapshot[0].Timestamp;
        var totalCost = 0m;

        foreach (var r in snapshot)
        {
            if (r.Timestamp < oldest) oldest = r.Timestamp;
            if (r.Timestamp > newest) newest = r.Timestamp;
            totalCost += r.EstimatedCost;
        }

        var span = newest - oldest;
        if (span.TotalHours < 0.01)
            return 0;

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
                _records.Enqueue(record);
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

        // Single-pass aggregate for all metrics
        var totalInput = 0;
        var totalOutput = 0;
        var totalCost = 0m;
        var oldest = records[0].Timestamp;
        var newest = records[0].Timestamp;

        foreach (var r in records)
        {
            totalInput += r.InputTokens;
            totalOutput += r.OutputTokens;
            totalCost += r.EstimatedCost;
            if (r.Timestamp < oldest) oldest = r.Timestamp;
            if (r.Timestamp > newest) newest = r.Timestamp;
        }

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
