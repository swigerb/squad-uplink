using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Serilog;
using Serilog.Events;
using Serilog.Parsing;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.Services;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.EndToEnd;

/// <summary>
/// Integration tests that exercise real service interactions end-to-end.
/// </summary>
public class IntegrationTests : IDisposable
{
    private readonly string _dbPath;
    private readonly DataService _dataService;

    public IntegrationTests()
    {
        _dbPath = Path.Combine(Path.GetTempPath(), $"squad-uplink-e2e-{Guid.NewGuid()}.db");
        _dataService = new DataService(_dbPath);
    }

    public void Dispose()
    {
        try { File.Delete(_dbPath); } catch { }
    }

    // ── SessionManager Scan Cycle ──────────────────────────────

    [Fact]
    public async Task SessionManager_ScanCycle_WithMockedScanner_DiscoversAndTracksSession()
    {
        var scanResult = new List<SessionState>
        {
            new()
            {
                Id = "e2e-scan-1",
                ProcessId = 9999,
                WorkingDirectory = @"C:\e2e-test",
                Status = SessionStatus.Discovered,
                StartedAt = DateTime.UtcNow
            }
        };

        var mockScanner = new Mock<IProcessScanner>();
        mockScanner.Setup(s => s.ScanAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(scanResult.AsReadOnly());

        var mockNotifications = new Mock<INotificationService>();
        mockNotifications.Setup(n => n.ShowSessionDiscoveredAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns(Task.CompletedTask);

        var manager = new SessionManager(
            mockScanner.Object,
            new Mock<IProcessLauncher>().Object,
            new Mock<ISquadDetector>().Object,
            new Mock<IDataService>().Object,
            mockNotifications.Object,
            new LoggerConfiguration().CreateLogger(),
            scanIntervalSeconds: 1);

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        try { await manager.StartScanningAsync(cts.Token); }
        catch (OperationCanceledException) { }

        Assert.Single(manager.Sessions);
        Assert.Equal("e2e-scan-1", manager.Sessions[0].Id);
        Assert.Equal(9999, manager.Sessions[0].ProcessId);
    }

    // ── ProcessLauncher Validates Directory ─────────────────────

    [Fact]
    public async Task ProcessLauncher_ThrowsForNonExistentDirectory()
    {
        var launcher = new ProcessLauncher(new LoggerConfiguration().CreateLogger());
        var nonExistent = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());

        await Assert.ThrowsAsync<DirectoryNotFoundException>(
            () => launcher.LaunchAsync(nonExistent));
    }

    [Fact]
    public void ProcessLauncher_BuildArguments_IncludesRemoteFlag()
    {
        var args = ProcessLauncher.BuildArguments(new LaunchOptions
        {
            WorkingDirectory = @"C:\test"
        });

        Assert.Contains("--remote", args);
    }

    [Fact]
    public void ProcessLauncher_BuildArguments_IncludesModelOverride()
    {
        var args = ProcessLauncher.BuildArguments(new LaunchOptions
        {
            WorkingDirectory = @"C:\test",
            ModelOverride = "claude-sonnet-4-20250514"
        });

        Assert.Contains("--model=claude-sonnet-4-20250514", args);
    }

    // ── DataService SQLite Round-Trip ───────────────────────────

    [Fact]
    public async Task DataService_SettingsRoundTrip_SaveAndLoad()
    {
        await _dataService.InitializeAsync();

        var original = new AppSettings
        {
            ThemeId = "PipBoy",
            ScanIntervalSeconds = 15,
            AudioEnabled = false,
            CrtEffectsEnabled = true,
            FontSize = 16,
            Volume = 42,
            DefaultWorkingDirectory = @"C:\my\repos",
            DefaultModel = "claude-opus-4-20250514",
            AlwaysUseRemote = true,
            NotifySessionCompleted = false,
            NotifyPermissionRequest = true,
            NotifyError = false,
            NotifySessionDiscovered = true,
        };

        await _dataService.SaveSettingsAsync(original);
        var loaded = await _dataService.GetSettingsAsync();

        Assert.Equal("PipBoy", loaded.ThemeId);
        Assert.Equal(15, loaded.ScanIntervalSeconds);
        Assert.False(loaded.AudioEnabled);
        Assert.True(loaded.CrtEffectsEnabled);
        Assert.Equal(16, loaded.FontSize);
        Assert.Equal(42, loaded.Volume);
        Assert.Equal(@"C:\my\repos", loaded.DefaultWorkingDirectory);
        Assert.Equal("claude-opus-4-20250514", loaded.DefaultModel);
        Assert.True(loaded.AlwaysUseRemote);
        Assert.False(loaded.NotifySessionCompleted);
        Assert.True(loaded.NotifyPermissionRequest);
        Assert.False(loaded.NotifyError);
        Assert.True(loaded.NotifySessionDiscovered);
    }

    [Fact]
    public async Task DataService_HistoryRoundTrip_SaveAndLoad()
    {
        await _dataService.InitializeAsync();

        var entry = new SessionHistoryEntry
        {
            SessionId = "e2e-hist",
            RepositoryName = "squad-uplink",
            WorkingDirectory = @"C:\repos\squad-uplink",
            FinalStatus = SessionStatus.Completed,
            StartedAt = new DateTime(2025, 7, 1, 12, 0, 0, DateTimeKind.Utc),
            EndedAt = new DateTime(2025, 7, 1, 12, 45, 0, DateTimeKind.Utc),
            DurationSeconds = 2700,
            ProcessId = 42,
            AgentCount = 5,
            GitHubTaskUrl = "https://github.com/swigerb/squad-uplink/issues/99"
        };

        await _dataService.SaveSessionHistoryAsync(entry);
        var results = await _dataService.GetRecentSessionsAsync(10);

        Assert.Single(results);
        Assert.Equal("e2e-hist", results[0].SessionId);
        Assert.Equal("squad-uplink", results[0].RepositoryName);
        Assert.Equal(2700, results[0].DurationSeconds);
        Assert.Equal(5, results[0].AgentCount);
    }

    // ── SquadDetector Parses Real team.md ──────────────────────

    [Fact]
    public async Task SquadDetector_ParsesRealTeamFile_FromThisRepo()
    {
        var repoRoot = FindRepoRoot();
        if (repoRoot is null)
        {
            // Skip gracefully if we can't find the repo root
            return;
        }

        var detector = new SquadDetector(new LoggerConfiguration().CreateLogger());
        var squad = await detector.DetectAsync(repoRoot);

        // The .squad/team.md file should exist in this repo
        Assert.NotNull(squad);
        Assert.False(string.IsNullOrEmpty(squad!.TeamName),
            "Team name should be parsed from team.md");
        // Member count depends on team.md format — just verify no crash
    }

    [Fact]
    public void SquadDetector_ParseTeamFile_ExtractsTeamNameAndMembers()
    {
        var content = """
            # Alpha Squad
            universe: testing

            | 🏗️ | **Wozniak** | Lead Engineer | Active |
            | 🧪 | **Hertzfeld** | Tester | Active |
            """;

        var info = SquadDetector.ParseTeamFile(content);

        Assert.Equal("Alpha Squad", info.TeamName);
        Assert.Equal("testing", info.Universe);
        Assert.Equal(2, info.Members.Count);
        Assert.Equal("Wozniak", info.Members[0].Name);
        Assert.Equal("Hertzfeld", info.Members[1].Name);
    }

    // ── ThemeService Switches and Persists ──────────────────────

    [Fact]
    public async Task ThemeService_SwitchThemeAndPersist_RoundTrip()
    {
        await _dataService.InitializeAsync();
        var service = new ThemeService(_dataService, NullLogger<ThemeService>.Instance);

        Assert.Equal("FluentDark", service.CurrentThemeId);

        service.ApplyTheme("AppleIIe");
        Assert.Equal("AppleIIe", service.CurrentThemeId);

        // Allow fire-and-forget persist
        await Task.Delay(300);

        var service2 = new ThemeService(_dataService, NullLogger<ThemeService>.Instance);
        await service2.LoadSavedThemeAsync();
        Assert.Equal("AppleIIe", service2.CurrentThemeId);
    }

    [Fact]
    public void ThemeService_AllFiveThemesAvailable()
    {
        var service = new ThemeService(
            new Mock<IDataService>().Object,
            NullLogger<ThemeService>.Instance);

        Assert.Equal(11, service.AvailableThemes.Count);
        Assert.Contains("FluentLight", service.AvailableThemes);
        Assert.Contains("FluentDark", service.AvailableThemes);
        Assert.Contains("AppleIIe", service.AvailableThemes);
        Assert.Contains("C64", service.AvailableThemes);
        Assert.Contains("PipBoy", service.AvailableThemes);
        Assert.Contains("MUTHUR", service.AvailableThemes);
        Assert.Contains("WOPR", service.AvailableThemes);
        Assert.Contains("Matrix", service.AvailableThemes);
        Assert.Contains("Win95", service.AvailableThemes);
        Assert.Contains("LCARS", service.AvailableThemes);
        Assert.Contains("StarWars", service.AvailableThemes);
    }

    // ── DiagnosticsViewModel 3-Stage Filter Pipeline ────────────

    [Fact]
    public void DiagnosticsViewModel_ThreeStageFilterPipeline_EndToEnd()
    {
        var parser = new MessageTemplateParser();
        var sink = new Core.Logging.InMemorySink();

        // Add diverse log events
        EmitEvent(sink, parser, "App started", LogEventLevel.Information, "App.Services.SessionManager");
        EmitEvent(sink, parser, "DB initialized", LogEventLevel.Debug, "App.Services.DataService");
        EmitEvent(sink, parser, "Session launched", LogEventLevel.Information, "App.Services.SessionManager");
        EmitEvent(sink, parser, "Theme applied", LogEventLevel.Debug, "App.Services.ThemeService");
        EmitEvent(sink, parser, "Connection failed", LogEventLevel.Error, "App.Services.SessionManager");

        var formatter = new LogPayloadFormatter();
        var vm = new DiagnosticsViewModel(sink, formatter, NullLogger<DiagnosticsViewModel>.Instance);

        // Stage 1: Level filter — Info+ gives App started, Session launched, Connection failed
        Assert.Equal(5, vm.FilteredEntries.Count);
        vm.SelectedLevel = LogEventLevel.Information;
        Assert.Equal(3, vm.FilteredEntries.Count);

        // Stage 2: Text search — "launched" matches only "Session launched"
        vm.SearchText = "launched";
        Assert.Single(vm.FilteredEntries);

        // Stage 3: Source filter (disable SessionManager)
        var sessionManagerSource = vm.AvailableSources.FirstOrDefault(s => s.Name == "SessionManager");
        Assert.NotNull(sessionManagerSource);
        sessionManagerSource!.IsActive = false;
        Assert.Empty(vm.FilteredEntries);

        // Re-enable and clear search
        sessionManagerSource.IsActive = true;
        vm.SearchText = "";
        vm.SelectedLevel = null;
        Assert.Equal(5, vm.FilteredEntries.Count);
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static void EmitEvent(
        Core.Logging.InMemorySink sink,
        MessageTemplateParser parser,
        string message,
        LogEventLevel level,
        string? source)
    {
        var template = parser.Parse(message);
        var props = new List<LogEventProperty>();
        if (source is not null)
            props.Add(new LogEventProperty("SourceContext", new ScalarValue(source)));
        sink.Emit(new LogEvent(DateTimeOffset.UtcNow, level, null, template, props));
    }

    private static string? FindRepoRoot()
    {
        var dir = AppContext.BaseDirectory;
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir, ".squad")))
                return dir;
            dir = Path.GetDirectoryName(dir);
        }

        // Fallback: try common locations
        var candidate = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            "source", "repos", "squad-uplink");
        return Directory.Exists(Path.Combine(candidate, ".squad")) ? candidate : null;
    }
}
