using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Contracts;
using SquadUplink.ViewModels;
using SquadUplink.Views;
using Windows.System;

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

    // --- Keyboard Accelerator Handlers ---

    private DashboardPage? GetDashboardPage()
    {
        return ContentFrame.Content as DashboardPage;
    }

    private void NextSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.SelectNextSession();
    }

    private void PreviousSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.SelectPreviousSession();
    }

    private void JumpToSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        // Map Number1..Number9 to index 0..8
        var index = sender.Key switch
        {
            VirtualKey.Number1 => 0,
            VirtualKey.Number2 => 1,
            VirtualKey.Number3 => 2,
            VirtualKey.Number4 => 3,
            VirtualKey.Number5 => 4,
            VirtualKey.Number6 => 5,
            VirtualKey.Number7 => 6,
            VirtualKey.Number8 => 7,
            VirtualKey.Number9 => 8,
            _ => -1
        };
        if (index >= 0)
        {
            GetDashboardPage()?.LayoutControl.SelectSessionByIndex(index);
        }
    }

    private void LaunchNewSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        var dashboard = GetDashboardPage();
        dashboard?.ViewModel.LaunchSessionCommand.Execute(null);
    }

    private void CloseCurrentSession_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        GetDashboardPage()?.LayoutControl.CloseCurrentSession();
    }

    private void ToggleFocusedMode_Invoked(KeyboardAccelerator sender, KeyboardAcceleratorInvokedEventArgs args)
    {
        args.Handled = true;
        var dashboard = GetDashboardPage();
        dashboard?.ViewModel.ToggleFocusedModeCommand.Execute(null);
    }
}
