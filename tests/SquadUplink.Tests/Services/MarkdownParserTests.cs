using SquadUplink.Core.Models;
using SquadUplink.Core.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class MarkdownParserTests
{
    private readonly IMarkdownParser _parser = new MarkdownParser();

    // ── ParseTeamFile ───────────────────────────────────────────

    [Fact]
    public void ParseTeamFile_ValidRoster_ExtractsAllMembers()
    {
        var md = """
            # Squad Team

            > squad-uplink — Retro terminal frontend

            ## Members

            | Name | Role | Charter | Status |
            |------|------|---------|--------|
            | Jobs | Lead | `.squad/agents/jobs/charter.md` | 🏗️ Active |
            | Woz | Lead Dev | `.squad/agents/woz/charter.md` | 🔧 Active |
            | Kare | Frontend Dev | `.squad/agents/kare/charter.md` | ⚛️ Active |
            | Hertzfeld | Tester | `.squad/agents/hertzfeld/charter.md` | 🧪 Active |
            """;

        var info = _parser.ParseTeamFile(md);

        Assert.Equal("Squad Team", info.TeamName);
        Assert.Equal(4, info.Members.Count);
        Assert.Equal("Jobs", info.Members[0].Name);
        Assert.Equal("Lead", info.Members[0].Role);
        Assert.Equal("Woz", info.Members[1].Name);
        Assert.Equal("Lead Dev", info.Members[1].Role);
        Assert.Equal("Kare", info.Members[2].Name);
        Assert.Equal("Hertzfeld", info.Members[3].Name);
        Assert.Equal("Tester", info.Members[3].Role);
    }

    [Fact]
    public void ParseTeamFile_ExtractsUniverse()
    {
        var md = """
            # My Team

            - **Universe:** Apple Legends (custom)

            universe: Apple Legends (custom)
            """;

        var info = _parser.ParseTeamFile(md);
        Assert.Equal("Apple Legends (custom)", info.Universe);
    }

    [Fact]
    public void ParseTeamFile_MissingColumns_StillParses()
    {
        var md = """
            # Sparse Team

            | Name | Role |
            |------|------|
            | Alice | Engineer |
            | Bob | Designer |
            """;

        var info = _parser.ParseTeamFile(md);
        Assert.Equal("Sparse Team", info.TeamName);
        Assert.Equal(2, info.Members.Count);
        Assert.Equal("Alice", info.Members[0].Name);
        Assert.Equal("Engineer", info.Members[0].Role);
    }

    [Fact]
    public void ParseTeamFile_BoldFormattingInCells_StripsMarkdown()
    {
        var md = """
            # Bold Team

            | Name | Role | Status |
            |------|------|--------|
            | **Alice** | **Lead** | Active |
            | _Bob_ | __Designer__ | Idle |
            """;

        var info = _parser.ParseTeamFile(md);
        Assert.Equal(2, info.Members.Count);
        Assert.Equal("Alice", info.Members[0].Name);
        Assert.Equal("Lead", info.Members[0].Role);
        Assert.Equal("Bob", info.Members[1].Name);
    }

    [Fact]
    public void ParseTeamFile_ExtraColumns_Ignored()
    {
        var md = """
            # Extended Team

            | Name | Role | Charter | Status | Extra |
            |------|------|---------|--------|-------|
            | Alice | Dev | charter.md | Active | foo |
            """;

        var info = _parser.ParseTeamFile(md);
        Assert.Single(info.Members);
        Assert.Equal("Alice", info.Members[0].Name);
        Assert.Equal("Dev", info.Members[0].Role);
    }

    [Fact]
    public void ParseTeamFile_EmptyContent_ReturnsEmptyInfo()
    {
        var info = _parser.ParseTeamFile("");
        Assert.Equal(string.Empty, info.TeamName);
        Assert.Empty(info.Members);
    }

    [Fact]
    public void ParseTeamFile_NullContent_ReturnsEmptyInfo()
    {
        var info = _parser.ParseTeamFile(null!);
        Assert.Equal(string.Empty, info.TeamName);
        Assert.Empty(info.Members);
    }

    [Fact]
    public void ParseTeamFile_MalformedMarkdown_DoesNotThrow()
    {
        var info = _parser.ParseTeamFile("random\x00garbage\x01\n||||\n\ncontent");
        Assert.NotNull(info);
    }

    [Fact]
    public void ParseTeamFile_MultipleTablesPicksMembers()
    {
        var md = """
            # Team

            ## Coordinator

            | Name | Role | Notes |
            |------|------|-------|
            | Squad | Coordinator | Routes work |

            ## Members

            | Name | Role | Charter | Status |
            |------|------|---------|--------|
            | Alice | Dev | charter.md | Active |
            | Bob | QA | charter.md | Active |
            """;

        var info = _parser.ParseTeamFile(md);
        // Should find members from both tables, Coordinator + Members
        Assert.True(info.Members.Count >= 2, $"Expected at least 2 members, got {info.Members.Count}");
    }

    // ── ParseDecisionsFile ──────────────────────────────────────

    [Fact]
    public void ParseDecisionsFile_MultipleEntries_AllParsed()
    {
        var md = """
            # Squad Decisions

            ## Active Decisions

            ### 2026-04-08T030500Z: WebSocket Auth via Subprotocol
            **By:** Woz (Lead Dev)
            **Status:** Implemented

            Switched WebSocket authentication from query parameter to subprotocol method.

            ---

            ### 2026-04-05T03:19:17Z: Squad-Uplink Architecture
            **By:** Brady
            **Status:** Approved

            Visual specs and integration design.
            """;

        var decisions = _parser.ParseDecisionsFile(md);
        Assert.Equal(2, decisions.Count);

        Assert.Equal("2026-04-08T030500Z", decisions[0].Timestamp);
        Assert.Equal("WebSocket Auth via Subprotocol", decisions[0].Title);
        Assert.Equal("Woz", decisions[0].Author);
        Assert.Equal("Implemented", decisions[0].Status);
        Assert.Contains("Switched WebSocket", decisions[0].Content);

        Assert.Equal("2026-04-05T03:19:17Z", decisions[1].Timestamp);
        Assert.Equal("Squad-Uplink Architecture", decisions[1].Title);
        Assert.Equal("Brady", decisions[1].Author);
    }

    [Fact]
    public void ParseDecisionsFile_NoEntries_ReturnsEmpty()
    {
        var md = """
            # Squad Decisions

            ## Active Decisions

            No decisions yet.
            """;

        var decisions = _parser.ParseDecisionsFile(md);
        Assert.Empty(decisions);
    }

    [Fact]
    public void ParseDecisionsFile_EmptyInput_ReturnsEmpty()
    {
        Assert.Empty(_parser.ParseDecisionsFile(""));
        Assert.Empty(_parser.ParseDecisionsFile("  \n  "));
        Assert.Empty(_parser.ParseDecisionsFile(null!));
    }

    [Fact]
    public void ParseDecisionsFile_HeadingWithoutTimestamp_UsesTitle()
    {
        var md = """
            # Decisions

            ### Use MVVM for all view models
            **By:** Woz

            Good architecture pattern.
            """;

        var decisions = _parser.ParseDecisionsFile(md);
        Assert.Single(decisions);
        Assert.Equal("Use MVVM for all view models", decisions[0].Title);
        Assert.Equal(string.Empty, decisions[0].Timestamp);
    }

    // ── ParseNowFile ────────────────────────────────────────────

    [Fact]
    public void ParseNowFile_ExtractsH2Focus()
    {
        var md = """
            ## Implementing core services

            Working on ProcessScanner and OutputCapture.
            """;

        var focus = _parser.ParseNowFile(md);
        Assert.Equal("Implementing core services", focus);
    }

    [Fact]
    public void ParseNowFile_ExtractsH1Focus()
    {
        var focus = _parser.ParseNowFile("# Current Focus\nMore info.");
        Assert.Equal("Current Focus", focus);
    }

    [Fact]
    public void ParseNowFile_FallsBackToFirstLine()
    {
        var focus = _parser.ParseNowFile("Doing important work");
        Assert.Equal("Doing important work", focus);
    }

    [Fact]
    public void ParseNowFile_ReturnsNullForEmpty()
    {
        Assert.Null(_parser.ParseNowFile(""));
        Assert.Null(_parser.ParseNowFile("   \n  \n  "));
        Assert.Null(_parser.ParseNowFile(null!));
    }

    [Fact]
    public void ParseNowFile_SkipsFrontMatter()
    {
        var md = """
            ---
            type: focus
            ---
            Working on tests
            """;

        var focus = _parser.ParseNowFile(md);
        Assert.Equal("Working on tests", focus);
    }
}
