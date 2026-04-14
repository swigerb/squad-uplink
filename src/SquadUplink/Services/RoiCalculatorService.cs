using System.Text.RegularExpressions;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

/// <summary>
/// Parses decisions.md entries for productivity signals and computes
/// per-agent ROI using the weighted formula:
/// ROI = (5·FileWrites + 10·TasksResolved + 20·TestPasses) / TotalTokenCost
/// </summary>
public partial class RoiCalculatorService : IRoiCalculatorService
{
    // File write signals
    [GeneratedRegex(@"\b(saved|created|wrote|committed|exported|generated|built)\b", RegexOptions.IgnoreCase)]
    private static partial Regex FileWritePattern();

    // Path-like references (e.g., src/Foo.cs, ./bar.js)
    [GeneratedRegex(@"[\w./\\]+\.\w{1,5}\b")]
    private static partial Regex FilePathPattern();

    // Task resolved signals
    [GeneratedRegex(@"\b(completed|done|resolved|finished|implemented|fixed|closed)\b", RegexOptions.IgnoreCase)]
    private static partial Regex TaskResolvedPattern();

    // Checkbox completed
    [GeneratedRegex(@"\[x\]", RegexOptions.IgnoreCase)]
    private static partial Regex CheckboxPattern();

    // Test pass signals
    [GeneratedRegex(@"\b(tests?\s+pass|exit\s+code\s+0|build\s+succeed|all\s+tests|✅.*test|test.*✅)\b", RegexOptions.IgnoreCase)]
    private static partial Regex TestPassPattern();

    public IReadOnlyList<AgentRoiMetrics> CalculateRoi(
        IReadOnlyList<DecisionEntry> decisions,
        IReadOnlyList<AgentTokenSummary> tokenData)
    {
        // Count productivity signals per author
        var agentSignals = new Dictionary<string, (int FileWrites, int TasksResolved, int TestPasses)>(
            StringComparer.OrdinalIgnoreCase);

        foreach (var decision in decisions)
        {
            var author = string.IsNullOrWhiteSpace(decision.Author) ? "Unknown" : decision.Author;
            if (!agentSignals.TryGetValue(author, out var counts))
                counts = (0, 0, 0);

            var text = decision.Text ?? string.Empty;

            // File writes: action keywords + path references
            var fileWrites = FileWritePattern().Matches(text).Count;
            if (fileWrites > 0 && FilePathPattern().IsMatch(text))
                fileWrites++; // bonus for explicit file path

            // Task resolved
            var tasksResolved = TaskResolvedPattern().Matches(text).Count
                              + CheckboxPattern().Matches(text).Count;

            // Test passes
            var testPasses = TestPassPattern().Matches(text).Count;

            agentSignals[author] = (
                counts.FileWrites + fileWrites,
                counts.TasksResolved + tasksResolved,
                counts.TestPasses + testPasses
            );
        }

        // Merge with token data
        var tokenLookup = tokenData.ToDictionary(t => t.AgentName, StringComparer.OrdinalIgnoreCase);
        var allAgents = new HashSet<string>(
            agentSignals.Keys.Concat(tokenLookup.Keys), StringComparer.OrdinalIgnoreCase);

        var results = new List<AgentRoiMetrics>();
        foreach (var agent in allAgents)
        {
            agentSignals.TryGetValue(agent, out var signals);
            tokenLookup.TryGetValue(agent, out var tokens);

            results.Add(new AgentRoiMetrics
            {
                AgentName = agent,
                FileWrites = signals.FileWrites,
                TasksResolved = signals.TasksResolved,
                TestPasses = signals.TestPasses,
                TotalCost = tokens?.TotalCost ?? 0,
                TotalTokens = tokens?.TotalTokens ?? 0
            });
        }

        return results.OrderByDescending(r => r.RoiRatio).ToList().AsReadOnly();
    }
}
