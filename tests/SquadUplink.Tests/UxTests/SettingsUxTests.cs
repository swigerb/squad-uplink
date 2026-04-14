using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 1: Settings page UX logic tests — verifies theme switcher,
/// log level dropdown, scan interval, and notification preferences.
/// </summary>
public class SettingsUxTests
{
    private static readonly string[] AllThemes =
    [
        "FluentLight", "FluentDark", "AppleIIe", "C64", "PipBoy",
        "MatrixGreen", "SolarizedLight", "SolarizedDark", "Dracula",
        "NordAurora", "TokyoNight"
    ];

    private static (SettingsViewModel vm, Mock<IThemeService> theme, Mock<IDataService> data) CreateViewModel(
        string[]? themes = null,
        AppSettings? settings = null)
    {
        themes ??= AllThemes;
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes).Returns(themes);
        themeMock.Setup(t => t.CurrentThemeId).Returns("FluentDark");

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync()).ReturnsAsync(settings ?? new AppSettings());
        dataMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>())).Returns(Task.CompletedTask);

        var vm = new SettingsViewModel(
            themeMock.Object, dataMock.Object,
            new Mock<ILogger<SettingsViewModel>>().Object);

        return (vm, themeMock, dataMock);
    }

    // ── Theme switcher ─────────────────────────────────────────

    [Fact]
    public void ThemeSwitcher_ListsAllThemes()
    {
        var (vm, themeMock, _) = CreateViewModel();
        var themes = themeMock.Object.AvailableThemes;
        Assert.Equal(11, themes.Count);
    }

    [Fact]
    public void ThemeSwitcher_HasAllExpectedThemes()
    {
        var (_, themeMock, _) = CreateViewModel();
        var themes = themeMock.Object.AvailableThemes;

        Assert.Contains("FluentLight", themes);
        Assert.Contains("FluentDark", themes);
        Assert.Contains("AppleIIe", themes);
        Assert.Contains("C64", themes);
        Assert.Contains("PipBoy", themes);
        Assert.Contains("MatrixGreen", themes);
        Assert.Contains("SolarizedLight", themes);
        Assert.Contains("SolarizedDark", themes);
        Assert.Contains("Dracula", themes);
        Assert.Contains("NordAurora", themes);
        Assert.Contains("TokyoNight", themes);
    }

    [Fact]
    public async Task ThemeChange_UpdatesService()
    {
        var (vm, themeMock, _) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.SelectedThemeIndex = 2; // AppleIIe
        await Task.Delay(50);

        themeMock.Verify(t => t.ApplyTheme("AppleIIe"), Times.Once);
    }

    [Fact]
    public async Task ThemeChange_PersistsToSettings()
    {
        var (vm, _, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.SelectedThemeIndex = 3; // C64
        await Task.Delay(50);

        dataMock.Verify(d => d.SaveSettingsAsync(
            It.Is<AppSettings>(s => s.ThemeId == "C64")), Times.AtLeastOnce);
    }

    // ── Log level dropdown ─────────────────────────────────────

    [Fact]
    public void LogLevel_DefaultsToInformation()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.Equal(2, vm.SelectedLogLevelIndex); // 0=Verbose, 1=Debug, 2=Information, 3=Warning
    }

    [Theory]
    [InlineData(0)] // Verbose
    [InlineData(1)] // Debug
    [InlineData(2)] // Information
    [InlineData(3)] // Warning
    public void LogLevel_AllLevelsAreSelectable(int levelIndex)
    {
        var (vm, _, _) = CreateViewModel();
        vm.SelectedLogLevelIndex = levelIndex;
        Assert.Equal(levelIndex, vm.SelectedLogLevelIndex);
    }

    // ── Scan interval ──────────────────────────────────────────

    [Fact]
    public void ScanInterval_DefaultIs5Seconds()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.Equal(5, vm.ScanIntervalSeconds);
    }

    [Fact]
    public async Task ScanInterval_CanBeChanged()
    {
        var (vm, _, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.ScanIntervalSeconds = 15;
        await Task.Delay(50);

        dataMock.Verify(d => d.SaveSettingsAsync(
            It.Is<AppSettings>(s => s.ScanIntervalSeconds == 15)), Times.AtLeastOnce);
    }

    [Fact]
    public void ScanInterval_AcceptsValidRange()
    {
        var (vm, _, _) = CreateViewModel();
        vm.ScanIntervalSeconds = 1;
        Assert.Equal(1, vm.ScanIntervalSeconds);

        vm.ScanIntervalSeconds = 60;
        Assert.Equal(60, vm.ScanIntervalSeconds);
    }

    // ── Audio settings ─────────────────────────────────────────

    [Fact]
    public void Audio_DefaultEnabled()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.True(vm.AudioEnabled);
    }

    [Fact]
    public void Volume_DefaultIs80()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.Equal(80, vm.Volume);
    }

    // ── Notification preferences ───────────────────────────────

    [Fact]
    public void Notifications_AllDefaultEnabled()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.True(vm.NotifySessionCompleted);
        Assert.True(vm.NotifyPermissionRequest);
        Assert.True(vm.NotifyError);
        Assert.True(vm.NotifySessionDiscovered);
    }

    [Fact]
    public async Task Notification_Change_PersistsToSettings()
    {
        var (vm, _, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.NotifySessionCompleted = false;
        await Task.Delay(50);

        dataMock.Verify(d => d.SaveSettingsAsync(
            It.Is<AppSettings>(s => s.NotifySessionCompleted == false)), Times.AtLeastOnce);
    }

    // ── Font size ──────────────────────────────────────────────

    [Fact]
    public void FontSize_DefaultIs13()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.Equal(13, vm.FontSize);
    }

    // ── CRT effects ────────────────────────────────────────────

    [Fact]
    public void CrtEffects_DefaultOff()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.False(vm.CrtEffectsEnabled);
    }

    // ── Auto scan ──────────────────────────────────────────────

    [Fact]
    public void AutoScan_DefaultEnabled()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.True(vm.AutoScanOnStartup);
    }

    // ── Update check ───────────────────────────────────────────

    [Fact]
    public void UpdateCheck_DefaultNotChecking()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.False(vm.IsCheckingForUpdates);
        Assert.Equal(string.Empty, vm.UpdateStatusText);
    }
}
