using System.Collections.Specialized;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class SessionTerminalControl : UserControl
{
    public static readonly DependencyProperty SessionProperty =
        DependencyProperty.Register(
            nameof(Session),
            typeof(SessionState),
            typeof(SessionTerminalControl),
            new PropertyMetadata(null, OnSessionChanged));

    public static readonly DependencyProperty ShowCloseButtonProperty =
        DependencyProperty.Register(
            nameof(ShowCloseButton),
            typeof(bool),
            typeof(SessionTerminalControl),
            new PropertyMetadata(true, OnShowCloseButtonChanged));

    public SessionState? Session
    {
        get => (SessionState?)GetValue(SessionProperty);
        set => SetValue(SessionProperty, value);
    }

    public bool ShowCloseButton
    {
        get => (bool)GetValue(ShowCloseButtonProperty);
        set => SetValue(ShowCloseButtonProperty, value);
    }

    public event EventHandler<SessionState>? CloseRequested;

    private bool _autoScroll = true;

    public SessionTerminalControl()
    {
        InitializeComponent();
    }

    private static void OnSessionChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SessionTerminalControl control)
        {
            // Unsubscribe from old session
            if (e.OldValue is SessionState oldSession)
            {
                oldSession.OutputLines.CollectionChanged -= control.OutputLines_CollectionChanged;
            }

            control.UpdateBinding();

            // Subscribe to new session's output
            if (e.NewValue is SessionState newSession)
            {
                newSession.OutputLines.CollectionChanged += control.OutputLines_CollectionChanged;
            }
        }
    }

    private static void OnShowCloseButtonChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SessionTerminalControl control)
        {
            control.CloseButton.Visibility = (bool)e.NewValue ? Visibility.Visible : Visibility.Collapsed;
        }
    }

    private void OutputLines_CollectionChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        DispatcherQueue?.TryEnqueue(() =>
        {
            UpdateOutputDisplay();
            if (_autoScroll)
            {
                TerminalScrollViewer.ChangeView(null, TerminalScrollViewer.ScrollableHeight, null);
            }
        });
    }

    private void UpdateBinding()
    {
        var session = Session;
        if (session is null)
        {
            PlaceholderPanel.Visibility = Visibility.Visible;
            TerminalScrollViewer.Visibility = Visibility.Collapsed;
            RepoNameText.Text = "—";
            PidText.Text = string.Empty;
            StatusDot.Fill = new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158));
            OutputItemsControl.ItemsSource = null;
            return;
        }

        PlaceholderPanel.Visibility = Visibility.Collapsed;
        TerminalScrollViewer.Visibility = Visibility.Visible;
        RepoNameText.Text = session.RepositoryName ?? "Unknown";
        PidText.Text = $"PID {session.ProcessId}";
        StatusDot.Fill = StatusToBrush(session.Status);
        UpdateOutputDisplay();
    }

    private void UpdateOutputDisplay()
    {
        var session = Session;
        if (session is null) return;
        OutputItemsControl.ItemsSource = session.OutputLines;
    }

    private static SolidColorBrush StatusToBrush(SessionStatus status) => status switch
    {
        SessionStatus.Running => new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83)),
        SessionStatus.Launching => new SolidColorBrush(ColorHelper.FromArgb(255, 33, 150, 243)),
        SessionStatus.Idle => new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7)),
        SessionStatus.Error => new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54)),
        SessionStatus.Completed => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
        SessionStatus.Discovered => new SolidColorBrush(ColorHelper.FromArgb(255, 33, 150, 243)),
        _ => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
    };

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        if (Session is { } session)
        {
            CloseRequested?.Invoke(this, session);
        }
    }
}
