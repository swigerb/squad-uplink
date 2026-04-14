using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class SettingsViewModelTests
{
    private static (SettingsViewModel vm, Mock<IThemeService> themeMock, Mock<IDataService> dataMock) CreateViewModel(
        AppSettings? settings = null)
    {
        var themeMock = new Mock<IThemeService>();
        themeMock.Setup(t => t.AvailableThemes).Returns(new[] { "FluentLight", "FluentDark", "AppleIIe", "C64", "PipBoy" });
        themeMock.Setup(t => t.CurrentThemeId).Returns("FluentDark");

        var dataMock = new Mock<IDataService>();
        dataMock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(settings ?? new AppSettings());
        dataMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>()))
            .Returns(Task.CompletedTask);

        var mockLogger = new Mock<ILogger<SettingsViewModel>>();
        var vm = new SettingsViewModel(themeMock.Object, dataMock.Object, mockLogger.Object);
        return (vm, themeMock, dataMock);
    }

    [Fact]
    public void ViewModel_CanBeConstructed()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.NotNull(vm);
        Assert.NotEmpty(vm.VersionText);
    }

    [Fact]
    public async Task LoadSettings_PopulatesFromDataService()
    {
        var settings = new AppSettings
        {
            ThemeId = "AppleIIe",
            ScanIntervalSeconds = 15,
            AudioEnabled = false,
            DefaultWorkingDirectory = @"C:\work",
            NotifySessionCompleted = false,
            NotifyError = true
        };

        var (vm, _, _) = CreateViewModel(settings);
        await vm.LoadSettingsAsync();

        Assert.Equal(2, vm.SelectedThemeIndex); // AppleIIe = index 2
        Assert.Equal(15, vm.ScanIntervalSeconds);
        Assert.False(vm.AudioEnabled);
        Assert.Equal(@"C:\work", vm.DefaultWorkingDirectory);
        Assert.False(vm.NotifySessionCompleted);
        Assert.True(vm.NotifyError);
    }

    [Fact]
    public async Task SaveSettings_PersistsChanges()
    {
        var (vm, _, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.AudioEnabled = false;
        // Give fire-and-forget a moment
        await Task.Delay(50);

        dataMock.Verify(d => d.SaveSettingsAsync(It.Is<AppSettings>(s => s.AudioEnabled == false)), Times.AtLeastOnce);
    }

    [Fact]
    public async Task ThemeChange_AppliesAndSaves()
    {
        var (vm, themeMock, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.SelectedThemeIndex = 3; // C64
        await Task.Delay(50);

        themeMock.Verify(t => t.ApplyTheme("C64"), Times.Once);
        dataMock.Verify(d => d.SaveSettingsAsync(It.Is<AppSettings>(s => s.ThemeId == "C64")), Times.AtLeastOnce);
    }

    [Fact]
    public async Task NotificationPreferences_SaveCorrectly()
    {
        var (vm, _, dataMock) = CreateViewModel();
        await vm.LoadSettingsAsync();

        vm.NotifySessionDiscovered = false;
        await Task.Delay(50);

        dataMock.Verify(d => d.SaveSettingsAsync(
            It.Is<AppSettings>(s => s.NotifySessionDiscovered == false)), Times.AtLeastOnce);
    }

    [Fact]
    public void UpdateStatusText_DefaultsToEmpty()
    {
        var (vm, _, _) = CreateViewModel();
        Assert.Equal(string.Empty, vm.UpdateStatusText);
        Assert.False(vm.IsCheckingForUpdates);
    }
}