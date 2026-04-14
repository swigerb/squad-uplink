using System.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Views;

namespace SquadUplink;

/// <summary>
/// WinUI Application. DI and logging are configured in Program.cs;
/// this class handles XAML init, splash screen, and service startup.
/// </summary>
public partial class App : Application
{
    private readonly Stopwatch _startupTimer = Stopwatch.StartNew();
    private ITrayIconService? _trayIconService;

    /// <summary>
    /// Application-wide service provider, set by Program.cs before app launch.
    /// </summary>
    public static IServiceProvider Services { get; set; } = null!;

    /// <summary>
    /// Resolves a service from the DI container.
    /// </summary>
    public static T GetService<T>() where T : class =>
        Services.GetRequiredService<T>();

    public App()
    {
        Log.Information("App constructor entered ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);

        // Global crash handler — catches exceptions the XAML runtime swallows
        UnhandledException += OnUnhandledException;
        TaskScheduler.UnobservedTaskException += OnUnobservedTaskException;

        try
        {
            InitializeComponent();
            Log.Debug("InitializeComponent succeeded ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: App constructor failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);
            Log.CloseAndFlush();
            throw;
        }
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        Log.Information("OnLaunched entered ({ElapsedMs}ms)", _startupTimer.ElapsedMilliseconds);

        // Show splash screen while services initialize
        var splash = new SplashWindow();
        splash.Activate();

        try
        {
            await InitializeServicesAsync(splash);

            splash.UpdateStatus("Ready!");
            await Task.Delay(300); // Brief pause so user sees "Ready!"

            Log.Debug("Creating MainWindow...");
            MainWindow = new MainWindow();
            MainWindow.Activate();

            splash.Close();

            // Initialize system tray icon
            InitializeTrayIcon();

            Log.Information("App launched successfully ({ElapsedMs}ms total startup)",
                _startupTimer.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            Log.Fatal(ex, "FATAL: OnLaunched failed — {Type}: {Message}",
                ex.GetType().FullName, ex.Message);

            splash.Close();
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
            catch (Velopack.Exceptions.NotInstalledException)
            {
                Log.Debug("Velopack: running in dev mode, skipping update check");
            }
            catch (Exception ex)
            {
                Log.Debug(ex, "Velopack update check skipped — {Message}", ex.Message);
            }
        });
    }

    public Window? MainWindow { get; private set; }

    // ── Service Initialization ──────────────────────────────────────

    private static async Task InitializeServicesAsync(SplashWindow splash)
    {
        // DataService must create tables before anything reads/writes
        try
        {
            splash.UpdateStatus("Initializing database...");
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
            splash.UpdateStatus("Setting up notifications...");
            var notificationService = Services.GetRequiredService<INotificationService>();
            await notificationService.InitializeAsync();
            Log.Debug("NotificationService initialized");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "NotificationService initialization failed — toasts disabled");
        }

        // Theme service — load saved theme
        try
        {
            splash.UpdateStatus("Applying theme...");
            var themeService = Services.GetRequiredService<IThemeService>();
            await themeService.LoadSavedThemeAsync();
            Log.Debug("Theme loaded");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Theme initialization failed — using default theme");
        }

        // Start background session scanning (if auto-scan enabled)
        try
        {
            splash.UpdateStatus("Starting session scanner...");
            var dataService = Services.GetRequiredService<IDataService>();
            var settings = await dataService.GetSettingsAsync();
            if (settings.AutoScanOnStartup)
            {
                var sessionManager = Services.GetRequiredService<ISessionManager>();
                _ = Task.Run(() => sessionManager.StartScanningAsync(CancellationToken.None));
                Log.Debug("Session scanning started");
            }
            else
            {
                Log.Debug("Session scanning skipped — AutoScanOnStartup is disabled");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Session scanning startup failed — sessions won't auto-discover");
        }
    }

    // ── Global Exception Handlers ───────────────────────────────────

    private void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        Log.Fatal(e.Exception, "UNHANDLED EXCEPTION — {Type}: {Message}",
            e.Exception.GetType().FullName, e.Message);
        Log.CloseAndFlush();
        e.Handled = true;

        ShowErrorDialog("Unexpected Error", e.Exception.Message);
    }

    private void OnUnobservedTaskException(object? sender, UnobservedTaskExceptionEventArgs e)
    {
        Log.Error(e.Exception, "Unobserved task exception");
        e.SetObserved();

        MainWindow?.DispatcherQueue?.TryEnqueue(() =>
            ShowErrorDialog("Background Error", e.Exception.InnerException?.Message ?? e.Exception.Message));
    }

    private void ShowErrorDialog(string title, string message)
    {
        try
        {
            if (MainWindow?.Content is not FrameworkElement root) return;
            var dialog = new Microsoft.UI.Xaml.Controls.ContentDialog
            {
                Title = title,
                Content = message,
                CloseButtonText = "OK",
                XamlRoot = root.XamlRoot
            };
            _ = dialog.ShowAsync();
        }
        catch
        {
            // Last resort — can't even show a dialog
        }
    }

    // ── Fallback Error Window ───────────────────────────────────────

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

    // ── System Tray ─────────────────────────────────────────────────

    private void InitializeTrayIcon()
    {
        try
        {
            _trayIconService = Services.GetRequiredService<ITrayIconService>();

            _trayIconService.ShowWindowRequested += () =>
            {
                if (MainWindow is not null)
                {
                    MainWindow.Activate();
                    Log.Debug("Window restored from tray");
                }
            };

            _trayIconService.LaunchSessionRequested += () =>
            {
                if (MainWindow is not null)
                {
                    MainWindow.Activate();
                    // Navigate to dashboard if needed and trigger launch
                    var sessionManager = Services.GetRequiredService<ISessionManager>();
                    _ = sessionManager.LaunchSessionAsync(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile));
                    Log.Information("Session launched from tray menu");
                }
            };

            _trayIconService.ExitRequested += () =>
            {
                Log.Information("Exit requested from tray menu");
                ExitApplication();
            };

            // Sync tray icon animation with session count
            var sessionManager = Services.GetRequiredService<ISessionManager>();
            sessionManager.Sessions.CollectionChanged += (_, _) =>
            {
                _trayIconService.ActiveSessionCount = sessionManager.Sessions.Count;
            };

            _trayIconService.Show();
            Log.Debug("Tray icon service initialized");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Tray icon initialization failed — running without tray support");
        }
    }

    /// <summary>
    /// Checks whether the window close should be intercepted (minimize to tray)
    /// or allowed to proceed (real exit).
    /// </summary>
    internal async Task<bool> ShouldMinimizeToTrayAsync()
    {
        try
        {
            var dataService = Services.GetRequiredService<IDataService>();
            var settings = await dataService.GetSettingsAsync();
            return settings.MinimizeToTray && _trayIconService is { IsVisible: true };
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Fully exits the application, disposing the tray icon first.
    /// </summary>
    public void ExitApplication()
    {
        Log.Information("Application exiting");
        _trayIconService?.Dispose();
        _trayIconService = null;
        MainWindow?.Close();
        Log.CloseAndFlush();
        Environment.Exit(0);
    }
}