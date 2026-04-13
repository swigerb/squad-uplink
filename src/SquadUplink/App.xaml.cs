using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Serilog;
using Serilog.Sinks.InMemory;
using SquadUplink.Helpers;
using Velopack;

namespace SquadUplink;

public partial class App : Application
{
    public static IServiceProvider Services { get; private set; } = null!;

    public App()
    {
        InitializeComponent();
        ConfigureLogging();
        Services = ConfigureServices();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        // Velopack update check (non-blocking)
        try
        {
            VelopackApp.Build().Run();
            Log.Information("Velopack bootstrap complete");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Velopack bootstrap failed — continuing launch");
        }

        // Initialize data service
        var dataService = Services.GetRequiredService<Contracts.IDataService>();
        await dataService.InitializeAsync();

        // Initialize notification service
        var notificationService = Services.GetRequiredService<Contracts.INotificationService>();
        await notificationService.InitializeAsync();

        MainWindow = new MainWindow();
        MainWindow.Activate();
    }

    public Window? MainWindow { get; private set; }

    private static void ConfigureLogging()
    {
        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink", "logs", "squad-uplink-.log");

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .WriteTo.Debug()
            .WriteTo.InMemory()
            .CreateLogger();

        Log.Information("Squad Uplink starting — {Version}", typeof(App).Assembly.GetName().Version);
    }

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        return services.BuildServiceProvider();
    }
}