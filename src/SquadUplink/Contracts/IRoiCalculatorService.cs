using SquadUplink.Models;

namespace SquadUplink.Contracts;

/// <summary>
/// Calculates agent ROI using a weighted productivity formula:
/// ROI = (5·FileWrites + 10·TasksResolved + 20·TestPasses) / TotalTokenCost
/// </summary>
public interface IRoiCalculatorService
{
    /// <summary>Parses decisions.md content and computes ROI metrics per agent.</summary>
    IReadOnlyList<AgentRoiMetrics> CalculateRoi(IReadOnlyList<DecisionEntry> decisions, IReadOnlyList<AgentTokenSummary> tokenData);
}
