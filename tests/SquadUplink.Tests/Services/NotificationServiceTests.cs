using Moq;
using SquadUplink.Contracts;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class NotificationServiceTests
{
    private static (NotificationService service, Mock<IDataService> dataMock) CreateService(AppSettings? settings = null)
    {
        var mock = new Mock<IDataService>();
        mock.Setup(d => d.GetSettingsAsync())
            .ReturnsAsync(settings ?? new AppSettings());
        var service = new NotificationService(mock.Object);
        return (service, mock);
    }

    [Fact]
    public async Task InitializeAsync_SetsInitialized()
    {
        var (service, _) = CreateService();
        await service.InitializeAsync();
        // Should not throw on subsequent calls
        await service.ShowSessionCompletedAsync("test-repo", TimeSpan.FromMinutes(5));
    }

    [Fact]
    public async Task ShowSessionCompleted_SkipsWhenNotInitialized()
    {
        var (service, dataMock) = CreateService();
        // Don't call InitializeAsync
        await service.ShowSessionCompletedAsync("test-repo", TimeSpan.FromMinutes(5));
        // Settings should never be queried when not initialized
        dataMock.Verify(d => d.GetSettingsAsync(), Times.Never);
    }

    [Fact]
    public async Task ShowSessionCompleted_SkipsWhenPreferenceDisabled()
    {
        var settings = new AppSettings { NotifySessionCompleted = false };
        var (service, dataMock) = CreateService(settings);
        await service.InitializeAsync();
        await service.ShowSessionCompletedAsync("test-repo", TimeSpan.FromMinutes(5));
        dataMock.Verify(d => d.GetSettingsAsync(), Times.Once);
    }

    [Fact]
    public async Task ShowPermissionRequest_RespectsPreference()
    {
        var settings = new AppSettings { NotifyPermissionRequest = false };
        var (service, _) = CreateService(settings);
        await service.InitializeAsync();
        // Should not throw; silently skips
        await service.ShowPermissionRequestAsync("test-repo", "sess-1");
    }

    [Fact]
    public async Task ShowError_RespectsPreference()
    {
        var settings = new AppSettings { NotifyError = true };
        var (service, dataMock) = CreateService(settings);
        await service.InitializeAsync();
        await service.ShowErrorAsync("test-repo", "something broke");
        dataMock.Verify(d => d.GetSettingsAsync(), Times.Once);
    }

    [Fact]
    public async Task ShowSessionDiscovered_RespectsPreference()
    {
        var settings = new AppSettings { NotifySessionDiscovered = false };
        var (service, dataMock) = CreateService(settings);
        await service.InitializeAsync();
        await service.ShowSessionDiscoveredAsync("test-repo", "sess-1");
        dataMock.Verify(d => d.GetSettingsAsync(), Times.Once);
    }

    [Fact]
    public async Task AllNotificationTypes_WorkWhenEnabled()
    {
        var settings = new AppSettings
        {
            NotifySessionCompleted = true,
            NotifyPermissionRequest = true,
            NotifyError = true,
            NotifySessionDiscovered = true
        };
        var (service, _) = CreateService(settings);
        await service.InitializeAsync();

        // All should succeed without throwing
        await service.ShowSessionCompletedAsync("repo", TimeSpan.FromHours(2));
        await service.ShowPermissionRequestAsync("repo", "sess-1");
        await service.ShowErrorAsync("repo", "error msg");
        await service.ShowSessionDiscoveredAsync("repo", "sess-2");
    }
}