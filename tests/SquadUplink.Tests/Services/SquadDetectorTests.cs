using Serilog;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class SquadDetectorTests : IDisposable
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();
    private readonly string _tempRoot;

    public SquadDetectorTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"squad-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, true); } catch { }
    }

    [Fact]
    public void Detector_CanBeConstructed()
    {
        var detector = new SquadDetector();
        Assert.NotNull(detector);
    }

    [Fact]
    public async Task DetectAsync_ReturnsNullForEmptyPath()
    {
        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(string.Empty);
        Assert.Null(result);
    }

    [Fact]
    public async Task DetectAsync_ReturnsNullWhenNoSquadDir()
    {
        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(@"C:\nonexistent\path\unlikely");
        Assert.Null(result);
    }

    [Fact]
    public async Task DetectAsync_ReadsTeamFile()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);

        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), """
            # Alpha Squad

            universe: squad-uplink

            | Emoji | **Name** | Role | Status |
            |-------|----------|------|--------|
            | 🧙 | **Woz** | Lead Dev | active |
            | 🎨 | **Pixel** | UI Designer | active |
            """);

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Equal("Alpha Squad", result!.TeamName);
        Assert.Equal("squad-uplink", result.Universe);
        Assert.Equal(2, result.Members.Count);
        Assert.Equal("Woz", result.Members[0].Name);
        Assert.Equal("Lead Dev", result.Members[0].Role);
        Assert.Equal("🧙", result.Members[0].Emoji);
        Assert.Equal("active", result.Members[0].Status);
    }

    [Fact]
    public async Task DetectAsync_ReadsCurrentFocus()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        var identityDir = Path.Combine(squadDir, "identity");
        Directory.CreateDirectory(identityDir);

        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), "# Bravo Team\n");
        await File.WriteAllTextAsync(Path.Combine(identityDir, "now.md"), """
            ## Implementing core services

            Working on ProcessScanner and OutputCapture.
            """);

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Equal("Implementing core services", result!.CurrentFocus);
    }

    [Fact]
    public async Task DetectAsync_DetectsSubSquads()
    {
        // Parent squad
        var parentSquadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(parentSquadDir);
        await File.WriteAllTextAsync(Path.Combine(parentSquadDir, "team.md"), "# Parent Squad\n");

        // Child sub-squad
        var childDir = Path.Combine(_tempRoot, "child-project");
        var childSquadDir = Path.Combine(childDir, ".squad");
        Directory.CreateDirectory(childSquadDir);
        await File.WriteAllTextAsync(Path.Combine(childSquadDir, "team.md"), """
            # Child Squad

            | Emoji | **Name** | Role | Status |
            |-------|----------|------|--------|
            | 🤖 | **Bot** | Worker | idle |
            """);

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Single(result!.SubSquads);
        Assert.Equal("Child Squad", result.SubSquads[0].TeamName);
        Assert.Single(result.SubSquads[0].Members);
    }

    [Fact]
    public async Task DetectAsync_HandlesCorruptedFiles()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);
        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), "garbage\x00\x01\x02content");

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        // Should return a SquadInfo (possibly empty team name) without crashing
        Assert.NotNull(result);
    }

    [Fact]
    public async Task DetectAsync_ReturnsNullWhenNoTeamFile()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);
        // .squad exists but no team.md

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);
        Assert.Null(result);
    }

    // --- ParseTeamFile unit tests ---

    [Fact]
    public void ParseTeamFile_ExtractsTeamName()
    {
        var info = SquadDetector.ParseTeamFileRegex("# My Cool Team\nSome description");
        Assert.Equal("My Cool Team", info.TeamName);
    }

    [Fact]
    public void ParseTeamFile_ExtractsUniverse()
    {
        var info = SquadDetector.ParseTeamFileRegex("# Team\nuniverse: big-project\n");
        Assert.Equal("big-project", info.Universe);
    }

    [Fact]
    public void ParseTeamFile_ExtractsMembers()
    {
        var content = """
            # Test Team

            | Emoji | **Name** | Role | Status |
            |-------|----------|------|--------|
            | 🔥 | **Alice** | Engineer | active |
            | 🌊 | **Bob** | Designer | idle |
            """;

        var info = SquadDetector.ParseTeamFileRegex(content);
        Assert.Equal(2, info.Members.Count);
        Assert.Equal("Alice", info.Members[0].Name);
        Assert.Equal("Bob", info.Members[1].Name);
        Assert.Equal("Engineer", info.Members[0].Role);
        Assert.Equal("idle", info.Members[1].Status);
    }

    [Fact]
    public void ParseTeamFile_HandlesEmptyContent()
    {
        var info = SquadDetector.ParseTeamFileRegex("");
        Assert.Equal(string.Empty, info.TeamName);
        Assert.Empty(info.Members);
    }

    [Fact]
    public void ParseTeamFile_HandlesNoMembers()
    {
        var info = SquadDetector.ParseTeamFileRegex("# Solo Squad\nNo members yet.");
        Assert.Equal("Solo Squad", info.TeamName);
        Assert.Empty(info.Members);
    }

    // --- ParseCurrentFocus unit tests ---

    [Fact]
    public void ParseCurrentFocus_ExtractsH2Header()
    {
        var focus = SquadDetector.ParseCurrentFocusRegex("## Building the dashboard\nDetails here.");
        Assert.Equal("Building the dashboard", focus);
    }

    [Fact]
    public void ParseCurrentFocus_ExtractsH1Header()
    {
        var focus = SquadDetector.ParseCurrentFocusRegex("# Current Focus\nMore info.");
        Assert.Equal("Current Focus", focus);
    }

    [Fact]
    public void ParseCurrentFocus_FallsBackToFirstLine()
    {
        var focus = SquadDetector.ParseCurrentFocusRegex("Doing important work");
        Assert.Equal("Doing important work", focus);
    }

    [Fact]
    public void ParseCurrentFocus_ReturnsNullForEmpty()
    {
        Assert.Null(SquadDetector.ParseCurrentFocusRegex(""));
        Assert.Null(SquadDetector.ParseCurrentFocusRegex("   \n  \n  "));
    }

    [Fact]
    public void ParseCurrentFocus_SkipsFrontMatter()
    {
        var content = """
            ---
            type: focus
            ---
            Working on tests
            """;
        var focus = SquadDetector.ParseCurrentFocusRegex(content);
        Assert.Equal("Working on tests", focus);
    }

    // --- Real .squad/ file integration tests ---

    [Fact]
    public async Task DetectAsync_ReadsRealSquadFiles_FromProjectRoot()
    {
        var projectRoot = FindProjectRoot();
        if (projectRoot is null) return;

        var squadDir = Path.Combine(projectRoot, ".squad");
        if (!Directory.Exists(squadDir)) return;

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(projectRoot);

        Assert.NotNull(result);
        Assert.Equal("Squad Team", result!.TeamName);

        // Verify the real roster: Jobs, Woz, Kare, Hertzfeld, Scribe, Ralph
        var memberNames = result.Members.Select(m => m.Name).ToList();
        Assert.Contains("Jobs", memberNames);
        Assert.Contains("Woz", memberNames);
        Assert.Contains("Kare", memberNames);
        Assert.Contains("Hertzfeld", memberNames);
        Assert.Contains("Scribe", memberNames);
        Assert.Contains("Ralph", memberNames);
        Assert.True(result.Members.Count >= 6, $"Expected at least 6 members, got {result.Members.Count}");

        // Verify current focus was read from identity/now.md
        Assert.NotNull(result.CurrentFocus);

        // Verify decisions were read from decisions.md
        Assert.NotNull(result.RecentDecisions);
        Assert.True(result.RecentDecisions.Count > 0, "Expected at least one decision from real decisions.md");
    }

    [Fact]
    public async Task DetectAsync_ReadsDecisionsFromRealFile()
    {
        var projectRoot = FindProjectRoot();
        if (projectRoot is null) return;

        var decisionsFile = Path.Combine(projectRoot, ".squad", "decisions.md");
        if (!File.Exists(decisionsFile)) return;

        var content = await File.ReadAllTextAsync(decisionsFile);
        var decisions = SquadDetector.ParseDecisions(content, 5);

        Assert.NotNull(decisions);
        Assert.True(decisions.Count > 0, "Real decisions.md should have at least one decision");
    }

    private static string? FindProjectRoot()
    {
        var dir = AppContext.BaseDirectory;
        for (var i = 0; i < 10; i++)
        {
            var candidate = Path.GetFullPath(Path.Combine(dir, string.Concat(Enumerable.Repeat("..\\", i))));
            if (Directory.Exists(Path.Combine(candidate, ".squad")))
                return candidate;
        }
        return null;
    }
}
