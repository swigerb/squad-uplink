using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Contracts;
using SquadUplink.Views;

namespace SquadUplink;

public sealed partial class MainWindow : Window
{
    private readonly ISessionManager _sessionManager;
    private int _sessionCount;
    private string _statusMessage = "Scanning for sessions...";

    public int SessionCount
    {
        get => _sessionCount;
        set
        {
            if (_sessionCount != value)
            {
                _sessionCount = value;
                Bindings.Update();
            }
        }
    }

    public string StatusMessage
    {
        get => _statusMessage;
        set
        {
            if (_statusMessage != value)
            {
                _statusMessage = value;
                Bindings.Update();
            }
        }
    }

    public MainWindow()
    {
        InitializeComponent();

        // Mica backdrop for modern Windows 11 feel
        SystemBackdrop = new MicaBackdrop();

        // Custom title bar
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        _sessionManager = App.Services.GetRequiredService<ISessionManager>();
        _sessionManager.Sessions.CollectionChanged += (_, _) => UpdateStatus();

        // Navigate to Dashboard on startup
        ContentFrame.Navigate(typeof(DashboardPage));
        NavView.SelectedItem = NavView.MenuItems[0];

        UpdateStatus();
    }

    private void NavView_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.IsSettingsSelected)
        {
            ContentFrame.Navigate(typeof(SettingsPage));
            return;
        }

        if (args.SelectedItemContainer is NavigationViewItem item)
        {
            var tag = item.Tag?.ToString();
            var pageType = tag switch
            {
                "Dashboard" => typeof(DashboardPage),
                "Sessions" => typeof(SessionPage),
                _ => typeof(DashboardPage)
            };
            ContentFrame.Navigate(pageType);
        }
    }

    private void UpdateStatus()
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            var count = _sessionManager.Sessions.Count;
            SessionCount = count;
            StatusMessage = count == 0
                ? "Scanning for sessions..."
                : $"{count} session{(count != 1 ? "s" : "")} active";
            FooterStatusText.Text = StatusMessage;
        });
    }
}
