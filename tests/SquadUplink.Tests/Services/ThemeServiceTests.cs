using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class ThemeServiceTests
{
    private readonly Mock<IDataService> _dataServiceMock;
    private readonly ThemeService _service;

    public ThemeServiceTests()
    {
        _dataServiceMock = new Mock<IDataService>();
        _dataServiceMock.Setup(d => d.GetSettingsAsync()).ReturnsAsync(new AppSettings());
        _dataServiceMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>())).Returns(Task.CompletedTask);

        _service = new ThemeService(_dataServiceMock.Object, NullLogger<ThemeService>.Instance);
    }

    [Fact]
    public void AvailableThemes_ContainsAllExpected()
    {
        var themes = _service.AvailableThemes;
        Assert.Contains("FluentLight", themes);
        Assert.Contains("FluentDark", themes);
        Assert.Contains("AppleIIe", themes);
        Assert.Contains("C64", themes);
        Assert.Contains("PipBoy", themes);
        Assert.Equal(5, themes.Count);
    }

    [Theory]
    [InlineData("FluentLight")]
    [InlineData("FluentDark")]
    [InlineData("AppleIIe")]
    [InlineData("C64")]
    [InlineData("PipBoy")]
    public void ApplyTheme_AllThemeNames_AreValid(string themeId)
    {
        _service.ApplyTheme(themeId);
        Assert.Equal(themeId, _service.CurrentThemeId);
    }

    [Fact]
    public void ApplyTheme_InvalidTheme_DoesNotChangeCurrentTheme()
    {
        var original = _service.CurrentThemeId;
        _service.ApplyTheme("NonExistent");
        Assert.Equal(original, _service.CurrentThemeId);
    }

    [Fact]
    public void ApplyTheme_FiresThemeChangedEvent()
    {
        string? firedWith = null;
        _service.ThemeChanged += id => firedWith = id;

        _service.ApplyTheme("C64");
        Assert.Equal("C64", firedWith);
    }

    [Fact]
    public void ApplyTheme_InvalidTheme_DoesNotFireEvent()
    {
        bool fired = false;
        _service.ThemeChanged += _ => fired = true;

        _service.ApplyTheme("NonExistent");
        Assert.False(fired);
    }

    [Fact]
    public void ApplyTheme_SwitchesBetweenThemesWithoutCrashing()
    {
        _service.ApplyTheme("AppleIIe");
        Assert.Equal("AppleIIe", _service.CurrentThemeId);

        _service.ApplyTheme("C64");
        Assert.Equal("C64", _service.CurrentThemeId);

        _service.ApplyTheme("PipBoy");
        Assert.Equal("PipBoy", _service.CurrentThemeId);

        _service.ApplyTheme("FluentDark");
        Assert.Equal("FluentDark", _service.CurrentThemeId);

        _service.ApplyTheme("FluentLight");
        Assert.Equal("FluentLight", _service.CurrentThemeId);
    }

    [Fact]
    public async Task LoadSavedThemeAsync_AppliesSavedTheme()
    {
        _dataServiceMock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings { ThemeId = "PipBoy" });

        await _service.LoadSavedThemeAsync();
        Assert.Equal("PipBoy", _service.CurrentThemeId);
    }

    [Fact]
    public async Task LoadSavedThemeAsync_InvalidSavedTheme_KeepsDefault()
    {
        _dataServiceMock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(new AppSettings { ThemeId = "Bogus" });

        await _service.LoadSavedThemeAsync();
        Assert.Equal("FluentDark", _service.CurrentThemeId);
    }

    [Fact]
    public async Task LoadSavedThemeAsync_DataServiceThrows_KeepsDefault()
    {
        _dataServiceMock.Setup(d => d.GetSettingsAsync())
            .ThrowsAsync(new InvalidOperationException("DB not ready"));

        await _service.LoadSavedThemeAsync();
        Assert.Equal("FluentDark", _service.CurrentThemeId);
    }

    [Fact]
    public async Task ApplyTheme_PersistsThemeChoice()
    {
        _service.ApplyTheme("C64");

        // Give the fire-and-forget persist task time to complete
        await Task.Delay(200);

        _dataServiceMock.Verify(
            d => d.SaveSettingsAsync(It.Is<AppSettings>(s => s.ThemeId == "C64")),
            Times.AtLeastOnce);
    }

    [Fact]
    public async Task ThemePersistence_RoundTrip_ThroughDataService()
    {
        // Simulate a real round-trip: apply → persist → reload
        var savedSettings = new AppSettings();

        _dataServiceMock.Setup(d => d.SaveSettingsAsync(It.IsAny<AppSettings>()))
            .Callback<AppSettings>(s => savedSettings = s)
            .Returns(Task.CompletedTask);

        _dataServiceMock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(() => savedSettings);

        _service.ApplyTheme("AppleIIe");
        await Task.Delay(200); // Let fire-and-forget persist complete

        // Create a new service instance and load saved theme
        var service2 = new ThemeService(_dataServiceMock.Object, NullLogger<ThemeService>.Instance);
        await service2.LoadSavedThemeAsync();

        Assert.Equal("AppleIIe", service2.CurrentThemeId);
    }

    [Fact]
    public void DefaultTheme_IsFluentDark()
    {
        Assert.Equal("FluentDark", _service.CurrentThemeId);
    }
}
