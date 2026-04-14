using Microsoft.Extensions.Logging;
using Microsoft.UI.Xaml;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;

namespace SquadUplink.Services;

public class ThemeService : IThemeService
{
    private static readonly string[] s_themes =
    [
        "FluentLight",
        "FluentDark",
        "AppleIIe",
        "C64",
        "PipBoy",
        "MUTHUR",
        "WOPR",
        "Matrix",
        "Win95",
        "LCARS",
        "StarWars"
    ];

    private static readonly Dictionary<string, string> s_themeResourcePaths = new()
    {
        ["FluentLight"] = "ms-appx:///Themes/Fluent.xaml",
        ["FluentDark"] = "ms-appx:///Themes/Fluent.xaml",
        ["AppleIIe"] = "ms-appx:///Themes/AppleIIe.xaml",
        ["C64"] = "ms-appx:///Themes/C64.xaml",
        ["PipBoy"] = "ms-appx:///Themes/PipBoy.xaml",
        ["MUTHUR"] = "ms-appx:///Themes/MUTHUR.xaml",
        ["WOPR"] = "ms-appx:///Themes/WOPR.xaml",
        ["Matrix"] = "ms-appx:///Themes/Matrix.xaml",
        ["Win95"] = "ms-appx:///Themes/Win95.xaml",
        ["LCARS"] = "ms-appx:///Themes/LCARS.xaml",
        ["StarWars"] = "ms-appx:///Themes/StarWars.xaml",
    };

    private readonly IDataService _dataService;
    private readonly ILogger<ThemeService> _logger;

    public string CurrentThemeId { get; private set; } = "FluentDark";

    public IReadOnlyList<string> AvailableThemes => s_themes;

    public event Action<string>? ThemeChanged;

    public ThemeService(IDataService dataService, ILogger<ThemeService> logger)
    {
        _dataService = dataService;
        _logger = logger;
    }

    public async Task LoadSavedThemeAsync()
    {
        try
        {
            var settings = await _dataService.GetSettingsAsync();
            if (s_themes.Contains(settings.ThemeId))
            {
                ApplyTheme(settings.ThemeId);
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load saved theme — using default");
        }
    }

    public void ApplyTheme(string themeId)
    {
        if (!s_themes.Contains(themeId))
        {
            Log.Warning("Unknown theme {ThemeId}, ignoring", themeId);
            return;
        }

        CurrentThemeId = themeId;
        _logger.ThemeChanged(themeId);

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
                if (themeId is "AppleIIe" or "C64" or "PipBoy" or "MUTHUR" or "WOPR" or "Matrix" or "Win95" or "LCARS" or "StarWars")
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

        // Persist theme choice (fire-and-forget)
        _ = PersistThemeAsync(themeId);

        ThemeChanged?.Invoke(themeId);
    }

    private async Task PersistThemeAsync(string themeId)
    {
        try
        {
            var settings = await _dataService.GetSettingsAsync();
            settings.ThemeId = themeId;
            await _dataService.SaveSettingsAsync(settings);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to persist theme choice {ThemeId}", themeId);
        }
    }
}
