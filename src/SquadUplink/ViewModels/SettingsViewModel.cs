using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Sinks.InMemory;
using SquadUplink.Contracts;
using SquadUplink.Models;
using Windows.UI;

namespace SquadUplink.ViewModels;

public partial class SettingsViewModel : ViewModelBase
{
    private readonly IThemeService _themeService;
    private readonly IDataService _dataService;
    private CancellationTokenSource? _saveCts;

    // Appearance
    [ObservableProperty]
    private int _selectedThemeIndex;

    [ObservableProperty]
    private bool _crtEffectsEnabled;

    [ObservableProperty]
    private double _crtIntensity = 70;

    [ObservableProperty]
    private double _fontSize = 13;

    [ObservableProperty]
    private Color _previewAccentColor;

    [ObservableProperty]
    private Color _previewBackgroundColor;

    [ObservableProperty]
    private Color _previewSurfaceColor;

    [ObservableProperty]
    private Color _previewTextColor;

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

        InitializeColors();
        _ = LoadSettingsAsync();
    }

    private void InitializeColors()
    {
        PreviewAccentColor = Color.FromArgb(255, 0, 200, 83);
        PreviewBackgroundColor = Color.FromArgb(255, 26, 26, 46);
        PreviewSurfaceColor = Color.FromArgb(255, 22, 33, 62);
        PreviewTextColor = Color.FromArgb(255, 255, 255, 255);
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
            CrtIntensity = settings.CrtIntensity;
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
            _ = DebouncedSaveAsync();
        }
    }

    partial void OnScanIntervalSecondsChanged(double value) => _ = DebouncedSaveAsync();
    partial void OnDefaultWorkingDirectoryChanged(string value) => _ = DebouncedSaveAsync();
    partial void OnAudioEnabledChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnAutoScanOnStartupChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnCrtEffectsEnabledChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnCrtIntensityChanged(double value) => _ = DebouncedSaveAsync();
    partial void OnFontSizeChanged(double value) => _ = DebouncedSaveAsync();
    partial void OnVolumeChanged(double value) => _ = DebouncedSaveAsync();
    partial void OnAlwaysUseRemoteChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnNotifySessionCompletedChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnNotifyPermissionRequestChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnNotifyErrorChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnNotifySessionDiscoveredChanged(bool value) => _ = DebouncedSaveAsync();
    partial void OnMinimizeToTrayChanged(bool value) => _ = DebouncedSaveAsync();

    private async Task DebouncedSaveAsync()
    {
        _saveCts?.Cancel();
        _saveCts = new CancellationTokenSource();
        try
        {
            await Task.Delay(500, _saveCts.Token);
            await SaveSettingsAsync();
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { Log.Warning(ex, "Debounced settings save failed"); }
    }

    private void UpdateThemePreview()
    {
        var themeId = SelectedThemeIndex >= 0 && SelectedThemeIndex < _themeService.AvailableThemes.Count
            ? _themeService.AvailableThemes[SelectedThemeIndex]
            : "FluentDark";

        (PreviewAccentColor, PreviewBackgroundColor, PreviewSurfaceColor, PreviewTextColor) = themeId switch
        {
            "FluentLight" => (
                Color.FromArgb(255, 0, 120, 212),
                Color.FromArgb(255, 243, 243, 243),
                Color.FromArgb(255, 255, 255, 255),
                Color.FromArgb(255, 0, 0, 0)),
            "FluentDark" => (
                Color.FromArgb(255, 0, 200, 83),
                Color.FromArgb(255, 26, 26, 46),
                Color.FromArgb(255, 22, 33, 62),
                Color.FromArgb(255, 255, 255, 255)),
            "AppleIIe" => (
                Color.FromArgb(255, 51, 255, 51),
                Color.FromArgb(255, 0, 0, 0),
                Color.FromArgb(255, 20, 20, 20),
                Color.FromArgb(255, 51, 255, 51)),
            "C64" => (
                Color.FromArgb(255, 134, 122, 222),
                Color.FromArgb(255, 64, 50, 133),
                Color.FromArgb(255, 80, 69, 155),
                Color.FromArgb(255, 134, 122, 222)),
            "PipBoy" => (
                Color.FromArgb(255, 18, 255, 128),
                Color.FromArgb(255, 10, 20, 10),
                Color.FromArgb(255, 15, 30, 15),
                Color.FromArgb(255, 18, 255, 128)),
            "MUTHUR" => (
                Color.FromArgb(255, 0, 255, 65),
                Color.FromArgb(255, 0, 0, 0),
                Color.FromArgb(255, 10, 15, 10),
                Color.FromArgb(255, 51, 255, 0)),
            "WOPR" => (
                Color.FromArgb(255, 255, 51, 51),
                Color.FromArgb(255, 10, 10, 26),
                Color.FromArgb(255, 15, 15, 36),
                Color.FromArgb(255, 0, 255, 0)),
            "Matrix" => (
                Color.FromArgb(255, 0, 143, 17),
                Color.FromArgb(255, 0, 0, 0),
                Color.FromArgb(255, 0, 26, 0),
                Color.FromArgb(255, 0, 255, 65)),
            "Win95" => (
                Color.FromArgb(255, 0, 0, 128),
                Color.FromArgb(255, 192, 192, 192),
                Color.FromArgb(255, 255, 255, 255),
                Color.FromArgb(255, 0, 0, 0)),
            "LCARS" => (
                Color.FromArgb(255, 204, 153, 204),
                Color.FromArgb(255, 0, 0, 0),
                Color.FromArgb(255, 10, 10, 20),
                Color.FromArgb(255, 255, 153, 0)),
            "StarWars" => (
                Color.FromArgb(255, 68, 136, 255),
                Color.FromArgb(255, 10, 10, 20),
                Color.FromArgb(255, 13, 17, 23),
                Color.FromArgb(255, 224, 224, 255)),
            _ => (
                Color.FromArgb(255, 0, 200, 83),
                Color.FromArgb(255, 26, 26, 46),
                Color.FromArgb(255, 22, 33, 62),
                Color.FromArgb(255, 255, 255, 255)),
        };
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
                CrtIntensity = CrtIntensity,
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