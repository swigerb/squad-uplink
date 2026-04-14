using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 1: Dashboard UX logic tests — verifies the ViewModel properties
/// that drive the Dashboard UI without rendering XAML.
/// </summary>
public class DashboardUxTests
{
    private static DashboardViewModel CreateViewModel(
        ObservableCollection<SessionState>? sessions = null,
        Mock<IDataService>? dataService = null)
    {
        sessions ??= new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        dataService ??= new Mock<IDataService>();
        dataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());
        var mockSquadDetector = new Mock<ISquadDetector>();
        var mockTelemetry = MockHelpers.CreateTelemetryMock();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());
        var mockLogger = new Mock<ILogger<DashboardViewModel>>();

        return new DashboardViewModel(
            mockSessionManager.Object,
            dataService.Object,
            mockSquadDetector.Object,
            mockTelemetry.Object,
            new InMemorySink(),
            mockLogger.Object);
    }

    private static SessionState CreateSession(
        string id = "s1",
        SessionStatus status = SessionStatus.Running,
        string? repo = null,
        string? gitHubUrl = null,
        SquadInfo? squad = null)
    {
        return new SessionState
        {
            Id = id,
            ProcessId = Random.Shared.Next(1000, 9999),
            WorkingDirectory = $@"C:\repos\{repo ?? id}",
            RepositoryName = repo,
            GitHubTaskUrl = gitHubUrl,
            Status = status,
            StartedAt = DateTime.UtcNow.AddMinutes(-5),
            Squad = squad
        };
    }

    // ── Session card data rendering ────────────────────────────

    [Fact]
    public void SessionCard_RenderData_FromSessionState()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        var session = CreateSession(
            id: "card-1",
            repo: "my-app",
            gitHubUrl: "https://github.com/owner/my-app/issues/5");
        sessions.Add(session);

        Assert.Single(vm.Sessions);
        Assert.Equal("my-app", vm.Sessions[0].RepositoryName);
        Assert.True(vm.Sessions[0].HasGitHubUrl);
    }

    [Fact]
    public void SessionWithNullGitHubUrl_DoesNotCrashCard()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        sessions.Add(CreateSession(id: "no-url", gitHubUrl: null));

        Assert.Single(vm.Sessions);
        Assert.False(vm.Sessions[0].HasGitHubUrl);
        Assert.Null(vm.Sessions[0].GitHubTaskUri);
    }

    [Fact]
    public void SessionWithValidGitHubUrl_ShowsOpenInGitHub()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        sessions.Add(CreateSession(
            id: "with-url",
            gitHubUrl: "https://github.com/o/r/pull/7"));

        Assert.True(vm.Sessions[0].HasGitHubUrl);
        Assert.NotNull(vm.Sessions[0].GitHubTaskUri);
    }

    // ── Launch New Session command ─────────────────────────────

    [Fact]
    public void LaunchSessionCommand_IsAvailable()
    {
        var vm = CreateViewModel();
        Assert.NotNull(vm.LaunchSessionCommand);
    }

    [Fact]
    public void RefreshCommand_IsAvailable()
    {
        var vm = CreateViewModel();
        Assert.NotNull(vm.RefreshCommand);
    }

    // ── Layout toggle ──────────────────────────────────────────

    [Fact]
    public void LayoutToggle_Cards_SetsExclusiveMode()
    {
        var vm = CreateViewModel();
        vm.IsCardsView = true;

        Assert.True(vm.IsCardsView);
        Assert.False(vm.IsTabView);
        Assert.False(vm.IsGridView);
        Assert.Equal(LayoutMode.Cards, vm.CurrentLayoutMode);
    }

    [Fact]
    public void LayoutToggle_Tabs_SetsExclusiveMode()
    {
        var vm = CreateViewModel();
        vm.IsTabView = true;

        Assert.True(vm.IsTabView);
        Assert.False(vm.IsCardsView);
        Assert.False(vm.IsGridView);
        Assert.Equal(LayoutMode.Tabs, vm.CurrentLayoutMode);
    }

    [Fact]
    public void LayoutToggle_Grid_SetsExclusiveMode()
    {
        var vm = CreateViewModel();
        vm.IsGridView = true;

        Assert.True(vm.IsGridView);
        Assert.False(vm.IsCardsView);
        Assert.False(vm.IsTabView);
        Assert.Equal(LayoutMode.Grid, vm.CurrentLayoutMode);
    }

    [Fact]
    public void LayoutToggle_GridShowsSizeSelector_OthersDont()
    {
        var vm = CreateViewModel();

        vm.IsGridView = true;
        Assert.True(vm.IsGridSizeSelectorVisible);

        vm.IsCardsView = true;
        Assert.False(vm.IsGridSizeSelectorVisible);

        vm.IsTabView = true;
        Assert.False(vm.IsGridSizeSelectorVisible);
    }

    // ── Session count badge ────────────────────────────────────

    [Fact]
    public void SessionCountBadge_ZeroSessions()
    {
        var vm = CreateViewModel();
        Assert.Equal("0 sessions", vm.SessionCount);
    }

    [Fact]
    public void SessionCountBadge_SingleSession_SingularForm()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        sessions.Add(CreateSession());
        Assert.Equal("1 session", vm.SessionCount);
    }

    [Fact]
    public void SessionCountBadge_MultipleSessions_PluralForm()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        sessions.Add(CreateSession(id: "s1"));
        sessions.Add(CreateSession(id: "s2"));
        sessions.Add(CreateSession(id: "s3"));
        Assert.Equal("3 sessions", vm.SessionCount);
    }

    [Fact]
    public void SessionCountBadge_Updates_WhenSessionRemoved()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        var s1 = CreateSession(id: "s1");
        sessions.Add(s1);
        sessions.Add(CreateSession(id: "s2"));
        Assert.Equal("2 sessions", vm.SessionCount);

        sessions.Remove(s1);
        Assert.Equal("1 session", vm.SessionCount);
    }

    // ── Empty state ────────────────────────────────────────────

    [Fact]
    public void EmptyState_ShowsWhenNoSessions()
    {
        var vm = CreateViewModel();
        Assert.True(vm.HasNoSessions);
    }

    [Fact]
    public void EmptyState_HidesWhenSessionsExist()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        sessions.Add(CreateSession());
        Assert.False(vm.HasNoSessions);
    }

    [Fact]
    public void EmptyState_ReappearsWhenAllSessionsRemoved()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        var s = CreateSession();
        sessions.Add(s);
        Assert.False(vm.HasNoSessions);

        sessions.Remove(s);
        Assert.True(vm.HasNoSessions);
    }

    // ── Scan status text ───────────────────────────────────────

    [Fact]
    public void ScanStatus_DefaultIsScanning()
    {
        var vm = CreateViewModel();
        Assert.Equal("Scanning...", vm.ScanStatusText);
    }

    [Fact]
    public void ScanStatus_SingleSessionActive()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        sessions.Add(CreateSession());
        Assert.Equal("1 session active", vm.ScanStatusText);
    }

    [Fact]
    public void ScanStatus_MultipleSessionsActive()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        sessions.Add(CreateSession(id: "a"));
        sessions.Add(CreateSession(id: "b"));
        Assert.Equal("2 sessions active", vm.ScanStatusText);
    }

    // ── Focused mode ───────────────────────────────────────────

    [Fact]
    public void FocusedMode_DefaultOff()
    {
        var vm = CreateViewModel();
        Assert.False(vm.IsFocusedMode);
    }

    [Fact]
    public void FocusedMode_TogglesOnOff()
    {
        var vm = CreateViewModel();
        vm.ToggleFocusedModeCommand.Execute(null);
        Assert.True(vm.IsFocusedMode);

        vm.ToggleFocusedModeCommand.Execute(null);
        Assert.False(vm.IsFocusedMode);
    }

    // ── Collections initialize empty ───────────────────────────

    [Fact]
    public void Collections_InitializeEmpty()
    {
        var vm = CreateViewModel();
        Assert.Empty(vm.SquadTreeItems);
        Assert.Empty(vm.Squads);
        Assert.NotNull(vm.RecentSessions);
        Assert.NotNull(vm.DecisionFeed);
        Assert.NotNull(vm.OrchestrationTimeline);
    }
}
