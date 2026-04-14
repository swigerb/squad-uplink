namespace SquadUplink.Models;

/// <summary>
/// A single token usage event from a completed LLM request.
/// </summary>
public record TokenUsageRecord
{
    public required string SessionId { get; init; }
    public required string AgentName { get; init; }
    public required string ModelName { get; init; }
    public required int InputTokens { get; init; }
    public required int OutputTokens { get; init; }
    public required decimal EstimatedCost { get; init; }
    public required DateTime Timestamp { get; init; }
}

/// <summary>
/// Aggregate token metrics for a time window or session.
/// </summary>
public record TokenMetrics
{
    public int TotalInputTokens { get; init; }
    public int TotalOutputTokens { get; init; }
    public int TotalTokens => TotalInputTokens + TotalOutputTokens;
    public decimal TotalCost { get; init; }
    public decimal BurnRatePerHour { get; init; }
    public int RequestCount { get; init; }
    public double AverageTokensPerRequest => RequestCount > 0 ? (double)TotalTokens / RequestCount : 0;
}

/// <summary>
/// Per-agent breakdown of token usage and ROI.
/// </summary>
public record AgentTokenSummary
{
    public required string AgentName { get; init; }
    public int TotalTokens { get; init; }
    public decimal TotalCost { get; init; }
    public int DecisionsCommitted { get; init; }
    public decimal CostPerDecision => DecisionsCommitted > 0 ? TotalCost / DecisionsCommitted : 0;
}
