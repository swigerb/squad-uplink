using System.Collections.ObjectModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Serilog;
using Serilog.Events;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.ViewModels;
using SquadUplink.Views;
using Windows.System;

namespace SquadUplink;

public sealed partial class MainWindow : Window
{
    private readonly ISessionManager _sessionManager;
    private readonly Core.Logging.InMemorySink _diagnosticsSink;
    private readonly ILogPayloadFormatter _formatter;
    private int _sessionCount;
    private string _statusMessage = "Scanning for sessions...";
    private int _logLevelIndex; // 0=Debug, 1=Info, 2=Warning, 3=Error
    private bool _isDiagPanelOpen;
    private DateTimeOffset _lastPanelOpenedAt = DateTimeOffset.UtcNow;

    /// <summary>Log entries shown in the inline diagnostics panel.</summary>
    internal ObservableCollection<DiagnosticLogEntry> PanelLogEntries { get; } = [];

    public int SessionCount
    {
        get => _sessionCount;
        set
        {
            if (_sessionCount != value)
            {
                _sessionCount = value;
                Bindings.Update();
            }
        }
    }

    public string SessionCountDisplay => _sessionCount.ToString();

    public string StatusMessage
    {
        get => _statusMessage;
        set
        {
            if (_statusMessage != value)
            {
                _statusMessage = value;
                Bindings.Update();
            }
        }
    }

    public int LogLevelIndex
    {
        get => _logLevelIndex;
        set
        {
            if (_logLevelIndex != value)
            {
                _logLevelIndex = value;
                Program.LevelSwitch.MinimumLevel = value switch
                {
                    0 => LogEventLevel.Debug,
                    1 => LogEventLevel.Information,
                    2 => LogEventLevel.Warning,
                    3 => LogEventLevel.Error,
                    _ => LogEventLevel.Information
                };
                Bindings.Update();
                Log.Information("Log level changed to {Level}", Program.LevelSwitch.MinimumLevel);
            }
        }
    }

    public MainWindow()
    {
        Log.Debug("MainWindow constructor entered");
        InitializeComponent();

        // Mica backdrop for modern Windows 11 feel
        SystemBackdrop = new MicaBackdrop();

        // Custom title bar
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        _sessionManager = App.Services.GetRequiredService<ISessionManager>();
        _diagnosticsSink = App.Services.GetRequiredService<Core.Logging.InMemorySink>();
        _formatter = App.Services.GetRequiredService<ILogPayloadFormatter>();
        _sessionManager.Sessions.CollectionChanged += (_, _) => UpdateStatus();

        // Intercept window close to support minimize-to-tray
        this.Closed += OnWindowClosed;

        // Navigate to Dashboard on startup
        ContentFrame.Navigate(typeof(DashboardPage));
        NavView.SelectedItem = NavView.MenuItems[0];

        // Bind panel list to our observable collection
        LogPanelList.ItemsSource = PanelLogEntries;

        // Subscribe to new log events for the inline panel
        _diagnosticsSink.LogReceived += OnPanelLogReceived;

        UpdateStatus();
        SubscribeToLogErrors();
        InitializeCommandPalette();
        Log.Information("MainWindow initialized, navigated to Dashboard");
    }

    private void SubscribeToLogErrors()
    {
        // Flash status bar when an error is logged via Serilog InMemorySink
        if (Serilog.Sinks.InMemory.InMemorySink.Instance is { })
        {
            // Poll is lightweight — InMemorySink doesn't expose events,
            // so we check on session updates and diagnostics opens instead.
        }
    }

    // ── Inline Diagnostics Panel ──────────────────────────────

    private const int MaxPanelEntries = 200;

    private void OnPanelLogReceived(LogEvent logEvent)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            var rendered = logEvent.RenderMessage();
            var fullMsg = rendered + (logEvent.Exception is not null ? $"\n{logEvent.Exception}" : "");
            var entry = new DiagnosticLogEntry
            {
                Time = logEvent.Timestamp.ToString("HH:mm:ss.fff"),
                Level = logEvent.Level,
                LevelTag = DiagnosticsViewModel.ToLevelTag(logEvent.Level),
                Source = DiagnosticsViewModel.TrimSource(DiagnosticsViewModel.GetSourceContext(logEvent)),
                ShortMessage = DiagnosticsViewModel.Truncate(rendered, 200),
                FullMessage = fullMsg,
                FormattedPayload = _formatter.FormatPayload(fullMsg),
                PayloadType = _formatter.DetectPayloadType(fullMsg),
            };

            PanelLogEntries.Add(entry);

            // Trim oldest when over capacity
            while (PanelLogEntries.Count > MaxPanelEntries)
                PanelLogEntries.RemoveAt(0);

