using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class DashboardViewModelTests
{
    private static DashboardViewModel CreateViewModel(
        ObservableCollection<SessionState>? sessions = null)
    {
        sessions ??= new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        var mockSquadDetector = new Mock<ISquadDetector>();

        return new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            mockSquadDetector.Object);
    }

    [Fact]
    public void ViewModel_CanBeConstructed()
    {
        var vm = CreateViewModel();
        Assert.NotNull(vm);
    }

    [Fact]
    public void SessionCount_UpdatesWhenSessionsChange()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        Assert.Equal("0 sessions", vm.SessionCount);

        sessions.Add(new SessionState
        {
            Id = "test",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal("1 session", vm.SessionCount);
    }

    [Fact]
    public void SquadTreeItems_InitializesEmpty()
    {
        var vm = CreateViewModel();
        Assert.Empty(vm.SquadTreeItems);
    }

    [Fact]
    public void ActiveSessionCount_ComputesCorrectly()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        Assert.Equal(0, vm.ActiveSessionCount);

        sessions.Add(new SessionState
        {
            Id = "running",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        sessions.Add(new SessionState
        {
            Id = "idle",
            WorkingDirectory = @"C:\test2",
            Status = SessionStatus.Completed,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal(1, vm.ActiveSessionCount);
    }
}
