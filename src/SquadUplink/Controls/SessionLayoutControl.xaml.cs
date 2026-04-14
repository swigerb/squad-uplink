using System.Collections.ObjectModel;
using System.Collections.Specialized;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Shapes;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class SessionLayoutControl : UserControl
{
    public static readonly DependencyProperty LayoutModeProperty =
        DependencyProperty.Register(
            nameof(LayoutMode),
            typeof(LayoutMode),
            typeof(SessionLayoutControl),
            new PropertyMetadata(Models.LayoutMode.Tabs, OnLayoutModeChanged));

    public static readonly DependencyProperty SessionsProperty =
        DependencyProperty.Register(
            nameof(Sessions),
            typeof(ObservableCollection<SessionState>),
            typeof(SessionLayoutControl),
            new PropertyMetadata(null, OnSessionsChanged));

    public static readonly DependencyProperty GridSizeProperty =
        DependencyProperty.Register(
            nameof(GridSize),
            typeof(GridSize),
            typeof(SessionLayoutControl),
            new PropertyMetadata(null, OnGridSizeChanged));

    public static readonly DependencyProperty SelectedSessionIndexProperty =
        DependencyProperty.Register(
            nameof(SelectedSessionIndex),
            typeof(int),
            typeof(SessionLayoutControl),
            new PropertyMetadata(-1, OnSelectedSessionIndexChanged));

    public LayoutMode LayoutMode
    {
        get => (LayoutMode)GetValue(LayoutModeProperty);
        set => SetValue(LayoutModeProperty, value);
    }

    public ObservableCollection<SessionState>? Sessions
    {
        get => (ObservableCollection<SessionState>?)GetValue(SessionsProperty);
        set => SetValue(SessionsProperty, value);
    }

    public GridSize GridSize
    {
        get => GetValue(GridSizeProperty) as GridSize ?? Models.GridSize.Default;
        set => SetValue(GridSizeProperty, value);
    }

    public int SelectedSessionIndex
    {
        get => (int)GetValue(SelectedSessionIndexProperty);
        set => SetValue(SelectedSessionIndexProperty, value);
    }

    public event EventHandler<SessionState>? SessionCloseRequested;
    public event EventHandler? LaunchNewRequested;
    public event EventHandler<SessionState>? SessionFocusRequested;
    public event EventHandler<int>? SelectedIndexChanged;

    public SessionLayoutControl()
    {
        InitializeComponent();
        UpdateLayoutVisibility();
    }

    private static void OnLayoutModeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SessionLayoutControl control)
        {
            control.UpdateLayoutVisibility();
        }
    }

    private static void OnSessionsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not SessionLayoutControl control) return;

        if (e.OldValue is ObservableCollection<SessionState> oldCol)
        {
            oldCol.CollectionChanged -= control.Sessions_CollectionChanged;
        }

        if (e.NewValue is ObservableCollection<SessionState> newCol)
        {
            newCol.CollectionChanged += control.Sessions_CollectionChanged;
        }

        control.GridPanel.Sessions = control.Sessions;
        control.RebuildTabs();
    }

    private static void OnGridSizeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SessionLayoutControl control)
        {
            control.GridPanel.GridSize = control.GridSize;
        }
    }

    private static void OnSelectedSessionIndexChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SessionLayoutControl control && e.NewValue is int index)
        {
            control.SyncTabSelection(index);
        }
    }

    private void Sessions_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        RebuildTabs();
    }

    private void UpdateLayoutVisibility()
    {
        var mode = LayoutMode;
        SessionTabView.Visibility = mode == LayoutMode.Tabs ? Visibility.Visible : Visibility.Collapsed;
        GridPanel.Visibility = mode == LayoutMode.Grid ? Visibility.Visible : Visibility.Collapsed;

        if (mode == LayoutMode.Tabs)
        {
            RebuildTabs();
        }
    }

    private void RebuildTabs()
    {
        if (LayoutMode != LayoutMode.Tabs) return;

        var sessions = Sessions;
        if (sessions is null) return;

        // Preserve selected index
        var currentIndex = SessionTabView.SelectedIndex;

        SessionTabView.TabItems.Clear();

        foreach (var session in sessions)
        {
            var tab = CreateTab(session);
            SessionTabView.TabItems.Add(tab);
        }

        // Restore selection
        if (SessionTabView.TabItems.Count > 0)
        {
            var idx = Math.Clamp(currentIndex, 0, SessionTabView.TabItems.Count - 1);
            SessionTabView.SelectedIndex = idx;
        }
    }

    private static TabViewItem CreateTab(SessionState session)
    {
        var statusDot = new Ellipse
        {
            Width = 8,
            Height = 8,
            Fill = StatusToBrush(session.Status),
            Margin = new Thickness(0, 0, 6, 0),
            VerticalAlignment = VerticalAlignment.Center,
        };

        var nameBlock = new TextBlock
        {
            Text = session.RepositoryName ?? "Session",
            VerticalAlignment = VerticalAlignment.Center,
            FontSize = 12,
        };

        var headerPanel = new StackPanel
        {
            Orientation = Orientation.Horizontal,
            Children = { statusDot, nameBlock },
        };

        var terminal = new SessionTerminalControl
        {
            Session = session,
            ShowCloseButton = false,
        };

        var tab = new TabViewItem
        {
            Header = headerPanel,
            Content = terminal,
            IsClosable = true,
            Tag = session,
        };

        // Pin support via context menu
        if (session.IsPinned)
        {
            tab.IsClosable = false;
        }

        return tab;
    }

    private static Microsoft.UI.Xaml.Media.SolidColorBrush StatusToBrush(SessionStatus status)
        => Converters.StatusToBrushConverter.StatusToBrush(status);

    private void SyncTabSelection(int index)
    {
        if (LayoutMode == LayoutMode.Tabs
            && index >= 0
            && index < SessionTabView.TabItems.Count)
        {
            SessionTabView.SelectedIndex = index;
        }
    }

    // --- Tab View events ---

    private void SessionTabView_AddTabButtonClick(TabView sender, object args)
    {
        LaunchNewRequested?.Invoke(this, EventArgs.Empty);
    }

    private void SessionTabView_TabCloseRequested(TabView sender, TabViewTabCloseRequestedEventArgs args)
    {
        if (args.Tab.Tag is SessionState session)
        {
            SessionCloseRequested?.Invoke(this, session);
        }
    }

    private void SessionTabView_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var index = SessionTabView.SelectedIndex;
        if (index >= 0)
        {
            SelectedIndexChanged?.Invoke(this, index);
        }
    }

    // --- Grid Panel events ---

    private void GridPanel_SessionCloseRequested(object? sender, SessionState session)
    {
        SessionCloseRequested?.Invoke(this, session);
    }

    private void GridPanel_SessionFocusRequested(object? sender, SessionState session)
    {
        SessionFocusRequested?.Invoke(this, session);
    }

    private void GridPanel_LaunchNewRequested(object? sender, EventArgs e)
    {
        LaunchNewRequested?.Invoke(this, EventArgs.Empty);
    }

    // --- Public API for keyboard navigation ---

    public void SelectNextSession()
    {
        var sessions = Sessions;
        if (sessions is null || sessions.Count == 0) return;

        if (LayoutMode == LayoutMode.Tabs)
        {
            var next = (SessionTabView.SelectedIndex + 1) % SessionTabView.TabItems.Count;
            SessionTabView.SelectedIndex = next;
        }
    }

    public void SelectPreviousSession()
    {
        var sessions = Sessions;
        if (sessions is null || sessions.Count == 0) return;

        if (LayoutMode == LayoutMode.Tabs)
        {
            var count = SessionTabView.TabItems.Count;
            var prev = (SessionTabView.SelectedIndex - 1 + count) % count;
            SessionTabView.SelectedIndex = prev;
        }
    }

    public void SelectSessionByIndex(int index)
    {
        if (LayoutMode == LayoutMode.Tabs
            && index >= 0
            && index < SessionTabView.TabItems.Count)
        {
            SessionTabView.SelectedIndex = index;
        }
    }

    public void CloseCurrentSession()
    {
        if (LayoutMode == LayoutMode.Tabs
            && SessionTabView.SelectedItem is TabViewItem { Tag: SessionState session })
        {
            SessionCloseRequested?.Invoke(this, session);
        }
    }
}
