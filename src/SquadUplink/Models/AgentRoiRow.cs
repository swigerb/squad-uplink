using Microsoft.UI;
using Microsoft.UI.Xaml.Media;

namespace SquadUplink.Models;

/// <summary>
/// UI display model for a single row in the Agent ROI table.
/// Brush creation is guarded with try-catch so the model remains testable
/// outside a WinUI thread (brushes resolve to null in unit-test context).
/// </summary>
public record AgentRoiRow
{
    public string AgentName { get; set; } = string.Empty;
    public string Emoji { get; set; } = string.Empty;
    public string TokenDisplay { get; set; } = string.Empty;
    public string CostDisplay { get; set; } = string.Empty;
    public string DecisionDisplay { get; set; } = string.Empty;
    public string CostPerDecisionDisplay { get; set; } = string.Empty;
    public string RoiDisplay { get; set; } = string.Empty;
    public bool IsHighCost { get; set; }
    public bool IsLooping { get; set; }
    public Brush? CostPerDecisionBrush { get; set; }
    public Brush? RoiBrush { get; set; }
    public Brush? RowBackground { get; set; }

    private static SolidColorBrush? _redBrush;
    private static SolidColorBrush? _defaultBrush;
    private static SolidColorBrush? _highlightBg;
    private static SolidColorBrush? _transparentBg;

    private static SolidColorBrush? TryCreateBrush(byte a, byte r, byte g, byte b)
    {
        try { return new SolidColorBrush(ColorHelper.FromArgb(a, r, g, b)); }
        catch { return null; }
    }

    private static SolidColorBrush? TryCreateTransparent()
    {
        try { return new SolidColorBrush(Colors.Transparent); }
        catch { return null; }
    }

    private static SolidColorBrush? HighCostBrush => _redBrush ??= TryCreateBrush(255, 244, 67, 54);
    private static SolidColorBrush? DefaultTextBrush => _defaultBrush ??= TryCreateBrush(255, 200, 200, 200);
    private static SolidColorBrush? HighlightBackground => _highlightBg ??= TryCreateBrush(20, 244, 67, 54);
    private static SolidColorBrush? TransparentBackground => _transparentBg ??= TryCreateTransparent();

    private static SolidColorBrush? _greenBrush;
    private static SolidColorBrush? _yellowBrush;
    private static SolidColorBrush? _loopingBg;
    private static SolidColorBrush? GreenRoiBrush => _greenBrush ??= TryCreateBrush(255, 0, 200, 83);
    private static SolidColorBrush? YellowRoiBrush => _yellowBrush ??= TryCreateBrush(255, 255, 193, 7);
    private static SolidColorBrush? LoopingBackground => _loopingBg ??= TryCreateBrush(30, 255, 193, 7);

    /// <summary>
    /// Returns the role emoji for an agent name using standard Squad conventions.
    /// </summary>
    internal static string GetAgentEmoji(string agentName)
    {
        if (string.IsNullOrEmpty(agentName)) return "🤖";

        var lower = agentName.ToLowerInvariant();
        return lower switch
        {
            _ when lower.Contains("lead") => "🎖️",
            _ when lower.Contains("architect") => "🏗️",
            _ when lower.Contains("frontend") || lower.Contains("ui") => "🎨",
            _ when lower.Contains("backend") || lower.Contains("api") => "⚙️",
            _ when lower.Contains("test") || lower.Contains("qa") => "🧪",
            _ when lower.Contains("devops") || lower.Contains("ops") => "🚀",
            _ when lower.Contains("design") => "✨",
            _ when lower.Contains("security") => "🔒",
            _ when lower.Contains("data") => "📊",
            _ when lower.Contains("doc") => "📝",
            _ => "🤖"
        };
    }

    public static AgentRoiRow FromSummary(AgentTokenSummary summary)
    {
        var costPerDecision = summary.CostPerDecision;
        var isHighCost = costPerDecision > 0.50m;

        return new AgentRoiRow
        {
            AgentName = summary.AgentName,
            Emoji = GetAgentEmoji(summary.AgentName),
            TokenDisplay = FormatTokens(summary.TotalTokens),
            CostDisplay = $"${summary.TotalCost:F2}",
            DecisionDisplay = summary.DecisionsCommitted.ToString(),
            CostPerDecisionDisplay = summary.DecisionsCommitted > 0
                ? $"${costPerDecision:F2}"
                : "—",
            RoiDisplay = "—",
            IsHighCost = isHighCost,
            CostPerDecisionBrush = isHighCost ? HighCostBrush : DefaultTextBrush,
            RoiBrush = DefaultTextBrush,
            RowBackground = isHighCost ? HighlightBackground : TransparentBackground
        };
    }

    /// <summary>
    /// Creates a row from combined ROI metrics (productivity + token data).
    /// </summary>
    public static AgentRoiRow FromRoiMetrics(AgentRoiMetrics metrics)
    {
        var isHighCost = metrics.TotalCost > 0 && metrics.RoiRatio < 10;
        var isLooping = metrics.IsLooping;

        Brush? roiBrush = metrics.RoiRatio switch
        {
            > 50 => GreenRoiBrush,
            > 10 => YellowRoiBrush,
            _ => HighCostBrush
        };

        Brush? bg = isLooping ? LoopingBackground
            : isHighCost ? HighlightBackground
            : TransparentBackground;

        return new AgentRoiRow
        {
            AgentName = metrics.AgentName,
            Emoji = GetAgentEmoji(metrics.AgentName),
            TokenDisplay = FormatTokens(metrics.TotalTokens),
            CostDisplay = metrics.TotalCost > 0 ? $"${metrics.TotalCost:F2}" : "—",
            DecisionDisplay = $"{metrics.FileWrites}w/{metrics.TasksResolved}t/{metrics.TestPasses}p",
            CostPerDecisionDisplay = metrics.WeightedScore.ToString(),
            RoiDisplay = metrics.TotalCost > 0 ? $"{metrics.RoiRatio:F1}" : "—",
            IsHighCost = isHighCost,
            IsLooping = isLooping,
            CostPerDecisionBrush = DefaultTextBrush,
            RoiBrush = roiBrush,
            RowBackground = bg
        };
    }

    private static string FormatTokens(int tokens) => tokens switch
    {
        >= 1_000_000 => $"{tokens / 1_000_000.0:F1}M",
        >= 1_000 => $"{tokens / 1_000.0:F1}K",
        _ => tokens.ToString()
    };
}
