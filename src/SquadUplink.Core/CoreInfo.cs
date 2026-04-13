namespace SquadUplink.Core;

/// <summary>
/// Shared logic library for Squad Uplink — no WinUI dependency.
/// Cross-cutting concerns like parsing, validation, and data models
/// that may be shared between the main app and test projects.
/// </summary>
public static class CoreInfo
{
    public const string AppName = "Squad Uplink";
    public const string AppId = "squad-uplink";

    public static string GetVersion()
        => typeof(CoreInfo).Assembly.GetName().Version?.ToString() ?? "0.0.0";
}
