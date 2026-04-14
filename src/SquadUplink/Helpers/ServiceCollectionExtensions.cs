using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
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

        // Diagnostics logging core
        services.AddSingleton(Program.DiagnosticsSink);
        services.AddSingleton<ILogPayloadFormatter, LogPayloadFormatter>();

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
        services.AddSingleton<ITrayIconService, TrayIconService>();
        services.AddSingleton<ITelemetryService, TelemetryService>();
        services.AddSingleton<SquadFileWatcher>();
        services.AddSingleton<OtlpListener>();

        // ViewModels
        services.AddTransient<DashboardViewModel>();
        services.AddTransient<SessionViewModel>();
        services.AddTransient<SettingsViewModel>();
        services.AddTransient<DiagnosticsViewModel>();

        return services;
    }
}