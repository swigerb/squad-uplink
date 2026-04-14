using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.Controls;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

/// <summary>
/// Command palette, token gauge, and timeline scrubber tests.
/// </summary>
public class CommandPaletteAndGaugeTests
{
    // ═══ Command Item — fuzzy search filtering ═══

    [Theory]
    [InlineData("launch", true)]
    [InlineData("Launch", true)]
    [InlineData("LAUNCH", true)]
    [InlineData("session", true)]
    [InlineData("xyz-nonexistent", false)]
    [InlineData("", true)]
    [InlineData("   ", true)]
    public void CommandItem_MatchesQuery_CaseInsensitive(string query, bool expected)
    {
        var item = new CommandItem
        {
            Id = "test",
            DisplayName = "Launch new session",
            Description = "Open the launch session dialog",
            Category = "Session",
            Execute = () => { }
        };

        Assert.Equal(expected, item.MatchesQuery(query));
    }

    [Fact]
    public void CommandItem_MatchesQuery_ByCategory()
    {
        var item = new CommandItem
        {
            Id = "theme-fluent",
            DisplayName = "Switch theme: Fluent",
            Description = "Apply the Fluent visual theme",
            Category = "Theme",
            Execute = () => { }
        };

        Assert.True(item.MatchesQuery("theme"));
        Assert.True(item.MatchesQuery("Theme"));
        Assert.False(item.MatchesQuery("session"));
    }

    [Fact]
    public void CommandItem_MatchesQuery_ByDescription()
    {
        var item = new CommandItem
        {
            Id = "diagnostics",
            DisplayName = "Open diagnostics",
            Description = "View logs and diagnostic information",
            Category = "Tools",
            Execute = () => { }
        };

        Assert.True(item.MatchesQuery("logs"));
        Assert.True(item.MatchesQuery("diagnostic"));
    }

    // ═══ Command List — generation and structure ═══

    [Fact]
    public void BuildCommandList_ContainsExpectedCommands()
    {
        var mockTheme = new Mock<IThemeService>();
        mockTheme.Setup(t => t.AvailableThemes)
            .Returns(new List<string> { "Fluent", "AppleIIe", "C64", "PipBoy" }.AsReadOnly());

        var commands = MainWindow.BuildCommandList(mockTheme.Object);

        // Core commands
        Assert.Contains(commands, c => c.Id == "launch-session");
        Assert.Contains(commands, c => c.Id == "view-cards");
        Assert.Contains(commands, c => c.Id == "view-tabs");
        Assert.Contains(commands, c => c.Id == "view-grid");
        Assert.Contains(commands, c => c.Id == "open-diagnostics");
        Assert.Contains(commands, c => c.Id == "stop-all");
        Assert.Contains(commands, c => c.Id == "export-diagnostic");
    }

    [Fact]
    public void BuildCommandList_IncludesThemeCommands()
    {
        var mockTheme = new Mock<IThemeService>();
        mockTheme.Setup(t => t.AvailableThemes)
            .Returns(new List<string> { "Fluent", "AppleIIe", "C64", "PipBoy" }.AsReadOnly());

        var commands = MainWindow.BuildCommandList(mockTheme.Object);

        Assert.Contains(commands, c => c.Id == "theme-fluent");
        Assert.Contains(commands, c => c.Id == "theme-appleiie");
        Assert.Contains(commands, c => c.Id == "theme-c64");
        Assert.Contains(commands, c => c.Id == "theme-pipboy");
    }

    [Fact]
    public void BuildCommandList_AllCommandsHaveRequiredFields()
    {
        var mockTheme = new Mock<IThemeService>();
        mockTheme.Setup(t => t.AvailableThemes)
            .Returns(new List<string> { "Fluent" }.AsReadOnly());

        var commands = MainWindow.BuildCommandList(mockTheme.Object);

        foreach (var cmd in commands)
        {
            Assert.False(string.IsNullOrEmpty(cmd.Id), $"Command missing Id");
            Assert.False(string.IsNullOrEmpty(cmd.DisplayName), $"Command {cmd.Id} missing DisplayName");
            Assert.NotNull(cmd.Execute);
        }
    }

