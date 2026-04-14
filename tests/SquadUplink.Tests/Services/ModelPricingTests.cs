using SquadUplink.Models;
using Xunit;

namespace SquadUplink.Tests.Services;

public class ModelPricingTests
{
    [Fact]
    public void CalculateCost_KnownModel_ReturnsCorrectCost()
    {
        // gpt-4o: $2.50 input / $10.00 output per 1M tokens
        var cost = ModelPricing.CalculateCost("gpt-4o", 1_000_000, 1_000_000);
        Assert.Equal(12.50m, cost);
    }

    [Fact]
    public void CalculateCost_SmallUsage_ReturnsProportionalCost()
    {
        // 1000 input tokens of gpt-4o: $2.50 / 1000 = $0.0025
        var cost = ModelPricing.CalculateCost("gpt-4o", 1000, 0);
        Assert.Equal(0.0025m, cost);
    }

    [Fact]
    public void CalculateCost_UnknownModel_ReturnsZero()
    {
        var cost = ModelPricing.CalculateCost("unknown-model-v99", 10_000, 5_000);
        Assert.Equal(0m, cost);
    }

    [Fact]
    public void CalculateCost_CombinedInputOutput()
    {
        // claude-sonnet-4.5: $3.00 input, $15.00 output per 1M
        // 500k input = $1.50, 200k output = $3.00, total = $4.50
        var cost = ModelPricing.CalculateCost("claude-sonnet-4.5", 500_000, 200_000);
        Assert.Equal(4.50m, cost);
    }

    [Fact]
    public void CalculateCost_ZeroTokens_ReturnsZero()
    {
        var cost = ModelPricing.CalculateCost("gpt-4o", 0, 0);
        Assert.Equal(0m, cost);
    }

    [Fact]
    public void GetContextWindow_KnownModels_ReturnsCorrectValues()
    {
        Assert.Equal(128_000, ModelPricing.GetContextWindow("gpt-4o"));
        Assert.Equal(200_000, ModelPricing.GetContextWindow("claude-opus-4.6"));
        Assert.Equal(200_000, ModelPricing.GetContextWindow("claude-sonnet-4.5"));
    }

    [Fact]
    public void GetContextWindow_UnknownModel_ReturnsDefault()
    {
        Assert.Equal(128_000, ModelPricing.GetContextWindow("some-future-model"));
    }
}
