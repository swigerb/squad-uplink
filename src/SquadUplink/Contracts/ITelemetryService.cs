using SquadUplink.Models;

namespace SquadUplink.Contracts;

public interface ITelemetryService
{
    /// <summary>Record token usage from a completed request.</summary>
    Task RecordTokenUsageAsync(TokenUsageRecord record);

    /// <summary>Get aggregate metrics across all sessions.</summary>
    TokenMetrics GetCurrentMetrics();

    /// <summary>Get aggregate metrics for a specific session.</summary>
    TokenMetrics GetSessionMetrics(string sessionId);

    /// <summary>Get per-agent token breakdown.</summary>
    IReadOnlyList<AgentTokenSummary> GetAgentBreakdown();

    /// <summary>Real-time burn rate (cost per hour).</summary>
    decimal GetBurnRatePerHour();

    /// <summary>Context window pressure (percentage of model's context used).</summary>
    double GetContextPressure(string modelName, int currentTokens);
}
