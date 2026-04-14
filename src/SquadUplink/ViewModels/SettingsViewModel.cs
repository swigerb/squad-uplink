using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Microsoft.UI;
using Microsoft.UI.Xaml.Media;
using Serilog;
using Serilog.Sinks.InMemory;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.ViewModels;

public partial class SettingsViewModel : ViewModelBase
{
    private readonly IThemeService _themeService;
    private readonly IDataService _dataService;

    // Appearance
    [ObservableProperty]
    private int _selectedThemeIndex;

    [ObservableProperty]
    private bool _crtEffectsEnabled;

    [ObservableProperty]
    private double _fontSize = 13;

    [ObservableProperty]
    private SolidColorBrush? _previewAccentBrush;

    [ObservableProperty]
    private SolidColorBrush? _previewBackgroundBrush;

    [ObservableProperty]
    private SolidColorBrush? _previewSurfaceBrush;

    [ObservableProperty]
    private SolidColorBrush? _previewTextBrush;

    // Scanning
    [ObservableProperty]
    private double _scanIntervalSeconds = 5;

    [ObservableProperty]
    private bool _autoScanOnStartup = true;

    // Launching
    [ObservableProperty]
    private string _defaultWorkingDirectory = string.Empty;

    [ObservableProperty]
    private int _selectedModelIndex;

    [ObservableProperty]
    private bool _alwaysUseRemote;

    // Audio
    [ObservableProperty]
    private bool _audioEnabled = true;

    [ObservableProperty]
    private double _volume = 80;

    [ObservableProperty]
    private int _selectedSoundPackIndex;

    // Notifications
    [ObservableProperty]
    private bool _notifySessionCompleted = true;

    [ObservableProperty]
    private bool _notifyPermissionRequest = true;

    [ObservableProperty]
    private bool _notifyError = true;

    [ObservableProperty]
    private bool _notifySessionDiscovered = true;

    // System tray
    [ObservableProperty]
    private bool _minimizeToTray = true;

    // Logs
    [ObservableProperty]
    private int _selectedLogLevelIndex = 2; // Information

    [ObservableProperty]
    private string _logOutput = string.Empty;

    // About / Updates
    [ObservableProperty]
    private string _versionText = string.Empty;

    [ObservableProperty]
    private string _updateStatusText = string.Empty;

    [ObservableProperty]
    private bool _isCheckingForUpdates;

    public ObservableCollection<string> LogEntries { get; } = [];

    public SettingsViewModel(IThemeService themeService, IDataService dataService, ILogger<SettingsViewModel> logger)
        : base(logger)
    {
        _themeService = themeService;
        _dataService = dataService;
        VersionText = $"v{typeof(App).Assembly.GetName().Version}";
        Log.Debug("SettingsViewModel created");

        InitializeBrushes();
        _ = LoadSettingsAsync();
    }

