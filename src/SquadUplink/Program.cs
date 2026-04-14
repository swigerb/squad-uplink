using System.Runtime.ExceptionServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Serilog;
using Serilog.Core;
using Serilog.Sinks.InMemory;
using SquadUplink.Core.Logging;
using SquadUplink.Helpers;

namespace SquadUplink;

/// <summary>
/// Custom entry point. Pre-Serilog crash logging ensures we capture failures
/// even before the logging pipeline is fully initialized.
/// </summary>
public static class Program
{
    /// <summary>
    /// Runtime-adjustable log level. Changing MinimumLevel takes effect immediately.
    /// </summary>
    public static LoggingLevelSwitch LevelSwitch { get; } = new(Serilog.Events.LogEventLevel.Debug);

    /// <summary>Custom in-memory sink shared with the Diagnostics UI via DI.</summary>
    internal static Core.Logging.InMemorySink DiagnosticsSink { get; } = new(maxCapacity: 1000);

    private static readonly string CrashLogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "SquadUplink", "crash.log");

    [STAThread]
    public static void Main(string[] args)
    {
        try
        {
            // Ensure crash log directory exists before anything else
            Directory.CreateDirectory(Path.GetDirectoryName(CrashLogPath)!);

            // Pre-Serilog crash handler — catches fatal errors before logging is up
            AppDomain.CurrentDomain.UnhandledException += (_, e) =>
            {
                WriteCrashLog($"CRASH: {e.ExceptionObject}");
                Log.CloseAndFlush();
            };

            // CLR-level first-chance observer for TypeLoadException diagnostics
            AppDomain.CurrentDomain.FirstChanceException += OnFirstChanceException;

            // Configure Serilog early
            ConfigureLogging();
            Log.Information("Squad Uplink starting — {Version}", typeof(Program).Assembly.GetName().Version);

            // Build the generic host for DI lifecycle
            var host = Host.CreateDefaultBuilder(args)
                .UseSerilog()
                .ConfigureServices((context, services) =>
                {
                    services.AddSquadUplinkServices();
                })
                .Build();

            // Expose the service provider for the WinUI app
            App.Services = host.Services;

            // Start the WinUI app
            WinRT.ComWrappersSupport.InitializeComWrappers();
            Application.Start(p =>
            {
                var context = new DispatcherQueueSynchronizationContext(
                    DispatcherQueue.GetForCurrentThread());
                SynchronizationContext.SetSynchronizationContext(context);
                _ = new App();
            });
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: Startup failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            WriteCrashLog($"FATAL: {ex}");
            Log.CloseAndFlush();
        }
    }

    private static void ConfigureLogging()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink", "logs");
        Directory.CreateDirectory(logDir);

        var logPath = Path.Combine(logDir, "squad-uplink-.log");

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.ControlledBy(LevelSwitch)
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .WriteTo.Debug()
            .WriteTo.InMemory()
            .WriteTo.Sink(DiagnosticsSink)
            .CreateLogger();
    }

    private static void OnFirstChanceException(object? sender, FirstChanceExceptionEventArgs e)
    {
        if (e.Exception is TypeLoadException tle)
        {
            Log.Error("FIRST-CHANCE TypeLoadException: TypeName={TypeName} Message={Message}",
                tle.TypeName, tle.Message);
        }
        else if (e.Exception is FileNotFoundException fnf && fnf.FileName?.Contains("Version=") == true)
        {
            Log.Error("FIRST-CHANCE Assembly not found: {FileName}", fnf.FileName);
        }
    }

    private static void WriteCrashLog(string message)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(CrashLogPath)!);
            File.AppendAllText(CrashLogPath, $"{DateTime.UtcNow:O} {message}\n");
        }
        catch
        {
            // Last resort — can't even write crash log
        }
    }
}
