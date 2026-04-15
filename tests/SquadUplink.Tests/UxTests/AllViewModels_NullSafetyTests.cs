using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Serilog.Events;
using Serilog.Parsing;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 2: ViewModel null-safety tests — verifies that every ViewModel
/// can be constructed and operated with minimal/null data without crashing.
/// </summary>
public class AllViewModels_NullSafetyTests
{
    // ── DashboardViewModel ─────────────────────────────────────

    [Fact]
    public void DashboardViewModel_EmptySessionList_DoesNotCrash()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var mockTelemetry = MockHelpers.CreateTelemetryMock();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            mockTelemetry.Object,
            new InMemorySink(),
            new Mock<ILogger<DashboardViewModel>>().Object);

        Assert.NotNull(vm);
        Assert.Equal("0 sessions", vm.SessionCount);
        Assert.Equal(0, vm.ActiveSessionCount);
        Assert.True(vm.HasNoSessions);
        Assert.Empty(vm.SquadTreeItems);
        Assert.Empty(vm.Squads);
    }

    [Fact]
    public void DashboardViewModel_SessionWithMinimalData_DoesNotCrash()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var mockTelemetry = MockHelpers.CreateTelemetryMock();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            mockTelemetry.Object,
            new InMemorySink(),
            new Mock<ILogger<DashboardViewModel>>().Object);

        // Minimal session— no repo name, no URL, no squad
        sessions.Add(new SessionState
        {
            Id = "minimal",
            WorkingDirectory = @"C:\temp",
            Status = SessionStatus.Discovered
        });

        Assert.False(vm.HasNoSessions);
        Assert.Equal("1 session", vm.SessionCount);
    }

    [Fact]
    public void DashboardViewModel_MixedSessionStates_DoesNotCrash()
    {
        var sessions = new ObservableCollection<SessionState>();
        var mockSessionManager = new Mock<ISessionManager>();
        mockSessionManager.Setup(m => m.Sessions).Returns(sessions);
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());

        var mockTelemetry = MockHelpers.CreateTelemetryMock();
        mockTelemetry.Setup(t => t.GetCurrentMetrics()).Returns(new TokenMetrics());
        mockTelemetry.Setup(t => t.GetAgentBreakdown()).Returns(new List<AgentTokenSummary>().AsReadOnly());

        var vm = new DashboardViewModel(
            mockSessionManager.Object,
            mockDataService.Object,
            new Mock<ISquadDetector>().Object,
            mockTelemetry.Object,
            new InMemorySink(),
            new Mock<ILogger<DashboardViewModel>>().Object);

        // All status typesat once
        foreach (var status in Enum.GetValues<SessionStatus>())
        {
            sessions.Add(new SessionState
            {
                Id = $"s-{status}",
                WorkingDirectory = @"C:\test",
                Status = status,
                StartedAt = DateTime.UtcNow
            });
        }

        Assert.Equal(6, sessions.Count); // All 6 status values
        Assert.False(vm.HasNoSessions);
    }

    // ── SessionViewModel ───────────────────────────────────────

    [Fact]
    public void SessionViewModel_NullGitHubUrl_DoesNotCrash()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        vm.LoadSession(new SessionState
        {
            Id = "null-url",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow,
            GitHubTaskUrl = null
        });

        Assert.False(vm.HasGitHubUrl);
        Assert.Null(vm.GitHubUri);
        Assert.Equal("Unknown", vm.RepositoryName);
    }

    [Fact]
    public void SessionViewModel_NullSquad_DoesNotCrash()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        vm.LoadSession(new SessionState
        {
            Id = "null-squad",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Idle,
            StartedAt = DateTime.UtcNow,
            Squad = null
        });

        Assert.Equal("—", vm.SquadName);
    }

    [Fact]
    public void SessionViewModel_EmptyOutputLines_DoesNotCrash()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        vm.LoadSession(new SessionState
        {
            Id = "empty-output",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Empty(vm.OutputLines);
        Assert.Equal(0, vm.OutputLineCount);
        Assert.Equal("Awaiting first event", vm.LastActivityText);
    }

    [Fact]
    public void SessionViewModel_WithOutputLines_ShowsActive()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        var session = new SessionState
        {
            Id = "active-output",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        };
        session.OutputLines.Add("line 1");

        vm.LoadSession(session);

        Assert.Equal("Active", vm.LastActivityText);
        Assert.Equal(1, vm.OutputLineCount);
    }

    [Fact]
    public void SessionViewModel_ErrorStatus_ShowsErrorSummary()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        vm.LoadSession(new SessionState
        {
            Id = "error-session",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Error,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal("1 error", vm.ErrorLogSummary);
    }

    [Fact]
    public void SessionViewModel_NonErrorStatus_ShowsZeroErrors()
    {
        var vm = new SessionViewModel(
            new Mock<ISessionManager>().Object,
            new Mock<ILogger<SessionViewModel>>().Object);

        vm.LoadSession(new SessionState
        {
            Id = "ok-session",
            ProcessId = 1,
            WorkingDirectory = @"C:\test",
            Status = SessionStatus.Running,
            StartedAt = DateTime.UtcNow
        });

        Assert.Equal("0 errors", vm.ErrorLogSummary);
    }

    // ── SettingsViewModel ──────────────────────────────────────

    [Fact]
    public void SettingsViewModel_DefaultSettings_DoesNotCrash()
    {
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes).Returns(new[] { "FluentDark" });
        themeMock.Setup(t => t.CurrentThemeId).Returns("FluentDark");

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync()).ReturnsAsync(new AppSettings());
        dataMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>())).Returns(Task.CompletedTask);

        var vm = new SettingsViewModel(
            themeMock.Object, dataMock.Object,
            new Mock<ILogger<SettingsViewModel>>().Object);

        Assert.NotNull(vm);
        Assert.NotEmpty(vm.VersionText);
        Assert.Equal(string.Empty, vm.UpdateStatusText);
        Assert.False(vm.IsCheckingForUpdates);
    }

    [Fact]
    public async Task SettingsViewModel_LoadsWithoutCrash()
    {
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes).Returns(new[] { "FluentDark", "FluentLight" });
        themeMock.Setup(t => t.CurrentThemeId).Returns("FluentDark");

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync()).ReturnsAsync(new AppSettings());
        dataMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>())).Returns(Task.CompletedTask);

        var vm = new SettingsViewModel(
            themeMock.Object, dataMock.Object,
            new Mock<ILogger<SettingsViewModel>>().Object);

        await vm.LoadSettingsAsync();

        Assert.True(vm.ScanIntervalSeconds > 0);
        Assert.True(vm.AudioEnabled);
    }

    // ── DiagnosticsViewModel ───────────────────────────────────

    [Fact]
    public void DiagnosticsViewModel_EmptyLogSink_DoesNotCrash()
    {
        var sink = new InMemorySink();
        var formatter = new LogPayloadFormatter();
        var logger = NullLogger<DiagnosticsViewModel>.Instance;

        var vm = new DiagnosticsViewModel(sink, formatter, logger);

        Assert.NotNull(vm);
        Assert.Empty(vm.FilteredEntries);
        Assert.Empty(vm.AvailableSources);
        Assert.Equal(0, vm.EntryCount);
        Assert.Equal(0, vm.TotalCount);
    }

    [Fact]
    public void DiagnosticsViewModel_DisposeThenEmit_DoesNotCrash()
    {
        var sink = new InMemorySink();
        var vm = new DiagnosticsViewModel(
            sink, new LogPayloadFormatter(),
            NullLogger<DiagnosticsViewModel>.Instance);

        vm.Dispose();

        // Emitting after dispose should not crash
        var parser = new MessageTemplateParser();
        sink.Emit(new LogEvent(
            DateTimeOffset.UtcNow,
            LogEventLevel.Information,
            null,
            parser.Parse("post-dispose"),
            []));

        Assert.Empty(vm.FilteredEntries);
    }
}