    [Fact]
    public void BuildCommandList_SearchFiltering_ReturnsSubset()
    {
        var mockTheme = new Mock<IThemeService>();
        mockTheme.Setup(t => t.AvailableThemes)
            .Returns(new List<string> { "Fluent", "C64" }.AsReadOnly());

        var commands = MainWindow.BuildCommandList(mockTheme.Object);
        var layoutCommands = commands.Where(c => c.MatchesQuery("view")).ToList();

        // Should match the 3 view-switching commands at minimum
        Assert.True(layoutCommands.Count >= 3, $"Expected at least 3 layout commands, got {layoutCommands.Count}");
    }

    // ═══ Token Gauge — threshold colors and percentages ═══

    [Theory]
    [InlineData(0, 100, 0.0)]
    [InlineData(50, 100, 50.0)]
    [InlineData(100, 100, 100.0)]
    [InlineData(12500, 32000, 39.0625)]
    public void TokenUsage_CalculatesPercentage(int current, int max, double expected)
    {
        var usage = new TokenUsage(current, max, 0m);
        Assert.Equal(expected, usage.Percentage, 4);
    }

    [Theory]
    [InlineData(10, 100, TokenTier.Green)]    // 10% — green
    [InlineData(49, 100, TokenTier.Green)]    // 49% — green
    [InlineData(50, 100, TokenTier.Yellow)]   // 50% — yellow
    [InlineData(79, 100, TokenTier.Yellow)]   // 79% — yellow
    [InlineData(80, 100, TokenTier.Red)]      // 80% — red
    [InlineData(100, 100, TokenTier.Red)]     // 100% — red
    public void TokenUsage_TierThresholds_AreCorrect(int current, int max, TokenTier expectedTier)
    {
        var usage = new TokenUsage(current, max, 0m);
        Assert.Equal(expectedTier, usage.Tier);
    }

    [Fact]
    public void TokenUsage_EmptyMaxTokens_ReturnsZeroPercent()
    {
        var usage = new TokenUsage(100, 0, 0m);
        Assert.Equal(0.0, usage.Percentage);
        Assert.Equal(TokenTier.Green, usage.Tier);
    }

    [Fact]
    public void TokenUsage_CostDisplay_FormattedCorrectly()
    {
        var usage = new TokenUsage(12500, 32000, 0.12m);
        Assert.Equal("$0.12 est.", usage.CostDisplay);

        var expensive = new TokenUsage(50000, 128000, 1.47m);
        Assert.Equal("$1.47 est.", expensive.CostDisplay);
    }

    [Fact]
    public void TokenUsage_Placeholder_HasReasonableDefaults()
    {
        var placeholder = TokenUsage.Placeholder;
        Assert.True(placeholder.CurrentTokens > 0);
        Assert.True(placeholder.MaxTokens > 0);
        Assert.True(placeholder.EstimatedCost > 0);
        Assert.True(placeholder.Percentage > 0);
    }

    [Fact]
    public void TokenUsage_PercentageDisplay_FormattedCorrectly()
    {
        var usage = new TokenUsage(25, 100, 0m);
        Assert.Equal("25%", usage.PercentageDisplay);

        var half = new TokenUsage(50, 100, 0m);
        Assert.Equal("50%", half.PercentageDisplay);
    }

    // ═══ Timeline Scrubber — time formatting ═══

    [Theory]
    [InlineData(0, "00:00")]
    [InlineData(90, "01:30")]
    [InlineData(3599, "59:59")]
    [InlineData(3600, "01:00:00")]
    [InlineData(7200, "02:00:00")]
    [InlineData(5400, "01:30:00")]
    public void TimelineScrubber_FormatTime_CorrectOutput(int seconds, string expected)
    {
        Assert.Equal(expected, TimelineScrubber.FormatTime(seconds));
    }

    [Fact]
    public void TimelineScrubber_FormatTime_NegativeSeconds_ReturnsZero()
    {
        Assert.Equal("00:00", TimelineScrubber.FormatTime(-100));
    }
}
