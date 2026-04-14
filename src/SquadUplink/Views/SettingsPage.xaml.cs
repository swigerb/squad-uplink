using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Serilog;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    private readonly StackPanel[] _sections;

    public SettingsPage()
    {
        ViewModel = App.Services.GetRequiredService<SettingsViewModel>();
        InitializeComponent();
        _sections = [AppearancePanel, ScanningPanel, LaunchingPanel,
                     SystemTrayPanel, AudioPanel, LogsPanel, AboutPanel];
        Log.Debug("SettingsPage initialized");
    }

    private void SettingsNav_Loaded(object sender, RoutedEventArgs e)
    {
        SettingsNav.SelectedItem = SettingsNav.MenuItems[0];
    }

    private void SettingsNav_SelectionChanged(NavigationView sender,
        NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is NavigationViewItem item)
        {
            ShowSection(item.Tag?.ToString() ?? "Appearance");
        }
    }

    private void ShowSection(string tag)
    {
        foreach (var section in _sections)
            section.Visibility = Visibility.Collapsed;

        var active = tag switch
        {
            "Appearance" => AppearancePanel,
            "Scanning" => ScanningPanel,
            "Launching" => LaunchingPanel,
            "SystemTray" => SystemTrayPanel,
            "Audio" => AudioPanel,
            "Logs" => LogsPanel,
            "About" => AboutPanel,
            _ => AppearancePanel
        };
        active.Visibility = Visibility.Visible;
    }
}
