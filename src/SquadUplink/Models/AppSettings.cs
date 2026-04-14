namespace SquadUplink.Models;

public class AppSettings
{
    public string ThemeId { get; set; } = "FluentDark";
    public int ScanIntervalSeconds { get; set; } = 5;
    public string DefaultWorkingDirectory { get; set; } = string.Empty;
    public bool AudioEnabled { get; set; } = true;
    public bool AutoScanOnStartup { get; set; } = true;
    public bool CrtEffectsEnabled { get; set; }
    public double CrtIntensity { get; set; } = 70;
    public double FontSize { get; set; } = 13;
    public double Volume { get; set; } = 80;
    public string SoundPack { get; set; } = "Fluent";
    public string DefaultModel { get; set; } = "auto";
    public bool AlwaysUseRemote { get; set; }
    public string LayoutMode { get; set; } = "Tabs";
    public string GridSize { get; set; } = "2x2";
    public bool MinimizeToTray { get; set; } = true;

    // Notification preferences
    public bool NotifySessionCompleted { get; set; } = true;
    public bool NotifyPermissionRequest { get; set; } = true;
    public bool NotifyError { get; set; } = true;
    public bool NotifySessionDiscovered { get; set; } = true;
}