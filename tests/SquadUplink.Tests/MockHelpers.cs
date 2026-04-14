using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Tests;

/// <summary>
/// Shared helpers for setting up mocks consistently across all test files.
/// </summary>
internal static class MockHelpers
{
    /// <summary>
    /// Creates a properly configured ITelemetryService mock that returns
    /// empty (non-null) metrics and agent breakdowns.
    /// </summary>
    public static Mock<ITelemetryService> CreateTelemetryMock()
    {
        var mock = new Mock<ITelemetryService>();
        mock.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mock.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());
        mock.Setup(t => t.GetBurnRatePerHour()).Returns(0m);
        return mock;
    }
}
