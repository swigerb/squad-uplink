using Microsoft.UI.Xaml;
using Serilog;
using SquadUplink.Contracts;

namespace SquadUplink.Services;

public class ThemeService : IThemeService
{
    private static readonly string[] s_themes =
    [
        "FluentLight",
        "FluentDark",
        "AppleIIe",
        "C64",
        "PipBoy"
    ];

    private static readonly Dictionary<string, string> s_themeResourcePaths = new()
    {
        ["FluentLight"] = "ms-appx:///Themes/Fluent.xaml",
        ["FluentDark"] = "ms-appx:///Themes/Fluent.xaml",
        ["AppleIIe"] = "ms-appx:///Themes/AppleIIe.xaml",
        ["C64"] = "ms-appx:///Themes/C64.xaml",
        ["PipBoy"] = "ms-appx:///Themes/PipBoy.xaml",
    };

    public string CurrentThemeId { get; private set; } = "FluentDark";

    public IReadOnlyList<string> AvailableThemes => s_themes;

    public event Action<string>? ThemeChanged;

    public void ApplyTheme(string themeId)
    {
        if (!s_themes.Contains(themeId))
        {
            Log.Warning("Unknown theme {ThemeId}, ignoring", themeId);
            return;
        }

        CurrentThemeId = themeId;
        Log.Information("Theme changed to {ThemeId}", themeId);

        try
        {
            var app = Application.Current;
            if (app?.Resources?.MergedDictionaries is { } merged)
            {
                // Remove existing custom theme dictionaries (keep XamlControlsResources at index 0)
                while (merged.Count > 1)
                    merged.RemoveAt(merged.Count - 1);

                // Add the base Fluent dictionary
                merged.Add(new ResourceDictionary { Source = new Uri("ms-appx:///Themes/Fluent.xaml") });

                // For retro themes, also add the RetroBase + specific theme
                if (themeId is "AppleIIe" or "C64" or "PipBoy")
                {
                    merged.Add(new ResourceDictionary { Source = new Uri("ms-appx:///Themes/RetroBase.xaml") });

                    if (s_themeResourcePaths.TryGetValue(themeId, out var path))
                        merged.Add(new ResourceDictionary { Source = new Uri(path) });
                }

                // Set light/dark mode on the root element
                if (app is { } winApp)
                {
                    var requestedTheme = themeId switch
                    {
                        "FluentLight" => ElementTheme.Light,
                        _ => ElementTheme.Dark,
                    };

                    // Apply to any active window's root content
                    if (winApp is SquadUplink.App uplinkApp && uplinkApp.MainWindow?.Content is FrameworkElement root)
                    {
                        root.RequestedTheme = requestedTheme;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to apply theme resources for {ThemeId}", themeId);
        }

        ThemeChanged?.Invoke(themeId);
    }
}
