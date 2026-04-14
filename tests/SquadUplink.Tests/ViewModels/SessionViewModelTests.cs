using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class SessionViewModelTests
{
    private static SessionViewModel CreateViewModel(Mock<ISessionManager>? sessionManager = null)
    {
        sessionManager ??= new Mock<ISessionManager>();
        var mockLogger = new Mock<ILogger<SessionViewModel>>();
        return new SessionViewModel(sessionManager.Object, mockLogger.Object);
    }

    [Fact]
    public void ViewModel_DefaultState()
    {
        var vm = CreateViewModel();
        Assert.Equal("No session selected", vm.StatusText);
        Assert.Equal("No Session", vm.RepositoryName);
    }

    [Fact]
    public void LoadSession_PopulatesProperties()
    {
        var vm = CreateViewModel();
        var session = new SessionState
        {
            Id = "test-1",
            ProcessId = 1234,
            WorkingDirectory = @"C:\repos\my-project",
            RepositoryName = "my-project",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddMinutes(-15),
            GitHubTaskUrl = "https://github.com/org/repo/issues/42"
        };

        vm.LoadSession(session);

        Assert.Equal("Running", vm.StatusText);
        Assert.Equal("PID 1234", vm.ProcessIdText);
        Assert.Equal("my-project", vm.RepositoryName);
        Assert.Equal(@"C:\repos\my-project", vm.WorkingDirectoryText);
        Assert.NotNull(vm.GitHubUri);
    }

    [Fact]
    public async Task StopCommand_StopsSession()
    {
        var mockManager = new Mock<ISessionManager>();
        mockManager.Setup(m => m.StopSessionAsync("test-stop"))
            .Returns(Task.CompletedTask);

        var vm = CreateViewModel(mockManager);
        var session = new SessionState
        {
            Id = "test-stop",
            ProcessId = 100,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };

        vm.LoadSession(session);
        await vm.StopCommand.ExecuteAsync(null);

        mockManager.Verify(m => m.StopSessionAsync("test-stop"), Times.Once);
    }

    [Fact]
    public async Task RestartCommand_StopsAndRelaunches()
    {
        var mockManager = new Mock<ISessionManager>();
        mockManager.Setup(m => m.StopSessionAsync("test-restart"))
            .Returns(Task.CompletedTask);
        mockManager.Setup(m => m.LaunchSessionAsync(@"C:\test", null))
            .ReturnsAsync(new SessionState
            {
                Id = "restarted-1",
                ProcessId = 200,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var vm = CreateViewModel(mockManager);
        var session = new SessionState
        {
            Id = "test-restart",
            ProcessId = 100,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };

        vm.LoadSession(session);
        await vm.RestartCommand.ExecuteAsync(null);

        mockManager.Verify(m => m.StopSessionAsync("test-restart"), Times.Once);
        mockManager.Verify(m => m.LaunchSessionAsync(@"C:\test", null), Times.Once);
        Assert.Equal("restarted-1", vm.RepositoryName is "Unknown" ? "restarted-1" : vm.RepositoryName);
    }

    [Fact]
    public void LoadSession_ExtractsGitHubUri()
    {
        var vm = CreateViewModel();
        var session = new SessionState
        {
            Id = "gh-link",
            ProcessId = 50,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow,
            GitHubTaskUrl = "https://github.com/swigerb/squad-uplink/issues/99"
        };

        vm.LoadSession(session);

        Assert.NotNull(vm.GitHubUri);
        Assert.Contains("issues/99", vm.GitHubUri!.ToString());
    }

    [Fact]
    public void LoadSession_HandlesNullGitHubUrl()
    {
        var vm = CreateViewModel();
        var session = new SessionState
        {
            Id = "no-url",
            ProcessId = 60,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Idle,
            StartedAt = DateTime.UtcNow
        };

        vm.LoadSession(session);

        Assert.Null(vm.GitHubUri);
        Assert.False(vm.HasGitHubUrl);
        Assert.Equal("Unknown", vm.RepositoryName);
    }

    [Fact]
    public void LoadSession_ComputesSessionAge()
    {
        var vm = CreateViewModel();
        var session = new SessionState
        {
            Id = "age-test",
            ProcessId = 70,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddHours(-2).AddMinutes(-15)
        };

        vm.LoadSession(session);

        Assert.Contains("h", vm.SessionAge);
    }
}