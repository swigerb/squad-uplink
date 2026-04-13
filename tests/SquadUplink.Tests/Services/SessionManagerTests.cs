using Moq;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class SessionManagerTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    private static SessionManager CreateManager(
        Mock<IProcessScanner>? scanner = null,
        Mock<IProcessLauncher>? launcher = null,
        Mock<ISquadDetector>? detector = null,
        Mock<IDataService>? dataService = null,
        Mock<INotificationService>? notificationService = null,
        int scanIntervalSeconds = 5)
    {
        return new SessionManager(
            (scanner ?? new Mock<IProcessScanner>()).Object,
            (launcher ?? new Mock<IProcessLauncher>()).Object,
            (detector ?? new Mock<ISquadDetector>()).Object,
            (dataService ?? new Mock<IDataService>()).Object,
            (notificationService ?? new Mock<INotificationService>()).Object,
            TestLogger,
            scanIntervalSeconds);
    }

    [Fact]
    public void Manager_CanBeConstructed()
    {
        var manager = CreateManager();
        Assert.NotNull(manager);
        Assert.Empty(manager.Sessions);
    }

    [Fact]
    public async Task LaunchSessionAsync_AddsToSessions()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "test-session",
                ProcessId = 12345,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Returns(Task.CompletedTask);

        var manager = CreateManager(launcher: mockLauncher, dataService: mockDataService);
        var session = await manager.LaunchSessionAsync(@"C:\test");

        Assert.Single(manager.Sessions);
        Assert.Equal("test-session", session.Id);
    }

    [Fact]
    public async Task StopSessionAsync_UpdatesStatus()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "stop-test",
                ProcessId = -1,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Running,
                StartedAt = DateTime.UtcNow
            });

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Returns(Task.CompletedTask);
        mockDataService.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings());

        var manager = CreateManager(launcher: mockLauncher, dataService: mockDataService);
        await manager.LaunchSessionAsync(@"C:\test");

        await manager.StopSessionAsync("stop-test");
        var session = manager.Sessions.First(s => s.Id == "stop-test");
        Assert.True(session.Status is SessionStatus.Completed or SessionStatus.Error);
    }

    [Fact]
    public async Task ScanCycle_DiscoversNewSessions()
    {
        var scanResult = new List<SessionState>
        {
            new() { Id = "scan-100", ProcessId = 100, WorkingDirectory = @"C:\proj",
                     Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var mockNotifications = new Mock<INotificationService>();
        mockNotifications.Setup(n => n.ShowSessionDiscoveredAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.CompletedTask);

        var manager = CreateManager(scanner: mockScanner, notificationService: mockNotifications, scanIntervalSeconds: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        try { await manager.StartScanningAsync(cts.Token); } catch (OperationCanceledException) { }

        Assert.Single(manager.Sessions);
        Assert.Equal(100, manager.Sessions[0].ProcessId);
    }

    [Fact]
    public async Task ScanCycle_SkipsDuplicatesByPID()
    {
        var scanResult = new List<SessionState>
        {
            new() { Id = "scan-200", ProcessId = 200, WorkingDirectory = @"C:\proj",
                     Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow },
            new() { Id = "scan-200-dup", ProcessId = 200, WorkingDirectory = @"C:\proj",
                     Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var manager = CreateManager(scanner: mockScanner, scanIntervalSeconds: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        try { await manager.StartScanningAsync(cts.Token); } catch (OperationCanceledException) { }

        Assert.Single(manager.Sessions);
    }

    [Fact]
    public async Task ScanCycle_DetectsSquadInfo()
    {
        var scanResult = new List<SessionState>
        {
            new() { Id = "scan-300", ProcessId = 300, WorkingDirectory = @"C:\squad-proj",
                     Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var mockDetector = new Mock<ISquadDetector>();
        mockDetector.Setup(d => d.DetectAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SquadInfo { TeamName = "Alpha Squad" });

        var manager = CreateManager(scanner: mockScanner, detector: mockDetector, scanIntervalSeconds: 1);
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));

        try { await manager.StartScanningAsync(cts.Token); } catch (OperationCanceledException) { }

        Assert.Single(manager.Sessions);
        Assert.Equal("Alpha Squad", manager.Sessions[0].Squad?.TeamName);
    }

    [Fact]
    public async Task LaunchSessionAsync_SavesHistory()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "hist-1",
                ProcessId = 999,
                WorkingDirectory = @"C:\repo",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var mockDataService = new Mock<IDataService>();
        SessionHistoryEntry? savedEntry = null;
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Callback<SessionHistoryEntry>(e => savedEntry = e)
            .Returns(Task.CompletedTask);

        var manager = CreateManager(launcher: mockLauncher, dataService: mockDataService);
        await manager.LaunchSessionAsync(@"C:\repo");

        Assert.NotNull(savedEntry);
        Assert.Equal("hist-1", savedEntry!.SessionId);
        Assert.Equal(@"C:\repo", savedEntry.WorkingDirectory);
        Assert.Equal(999, savedEntry.ProcessId);
    }

    [Fact]
    public async Task StopSessionAsync_HandlesUnknownSession()
    {
        var manager = CreateManager();
        await manager.StopSessionAsync("nonexistent-id");
        Assert.Empty(manager.Sessions);
    }

    [Fact]
    public async Task StopSessionAsync_SavesHistoryWithDuration()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "stop-hist",
                ProcessId = -1,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Running,
                StartedAt = DateTime.UtcNow
            });

        var savedEntries = new List<SessionHistoryEntry>();
        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Callback<SessionHistoryEntry>(e => savedEntries.Add(e))
            .Returns(Task.CompletedTask);
        mockDataService.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings());

        var manager = CreateManager(launcher: mockLauncher, dataService: mockDataService);
        await manager.LaunchSessionAsync(@"C:\test");
        await manager.StopSessionAsync("stop-hist");

        // Should have saved twice: once on launch, once on stop
        Assert.Equal(2, savedEntries.Count);
        Assert.NotNull(savedEntries[1].EndedAt);
        Assert.NotNull(savedEntries[1].DurationSeconds);
    }

    [Fact]
    public async Task LaunchSessionAsync_HandlesSquadDetectionFailure()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "squad-fail",
                ProcessId = 555,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var mockDetector = new Mock<ISquadDetector>();
        mockDetector.Setup(d => d.DetectAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("disk error"));

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Returns(Task.CompletedTask);

        var manager = CreateManager(launcher: mockLauncher, detector: mockDetector, dataService: mockDataService);
        var session = await manager.LaunchSessionAsync(@"C:\test");

        Assert.NotNull(session);
        Assert.Null(session.Squad);
        Assert.Single(manager.Sessions);
    }

    [Fact]
    public async Task LaunchSessionAsync_MergesWithDiscoveredByPID()
    {
        var mockLauncher = new Mock<IProcessLauncher>();
        mockLauncher.Setup(l => l.LaunchAsync(It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SessionState
            {
                Id = "launched-1",
                ProcessId = 400,
                WorkingDirectory = @"C:\test",
                Status = SessionStatus.Launching,
                StartedAt = DateTime.UtcNow
            });

        var mockDataService = new Mock<IDataService>();
        mockDataService.Setup(d => d.SaveSessionHistoryAsync(It.IsAny<SessionHistoryEntry>()))
            .Returns(Task.CompletedTask);

        var scanResult = new List<SessionState>
        {
            new() { Id = "scan-400", ProcessId = 400, WorkingDirectory = @"C:\test",
                     Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var manager = CreateManager(scanner: mockScanner, launcher: mockLauncher, dataService: mockDataService);

        await manager.LaunchSessionAsync(@"C:\test");
        Assert.Single(manager.Sessions);

        await manager.ScanAndMergeAsync(CancellationToken.None);

        Assert.Single(manager.Sessions);
        Assert.Equal("launched-1", manager.Sessions[0].Id);
    }

    [Fact]
    public async Task ScanCycle_SendsDiscoveryNotification()
    {
        var scanResult = new List<SessionState>
        {
            new() { Id = "notify-1", ProcessId = 500, WorkingDirectory = @"C:\proj",
                     RepositoryName = "my-repo", Status = SessionStatus.Discovered, StartedAt = DateTime.UtcNow }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var mockNotifications = new Mock<INotificationService>();
        string? notifiedRepo = null;
        mockNotifications.Setup(n => n.ShowSessionDiscoveredAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Callback<string, string>((repo, _) => notifiedRepo = repo)
            .Returns(Task.CompletedTask);

        var manager = CreateManager(scanner: mockScanner, notificationService: mockNotifications);
        await manager.ScanAndMergeAsync(CancellationToken.None);

        Assert.Equal("my-repo", notifiedRepo);
    }
}