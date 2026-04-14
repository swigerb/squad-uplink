using SquadUplink.Models;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 1: Command palette UX logic tests — verifies command search,
/// filtering, and structure without rendering the XAML popup.
/// </summary>
public class CommandPaletteUxTests
{
    private static CommandItem CreateCommand(
        string id,
        string name,
        string? desc = null,
        string? category = null)
    {
        return new CommandItem
        {
            Id = id,
            DisplayName = name,
            Description = desc,
            Category = category,
            Execute = () => { }
        };
    }

    private static List<CommandItem> CreateSampleCommandList()
    {
        return
        [
            CreateCommand("launch-session", "Launch new session", "Open the launch dialog", "Session"),
            CreateCommand("view-cards", "Switch to Cards view", "Card layout", "Layout"),
            CreateCommand("view-tabs", "Switch to Tabs view", "Tab layout", "Layout"),
            CreateCommand("view-grid", "Switch to Grid view", "Grid layout", "Layout"),
            CreateCommand("open-diagnostics", "Open diagnostics", "View logs", "Tools"),
            CreateCommand("stop-all", "Stop all sessions", "Terminate running sessions", "Session"),
            CreateCommand("export-diagnostic", "Export diagnostic report", "Export to markdown", "Tools"),
            CreateCommand("theme-fluent", "Theme: Fluent", "Apply Fluent theme", "Theme"),
            CreateCommand("theme-c64", "Theme: C64", "Apply C64 theme", "Theme"),
        ];
    }

    // ── Command list structure ──────────────────────────────────

    [Fact]
    public void CommandList_ContainsAllExpectedIds()
    {
        var commands = CreateSampleCommandList();

        Assert.Contains(commands, c => c.Id == "launch-session");
        Assert.Contains(commands, c => c.Id == "view-cards");
        Assert.Contains(commands, c => c.Id == "view-tabs");
        Assert.Contains(commands, c => c.Id == "view-grid");
        Assert.Contains(commands, c => c.Id == "open-diagnostics");
        Assert.Contains(commands, c => c.Id == "stop-all");
        Assert.Contains(commands, c => c.Id == "export-diagnostic");
    }

    [Fact]
    public void CommandList_AllCommandsHaveRequiredFields()
    {
        var commands = CreateSampleCommandList();

        foreach (var cmd in commands)
        {
            Assert.False(string.IsNullOrEmpty(cmd.Id));
            Assert.False(string.IsNullOrEmpty(cmd.DisplayName));
            Assert.NotNull(cmd.Execute);
        }
    }

    // ── Search filtering ───────────────────────────────────────

    [Fact]
    public void Search_EmptyQuery_ShowsAllCommands()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("")).ToList();
        Assert.Equal(commands.Count, filtered.Count);
    }

    [Fact]
    public void Search_WhitespaceQuery_ShowsAllCommands()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("   ")).ToList();
        Assert.Equal(commands.Count, filtered.Count);
    }

    [Fact]
    public void Search_ByDisplayName_FiltersCorrectly()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("Launch")).ToList();
        Assert.Single(filtered);
        Assert.Equal("launch-session", filtered[0].Id);
    }

    [Fact]
    public void Search_ByCategory_FiltersCorrectly()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("Layout")).ToList();
        Assert.Equal(3, filtered.Count);
        Assert.All(filtered, c => Assert.Equal("Layout", c.Category));
    }

    [Fact]
    public void Search_ByDescription_FiltersCorrectly()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("logs")).ToList();
        Assert.Single(filtered);
        Assert.Equal("open-diagnostics", filtered[0].Id);
    }

    [Fact]
    public void Search_IsCaseInsensitive()
    {
        var commands = CreateSampleCommandList();
        var lower = commands.Where(c => c.MatchesQuery("theme")).ToList();
        var upper = commands.Where(c => c.MatchesQuery("THEME")).ToList();
        var mixed = commands.Where(c => c.MatchesQuery("ThEmE")).ToList();

        Assert.Equal(lower.Count, upper.Count);
        Assert.Equal(lower.Count, mixed.Count);
        Assert.True(lower.Count >= 2);
    }

    [Fact]
    public void Search_NoMatch_ReturnsEmpty()
    {
        var commands = CreateSampleCommandList();
        var filtered = commands.Where(c => c.MatchesQuery("zzzznonexistent")).ToList();
        Assert.Empty(filtered);
    }

    // ── CommandItem null-safe fields ───────────────────────────

    [Fact]
    public void CommandItem_NullDescription_MatchesOnlyByNameAndCategory()
    {
        var cmd = new CommandItem
        {
            Id = "test",
            DisplayName = "Test command",
            Description = null,
            Category = null,
            Execute = () => { }
        };

        Assert.True(cmd.MatchesQuery("Test"));
        Assert.False(cmd.MatchesQuery("description"));
    }

    [Fact]
    public void CommandItem_NullCategory_DoesNotCrash()
    {
        var cmd = new CommandItem
        {
            Id = "test",
            DisplayName = "Test",
            Category = null,
            Execute = () => { }
        };

        Assert.False(cmd.MatchesQuery("Session"));
    }
}
