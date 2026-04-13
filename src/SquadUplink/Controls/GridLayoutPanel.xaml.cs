using System.Collections.ObjectModel;
using System.Collections.Specialized;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class GridLayoutPanel : UserControl
{
    public static readonly DependencyProperty SessionsProperty =
        DependencyProperty.Register(
            nameof(Sessions),
            typeof(ObservableCollection<SessionState>),
            typeof(GridLayoutPanel),
            new PropertyMetadata(null, OnSessionsChanged));

    public static readonly DependencyProperty GridSizeProperty =
        DependencyProperty.Register(
            nameof(GridSize),
            typeof(GridSize),
            typeof(GridLayoutPanel),
            new PropertyMetadata(null, OnGridSizeChanged));

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

    public event EventHandler<SessionState>? SessionCloseRequested;
    public event EventHandler<SessionState>? SessionFocusRequested;
    public event EventHandler? LaunchNewRequested;

    public GridLayoutPanel()
    {
        InitializeComponent();
    }

    private static void OnSessionsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not GridLayoutPanel panel) return;

        if (e.OldValue is ObservableCollection<SessionState> oldCol)
        {
            oldCol.CollectionChanged -= panel.Sessions_CollectionChanged;
        }

        if (e.NewValue is ObservableCollection<SessionState> newCol)
        {
            newCol.CollectionChanged += panel.Sessions_CollectionChanged;
        }

        panel.RebuildGrid();
    }

    private static void OnGridSizeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is GridLayoutPanel panel)
        {
            panel.RebuildGrid();
        }
    }

    private void Sessions_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        RebuildGrid();
    }

    private void RebuildGrid()
    {
        RootGrid.Children.Clear();
        RootGrid.RowDefinitions.Clear();
        RootGrid.ColumnDefinitions.Clear();

        var size = GridSize;
        var sessions = Sessions;

        for (int r = 0; r < size.Rows; r++)
        {
            RootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        }
        for (int c = 0; c < size.Columns; c++)
        {
            RootGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        }

        int totalCells = size.Rows * size.Columns;
        int sessionIndex = 0;

        for (int r = 0; r < size.Rows; r++)
        {
            for (int c = 0; c < size.Columns; c++)
            {
                FrameworkElement cell;

                if (sessions is not null && sessionIndex < sessions.Count)
                {
                    var session = sessions[sessionIndex];
                    var terminal = new SessionTerminalControl
                    {
                        Session = session,
                        ShowCloseButton = false,
                        Margin = new Thickness(3),
                    };
                    terminal.DoubleTapped += Terminal_DoubleTapped;
                    terminal.CloseRequested += Terminal_CloseRequested;
                    cell = terminal;
                    sessionIndex++;
                }
                else
                {
                    cell = CreateEmptyCell();
                }

                Grid.SetRow(cell, r);
                Grid.SetColumn(cell, c);
                RootGrid.Children.Add(cell);
            }
        }
    }

    private Border CreateEmptyCell()
    {
        var button = new Button
        {
            Content = "Launch New Session",
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        button.Click += (_, _) => LaunchNewRequested?.Invoke(this, EventArgs.Empty);

        var placeholder = new StackPanel
        {
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center,
            Spacing = 12,
            Children =
            {
                new FontIcon
                {
                    Glyph = "\uE710",
                    FontSize = 28,
                    Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorDisabledBrush"],
                    HorizontalAlignment = HorizontalAlignment.Center,
                },
                new TextBlock
                {
                    Text = "Drop session here",
                    HorizontalAlignment = HorizontalAlignment.Center,
                    Foreground = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["TextFillColorSecondaryBrush"],
                    FontSize = 12,
                },
                button,
            }
        };

        return new Border
        {
            Style = (Style)Application.Current.Resources["LaunchCardStyle"],
            Margin = new Thickness(3),
            Child = placeholder,
        };
    }

    private void Terminal_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if (sender is SessionTerminalControl { Session: { } session })
        {
            SessionFocusRequested?.Invoke(this, session);
        }
    }

    private void Terminal_CloseRequested(object? sender, SessionState session)
    {
        SessionCloseRequested?.Invoke(this, session);
    }
}
