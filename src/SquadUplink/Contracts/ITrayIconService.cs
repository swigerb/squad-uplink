namespace SquadUplink.Contracts;

/// <summary>
/// Manages the system tray (notification area) icon, including animation
/// state and context-menu actions.
/// </summary>
public interface ITrayIconService : IDisposable
{
    /// <summary>Whether the tray icon is currently visible.</summary>
    bool IsVisible { get; }

    /// <summary>Number of active sessions driving the animation state.</summary>
    int ActiveSessionCount { get; set; }

    /// <summary>Show the tray icon in the notification area.</summary>
    void Show();

    /// <summary>Hide the tray icon.</summary>
    void Hide();

    /// <summary>Raised when the user requests the main window to be shown.</summary>
    event Action? ShowWindowRequested;

    /// <summary>Raised when the user clicks "Launch New Session" from the tray menu.</summary>
    event Action? LaunchSessionRequested;

    /// <summary>Raised when the user clicks "Exit" from the tray menu.</summary>
    event Action? ExitRequested;
}
