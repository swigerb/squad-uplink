using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Serilog;
using SquadUplink.Controls;
using SquadUplink.Models;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class DashboardPage : Page
{
    public DashboardViewModel ViewModel { get; }

    public DashboardPage()
    {
        ViewModel = App.Services.GetRequiredService<DashboardViewModel>();
        ViewModel.LaunchDialogRequested += ShowLaunchDialogAsync;
        InitializeComponent();
        Log.Debug("DashboardPage initialized");
    }

    // Helper functions for x:Bind in DataTemplates
    public static Thickness GetIndentPadding(int indentLevel)
        => new(indentLevel * 16, 0, 0, 0);

    public static Windows.UI.Text.FontWeight GetFontWeight(bool isHeader)
        => isHeader ? FontWeights.SemiBold : FontWeights.Normal;

    public static double GetFontSize(bool isHeader)
        => isHeader ? 13 : 12;

    // SessionLayoutControl event handlers
    private void SessionLayout_SessionCloseRequested(object? sender, SessionState session)
    {
        ViewModel.CloseSessionCommand.Execute(session);
    }

    private void SessionLayout_LaunchNewRequested(object? sender, EventArgs e)
    {
        ViewModel.LaunchSessionCommand.Execute(null);
    }

    private void SessionLayout_SessionFocusRequested(object? sender, SessionState session)
    {
        ViewModel.OpenSessionCommand.Execute(session);
    }

    // Public access for keyboard shortcut routing from MainWindow
    internal SessionLayoutControl LayoutControl => SessionLayout;

    // SquadTreeControl selection handler
    private void SquadTreeView_SquadSelected(object? sender, SquadInfo squad)
    {
        ViewModel.SelectedSquad = squad;
    }

    // Session card click handler
    private void SessionCard_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (sender is Border { Tag: SessionState session })
        {
            ViewModel.OpenSessionCommand.Execute(session);
        }
    }

    // Launch new session card click
    private void LaunchCard_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        ViewModel.LaunchSessionCommand.Execute(null);
    }

    // Show launch dialog
    private async Task ShowLaunchDialogAsync()
    {
        var dialog = new LaunchSessionDialog { XamlRoot = this.XamlRoot };

        // Load recent directories from history
        var recentDirs = ViewModel.RecentSessions
            .Select(s => s.WorkingDirectory)
            .Where(d => !string.IsNullOrEmpty(d))
            .Distinct()
            .Take(10);
        dialog.LoadRecentDirectories(recentDirs);

        // Set default directory
        var defaultDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        dialog.SetDefaultDirectory(defaultDir);

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            var options = dialog.GetLaunchOptions();
            await ViewModel.LaunchWithOptionsAsync(options);
        }
    }
}
