using SquadUplink.Core.Services;
using SquadUplink.Services;
using Serilog;
using Xunit;

namespace SquadUplink.Tests.Integration;

/// <summary>
/// Integration tests that read ACTUAL .squad/ files from this repo.
/// Validates parsing against the real team roster and decisions.
/// </summary>
public class RealSquadFileTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    private static string? FindProjectRoot()
    {
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 10; i++)
        {
            var candidate = Path.GetFullPath(Path.Combine(dir, string.Concat(Enumerable.Repeat(".." + Path.DirectorySeparatorChar, i))));
            if (Directory.Exists(Path.Combine(candidate, ".squad")))
                return candidate;
        }
        return null;
    }

    [Fact]
    public void MarkdigParser_ParsesRealTeamFile()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var teamFile = Path.Combine(root, ".squad", "team.md");
        if (!File.Exists(teamFile)) return;

        var parser = new MarkdownParser();
        var content = File.ReadAllText(teamFile);
        var info = parser.ParseTeamFile(content);

        Assert.Equal("Squad Team", info.TeamName);
        Assert.True(info.Members.Count >= 4, $"Expected at least 4 members, got {info.Members.Count}");

        var names = info.Members.Select(m => m.Name).ToList();
        Assert.Contains("Jobs", names);
        Assert.Contains("Woz", names);
        Assert.Contains("Kare", names);
        Assert.Contains("Hertzfeld", names);
    }

    [Fact]
    public void MarkdigParser_ParsesRealDecisionsFile()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var decisionsFile = Path.Combine(root, ".squad", "decisions.md");
        if (!File.Exists(decisionsFile)) return;

        var parser = new MarkdownParser();
        var content = File.ReadAllText(decisionsFile);
        var decisions = parser.ParseDecisionsFile(content);

        Assert.True(decisions.Count > 0, "Real decisions.md should have at least one decision entry");
        Assert.All(decisions, d =>
        {
            Assert.False(string.IsNullOrWhiteSpace(d.Title), "Decision title should not be empty");
            Assert.False(string.IsNullOrWhiteSpace(d.Author), "Decision author should not be empty");
        });
    }

    [Fact]
    public void MarkdigParser_RealTeamRoster_ContainsExpectedRoles()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var teamFile = Path.Combine(root, ".squad", "team.md");
        if (!File.Exists(teamFile)) return;

        var parser = new MarkdownParser();
        var info = parser.ParseTeamFile(File.ReadAllText(teamFile));

        var roles = info.Members.Select(m => m.Role).ToList();
        Assert.Contains(roles, r => r.Contains("Lead", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(roles, r => r.Contains("Tester", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(roles, r => r.Contains("Dev", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task SquadDetector_ParsesRealSquadFiles()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(root);

        Assert.NotNull(result);
        Assert.Equal("Squad Team", result!.TeamName);

        var names = result.Members.Select(m => m.Name).ToList();
        Assert.Contains("Jobs", names);
        Assert.Contains("Woz", names);
        Assert.Contains("Kare", names);
        Assert.Contains("Hertzfeld", names);
    }

    [Fact]
    public async Task SquadDetector_RealDecisions_HasEntries()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(root);

        Assert.NotNull(result);
        Assert.True(result!.RecentDecisions.Count > 0, "Should detect decisions from real decisions.md");
    }

    [Fact]
    public void MarkdigParser_ReturnsConsistentResultsWithRegex()
    {
        var root = FindProjectRoot();
        if (root is null) return;

        var teamFile = Path.Combine(root, ".squad", "team.md");
        if (!File.Exists(teamFile)) return;

        var content = File.ReadAllText(teamFile);

        // Parse with both approaches
        var markdigParser = new MarkdownParser();
        var markdigResult = markdigParser.ParseTeamFile(content);
        var regexResult = SquadDetector.ParseTeamFileRegex(content);

        // Both should find the same team name
        Assert.Equal(regexResult.TeamName, markdigResult.TeamName);

        // Both should find the same member count (or close)
        Assert.True(
            Math.Abs(regexResult.Members.Count - markdigResult.Members.Count) <= 1,
            $"Regex found {regexResult.Members.Count}, Markdig found {markdigResult.Members.Count}");
    }
}
