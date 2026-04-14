namespace SquadUplink.Models;

/// <summary>
/// ROI metrics for a single agent, computed from decisions.md productivity signals
/// and token usage telemetry.
/// </summary>
public record AgentRoiMetrics
{
    public required string AgentName { get; init; }

    /// <summary>Count of file saves, commits, artifact exports (Weight = 5).</summary>
    public int FileWrites { get; init; }

    /// <summary>Count of completed tasks, checkboxes, resolved items (Weight = 10).</summary>
    public int TasksResolved { get; init; }

    /// <summary>Count of successful test runs, build successes (Weight = 20).</summary>
    public int TestPasses { get; init; }

    /// <summary>Weighted productivity score: 5·FileWrites + 10·TasksResolved + 20·TestPasses.</summary>
    public int WeightedScore => (5 * FileWrites) + (10 * TasksResolved) + (20 * TestPasses);

    /// <summary>Total token cost from telemetry.</summary>
    public decimal TotalCost { get; init; }

    /// <summary>Total tokens consumed.</summary>
    public int TotalTokens { get; init; }

    /// <summary>ROI ratio = WeightedScore / TotalCost (0 when cost is 0).</summary>
    public decimal RoiRatio => TotalCost > 0 ? WeightedScore / TotalCost : 0;

    /// <summary>True when token spend is high but no file writes detected (agent may be looping).</summary>
    public bool IsLooping => TotalTokens > 10_000 && FileWrites == 0;
}
