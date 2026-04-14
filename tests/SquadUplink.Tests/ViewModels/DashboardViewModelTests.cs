using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class DashboardViewModelTests
{
    private static DashboardViewModel CreateViewModel(
        ObservableCollection<SessionState>? sessions = null,
        Mock<IDataService>? dataService = null,
        InMemorySink? sink = null)
    {
        sessions ??= new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        dataService ??= new Mock<IDataService>();
        dataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());
        var mockSquadDetector = new Mock<ISquadDetector>();
        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());
        var mockLogger = new Mock<ILogger<DashboardViewModel>>();

        return new DashboardViewModel(
            mockSessionManager.Object,
            dataService.Object,
            mockSquadDetector.Object,
            mockTelemetry.Object,
            sink ?? new InMemorySink(),
            mockLogger.Object);
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

    [Fact]
    public void LayoutToggle_SetsCorrectMode()
    {
        var vm = CreateViewModel();

        vm.IsGridView = true;
        Assert.True(vm.IsGridView);
        Assert.False(vm.IsTabView);
        Assert.False(vm.IsCardsView);

        vm.IsTabView = true;
        Assert.True(vm.IsTabView);
        Assert.False(vm.IsGridView);
        Assert.False(vm.IsCardsView);

        vm.IsCardsView = true;
        Assert.True(vm.IsCardsView);
        Assert.False(vm.IsTabView);
        Assert.False(vm.IsGridView);
    }

    [Fact]
    public async Task LaunchSessionCommand_InvokesSessionManager()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        mockSessionManager.Setup(m => m.LaunchSessionAsync(It.IsAny<string>(), null))
            .ReturnsAsync(new SessionState
            {
                Id = "new-session",
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            mockTelemetry.Object,
            new InMemorySink(),
            new Mock<ILogger<DashboardViewModel>>().Object);

        await vm.LaunchSessionCommand.ExecuteAsync(null);

        mockSessionManager.Verify(m => m.LaunchSessionAsync(It.IsAny<string>(), null), Times.Once);
    }

    [Fact]
    public void RecentSessions_InitializesEmpty()
    {
        var vm = CreateViewModel();
        Assert.NotNull(vm.RecentSessions);
    }

    [Fact]
    public void ErrorCount_TracksInMemorySinkErrors()
    {
        var sink = new InMemorySink();
        var vm = CreateViewModel(sink: sink);

        // Emit an error-level event into the sink
        sink.Emit(new Serilog.Events.LogEvent(
            DateTimeOffset.UtcNow,
            Serilog.Events.LogEventLevel.Error,
            null,
            new Serilog.Events.MessageTemplate("Test error", []),
            []));

        Assert.Equal(1, vm.ErrorCount);
    }

    [Fact]
    public void LayoutMode_DefaultsToCards()
    {
        var vm = CreateViewModel();
        Assert.Equal(LayoutMode.Cards, vm.CurrentLayoutMode);
    }

    [Fact]
    public void GridSizeOptions_ContainsPresets()
    {
        var vm = CreateViewModel();
        Assert.Contains("2x2", vm.GridSizeOptions);
        Assert.Contains("1x1", vm.GridSizeOptions);
        Assert.Contains("3x2", vm.GridSizeOptions);
    }

    [Fact]
    public void LayoutToggle_SwitchesToGrid_SetsLayoutMode()
    {
        var vm = CreateViewModel();
        // Start in Cards mode (default), switch to Grid
        vm.IsGridView = true;
        Assert.Equal(LayoutMode.Grid, vm.CurrentLayoutMode);
        Assert.True(vm.IsGridSizeSelectorVisible);
    }

    [Fact]
    public void LayoutToggle_SwitchesToTabs_HidesGridSelector()
    {
        var vm = CreateViewModel();
        // Switch to Grid, then Tabs
        vm.IsGridView = true;
        vm.IsTabView = true;
        Assert.Equal(LayoutMode.Tabs, vm.CurrentLayoutMode);
        Assert.False(vm.IsGridSizeSelectorVisible);
    }

    [Fact]
    public void GridSize_DefaultsTo2x2()
    {
        var vm = CreateViewModel();
        Assert.Equal(GridSize.Default, vm.CurrentGridSize);
        Assert.Equal(2, vm.CurrentGridSize.Rows);
        Assert.Equal(2, vm.CurrentGridSize.Columns);
    }

    [Fact]
    public void GridSizeIndex_ChangesGridSize()
    {
        var vm = CreateViewModel();
        // Switch to Grid mode first so index changes are meaningful
        vm.IsGridView = true;
        vm.SelectedGridSizeIndex = 1; // 2x1
        Assert.Equal(new GridSize(2, 1), vm.CurrentGridSize);

        vm.SelectedGridSizeIndex = 4; // 3x2
        Assert.Equal(new GridSize(3, 2), vm.CurrentGridSize);
    }

    [Fact]
    public void SelectNextSession_CyclesToNext()
    {
        var sessions = new ObservableCollection<SessionState>
        {
            new() { Id = "s1", WorkingDirectory = @"C:\a", StartedAt = DateTime.UtcNow },
            new() { Id = "s2", WorkingDirectory = @"C:\b", StartedAt = DateTime.UtcNow },
            new() { Id = "s3", WorkingDirectory = @"C:\c", StartedAt = DateTime.UtcNow },
        };
        var vm = CreateViewModel(sessions);
        vm.SelectedSessionIndex = 0;

        vm.SelectNextSessionCommand.Execute(null);
        Assert.Equal(1, vm.SelectedSessionIndex);

        vm.SelectNextSessionCommand.Execute(null);
        Assert.Equal(2, vm.SelectedSessionIndex);

        // Wraps around
        vm.SelectNextSessionCommand.Execute(null);
        Assert.Equal(0, vm.SelectedSessionIndex);
    }

    [Fact]
    public void SelectPreviousSession_CyclesToPrevious()
    {
        var sessions = new ObservableCollection<SessionState>
        {
            new() { Id = "s1", WorkingDirectory = @"C:\a", StartedAt = DateTime.UtcNow },
            new() { Id = "s2", WorkingDirectory = @"C:\b", StartedAt = DateTime.UtcNow },
        };
        var vm = CreateViewModel(sessions);
        vm.SelectedSessionIndex = 0;

        // Wraps to last
        vm.SelectPreviousSessionCommand.Execute(null);
        Assert.Equal(1, vm.SelectedSessionIndex);
    }

    [Fact]
    public void SelectSessionByIndex_SetsCorrectIndex()
    {
        var sessions = new ObservableCollection<SessionState>
        {
            new() { Id = "s1", WorkingDirectory = @"C:\a", StartedAt = DateTime.UtcNow },
            new() { Id = "s2", WorkingDirectory = @"C:\b", StartedAt = DateTime.UtcNow },
            new() { Id = "s3", WorkingDirectory = @"C:\c", StartedAt = DateTime.UtcNow },
        };
        var vm = CreateViewModel(sessions);

        vm.SelectSessionByIndexCommand.Execute(2);
        Assert.Equal(2, vm.SelectedSessionIndex);
    }

    [Fact]
    public void SelectSessionByIndex_IgnoresOutOfRange()
    {
        var sessions = new ObservableCollection<SessionState>
        {
            new() { Id = "s1", WorkingDirectory = @"C:\a", StartedAt = DateTime.UtcNow },
        };
        var vm = CreateViewModel(sessions);
        vm.SelectedSessionIndex = 0;

        vm.SelectSessionByIndexCommand.Execute(5);
        Assert.Equal(0, vm.SelectedSessionIndex);
    }

    [Fact]
    public void ToggleFocusedMode_Toggles()
    {
        var vm = CreateViewModel();
        Assert.False(vm.IsFocusedMode);

        vm.ToggleFocusedModeCommand.Execute(null);
        Assert.True(vm.IsFocusedMode);

        vm.ToggleFocusedModeCommand.Execute(null);
        Assert.False(vm.IsFocusedMode);
    }

    [Fact]
    public void GridSize_ParseRoundTrips()
    {
        var original = new GridSize(3, 2);
        var parsed = GridSize.Parse(original.ToString());
        Assert.Equal(original, parsed);
    }

    [Fact]
    public void GridSize_ParseInvalid_ReturnsDefault()
    {
        var result = GridSize.Parse("invalid");
        Assert.Equal(GridSize.Default, result);
    }

    // ═══ SessionState Null-Safety Tests ═══

    [Fact]
    public void SessionState_NullGitHubTaskUrl_HasGitHubUrlIsFalse()
    {
        var session = new SessionState
        {
            Id = "null-url",
            WorkingDirectory = @"C:\test",
            StartedAt = DateTime.UtcNow
        };

        Assert.Null(session.GitHubTaskUrl);
        Assert.False(session.HasGitHubUrl);
        Assert.Null(session.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_EmptyGitHubTaskUrl_HasGitHubUrlIsFalse()
    {
        var session = new SessionState
        {
            Id = "empty-url",
            WorkingDirectory = @"C:\test",
            StartedAt = DateTime.UtcNow,
            GitHubTaskUrl = ""
        };

        Assert.False(session.HasGitHubUrl);
        Assert.Null(session.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_ValidGitHubTaskUrl_HasGitHubUrlIsTrue()
    {
        var session = new SessionState
        {
            Id = "valid-url",
            WorkingDirectory = @"C:\test",
            StartedAt = DateTime.UtcNow,
            GitHubTaskUrl = "https://github.com/org/repo/issues/1"
        };

        Assert.True(session.HasGitHubUrl);
        Assert.NotNull(session.GitHubTaskUri);
        Assert.Contains("issues/1", session.GitHubTaskUri!.ToString());
    }

    [Fact]
    public void SessionState_SetGitHubTaskUrl_UpdatesComputedProperties()
    {
        var session = new SessionState
        {
            Id = "update-url",
            WorkingDirectory = @"C:\test",
            StartedAt = DateTime.UtcNow
        };

        Assert.False(session.HasGitHubUrl);
        Assert.Null(session.GitHubTaskUri);

        session.GitHubTaskUrl = "https://github.com/org/repo/pull/42";

        Assert.True(session.HasGitHubUrl);
        Assert.NotNull(session.GitHubTaskUri);

        session.GitHubTaskUrl = null;

        Assert.False(session.HasGitHubUrl);
        Assert.Null(session.GitHubTaskUri);
    }

    [Fact]
    public void SessionState_NullableProperties_HaveSafeDefaults()
    {
        var session = new SessionState { Id = "defaults" };

        // All nullable properties should be null/safe by default
        Assert.Null(session.RepositoryName);
        Assert.Null(session.GitHubTaskUrl);
        Assert.Null(session.Squad);
        Assert.False(session.HasGitHubUrl);
        Assert.Null(session.GitHubTaskUri);
        Assert.Equal(string.Empty, session.CommandLineArgs);
        Assert.Equal(string.Empty, session.WorkingDirectory);
        Assert.NotNull(session.OutputLines);
    }

    [Fact]
    public async Task CloseSessionCommand_StopsSession()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        mockSessionManager.Setup(m => m.StopSessionAsync(It.IsAny<string>()))
            .Returns(Task.CompletedTask);

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var mockTelemetry = new Mock<ITelemetryService>();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            mockTelemetry.Object,
            new InMemorySink(),
            new Mock<ILogger<DashboardViewModel>>().Object);

        var session = new SessionState
        {
            Id = "close-me",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };

        await vm.CloseSessionCommand.ExecuteAsync(session);
        mockSessionManager.Verify(m => m.StopSessionAsync("close-me"), Times.Once);
    }

    [Fact]
    public void IsPinned_CanBeSetOnSession()
    {
        var session = new SessionState
        {
            Id = "pin-test",
            WorkingDirectory = @"C:\test",
            StartedAt = DateTime.UtcNow
        };

        Assert.False(session.IsPinned);
        session.IsPinned = true;
        Assert.True(session.IsPinned);
    }

    [Fact]
    public async Task LayoutPreferences_SavedOnToggle()
    {
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings());
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var vm = CreateViewModel(dataService: mockDataService);

        vm.IsGridView = true;

        // Allow async save to complete
        await Task.Delay(100);

        mockDataService.Verify(d => d.SaveSettingsAsync(It.Is<AppSettings>(s =>
            s.LayoutMode == "Grid")), Times.AtLeastOnce);
    }

    // ═══ Phase B Tests ═══

    [Fact]
    public void HasNoSessions_TrueWhenEmpty()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);
        Assert.True(vm.HasNoSessions);
    }

    [Fact]
    public void HasNoSessions_FalseWhenSessionsExist()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        sessions.Add(new SessionState
        {
            Id = "s1",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.False(vm.HasNoSessions);
    }

    [Fact]
    public void ScanStatusText_ShowsSessionCount()
    {
        var sessions = new ObservableCollection<SessionState>();
        var vm = CreateViewModel(sessions);

        Assert.Equal("Scanning...", vm.ScanStatusText);

        sessions.Add(new SessionState
        {
            Id = "s1",
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal("1 session active", vm.ScanStatusText);

        sessions.Add(new SessionState
        {
            Id = "s2",
            WorkingDirectory = @"C:\test2",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal("2 sessions active", vm.ScanStatusText);
    }

    [Fact]
    public void IsCardsView_DefaultIsTrue()
    {
        var vm = CreateViewModel();
        Assert.True(vm.IsCardsView);
    }

    [Fact]
    public void CardsMode_SetsCorrectLayoutMode()
    {
        var vm = CreateViewModel();
        // Default is Cards
        Assert.Equal(LayoutMode.Cards, vm.CurrentLayoutMode);

        // Switch to Grid then back to Cards
        vm.IsGridView = true;
        Assert.Equal(LayoutMode.Grid, vm.CurrentLayoutMode);

        vm.IsCardsView = true;
        Assert.Equal(LayoutMode.Cards, vm.CurrentLayoutMode);
        Assert.False(vm.IsGridSizeSelectorVisible);
    }

    [Fact]
    public void LayoutModeEnum_HasCardsValue()
    {
        Assert.True(Enum.IsDefined(typeof(LayoutMode), LayoutMode.Cards));
    }
}