    private void InitializeBrushes()
    {
        try
        {
            PreviewAccentBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83));
            PreviewBackgroundBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 26, 26, 46));
            PreviewSurfaceBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 22, 33, 62));
            PreviewTextBrush = new SolidColorBrush(Colors.White);
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            // WinUI runtime not available (unit tests)
        }
    }

    internal async Task LoadSettingsAsync()
    {
        try
        {
            var settings = await _dataService.GetSettingsAsync();
            SelectedThemeIndex = _themeService.AvailableThemes.ToList().IndexOf(settings.ThemeId);
            if (SelectedThemeIndex < 0) SelectedThemeIndex = 1; // Default to FluentDark
            ScanIntervalSeconds = settings.ScanIntervalSeconds;
            DefaultWorkingDirectory = settings.DefaultWorkingDirectory;
            AudioEnabled = settings.AudioEnabled;
            AutoScanOnStartup = settings.AutoScanOnStartup;
            CrtEffectsEnabled = settings.CrtEffectsEnabled;
            FontSize = settings.FontSize;
            Volume = settings.Volume;
            NotifySessionCompleted = settings.NotifySessionCompleted;
            NotifyPermissionRequest = settings.NotifyPermissionRequest;
            NotifyError = settings.NotifyError;
            NotifySessionDiscovered = settings.NotifySessionDiscovered;
            MinimizeToTray = settings.MinimizeToTray;
            UpdateThemePreview();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load settings — using defaults");
        }
    }

    partial void OnSelectedThemeIndexChanged(int value)
    {
        if (value >= 0 && value < _themeService.AvailableThemes.Count)
        {
            _themeService.ApplyTheme(_themeService.AvailableThemes[value]);
            UpdateThemePreview();
            _ = SaveSettingsAsync();
        }
    }

    partial void OnScanIntervalSecondsChanged(double value) => _ = SaveSettingsAsync();
    partial void OnDefaultWorkingDirectoryChanged(string value) => _ = SaveSettingsAsync();
    partial void OnAudioEnabledChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnAutoScanOnStartupChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnCrtEffectsEnabledChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnFontSizeChanged(double value) => _ = SaveSettingsAsync();
    partial void OnVolumeChanged(double value) => _ = SaveSettingsAsync();
    partial void OnAlwaysUseRemoteChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnNotifySessionCompletedChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnNotifyPermissionRequestChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnNotifyErrorChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnNotifySessionDiscoveredChanged(bool value) => _ = SaveSettingsAsync();
    partial void OnMinimizeToTrayChanged(bool value) => _ = SaveSettingsAsync();

    private void UpdateThemePreview()
    {
        var themeId = SelectedThemeIndex >= 0 && SelectedThemeIndex < _themeService.AvailableThemes.Count
            ? _themeService.AvailableThemes[SelectedThemeIndex]
            : "FluentDark";

        try
        {
            (PreviewAccentBrush, PreviewBackgroundBrush, PreviewSurfaceBrush, PreviewTextBrush) = themeId switch
            {
                "FluentLight" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 120, 212)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 243, 243, 243)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 255, 255, 255)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0))),
                "FluentDark" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 26, 26, 46)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 22, 33, 62)),
                    new SolidColorBrush(Colors.White)),
                "AppleIIe" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 51, 255, 51)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 20, 20, 20)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 51, 255, 51))),
                "C64" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 134, 122, 222)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 64, 50, 133)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 80, 69, 155)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 134, 122, 222))),
                "PipBoy" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 18, 255, 128)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 10, 20, 10)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 15, 30, 15)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 18, 255, 128))),
                "MUTHUR" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 255, 65)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 10, 15, 10)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 51, 255, 0))),
                "WOPR" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 255, 51, 51)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 10, 10, 26)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 15, 15, 36)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 255, 0))),
                "Matrix" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 143, 17)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 26, 0)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 255, 65))),
                "Win95" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 128)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 192, 192, 192)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 255, 255, 255)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0))),
                "LCARS" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 204, 153, 204)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 0, 0)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 10, 10, 20)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 255, 153, 0))),
                "StarWars" => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 68, 136, 255)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 10, 10, 20)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 13, 17, 23)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 224, 224, 255))),
                _ => (
                    new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 26, 26, 46)),
                    new SolidColorBrush(ColorHelper.FromArgb(255, 22, 33, 62)),
                    new SolidColorBrush(Colors.White)),
            };
        }
        catch (System.Runtime.InteropServices.COMException)
        {
            // WinUI runtime not available (unit tests)
        }
    }

    [RelayCommand]
    private Task BrowseDirectoryAsync()
    {
        Log.Debug("Browse directory requested");
        return Task.CompletedTask;
    }

    [RelayCommand]
    private void RefreshLogs()
    {
        LogEntries.Clear();
        var entries = InMemorySink.Instance?.LogEvents ?? [];
        var minLevel = SelectedLogLevelIndex switch
        {
            0 => Serilog.Events.LogEventLevel.Verbose,
            1 => Serilog.Events.LogEventLevel.Debug,
            2 => Serilog.Events.LogEventLevel.Information,
            3 => Serilog.Events.LogEventLevel.Warning,
            4 => Serilog.Events.LogEventLevel.Error,
            _ => Serilog.Events.LogEventLevel.Information,
        };

        foreach (var e in entries.Where(e => e.Level >= minLevel))
        {
            LogEntries.Add($"[{e.Timestamp:HH:mm:ss}] [{e.Level.ToString()[..3].ToUpperInvariant()}] {e.RenderMessage()}");
        }

        LogOutput = string.Join(Environment.NewLine, LogEntries);
    }

    [RelayCommand]
    private void ClearLogs()
    {
        LogEntries.Clear();
        LogOutput = string.Empty;
        Log.Debug("Logs cleared");
    }

    [RelayCommand]
    private void ExportLogs()
    {
        Log.Debug("Export logs requested");
    }

    [RelayCommand]
    private async Task CheckForUpdatesAsync()
    {
        IsCheckingForUpdates = true;
        UpdateStatusText = "Checking for updates...";
        Log.Information("Checking for updates via Velopack...");

        try
        {
            var mgr = new Velopack.UpdateManager("https://github.com/swigerb/squad-uplink/releases");
            var updateInfo = await mgr.CheckForUpdatesAsync();
            if (updateInfo is not null)
            {
                UpdateStatusText = $"Update available: v{updateInfo.TargetFullRelease.Version}";
                Log.Information("Update available: {Version}", updateInfo.TargetFullRelease.Version);
            }
            else
            {
                UpdateStatusText = "You're up to date!";
                Log.Information("No updates available");
            }
        }
        catch (Exception ex)
        {
            UpdateStatusText = "Update check failed";
            Log.Warning(ex, "Velopack update check failed");
        }
        finally
        {
            IsCheckingForUpdates = false;
        }
    }

    internal async Task SaveSettingsAsync()
    {
        try
        {
            var settings = new AppSettings
            {
                ThemeId = SelectedThemeIndex >= 0 && SelectedThemeIndex < _themeService.AvailableThemes.Count
                    ? _themeService.AvailableThemes[SelectedThemeIndex]
                    : "FluentDark",
                ScanIntervalSeconds = (int)ScanIntervalSeconds,
                DefaultWorkingDirectory = DefaultWorkingDirectory,
                AudioEnabled = AudioEnabled,
                AutoScanOnStartup = AutoScanOnStartup,
                CrtEffectsEnabled = CrtEffectsEnabled,
                FontSize = FontSize,
                Volume = Volume,
                SoundPack = SelectedSoundPackIndex switch
                {
                    0 => "Fluent",
                    1 => "AppleIIe",
                    2 => "C64",
                    3 => "PipBoy",
                    _ => "Fluent"
                },
                DefaultModel = SelectedModelIndex switch
                {
                    0 => "auto",
                    1 => "claude-sonnet-4-20250514",
                    2 => "claude-opus-4-20250514",
                    3 => "gpt-4.1",
                    4 => "o4-mini",
                    _ => "auto"
                },
                AlwaysUseRemote = AlwaysUseRemote,
                NotifySessionCompleted = NotifySessionCompleted,
                NotifyPermissionRequest = NotifyPermissionRequest,
                NotifyError = NotifyError,
                NotifySessionDiscovered = NotifySessionDiscovered,
                MinimizeToTray = MinimizeToTray
            };
            await _dataService.SaveSettingsAsync(settings);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to save settings");
        }
    }
}