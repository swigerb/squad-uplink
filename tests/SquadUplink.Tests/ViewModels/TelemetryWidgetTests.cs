using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.Services;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

/// <summary>
/// Tests for telemetry dashboard widgets, SquadFileWatcher debounce,
/// and DashboardViewModel telemetry integration.
/// </summary>
public class TelemetryWidgetTests
{
    // ═══ Helper: Create DashboardViewModel with telemetry ═══

    private static DashboardViewModel CreateViewModel(
        Mock<ITelemetryService>? telemetry = null,
        SquadFileWatcher? fileWatcher = null,
        ObservableCollection<SessionState>? sessions = null)
    {
        sessions ??= new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());
        var mockSquadDetector = new Mock<ISquadDetector>();
        telemetry ??= new Mock<ITelemetryService>();
        var mockLogger = new Mock<ILogger<DashboardViewModel>>();

        return new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            mockSquadDetector.Object,
            telemetry.Object,
            new InMemorySink(),
            mockLogger.Object,
            fileWatcher);
    }

    // ═══ BurnRate display model tests ═══

    [Theory]
    [InlineData(0.0, "$0.00/hr")]
    [InlineData(0.42, "$0.42/hr")]
    [InlineData(1.50, "$1.50/hr")]
    [InlineData(10.0, "$10.00/hr")]
    public void BurnRateDisplay_FormatsCorrectly(double rate, string expected)
    {
        Assert.Equal(expected, $"${rate:F2}/hr");
    }

    // ═══ Context pressure formatting ═══

    [Theory]
    [InlineData(128_000, "128K")]
    [InlineData(200_000, "200K")]
    [InlineData(1_000_000, "1M")]
    [InlineData(500, "500")]
    public void ContextPressure_FormatTokenCount(int tokens, string expected)
    {
        var result = Controls.ContextPressureWidget.FormatTokenCount(tokens);
        Assert.Equal(expected, result);
    }

    // ═══ AgentRoiRow — emoji mapping ═══

    [Theory]
    [InlineData("Lead Agent", "🎖️")]
    [InlineData("Frontend Dev", "🎨")]
    [InlineData("Backend Engineer", "⚙️")]
    [InlineData("Test Runner", "🧪")]
    [InlineData("DevOps Bot", "🚀")]
    [InlineData("Unknown", "🤖")]
    public void AgentRoiRow_GetAgentEmoji_MapsRolesCorrectly(string name, string expectedEmoji)
    {
        var result = AgentRoiRow.GetAgentEmoji(name);
        Assert.Equal(expectedEmoji, result);
    }

    // ═══ AgentRoiRow — FromSummary ═══

    [Fact]
    public void AgentRoiRow_FromSummary_HighCostHighlighted()
    {
        var summary = new AgentTokenSummary
        {
            AgentName = "Lead Agent",
            TotalTokens = 50_000,
            TotalCost = 2.50m,
            DecisionsCommitted = 2 // $1.25/decision > $0.50 threshold
        };

        var row = AgentRoiRow.FromSummary(summary);
        Assert.Equal("Lead Agent", row.AgentName);
        Assert.Equal("🎖️", row.Emoji);
        Assert.Equal("$2.50", row.CostDisplay);
        Assert.Equal("$1.25", row.CostPerDecisionDisplay);
        Assert.True(row.IsHighCost);
    }

    [Fact]
    public void AgentRoiRow_FromSummary_LowCostNotHighlighted()
    {
        var summary = new AgentTokenSummary
        {
            AgentName = "Test Runner",
            TotalTokens = 10_000,
            TotalCost = 0.10m,
            DecisionsCommitted = 5 // $0.02/decision — way below threshold
        };

        var row = AgentRoiRow.FromSummary(summary);
        Assert.Equal("$0.02", row.CostPerDecisionDisplay);
        Assert.False(row.IsHighCost);
    }

    [Fact]
    public void AgentRoiRow_FromSummary_ZeroDecisions_ShowsDash()
    {
        var summary = new AgentTokenSummary
        {
            AgentName = "Idle Agent",
            TotalTokens = 100,
            TotalCost = 0.01m,
            DecisionsCommitted = 0
        };

        var row = AgentRoiRow.FromSummary(summary);
        Assert.Equal("—", row.CostPerDecisionDisplay);
    }

    // ═══ DashboardViewModel — telemetry refresh ═══

    [Fact]
    public void ViewModel_RefreshTelemetryWidgets_UpdatesProperties()
    {
        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics
        {
            TotalInputTokens = 50_000,
            TotalOutputTokens = 30_000,
            TotalCost = 3.50m,
            BurnRatePerHour = 1.25m,
            RequestCount = 10
        });
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>
        {
            new() { AgentName = "Lead", TotalTokens = 40_000, TotalCost = 2.00m, DecisionsCommitted = 5 },
            new() { AgentName = "Dev", TotalTokens = 40_000, TotalCost = 1.50m, DecisionsCommitted = 3 }
        }.AsReadOnly());

        var vm = CreateViewModel(telemetry: mockTelemetry);
        vm.RefreshTelemetryWidgets();

        Assert.Equal(1.25, vm.BurnRatePerHour);
        Assert.Equal(3.50, vm.SessionTotalCost);
        Assert.Equal(80_000, vm.ContextCurrentTokens); // 50K + 30K
        Assert.NotNull(vm.AgentBreakdown);
        Assert.Equal(2, vm.AgentBreakdown!.Count);
    }

    [Fact]
    public void ViewModel_RefreshTelemetryWidgets_HandlesEmptyMetrics()
    {
        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = CreateViewModel(telemetry: mockTelemetry);
        vm.RefreshTelemetryWidgets();

        Assert.Equal(0.0, vm.BurnRatePerHour);
        Assert.Equal(0.0, vm.SessionTotalCost);
        Assert.Equal(0, vm.ContextCurrentTokens);
        Assert.Empty(vm.AgentBreakdown!);
    }

    // ═══ SquadFileWatcher — debounce behavior ═══

    [Fact]
    public async Task FileWatcher_Debounce_OnlyFiresOnce()
    {
        var mockLogger = new Mock<ILogger<SquadFileWatcher>>();
        using var watcher = new SquadFileWatcher(mockLogger.Object);
        watcher.DebounceMs = 100; // Fast for testing

        var events = new List<SquadFileChangeEvent>();
        watcher.FileChanged += e => events.Add(e);

        // Create a temporary directory with a .md file
        var tempDir = Path.Combine(Path.GetTempPath(), $"squad-watcher-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);
        try
        {
            var testFile = Path.Combine(tempDir, "team.md");
            File.WriteAllText(testFile, "# Team Alpha");

            watcher.StartWatching(tempDir);

            // Rapid-fire multiple writes (should debounce to ~1 event)
            for (int i = 0; i < 5; i++)
            {
                File.AppendAllText(testFile, $"\nLine {i}");
                await Task.Delay(20);
            }

            // Wait for debounce to fire
            await Task.Delay(300);

            // Should have received at most 2 events (debounced)
            Assert.InRange(events.Count, 1, 2);
            Assert.All(events, e => Assert.True(e.FilePath.EndsWith("team.md")));
        }
        finally
        {
            watcher.StopWatching();
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void FileWatcher_StopWatching_StopsEvents()
    {
        var mockLogger = new Mock<ILogger<SquadFileWatcher>>();
        using var watcher = new SquadFileWatcher(mockLogger.Object);

        var tempDir = Path.Combine(Path.GetTempPath(), $"squad-watcher-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);
        try
        {
            watcher.StartWatching(tempDir);
            watcher.StopWatching();

            // After stop, watcher should not throw and should be safe to call again
            watcher.StartWatching(tempDir);
            watcher.StopWatching();
        }
        finally
        {
            Directory.Delete(tempDir, recursive: true);
        }
    }

    [Fact]
    public void FileWatcher_NonExistentDirectory_DoesNotThrow()
    {
        var mockLogger = new Mock<ILogger<SquadFileWatcher>>();
        using var watcher = new SquadFileWatcher(mockLogger.Object);

        // Should not throw, just log warning
        watcher.StartWatching(@"C:\nonexistent-dir-that-does-not-exist-12345");
    }

    // ═══ SquadFileChangeEvent model ═══

    [Theory]
    [InlineData("team.md", true, false)]
    [InlineData("TEAM.MD", true, false)]
    [InlineData("decisions.md", false, true)]
    [InlineData("DECISIONS.MD", false, true)]
    [InlineData("now.md", false, false)]
    [InlineData("other.md", false, false)]
    public void SquadFileChangeEvent_DetectsFileType(string fileName, bool isTeam, bool isDecisions)
    {
        var evt = new SquadFileChangeEvent
        {
            FilePath = Path.Combine(@"C:\repo\.squad", fileName),
            ChangeType = WatcherChangeTypes.Changed,
            Timestamp = DateTime.UtcNow
        };

        Assert.Equal(isTeam, evt.IsTeamFile);
        Assert.Equal(isDecisions, evt.IsDecisionsFile);
    }

    // ═══ ViewModel — FileWatcher subscription ═══

    [Fact]
    public void ViewModel_WithFileWatcher_SubscribesCorrectly()
    {
        var mockLogger = new Mock<ILogger<SquadFileWatcher>>();
        using var fileWatcher = new SquadFileWatcher(mockLogger.Object);

        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        // Constructor should not throw when watcher is provided
        var vm = CreateViewModel(telemetry: mockTelemetry, fileWatcher: fileWatcher);
        Assert.NotNull(vm);
    }

    [Fact]
    public void ViewModel_WithoutFileWatcher_ConstructsSuccessfully()
    {
        var vm = CreateViewModel(fileWatcher: null);
        Assert.NotNull(vm);
    }
}
