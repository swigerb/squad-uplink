using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using Serilog;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = App.Services.GetRequiredService<SettingsViewModel>();
        InitializeComponent();
        Log.Debug("SettingsPage initialized");
    }
}
