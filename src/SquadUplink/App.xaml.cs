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
        // Configure logging FIRST, before anything else
        ConfigureLogging();
        
        try
        {
            InitializeComponent();
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: InitializeComponent() failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            if (ex is TypeLoadException tle)
                Log.Fatal("TypeLoadException.TypeName = {TypeName}", tle.TypeName);
            var inner = ex.InnerException;
            while (inner is not null)
            {
                Log.Fatal(inner, "Inner: {Type}: {Message}", inner.GetType().FullName, inner.Message);
                if (inner is TypeLoadException tle2)
                    Log.Fatal("Inner TypeLoadException.TypeName = {TypeName}", tle2.TypeName);
                inner = inner.InnerException;
            }
            Log.CloseAndFlush();
            throw;
        }
        
        Services = ConfigureServices();
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            await LaunchCoreAsync(args);
        }
        catch (Exception ex)
        {
            LogFatalException(ex);
        }
    }

    private async Task LaunchCoreAsync(LaunchActivatedEventArgs args)
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
        Log.Debug("Resolving IDataService...");
        var dataService = Services.GetRequiredService<Contracts.IDataService>();
        await dataService.InitializeAsync();
        Log.Debug("IDataService initialized");

        // Initialize notification service
        Log.Debug("Resolving INotificationService...");
        var notificationService = Services.GetRequiredService<Contracts.INotificationService>();
        await notificationService.InitializeAsync();
        Log.Debug("INotificationService initialized");

        Log.Debug("Creating MainWindow...");
        MainWindow = new MainWindow();
        Log.Debug("MainWindow created, activating...");
        MainWindow.Activate();
        Log.Debug("MainWindow activated");
    }

    private static void LogFatalException(Exception ex)
    {
        Log.Fatal(ex, "FATAL: Unhandled exception during launch — {Type}: {Message}",
            ex.GetType().FullName, ex.Message);

        // Walk the inner exception chain
        var inner = ex.InnerException;
        var depth = 1;
        while (inner is not null)
        {
            Log.Fatal(inner, "FATAL: Inner exception [{Depth}] — {Type}: {Message}",
                depth, inner.GetType().FullName, inner.Message);
            inner = inner.InnerException;
            depth++;
        }

        // TypeLoadException has extra info
        if (ex is TypeLoadException tle)
        {
            Log.Fatal("TypeLoadException.TypeName = {TypeName}", tle.TypeName);
        }
        if (ex is System.Reflection.ReflectionTypeLoadException rtle)
        {
            foreach (var loaderEx in rtle.LoaderExceptions ?? [])
            {
                Log.Fatal(loaderEx, "Loader exception: {Message}", loaderEx?.Message);
            }
        }

        Log.CloseAndFlush();
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