namespace SquadUplink.Models;

/// <summary>
/// Token pricing table for LLM models. Per-1M-token rates (approximate).
/// </summary>
public static class ModelPricing
{
    public static readonly Dictionary<string, (decimal InputPer1M, decimal OutputPer1M)> Prices = new()
    {
        ["gpt-4o"] = (2.50m, 10.00m),
        ["gpt-4o-mini"] = (0.15m, 0.60m),
        ["claude-opus-4.6"] = (15.00m, 75.00m),
        ["claude-sonnet-4.5"] = (3.00m, 15.00m),
        ["claude-haiku-4.5"] = (0.25m, 1.25m),
        ["o1"] = (15.00m, 60.00m),
        ["o1-mini"] = (3.00m, 12.00m),
    };

    public static decimal CalculateCost(string model, int inputTokens, int outputTokens)
    {
        if (!Prices.TryGetValue(model, out var pricing))
            return 0;
        return (inputTokens * pricing.InputPer1M / 1_000_000m) +
               (outputTokens * pricing.OutputPer1M / 1_000_000m);
    }

    public static int GetContextWindow(string model) => model switch
    {
        "gpt-4o" => 128_000,
        "gpt-4o-mini" => 128_000,
        "claude-opus-4.6" => 200_000,
        "claude-sonnet-4.5" => 200_000,
        "claude-haiku-4.5" => 200_000,
        "o1" => 200_000,
        "o1-mini" => 128_000,
        _ => 128_000
    };
}
