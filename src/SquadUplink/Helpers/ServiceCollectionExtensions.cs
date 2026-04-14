using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using SquadUplink.Contracts;
using SquadUplink.Services;
using SquadUplink.ViewModels;

namespace SquadUplink.Helpers;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddSquadUplinkServices(this IServiceCollection services)
    {
        // Logging — NullLoggerFactory for now; App.xaml.cs can override with a real provider
        services.AddSingleton<ILoggerFactory, NullLoggerFactory>();
        services.AddSingleton(typeof(ILogger<>), typeof(NullLogger<>));

        // Services
        services.AddSingleton<IProcessScanner, ProcessScanner>();
        services.AddSingleton<IProcessLauncher, ProcessLauncher>();
        services.AddSingleton<IOutputCapture, OutputCapture>();
        services.AddSingleton<ISquadDetector, SquadDetector>();
        services.AddSingleton<IThemeService, ThemeService>();
        services.AddSingleton<IAudioService, AudioService>();
        services.AddSingleton<IDataService, DataService>();
        services.AddSingleton<INotificationService, NotificationService>();
        services.AddSingleton<ISessionManager, SessionManager>();

        // ViewModels
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<SessionViewModel>();
        services.AddTransient<SettingsViewModel>();

        return services;
    }
}