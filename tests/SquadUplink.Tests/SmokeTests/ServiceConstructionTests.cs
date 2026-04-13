using Moq;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.Services;
using SquadUplink.ViewModels;
using System.Collections.ObjectModel;
using Xunit;

namespace SquadUplink.Tests.SmokeTests;

/// <summary>
/// Tests that every concrete service and ViewModel can be instantiated without throwing.
/// Catches constructor-time failures like missing dependencies or TypeLoadException.
/// </summary>
public class ServiceConstructionTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    // --- Services ---

    [Fact]
    public void ProcessScanner_CanBeConstructed()
    {
        var scanner = new ProcessScanner();
        Assert.NotNull(scanner);
        Assert.IsAssignableFrom<IProcessScanner>(scanner);
    }

    [Fact]
    public void ProcessLauncher_CanBeConstructed()
    {
        var launcher = new ProcessLauncher();
        Assert.NotNull(launcher);
        Assert.IsAssignableFrom<IProcessLauncher>(launcher);
    }

    [Fact]
    public void OutputCapture_CanBeConstructed()
    {
        var capture = new OutputCapture();
        Assert.NotNull(capture);
        Assert.IsAssignableFrom<IOutputCapture>(capture);
    }

    [Fact]
    public void SquadDetector_CanBeConstructed()
    {
        var detector = new SquadDetector();
        Assert.NotNull(detector);
        Assert.IsAssignableFrom<ISquadDetector>(detector);
    }

    [Fact]
    public void ThemeService_CanBeConstructed()
    {
        var service = new ThemeService();
        Assert.NotNull(service);
        Assert.IsAssignableFrom<IThemeService>(service);
    }

    [Fact]
    public void AudioService_CanBeConstructed()
    {
        var service = new AudioService();
        Assert.NotNull(service);
        Assert.IsAssignableFrom<IAudioService>(service);
    }

    [Fact]
    public void DataService_CanBeConstructed()
    {
        var service = new DataService();
        Assert.NotNull(service);
        Assert.IsAssignableFrom<IDataService>(service);
    }

    [Fact]
    public void NotificationService_CanBeConstructed()
    {
        var mockData = new Mock<IDataService>();
        var service = new NotificationService(mockData.Object);
        Assert.NotNull(service);
        Assert.IsAssignableFrom<INotificationService>(service);
    }

    [Fact]
    public void SessionManager_CanBeConstructed()
    {
        var manager = new SessionManager(
            new Mock<IProcessScanner>().Object,
            new Mock<IProcessLauncher>().Object,
            new Mock<ISquadDetector>().Object,
            new Mock<IDataService>().Object,
            new Mock<INotificationService>().Object);
        Assert.NotNull(manager);
        Assert.IsAssignableFrom<ISessionManager>(manager);
    }

    // --- ViewModels ---

    [Fact]
    public void DashboardViewModel_CanBeConstructed()
    {
        var sessionManager = new Mock<ISessionManager>();
        sessionManager.Setup(m => m.Sessions).Returns(new ObservableCollection<SessionState>());

        var dataService = new Mock<IDataService>();
        dataService.Setup(d => d.GetRecentSessionsAsync(It.IsAny<int>()))
            .ReturnsAsync(new List<SessionHistoryEntry>().AsReadOnly());
        dataService.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings());

        var squadDetector = new Mock<ISquadDetector>();

        var vm = new DashboardViewModel(
            sessionManager.Object,
            dataService.Object,
            squadDetector.Object);
        Assert.NotNull(vm);
    }

    [Fact]
    public void SessionViewModel_CanBeConstructed()
    {
        var sessionManager = new Mock<ISessionManager>();
        var vm = new SessionViewModel(sessionManager.Object);
        Assert.NotNull(vm);
    }

    [Fact]
    public void SettingsViewModel_CanBeConstructed()
    {
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes)
            .Returns(new[] { "FluentLight", "FluentDark", "AppleIIe", "C64", "PipBoy" });

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings());

        var vm = new SettingsViewModel(themeMock.Object, dataMock.Object);
        Assert.NotNull(vm);
    }

    // --- Models ---

    [Fact]
    public void AllModels_CanBeDefaultConstructed()
    {
        Assert.NotNull(new SessionState());
        Assert.NotNull(new SquadInfo());
        Assert.NotNull(new SquadMember());
        Assert.NotNull(new SquadTreeItem());
        Assert.NotNull(new AppSettings());
        Assert.NotNull(new SessionHistoryEntry());
    }

    [Fact]
    public void LaunchOptions_CanBeConstructed()
    {
        var options = new LaunchOptions { WorkingDirectory = @"C:\test" };
        Assert.NotNull(options);
        Assert.Equal(@"C:\test", options.WorkingDirectory);
    }

    [Fact]
    public void GridSize_CanBeConstructed()
    {
        var size = new GridSize(3, 2);
        Assert.Equal(3, size.Rows);
        Assert.Equal(2, size.Columns);
    }
}
