using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Serilog;
using Serilog.Sinks.InMemory;
using SquadUplink.Helpers;

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
            Log.Debug("Calling InitializeComponent...");
            InitializeComponent();
            Log.Debug("InitializeComponent succeeded");
            
            Log.Debug("Calling ConfigureServices...");
            Services = ConfigureServices();
            Log.Debug("ConfigureServices succeeded");
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: App constructor failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            LogTypeLoadDetails(ex);
            Log.CloseAndFlush();
            throw;
        }
    }

    private static void LogTypeLoadDetails(Exception ex)
    {
        if (ex is TypeLoadException tle)
            Log.Fatal("TypeLoadException.TypeName = {TypeName}", tle.TypeName);
        
        var inner = ex.InnerException;
        var depth = 0;
        while (inner is not null)
        {
            depth++;
            Log.Fatal(inner, "Inner [{Depth}]: {Type}: {Message}", depth, inner.GetType().FullName, inner.Message);
            if (inner is TypeLoadException tle2)
                Log.Fatal("Inner TypeLoadException.TypeName = {TypeName}", tle2.TypeName);
            inner = inner.InnerException;
        }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        // MINIMAL LAUNCH — just show a window to prove the app can start
        try
        {
            Log.Debug("OnLaunched — creating minimal window...");
            MainWindow = new Window();
            MainWindow.Title = "Squad Uplink";
            var panel = new Microsoft.UI.Xaml.Controls.StackPanel
            {
                HorizontalAlignment = Microsoft.UI.Xaml.HorizontalAlignment.Center,
                VerticalAlignment = Microsoft.UI.Xaml.VerticalAlignment.Center
            };
            panel.Children.Add(new Microsoft.UI.Xaml.Controls.TextBlock 
            { 
                Text = "🚀 Squad Uplink — Loading...",
                FontSize = 24
            });
            MainWindow.Content = panel;
            MainWindow.Activate();
            Log.Information("Minimal window launched successfully");
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: OnLaunched failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            LogTypeLoadDetails(ex);
            Log.CloseAndFlush();
        }
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