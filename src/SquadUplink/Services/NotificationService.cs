using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public class NotificationService : INotificationService
{
    private readonly IDataService _dataService;
    private bool _initialized;

    public NotificationService(IDataService dataService)
    {
        _dataService = dataService;
    }

    public Task InitializeAsync()
    {
        try
        {
            // Register Windows App Notification manager
            // In production this calls AppNotificationManager.Default.Register()
            _initialized = true;
            Log.Information("Notification service initialized");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to initialize notification service — notifications disabled");
            _initialized = false;
        }
        return Task.CompletedTask;
    }

    public async Task ShowSessionCompletedAsync(string repoName, TimeSpan duration)
    {
        if (!_initialized) return;

        var settings = await _dataService.GetSettingsAsync();
        if (!settings.NotifySessionCompleted) return;

        var durationText = duration.TotalMinutes < 1
            ? $"{(int)duration.TotalSeconds}s"
            : duration.TotalHours < 1
                ? $"{(int)duration.TotalMinutes}m"
                : $"{(int)duration.TotalHours}h {(int)(duration.TotalMinutes % 60)}m";

        var title = "Session Completed";
        var body = $"Session in {repoName} finished after {durationText}";
        SendToast(title, body);
    }

    public async Task ShowPermissionRequestAsync(string repoName, string sessionId)
    {
        if (!_initialized) return;

        var settings = await _dataService.GetSettingsAsync();
        if (!settings.NotifyPermissionRequest) return;

        var title = "Permission Required";
        var body = $"Copilot needs your approval in {repoName}";
        SendToast(title, body, sessionId);
    }

    public async Task ShowErrorAsync(string repoName, string errorMessage)
    {
        if (!_initialized) return;

        var settings = await _dataService.GetSettingsAsync();
        if (!settings.NotifyError) return;

        var title = "Session Error";
        var body = $"Session in {repoName} encountered an error";
        SendToast(title, body);
    }

    public async Task ShowSessionDiscoveredAsync(string repoName, string sessionId)
    {
        if (!_initialized) return;

        var settings = await _dataService.GetSettingsAsync();
        if (!settings.NotifySessionDiscovered) return;

        var title = "Session Discovered";
        var body = $"Found new Copilot session in {repoName}";
        SendToast(title, body, sessionId);
    }

    private static void SendToast(string title, string body, string? launchArgs = null)
    {
        try
        {
            // Build XML payload for Windows App SDK toast notification
            // In production: var notification = new AppNotification(xml); AppNotificationManager.Default.Show(notification);
            Log.Information("Toast notification: [{Title}] {Body}", title, body);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to show toast notification");
        }
    }
}