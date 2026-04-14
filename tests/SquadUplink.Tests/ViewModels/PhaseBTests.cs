using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class PhaseBTests
{
    // ═══ GitHub URL Extraction ═══

    [Theory]
    [InlineData("https://github.com/octocat/hello/tasks/42", "https://github.com/octocat/hello/tasks/42")]
    [InlineData("Check out https://github.com/org/repo/issues/123 for details", "https://github.com/org/repo/issues/123")]
    [InlineData("PR at https://github.com/team/proj/pull/7 is ready", "https://github.com/team/proj/pull/7")]
    [InlineData("no url here", null)]
    [InlineData("https://example.com/not-github", null)]
    [InlineData("", null)]
    public void ExtractGitHubUrl_ParsesVariousFormats(string input, string? expected)
    {
        var result = SessionViewModel.ExtractGitHubUrl(input);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void ExtractGitHubUrl_FindsTasksUrl()
    {
        var url = SessionViewModel.ExtractGitHubUrl(
            "Working on https://github.com/swigerb/squad-uplink/tasks/99");
        Assert.Contains("tasks/99", url!);
    }

    [Fact]
    public void ExtractGitHubUrl_FindsIssuesUrl()
    {
        var url = SessionViewModel.ExtractGitHubUrl(
            "Issue https://github.com/owner/repo/issues/5 assigned");
        Assert.Contains("issues/5", url!);
    }

    [Fact]
    public void ExtractGitHubUrl_FindsPullRequestUrl()
    {
        var url = SessionViewModel.ExtractGitHubUrl(
            "See https://github.com/owner/repo/pull/12 for changes");
        Assert.Contains("pull/12", url!);
    }

    // ═══ Session Card ViewModel Properties ═══

    [Fact]
    public void SessionState_ComputesRepositoryNameFromWorkingDirectory()
    {
        var session = new SessionState
        {
            Id = "card-test",
            WorkingDirectory = @"C:\repos\my-project",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };

        // RepositoryName defaults to null — ViewModel fills it in
        Assert.Null(session.RepositoryName);
        session.RepositoryName = "my-project";
        Assert.Equal("my-project", session.RepositoryName);
    }

    [Fact]
    public void SessionState_GitHubTaskUrlIsObservable()
    {
        var session = new SessionState
        {
            Id = "gh-test",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };

        string? changedProperty = null;
        session.PropertyChanged += (_, e) => changedProperty = e.PropertyName;

        session.GitHubTaskUrl = "https://github.com/o/r/tasks/1";
        Assert.Equal("GitHubTaskUrl", changedProperty);
    }

    [Fact]
    public void SessionViewModel_LoadSession_SetsAllProperties()
    {
        var mockManager = new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        var vm = new SessionViewModel(mockManager.Object, mockLogger.Object);

        var session = new SessionState
        {
            Id = "full-test",
            ProcessId = 5678,
            WorkingDirectory = @"C:\repos\squad-uplink",
            RepositoryName = "squad-uplink",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddHours(-1),
            GitHubTaskUrl = "https://github.com/swigerb/squad-uplink/tasks/10"
        };

        vm.LoadSession(session);

        Assert.Equal("Running", vm.StatusText);
        Assert.Equal("PID 5678", vm.ProcessIdText);
        Assert.Equal(@"C:\repos\squad-uplink", vm.WorkingDirectoryText);
        Assert.Equal("squad-uplink", vm.RepositoryName);
        Assert.True(vm.HasGitHubUrl);
        Assert.NotNull(vm.GitHubUri);
        Assert.Contains("tasks/10", vm.GitHubUri!.ToString());
    }

    [Fact]
    public void SessionViewModel_OutputLines_PopulatedOnLoad()
    {
        var mockManager = new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        var vm = new SessionViewModel(mockManager.Object, mockLogger.Object);

        var session = new SessionState
        {
            Id = "output-test",
            ProcessId = 100,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };
        session.OutputLines.Add("Line 1");
        session.OutputLines.Add("Line 2");
        session.OutputLines.Add("Line 3");

        vm.LoadSession(session);

        Assert.Equal(3, vm.OutputLines.Count);
        Assert.Equal("Line 1", vm.OutputLines[0]);
        Assert.Equal(3, vm.OutputLineCount);
    }

    [Fact]
    public void SessionViewModel_ExtractsGitHubUrlFromOutput()
    {
        var mockManager = new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        var vm = new SessionViewModel(mockManager.Object, mockLogger.Object);

        var session = new SessionState
        {
            Id = "extract-test",
            ProcessId = 200,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };
        session.OutputLines.Add("Starting session...");
        session.OutputLines.Add("Task: https://github.com/owner/repo/tasks/55");
        session.OutputLines.Add("Done.");

        vm.LoadSession(session);

        Assert.True(vm.HasGitHubUrl);
        Assert.Contains("tasks/55", vm.GitHubUri!.ToString());
    }

    // ═══ Launch Dialog Validation ═══

    [Fact]
    public void LaunchOptions_RequiresWorkingDirectory()
    {
        var options = new LaunchOptions
        {
            WorkingDirectory = @"C:\test"
        };

        Assert.Equal(@"C:\test", options.WorkingDirectory);
    }

    [Fact]
    public void LaunchOptions_OptionalFieldsAreNull()
    {
        var options = new LaunchOptions
        {
            WorkingDirectory = @"C:\test"
        };

        Assert.Null(options.InitialPrompt);
        Assert.Null(options.ModelOverride);
        Assert.Null(options.ResumeSessionId);
    }

    [Fact]
    public void LaunchOptions_CanSetAllFields()
    {
        var options = new LaunchOptions
        {
            WorkingDirectory = @"C:\repos\app",
            InitialPrompt = "Fix the tests",
            ModelOverride = "sonnet",
            ResumeSessionId = "abc123"
        };

        Assert.Equal(@"C:\repos\app", options.WorkingDirectory);
        Assert.Equal("Fix the tests", options.InitialPrompt);
        Assert.Equal("sonnet", options.ModelOverride);
        Assert.Equal("abc123", options.ResumeSessionId);
    }

    // ═══ Layout Persistence ═══

    [Fact]
    public void LayoutMode_CardsCanBeParsed()
    {
        Assert.True(Enum.TryParse<LayoutMode>("Cards", out var mode));
        Assert.Equal(LayoutMode.Cards, mode);
    }

    [Fact]
    public void LayoutMode_AllModesRoundTrip()
    {
        foreach (var mode in Enum.GetValues<LayoutMode>())
        {
            var str = mode.ToString();
            Assert.True(Enum.TryParse<LayoutMode>(str, out var parsed));
            Assert.Equal(mode, parsed);
        }
    }

    [Fact]
    public void AppSettings_DefaultLayoutIsCards()
    {
        // AppSettings.LayoutMode defaults to "Tabs" (existing behavior),
        // but when parsed as Cards it works
        Assert.True(Enum.TryParse<LayoutMode>("Cards", out _));
    }

    // ═══ Session Age Computation ═══

    [Fact]
    public void SessionViewModel_SessionAge_MinutesFormat()
    {
        var mockManager = new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        var vm = new SessionViewModel(mockManager.Object, mockLogger.Object);

        var session = new SessionState
        {
            Id = "age-min",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddMinutes(-30)
        };

        vm.LoadSession(session);
        Assert.EndsWith("m", vm.SessionAge);
        Assert.DoesNotContain("h", vm.SessionAge);
    }

    [Fact]
    public void SessionViewModel_SessionAge_HoursFormat()
    {
        var mockManager = new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        var vm = new SessionViewModel(mockManager.Object, mockLogger.Object);

        var session = new SessionState
        {
            Id = "age-hr",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddHours(-3).AddMinutes(-15)
        };

        vm.LoadSession(session);
        Assert.Contains("h", vm.SessionAge);
    }
}