            // Auto-scroll to bottom when panel is open
            if (_isDiagPanelOpen && LogPanelList.Items.Count > 0)
                LogPanelList.ScrollIntoView(LogPanelList.Items[^1]);

            // Update error badge when panel is closed
            UpdateDiagnosticsBadge(logEvent);
        });
    }

    private void UpdateDiagnosticsBadge(LogEvent logEvent)
    {
        if (!_isDiagPanelOpen && logEvent.Level >= LogEventLevel.Error)
        {
            var errorCount = _diagnosticsSink.GetEvents()
                .Count(ev => ev.Level >= LogEventLevel.Error && ev.Timestamp > _lastPanelOpenedAt);
            if (errorCount > 0)
            {
                DiagErrorBadge.Text = $"({errorCount})";
                DiagErrorBadge.Visibility = Visibility.Visible;
            }
        }
    }

    private void DiagToggle_Checked(object sender, RoutedEventArgs e)
    {
        _isDiagPanelOpen = true;
        _lastPanelOpenedAt = DateTimeOffset.UtcNow;
        DiagToggleGlyph.Text = "▼";
        DiagErrorBadge.Visibility = Visibility.Collapsed;
        DiagnosticsPanel.Visibility = Visibility.Visible;

        // Refresh panel entries from sink
        RefreshPanelEntries();

        // Auto-scroll to bottom
        if (LogPanelList.Items.Count > 0)
            LogPanelList.ScrollIntoView(LogPanelList.Items[^1]);
    }

    private void DiagToggle_Unchecked(object sender, RoutedEventArgs e)
    {
        _isDiagPanelOpen = false;
        DiagToggleGlyph.Text = "▶";
        DiagnosticsPanel.Visibility = Visibility.Collapsed;
    }

    private void RefreshPanelEntries()
    {
        PanelLogEntries.Clear();
        var events = _diagnosticsSink.GetEvents();

        // Show last N entries (oldest to newest for chronological display)
        var recent = events.Skip(Math.Max(0, events.Count - MaxPanelEntries));
        foreach (var e in recent)
        {
            var rendered = e.RenderMessage();
            var fullMsg = rendered + (e.Exception is not null ? $"\n{e.Exception}" : "");
            PanelLogEntries.Add(new DiagnosticLogEntry
            {
                Time = e.Timestamp.ToString("HH:mm:ss.fff"),
                Level = e.Level,
                LevelTag = DiagnosticsViewModel.ToLevelTag(e.Level),
                Source = DiagnosticsViewModel.TrimSource(DiagnosticsViewModel.GetSourceContext(e)),
                ShortMessage = DiagnosticsViewModel.Truncate(rendered, 200),
                FullMessage = fullMsg,
                FormattedPayload = _formatter.FormatPayload(fullMsg),
                PayloadType = _formatter.DetectPayloadType(fullMsg),
            });
        }
    }

    private void ClearPanelLogs_Click(object sender, RoutedEventArgs e)
    {
        PanelLogEntries.Clear();
    }

    private async void OpenDiagnostics_Click(object sender, RoutedEventArgs e)
    {
        var vm = App.Services.GetRequiredService<DiagnosticsViewModel>();
        var dialog = new DiagnosticsDialog(vm) { XamlRoot = Content.XamlRoot };
        await dialog.ShowAsync();
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            ContentFrame.Navigate(typeof(SettingsPage));
            Log.Debug("Navigated to Settings");
            return;
        }

        if (args.SelectedItemContainer is NavigationViewItem item)
        {
            var tag = item.Tag?.ToString();
            var pageType = tag switch
            {
                "Dashboard" => typeof(DashboardPage),
                "Sessions" => typeof(SessionPage),
                _ => typeof(DashboardPage)
            };
            ContentFrame.Navigate(pageType);
            Log.Debug("Navigated to {Page}", tag);
        }
    }

    private void UpdateStatus()
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            var count = _sessionManager.Sessions.Count;
            SessionCount = count;
            StatusMessage = count == 0
                ? "Scanning for sessions..."
                : $"{count} session{(count != 1 ? "s" : "")} active";
            FooterStatusText.Text = StatusMessage;

            // Check for recent errors in the InMemorySink
            var recentErrors = Serilog.Sinks.InMemory.InMemorySink.Instance?.LogEvents
                .Where(e => e.Level >= LogEventLevel.Error)
                .OrderByDescending(e => e.Timestamp)
                .FirstOrDefault();

            if (recentErrors is not null
                && recentErrors.Timestamp > DateTimeOffset.Now.AddMinutes(-1))
            {
                StatusDot.Fill = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["SquadErrorRedBrush"];
            }
            else
            {
                StatusDot.Fill = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["SquadAccentGreenBrush"];
            }
        });
    }

    // --- Minimize to Tray ---

    private async void OnWindowClosed(object sender, WindowEventArgs args)
    {
        var app = (App)Application.Current;
        if (await app.ShouldMinimizeToTrayAsync())
        {
            // Cancel the close and hide the window instead
            args.Handled = true;
            this.AppWindow.Hide();
            Log.Debug("Window hidden to tray");
        }
    }

    // --- Keyboard Accelerator Handlers ---

    private DashboardPage? GetDashboardPage()
    {
        return ContentFrame.Content as DashboardPage;
    }

    private void NextSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.SelectNextSession();
    }

    private void PreviousSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.SelectPreviousSession();
    }

    private void JumpToSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        // Map Number1..Number9 to index 0..8
        var index = sender.Key switch
        {
            VirtualKey.Number1 => 0,
            VirtualKey.Number2 => 1,
            VirtualKey.Number3 => 2,
            VirtualKey.Number4 => 3,
            VirtualKey.Number5 => 4,
            VirtualKey.Number6 => 5,
            VirtualKey.Number7 => 6,
            VirtualKey.Number8 => 7,
            VirtualKey.Number9 => 8,
            _ => -1
        };
        if (index >= 0)
        {
            GetDashboardPage()?.LayoutControl.SelectSessionByIndex(index);
        }
    }

    private void LaunchNewSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        var dashboard = GetDashboardPage();
        dashboard?.ViewModel.LaunchSessionCommand.Execute(null);
    }

    private void CloseCurrentSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.CloseCurrentSession();
    }

    private void ToggleFocusedMode_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        var dashboard = GetDashboardPage();
        dashboard?.ViewModel.ToggleFocusedModeCommand.Execute(null);
    }

    private void CommandPalette_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        CommandPaletteControl.Toggle();
    }

    private void DismissOverlay_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        if (CommandPaletteControl.IsOpen)
        {
            args.Handled = true;
            CommandPaletteControl.Hide();
        }
    }

    private void InitializeCommandPalette()
    {
        var themeService = App.Services.GetRequiredService<IThemeService>();
        CommandPaletteControl.SetCommands(BuildCommandList(themeService));
    }

    /// <summary>
    /// Builds the canonical command list for the command palette.
    /// Internal for testability.
    /// </summary>
    internal static List<CommandItem> BuildCommandList(IThemeService themeService)
    {
        var commands = new List<CommandItem>
        {
            new()
            {
                Id = "launch-session",
                DisplayName = "Launch new session",
                Description = "Open the launch session dialog",
                IconGlyph = "\uE710",
                Category = "Session",
                Execute = () => Log.Information("Command: Launch new session")
            },
            new()
            {
                Id = "view-cards",
                DisplayName = "Switch to Cards view",
                Description = "Display sessions as cards",
                IconGlyph = "\uF0E2",
                Category = "Layout",
                Execute = () => Log.Information("Command: Switch to Cards view")
            },
            new()
            {
                Id = "view-tabs",
                DisplayName = "Switch to Tabs view",
                Description = "Display sessions as tabs",
                IconGlyph = "\uE8A0",
                Category = "Layout",
                Execute = () => Log.Information("Command: Switch to Tabs view")
            },
            new()
            {
                Id = "view-grid",
                DisplayName = "Switch to Grid view",
                Description = "Display sessions in a grid layout",
                IconGlyph = "\uE80A",
                Category = "Layout",
                Execute = () => Log.Information("Command: Switch to Grid view")
            },
            new()
            {
                Id = "open-diagnostics",
                DisplayName = "Open diagnostics",
                Description = "View logs and diagnostic information",
                IconGlyph = "\uE9D9",
                Category = "Tools",
                Execute = () => Log.Information("Command: Open diagnostics")
            },
            new()
            {
                Id = "stop-all",
                DisplayName = "Stop all sessions",
                Description = "Terminate all running sessions",
                IconGlyph = "\uE71A",
                Category = "Session",
                Execute = () => Log.Information("Command: Stop all sessions")
            },
            new()
            {
                Id = "export-diagnostic",
                DisplayName = "Export diagnostic report",
                Description = "Export logs to file",
                IconGlyph = "\uEDE1",
                Category = "Tools",
                Execute = () => Log.Information("Command: Export diagnostic report")
            },
        };

        // Add theme switch commands
        foreach (var theme in themeService.AvailableThemes)
        {
            commands.Add(new CommandItem
            {
                Id = $"theme-{theme.ToLowerInvariant()}",
                DisplayName = $"Switch theme: {theme}",
                Description = $"Apply the {theme} visual theme",
                IconGlyph = "\uE790",
                Category = "Theme",
                Execute = () =>
                {
                    themeService.ApplyTheme(theme);
                    Log.Information("Command: Switched theme to {Theme}", theme);
                }
            });
        }

        return commands;
    }
}
