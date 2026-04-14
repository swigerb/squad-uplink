using Microsoft.Extensions.DependencyInjection;
using SquadUplink.Contracts;
using SquadUplink.Helpers;
using SquadUplink.Services;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.SmokeTests;

/// <summary>
/// Tests that the DI container can build and resolve all registered services.
/// A failure here means the app would crash on startup when ConfigureServices() runs.
/// </summary>
public class DependencyInjectionTests
{
    [Fact]
    public void ServiceProvider_CanBuildWithoutErrors()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();

        var provider = services.BuildServiceProvider();
        Assert.NotNull(provider);
    }

    [Theory]
    [InlineData(typeof(IProcessScanner))]
    [InlineData(typeof(IProcessLauncher))]
    [InlineData(typeof(IOutputCapture))]
    [InlineData(typeof(ISquadDetector))]
    [InlineData(typeof(IThemeService))]
    [InlineData(typeof(IAudioService))]
    [InlineData(typeof(IDataService))]
    [InlineData(typeof(INotificationService))]
    [InlineData(typeof(ISessionManager))]
    public void ServiceProvider_CanResolveService(Type serviceType)
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        var provider = services.BuildServiceProvider();

        var service = provider.GetService(serviceType);
        Assert.NotNull(service);
    }

    [Theory]
    [InlineData(typeof(DashboardViewModel))]
    [InlineData(typeof(SessionViewModel))]
    [InlineData(typeof(SettingsViewModel))]
    [InlineData(typeof(DiagnosticsViewModel))]
    public void ServiceProvider_CanResolveViewModel(Type vmType)
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        var provider = services.BuildServiceProvider();

        var vm = provider.GetService(vmType);
        Assert.NotNull(vm);
    }

    [Fact]
    public void ServiceProvider_SingletonServicesReturnSameInstance()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        var provider = services.BuildServiceProvider();

        var scanner1 = provider.GetService<IProcessScanner>();
        var scanner2 = provider.GetService<IProcessScanner>();
        Assert.Same(scanner1, scanner2);
    }

    [Fact]
    public void ServiceProvider_TransientViewModelsReturnNewInstances()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        var provider = services.BuildServiceProvider();

        var vm1 = provider.GetService<DashboardViewModel>();
        var vm2 = provider.GetService<DashboardViewModel>();
        Assert.NotSame(vm1, vm2);
    }

    [Fact]
    public void AllRegisteredServices_ImplementTheirInterfaces()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        var provider = services.BuildServiceProvider();

        Assert.IsAssignableFrom<IProcessScanner>(provider.GetRequiredService<IProcessScanner>());
        Assert.IsAssignableFrom<IProcessLauncher>(provider.GetRequiredService<IProcessLauncher>());
        Assert.IsAssignableFrom<IOutputCapture>(provider.GetRequiredService<IOutputCapture>());
        Assert.IsAssignableFrom<ISessionManager>(provider.GetRequiredService<ISessionManager>());
        Assert.IsAssignableFrom<ISquadDetector>(provider.GetRequiredService<ISquadDetector>());
        Assert.IsAssignableFrom<IThemeService>(provider.GetRequiredService<IThemeService>());
        Assert.IsAssignableFrom<IAudioService>(provider.GetRequiredService<IAudioService>());
        Assert.IsAssignableFrom<IDataService>(provider.GetRequiredService<IDataService>());
        Assert.IsAssignableFrom<INotificationService>(provider.GetRequiredService<INotificationService>());
    }
}
