using System.Collections.Specialized;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Navigation;
using Serilog;
using SquadUplink.Models;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class SessionPage : Page
{
    public SessionViewModel ViewModel { get; }
    private bool _autoScroll = true;

    public SessionPage()
    {
        ViewModel = App.Services.GetRequiredService<SessionViewModel>();
        InitializeComponent();
        Log.Debug("SessionPage initialized");

        // Auto-scroll when new output arrives
        ViewModel.OutputLines.CollectionChanged += OutputLines_CollectionChanged;
    }

    protected override void OnNavigatedTo(NavigationEventArgs e)
    {
        base.OnNavigatedTo(e);
        if (e.Parameter is SessionState session)
        {
            ViewModel.LoadSession(session);
            Log.Debug("SessionPage loaded session {Id}", session.Id);
        }
    }

    protected override void OnNavigatedFrom(NavigationEventArgs e)
    {
        ViewModel.OutputLines.CollectionChanged -= OutputLines_CollectionChanged;
        base.OnNavigatedFrom(e);
    }

    private void OutputLines_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (_autoScroll && e.Action == NotifyCollectionChangedAction.Add)
        {
            OutputScrollViewer.ChangeView(null, OutputScrollViewer.ScrollableHeight, null);
        }
    }

    private void OutputScrollViewer_ViewChanged(object? sender, ScrollViewerViewChangedEventArgs e)
    {
        if (!e.IsIntermediate)
        {
            // Stop auto-scroll when user scrolls up, resume when at bottom
            var atBottom = OutputScrollViewer.VerticalOffset >=
                           OutputScrollViewer.ScrollableHeight - 20;
            _autoScroll = atBottom;
        }
    }
}
