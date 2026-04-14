namespace SquadUplink.Models;

/// <summary>
/// Holds token usage metrics for a session gauge display.
/// </summary>
public record TokenUsage(int CurrentTokens, int MaxTokens, decimal EstimatedCost)
{
    public double Percentage => MaxTokens > 0 ? (double)CurrentTokens / MaxTokens * 100.0 : 0;

    /// <summary>
    /// Returns the threshold tier for color coding.
    /// Green: &lt;50%, Yellow: 50-80%, Red: &gt;80%
    /// </summary>
    public TokenTier Tier => Percentage switch
    {
        < 50.0 => TokenTier.Green,
        < 80.0 => TokenTier.Yellow,
        _ => TokenTier.Red
    };

    public string CostDisplay => $"${EstimatedCost:F2} est.";
    public string PercentageDisplay => $"{Percentage:F0}%";

    public static TokenUsage Empty => new(0, 0, 0m);

    /// <summary>
    /// Creates placeholder data for UI preview.
    /// </summary>
    public static TokenUsage Placeholder => new(12_500, 32_000, 0.12m);
}

public enum TokenTier
{
    Green,
    Yellow,
    Red
}
