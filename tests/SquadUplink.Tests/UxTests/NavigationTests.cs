using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 1: Navigation UX logic tests — verifies that ViewModel state
/// correctly reflects navigation between pages.
/// </summary>
public class NavigationTests
{
    private static DashboardViewModel CreateDashboardViewModel()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        return new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            new Mock<ILogger<DashboardViewModel>>().Object);
    }

    private static SessionViewModel CreateSessionViewModel() =>
        new(new Mock<ISessionManager>().Object, new Mock<ILogger<SessionViewModel>>().Object);

    private static SettingsViewModel CreateSettingsViewModel()
    {
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes)
            .Returns(new[] { "FluentLight", "FluentDark" });
        themeMock.Setup(t => t.CurrentThemeId).Returns("FluentDark");

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync()).ReturnsAsync(new AppSettings());
        dataMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>()))
            .Returns(Task.CompletedTask);

        return new SettingsViewModel(
            themeMock.Object, dataMock.Object,
            new Mock<ILogger<SettingsViewModel>>().Object);
    }

    // ── Dashboard page ─────────────────────────────────────────

    [Fact]
    public void DashboardPage_ViewModel_HasCorrectInitialState()
    {
        var vm = CreateDashboardViewModel();
        Assert.Equal("0 sessions", vm.SessionCount);
        Assert.True(vm.HasNoSessions);
        Assert.True(vm.IsCardsView);
    }

    [Fact]
    public void DashboardPage_ViewModel_TracksActiveSessions()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            new Mock<ILogger<DashboardViewModel>>().Object);

        sessions.Add(new SessionState
        {
            Id = "nav-1",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal(1, vm.ActiveSessionCount);
    }

    // ── Session detail page ────────────────────────────────────

    [Fact]
    public void SessionPage_ViewModel_DefaultsToNoSession()
    {
        var vm = CreateSessionViewModel();
        Assert.Equal("No session selected", vm.StatusText);
        Assert.Equal("No Session", vm.RepositoryName);
        Assert.False(vm.HasGitHubUrl);
    }

    [Fact]
    public void SessionPage_ViewModel_LoadsSessionCorrectly()
    {
        var vm = CreateSessionViewModel();
        vm.LoadSession(new SessionState
        {
            Id = "nav-sess",
            ProcessId = 2222,
            WorkingDirectory = @"C:\repos\app",
            RepositoryName = "app",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow.AddMinutes(-10)
        });

        Assert.Equal("Running", vm.StatusText);
        Assert.Equal("app", vm.RepositoryName);
        Assert.Equal("PID 2222", vm.ProcessIdText);
    }

    // ── Settings page ──────────────────────────────────────────

    [Fact]
    public void SettingsPage_ViewModel_HasVersionText()
    {
        var vm = CreateSettingsViewModel();
        Assert.NotEmpty(vm.VersionText);
    }

    [Fact]
    public async Task SettingsPage_ViewModel_LoadsSettings()
    {
        var vm = CreateSettingsViewModel();
        await vm.LoadSettingsAsync();
        Assert.True(vm.ScanIntervalSeconds > 0);
    }

    // ── ViewModel type safety ──────────────────────────────────

    [Fact]
    public void AllViewModels_InheritViewModelBase()
    {
        var dashboard = CreateDashboardViewModel();
        var session = CreateSessionViewModel();
        var settings = CreateSettingsViewModel();

        Assert.IsAssignableFrom<ViewModelBase>(dashboard);
        Assert.IsAssignableFrom<ViewModelBase>(session);
        Assert.IsAssignableFrom<ViewModelBase>(settings);
    }

    [Fact]
    public void AllViewModels_ImplementIDisposable()
    {
        var dashboard = CreateDashboardViewModel();
        var session = CreateSessionViewModel();
        var settings = CreateSettingsViewModel();

        Assert.IsAssignableFrom<IDisposable>(dashboard);
        Assert.IsAssignableFrom<IDisposable>(session);
        Assert.IsAssignableFrom<IDisposable>(settings);
    }
}
