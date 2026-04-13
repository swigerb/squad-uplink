using System.Diagnostics;
using System.Runtime.ExceptionServices;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Serilog;
using Serilog.Sinks.InMemory;
using SquadUplink.Contracts;
using SquadUplink.Helpers;
using SquadUplink.Views;

namespace SquadUplink;

public partial class App : Application
{
    private readonly Stopwatch _startupTimer = Stopwatch.StartNew();

    public static IServiceProvider Services { get; private set; } = null!;

    public App()
    {
        // 1. Logging — before anything else
        ConfigureLogging();
        Log.Information("App constructor entered ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);

        // 2. Global crash handler — catches exceptions the XAML runtime swallows
        UnhandledException += OnUnhandledException;

        // 3. CLR-level first-chance observer for TypeLoadException diagnostics
        AppDomain.CurrentDomain.FirstChanceException += OnFirstChanceException;
        AppDomain.CurrentDomain.UnhandledException += OnDomainUnhandledException;

        try
        {
            Log.Debug("Calling InitializeComponent...");
            InitializeComponent();
            Log.Debug("InitializeComponent succeeded ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);

            Log.Debug("Calling ConfigureServices...");
            Services = ConfigureServices();
            Log.Debug("ConfigureServices succeeded ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);
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

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        Log.Information("OnLaunched entered ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);

        try
        {
            // Initialize async services before showing the real UI
            await InitializeServicesAsync();

            Log.Debug("Creating MainWindow...");
            MainWindow = new MainWindow();
            MainWindow.Activate();

            Log.Information("App launched successfully ({ElapsedMs}ms total startup)",
                _startupTimer.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: OnLaunched failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            LogTypeLoadDetails(ex);

            // Fall back to a bare error window so the user sees something
            ShowFallbackErrorWindow(ex);
        }

        // Velopack auto-update check (non-critical)
        _ = Task.Run(async () =>
        {
            try
            {
                var mgr = new Velopack.UpdateManager("https://github.com/swigerb/squad-uplink/releases");
                var update = await mgr.CheckForUpdatesAsync();
                if (update is not null)
                    Log.Information("Update available: {Version}", update.TargetFullRelease.Version);
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Velopack update check skipped — {Message}", ex.Message);
            }
        });
    }

    public Window? MainWindow { get; private set; }

    // ── Service Initialization ──────────────────────────────────────

    private static async Task InitializeServicesAsync()
    {
        // DataService must create tables before anything reads/writes
        try
        {
            var dataService = Services.GetRequiredService<IDataService>();
            await dataService.InitializeAsync();
            Log.Debug("DataService initialized");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "DataService initialization failed — history/settings will be unavailable");
        }

        // NotificationService registration
        try
        {
            var notificationService = Services.GetRequiredService<INotificationService>();
            await notificationService.InitializeAsync();
            Log.Debug("NotificationService initialized");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "NotificationService initialization failed — toasts disabled");
        }

        // Start background session scanning
        try
        {
            var sessionManager = Services.GetRequiredService<ISessionManager>();
            _ = Task.Run(() => sessionManager.StartScanningAsync(CancellationToken.None));
            Log.Debug("Session scanning started");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Session scanning startup failed — sessions won't auto-discover");
        }
    }

    // ── Logging ─────────────────────────────────────────────────────

    private static void ConfigureLogging()
    {
        var logDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink", "logs");
        Directory.CreateDirectory(logDir);

        var logPath = Path.Combine(logDir, "squad-uplink-.log");

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .WriteTo.Debug()
            .WriteTo.InMemory()
            .CreateLogger();

        Log.Information("Squad Uplink starting — {Version}", typeof(App).Assembly.GetName().Version);
    }

    // ── DI Container ────────────────────────────────────────────────

    private static IServiceProvider ConfigureServices()
    {
        var services = new ServiceCollection();
        services.AddSquadUplinkServices();
        return services.BuildServiceProvider();
    }

    // ── Global Exception Handlers ───────────────────────────────────

    private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        Log.Fatal(e.Exception, "UNHANDLED EXCEPTION — {Type}: {Message}",
            e.Exception.GetType().FullName, e.Message);
        LogTypeLoadDetails(e.Exception);
        Log.CloseAndFlush();
        e.Handled = true; // Prevent immediate crash so log can flush
    }

    private static void OnDomainUnhandledException(object sender, System.UnhandledExceptionEventArgs e)
    {
        if (e.ExceptionObject is Exception ex)
        {
            Log.Fatal(ex, "DOMAIN UNHANDLED — {Type}: {Message} (IsTerminating={IsTerminating})",
                ex.GetType().FullName, ex.Message, e.IsTerminating);
            LogTypeLoadDetails(ex);
            Log.CloseAndFlush();
        }
    }

    private static void OnFirstChanceException(object? sender, FirstChanceExceptionEventArgs e)
    {
        // Only log TypeLoadException at first chance for diagnostics
        if (e.Exception is TypeLoadException tle)
        {
            Log.Error("FIRST-CHANCE TypeLoadException: TypeName={TypeName} Message={Message}",
                tle.TypeName, tle.Message);
        }
        else if (e.Exception is System.IO.FileNotFoundException fnf && fnf.FileName?.Contains("Version=") == true)
        {
            Log.Error("FIRST-CHANCE Assembly not found: {FileName}", fnf.FileName);
        }
    }

    // ── Diagnostic Helpers ──────────────────────────────────────────

    private static void LogTypeLoadDetails(Exception ex)
    {
        if (ex is TypeLoadException tle)
            Log.Fatal("TypeLoadException.TypeName = {TypeName}", tle.TypeName);

        if (ex is System.IO.FileNotFoundException fnf)
            Log.Fatal("FileNotFoundException.FileName = {FileName}", fnf.FileName);

        if (ex is System.IO.FileLoadException fle)
            Log.Fatal("FileLoadException.FileName = {FileName} FusionLog = {FusionLog}",
                fle.FileName, fle.FusionLog);

        var inner = ex.InnerException;
        var depth = 0;
        while (inner is not null && depth < 10)
        {
            depth++;
            Log.Fatal(inner, "Inner [{Depth}]: {Type}: {Message}", depth, inner.GetType().FullName, inner.Message);
            LogTypeLoadDetails(inner);
            inner = inner.InnerException;
        }
    }

    private void ShowFallbackErrorWindow(Exception ex)
    {
        try
        {
            MainWindow = new Window { Title = "Squad Uplink — Startup Error" };
            var panel = new Microsoft.UI.Xaml.Controls.StackPanel
            {
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Spacing = 12,
                MaxWidth = 600,
                Padding = new Thickness(32)
            };
            panel.Children.Add(new Microsoft.UI.Xaml.Controls.TextBlock
            {
                Text = "❌ Squad Uplink failed to start",
                FontSize = 24,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold
            });
            panel.Children.Add(new Microsoft.UI.Xaml.Controls.TextBlock
            {
                Text = $"{ex.GetType().Name}: {ex.Message}",
                TextWrapping = TextWrapping.Wrap,
                IsTextSelectionEnabled = true,
                FontFamily = new Microsoft.UI.Xaml.Media.FontFamily("Cascadia Mono,Consolas,monospace"),
                FontSize = 12
            });
            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "SquadUplink", "logs");
            panel.Children.Add(new Microsoft.UI.Xaml.Controls.TextBlock
            {
                Text = $"Logs: {logDir}",
                FontSize = 11,
                IsTextSelectionEnabled = true,
                Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(
                    Microsoft.UI.ColorHelper.FromArgb(255, 158, 158, 158))
            });
            MainWindow.Content = panel;
            MainWindow.Activate();
        }
        catch (Exception fallbackEx)
        {
            Log.Fatal(fallbackEx, "Even the fallback error window failed");
            Log.CloseAndFlush();
        }
    }
}