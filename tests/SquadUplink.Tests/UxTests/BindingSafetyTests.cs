using SquadUplink.Models;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 2: XAML binding safety tests.
/// Every model used in DataTemplates must handle null/minimal properties gracefully.
/// Prevents crashes like the GitHubTaskUrl null-binding regression.
/// </summary>
public class BindingSafetyTests
{
    // ── SessionState null safety ───────────────────────────────

    [Fact]
    public void SessionState_WithNullProperties_DoesNotThrowOnPropertyAccess()
    {
        var state = new SessionState
        {
            Id = "test",
            ProcessId = 0,
            WorkingDirectory = "",
            Status = SessionStatus.Discovered
        };

        // All nullable properties should be safely accessible
        var url = state.GitHubTaskUrl;
        var repo = state.RepositoryName;
        var squad = state.Squad;
        var uri = state.GitHubTaskUri;

        Assert.Null(url);
        Assert.Null(repo);
        Assert.Null(squad);
        Assert.Null(uri);
    }

    [Fact]
    public void SessionState_HasGitHubUrl_ReturnsFalseWhenNull()
    {
        var state = new SessionState { Id = "test", GitHubTaskUrl = null };
        Assert.False(state.HasGitHubUrl);
    }

    [Fact]
    public void SessionState_HasGitHubUrl_ReturnsTrueWhenSet()
    {
        var state = new SessionState
        {
            Id = "test",
            GitHubTaskUrl = "https://github.com/owner/repo/issues/1"
        };
        Assert.True(state.HasGitHubUrl);
    }

