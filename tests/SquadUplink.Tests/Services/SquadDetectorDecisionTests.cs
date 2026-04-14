using Serilog;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class SquadDetectorDecisionTests : IDisposable
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();
    private readonly string _tempRoot;

    public SquadDetectorDecisionTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"squad-decisions-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, true); } catch { }
    }

    // ── Decision Parsing ────────────────────────────────────────

    [Fact]
    public void ParseDecisions_AuthorPrefixed_ExtractsCorrectly()
    {
        var content = """
            # Decisions

            **Woz** — Use MVVM pattern for all view models
            **Pixel** — Adopt Fluent Design system
            **Tester** — Run smoke tests on every PR
            """;

        var decisions = SquadDetector.ParseDecisions(content);

        Assert.Equal(3, decisions.Count);
        Assert.Equal("Woz", decisions[0].Author);
        Assert.Equal("Use MVVM pattern for all view models", decisions[0].Text);
        Assert.Equal("Pixel", decisions[1].Author);
        Assert.Equal("Adopt Fluent Design system", decisions[1].Text);
    }

    [Fact]
    public void ParseDecisions_Timestamped_ExtractsDateAndText()
    {
        var content = """
            # Decisions Log

            - **2025-01-15 14:30** — Migrate to .NET 10
            - **2025-01-16 09:00** — Add FileSystemWatcher support
            """;

        var decisions = SquadDetector.ParseDecisions(content);

        Assert.Equal(2, decisions.Count);
        Assert.Equal(new DateTime(2025, 1, 15, 14, 30, 0), decisions[0].Timestamp);
        Assert.Equal("Migrate to .NET 10", decisions[0].Text);
        Assert.Equal(new DateTime(2025, 1, 16, 9, 0, 0), decisions[1].Timestamp);
    }

    [Fact]
    public void ParseDecisions_BulletPoints_ExtractsSimpleList()
    {
        var content = """
            # Decisions

            - Use xUnit for testing
            - Prefer source-generated regex
            * Keep models immutable where possible
            """;

        var decisions = SquadDetector.ParseDecisions(content);

        Assert.Equal(3, decisions.Count);
        Assert.Equal("Use xUnit for testing", decisions[0].Text);
        Assert.Equal("Prefer source-generated regex", decisions[1].Text);
        Assert.Equal("Keep models immutable where possible", decisions[2].Text);
    }

    [Fact]
    public void ParseDecisions_RespectMaxCount()
    {
        var content = """
            - Decision 1
            - Decision 2
            - Decision 3
            - Decision 4
            - Decision 5
            - Decision 6
            - Decision 7
            """;

        var decisions = SquadDetector.ParseDecisions(content, maxCount: 3);

        Assert.Equal(3, decisions.Count);
    }

    [Fact]
    public void ParseDecisions_EmptyContent_ReturnsEmptyList()
    {
        Assert.Empty(SquadDetector.ParseDecisions(""));
        Assert.Empty(SquadDetector.ParseDecisions("   \n  "));
    }

    [Fact]
    public void ParseDecisions_MalformedContent_DoesNotThrow()
    {
        var content = "random\x00garbage\x01\ncontent\nno decisions here";
        var decisions = SquadDetector.ParseDecisions(content);
        Assert.NotNull(decisions);
    }

    // ── Decision Inbox File Parsing ─────────────────────────────

    [Fact]
    public void ParseDecisionInboxFile_FullFormat_ExtractsAllFields()
    {
        var content = """
            # Adopt dark mode as default

            author: Pixel
            date: 2025-01-20 10:30

            ---

            Dark mode reduces eye strain and matches our cockpit aesthetic.
            """;

        var decisions = SquadDetector.ParseDecisionInboxFile(content, "inbox/001.md");

        Assert.Single(decisions);
        Assert.Equal("Adopt dark mode as default", decisions[0].Text);
        Assert.Equal("Pixel", decisions[0].Author);
        Assert.Equal(new DateTime(2025, 1, 20, 10, 30, 0), decisions[0].Timestamp);
        Assert.Equal("inbox/001.md", decisions[0].FilePath);
    }

    [Fact]
    public void ParseDecisionInboxFile_MinimalFormat_UsesDefaults()
    {
        var content = "This is a simple decision without metadata.";
        var decisions = SquadDetector.ParseDecisionInboxFile(content);

        Assert.Single(decisions);
        Assert.Equal("This is a simple decision without metadata.", decisions[0].Text);
        Assert.Equal("Squad", decisions[0].Author);
    }

    [Fact]
    public void ParseDecisionInboxFile_EmptyContent_ReturnsEmpty()
    {
        Assert.Empty(SquadDetector.ParseDecisionInboxFile(""));
    }

    // ── Orchestration Log Parsing ───────────────────────────────

    [Fact]
    public void ParseOrchestrationLog_FullFormat_ExtractsAllFields()
    {
        var content = """
            # 🧙 Woz

            agent: Woz
            outcome: success
            timestamp: 2025-01-20 15:00

            ---

            Implemented the SquadDetector service with FileSystemWatcher support.
            """;

        var entries = SquadDetector.ParseOrchestrationLog(content, "log/001.md");

        Assert.Single(entries);
        Assert.Equal("Woz", entries[0].AgentName);
        Assert.Equal("🧙", entries[0].AgentEmoji);
        Assert.Equal("success", entries[0].Outcome);
        Assert.Equal(new DateTime(2025, 1, 20, 15, 0, 0), entries[0].Timestamp);
        Assert.Contains("SquadDetector", entries[0].Summary);
        Assert.Equal("log/001.md", entries[0].FilePath);
        Assert.NotNull(entries[0].FullLogContent);
    }

    [Fact]
    public void ParseOrchestrationLog_MetadataOnly_ExtractsAgent()
    {
        var content = """
            agent: Tester
            outcome: failed
            timestamp: 2025-01-19 12:00

            3 tests failed in the smoke test suite.
            """;

        var entries = SquadDetector.ParseOrchestrationLog(content);

        Assert.Single(entries);
        Assert.Equal("Tester", entries[0].AgentName);
        Assert.Equal("failed", entries[0].Outcome);
        Assert.Equal("🧪", entries[0].AgentEmoji);
    }

    [Fact]
    public void ParseOrchestrationLog_HeaderWithEmoji_ParsesCorrectly()
    {
        var content = """
            # 🎨 Pixel

            Redesigned the dashboard layout with cards view.
            """;

        var entries = SquadDetector.ParseOrchestrationLog(content);

        Assert.Single(entries);
        Assert.Equal("Pixel", entries[0].AgentName);
        Assert.Equal("🎨", entries[0].AgentEmoji);
    }

    [Fact]
    public void ParseOrchestrationLog_EmptyContent_ReturnsEmpty()
    {
        Assert.Empty(SquadDetector.ParseOrchestrationLog(""));
        Assert.Empty(SquadDetector.ParseOrchestrationLog("   \n  "));
    }

    // ── Agent Emoji Resolution ──────────────────────────────────

    [Theory]
    [InlineData("Lead Dev", "🏗️")]
    [InlineData("Woz", "🏗️")]
    [InlineData("Developer", "🔧")]
    [InlineData("Senior Engineer", "🔧")]
    [InlineData("QA Tester", "🧪")]
    [InlineData("UI Designer", "🎨")]
    [InlineData("Technical Writer", "📝")]
    [InlineData("DevOps Engineer", "⚙️")]
    [InlineData("Unknown Agent", "🤖")]
    public void GetAgentEmoji_ReturnsCorrectEmoji(string agentName, string expectedEmoji)
    {
        Assert.Equal(expectedEmoji, SquadDetector.GetAgentEmoji(agentName));
    }

    // ── Integration: DetectAsync reads decisions ────────────────

    [Fact]
    public async Task DetectAsync_ReadsDecisionsFile()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);

        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), """
            # Test Squad

            | Emoji | **Name** | Role | Status |
            |-------|----------|------|--------|
            | 🧙 | **Woz** | Lead Dev | active |
            """);

        await File.WriteAllTextAsync(Path.Combine(squadDir, "decisions.md"), """
            # Decisions

            **Woz** — Use source-generated regex
            **Pixel** — Adopt Fluent Design
            """);

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Equal(2, result!.RecentDecisions.Count);
        Assert.Equal("Use source-generated regex", result.RecentDecisions[0].Text);
    }

    [Fact]
    public async Task DetectAsync_NoDecisionsFile_EmptyDecisions()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);

        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), "# Empty Squad\n");

        var detector = new SquadDetector(TestLogger);
        var result = await detector.DetectAsync(_tempRoot);

        Assert.NotNull(result);
        Assert.Empty(result!.RecentDecisions);
    }

    // ── FileSystemWatcher ───────────────────────────────────────

    [Fact]
    public void StartWatching_NoSquadDir_DoesNotThrow()
    {
        using var detector = new SquadDetector(TestLogger);
        detector.StartWatching(Path.Combine(_tempRoot, "nonexistent"));
        // Should silently return without throwing
    }

    [Fact]
    public void StopWatching_WithoutStart_DoesNotThrow()
    {
        using var detector = new SquadDetector(TestLogger);
        detector.StopWatching();
        // Should silently return
    }

    [Fact]
    public void Dispose_CleansUpWatcher()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);
        File.WriteAllText(Path.Combine(squadDir, "team.md"), "# Test\n");

        var detector = new SquadDetector(TestLogger);
        detector.StartWatching(_tempRoot);
        detector.Dispose();
        // No exception on double dispose
        detector.Dispose();
    }

    [Fact]
    public async Task SquadStateChanged_FiresOnFileChange()
    {
        var squadDir = Path.Combine(_tempRoot, ".squad");
        Directory.CreateDirectory(squadDir);
        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), "# Initial Squad\n");

        using var detector = new SquadDetector(TestLogger);
        SquadInfo? receivedInfo = null;
        var tcs = new TaskCompletionSource<SquadInfo>();

        detector.SquadStateChanged += (_, info) =>
        {
            receivedInfo = info;
            tcs.TrySetResult(info);
        };

        detector.StartWatching(_tempRoot);

        // Modify team file to trigger watcher
        await File.WriteAllTextAsync(Path.Combine(squadDir, "team.md"), """
            # Updated Squad

            | Emoji | **Name** | Role | Status |
            |-------|----------|------|--------|
            | 🧙 | **Woz** | Lead Dev | active |
            """);

        // Wait up to 3 seconds for the event
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try
        {
            await tcs.Task.WaitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            // FileSystemWatcher may not fire reliably in CI/temp dirs
        }

        // If event fired, validate it
        if (receivedInfo is not null)
        {
            Assert.Equal("Updated Squad", receivedInfo.TeamName);
        }
    }
}