    [Fact]
    public void SessionState_GitHubTaskUri_NullWhenUrlNull()
    {
        var state = new SessionState { Id = "test" };
        Assert.Null(state.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_GitHubTaskUri_ParsedWhenUrlValid()
    {
        var state = new SessionState
        {
            Id = "test",
            GitHubTaskUrl = "https://github.com/owner/repo/pull/42"
        };
        Assert.NotNull(state.GitHubTaskUri);
        Assert.Contains("pull/42", state.GitHubTaskUri!.ToString());
    }

    [Fact]
    public void SessionState_GitHubTaskUri_NullWhenUrlInvalid()
    {
        var state = new SessionState
        {
            Id = "test",
            GitHubTaskUrl = "not-a-url"
        };
        // HasGitHubUrl is true (non-empty string) but URI is null (invalid parse)
        Assert.True(state.HasGitHubUrl);
        Assert.Null(state.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_HasGitHubUrl_UpdatesWhenUrlCleared()
    {
        var state = new SessionState
        {
            Id = "test",
            GitHubTaskUrl = "https://github.com/o/r/issues/1"
        };
        Assert.True(state.HasGitHubUrl);

        state.GitHubTaskUrl = null;
        Assert.False(state.HasGitHubUrl);
        Assert.Null(state.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_HasGitHubUrl_UpdatesWhenUrlSetToEmpty()
    {
        var state = new SessionState
        {
            Id = "test",
            GitHubTaskUrl = "https://github.com/o/r/issues/1"
        };

        state.GitHubTaskUrl = "";
        Assert.False(state.HasGitHubUrl);
    }

    [Fact]
    public void SessionState_DefaultValues_AreBindingSafe()
    {
        var state = new SessionState();

        // All string properties should have safe defaults (not crash on .Length, etc.)
        Assert.NotNull(state.Id);
        Assert.NotNull(state.WorkingDirectory);
        Assert.NotNull(state.CommandLineArgs);
        Assert.NotNull(state.OutputLines);
        Assert.Empty(state.OutputLines);
    }

    [Fact]
    public void SessionState_AllStatusValues_AreBindingSafe()
    {
        foreach (var status in Enum.GetValues<SessionStatus>())
        {
            var state = new SessionState
            {
                Id = $"status-{status}",
                Status = status,
                WorkingDirectory = @"C:\test"
            };

            // ToString should not throw for any status
            var text = state.Status.ToString();
            Assert.NotNull(text);
            Assert.NotEmpty(text);
        }
    }

    // ── SquadInfo null safety ──────────────────────────────────

    [Fact]
    public void SquadInfo_DefaultConstruction_IsBindingSafe()
    {
        var squad = new SquadInfo();

        Assert.NotNull(squad.TeamName);
        Assert.Null(squad.Universe);
        Assert.Null(squad.CurrentFocus);
        Assert.NotNull(squad.Members);
        Assert.Empty(squad.Members);
        Assert.NotNull(squad.SubSquads);
        Assert.NotNull(squad.RecentDecisions);
    }

    [Fact]
    public void SquadMember_DefaultConstruction_IsBindingSafe()
    {
        var member = new SquadMember();

        Assert.NotNull(member.Name);
        Assert.NotNull(member.Role);
        Assert.NotNull(member.Emoji);
        Assert.NotNull(member.Status);
    }

    // ── DecisionEntry null safety ──────────────────────────────

    [Fact]
    public void DecisionEntry_DefaultConstruction_IsBindingSafe()
    {
        var entry = new DecisionEntry();

        Assert.NotNull(entry.Author);
        Assert.NotNull(entry.Text);
        Assert.Null(entry.FilePath);
        Assert.Equal(default, entry.Timestamp);
    }

    // ── OrchestrationEntry null safety ─────────────────────────

    [Fact]
    public void OrchestrationEntry_DefaultConstruction_IsBindingSafe()
    {
        var entry = new OrchestrationEntry();

        Assert.NotNull(entry.AgentName);
        Assert.Equal("🤖", entry.AgentEmoji);
        Assert.NotNull(entry.Outcome);
        Assert.NotNull(entry.Summary);
        Assert.Null(entry.FullLogContent);
        Assert.Null(entry.FilePath);
    }

    // ── SessionHistoryEntry null safety ────────────────────────

    [Fact]
    public void SessionHistoryEntry_DefaultConstruction_IsBindingSafe()
    {
        var entry = new SessionHistoryEntry();

        Assert.NotNull(entry.SessionId);
        Assert.Null(entry.RepositoryName);
        Assert.NotNull(entry.WorkingDirectory);
        Assert.Null(entry.GitHubTaskUrl);
        Assert.Null(entry.EndedAt);
        Assert.Null(entry.DurationSeconds);
    }

    [Fact]
    public void SessionHistoryEntry_WithNullGitHubUrl_DoesNotCrash()
    {
        var entry = new SessionHistoryEntry
        {
            SessionId = "hist-1",
            WorkingDirectory = @"C:\test",
            GitHubTaskUrl = null
        };

        Assert.Null(entry.GitHubTaskUrl);
    }

    // ── SquadTreeItem null safety ──────────────────────────────

    [Fact]
    public void SquadTreeItem_DefaultConstruction_IsBindingSafe()
    {
        var item = new SquadTreeItem();

        Assert.NotNull(item.DisplayText);
        Assert.NotNull(item.Icon);
        Assert.NotNull(item.StatusText);
        Assert.NotNull(item.Role);
        Assert.False(item.IsHeader);
        Assert.Equal(0, item.IndentLevel);
    }

    // ── TokenUsage null safety ─────────────────────────────────

    [Fact]
    public void TokenUsage_Empty_IsBindingSafe()
    {
        var usage = TokenUsage.Empty;

        Assert.Equal(0, usage.CurrentTokens);
        Assert.Equal(0, usage.MaxTokens);
        Assert.Equal(0m, usage.EstimatedCost);
        Assert.Equal(0.0, usage.Percentage);
        Assert.Equal(TokenTier.Green, usage.Tier);
        Assert.NotNull(usage.CostDisplay);
        Assert.NotNull(usage.PercentageDisplay);
    }

    // ── LaunchOptions null safety ──────────────────────────────

    [Fact]
    public void LaunchOptions_MinimalConstruction_IsBindingSafe()
    {
        var options = new LaunchOptions { WorkingDirectory = @"C:\test" };

        Assert.Null(options.InitialPrompt);
        Assert.Null(options.ResumeSessionId);
        Assert.Null(options.ModelOverride);
        Assert.Null(options.CustomArgs);
        Assert.Null(options.EnvironmentVariables);
    }

    // ── AppSettings defaults ───────────────────────────────────

    [Fact]
    public void AppSettings_DefaultConstruction_HasSafeDefaults()
    {
        var settings = new AppSettings();

        Assert.NotNull(settings.ThemeId);
        Assert.NotNull(settings.DefaultWorkingDirectory);
        Assert.NotNull(settings.SoundPack);
        Assert.NotNull(settings.DefaultModel);
        Assert.NotNull(settings.LayoutMode);
        Assert.NotNull(settings.GridSize);
        Assert.True(settings.ScanIntervalSeconds > 0);
        Assert.True(settings.FontSize > 0);
        Assert.True(settings.Volume > 0);
    }
}
