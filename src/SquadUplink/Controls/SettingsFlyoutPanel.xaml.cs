using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media.Animation;
using Serilog;
using SquadUplink.ViewModels;

namespace SquadUplink.Controls;

public sealed partial class SettingsFlyoutPanel : UserControl
{
    private const double PanelWidth = 420;

    public SettingsViewModel ViewModel { get; }

    public bool IsOpen => OverlayRoot.Visibility == Visibility.Visible;

    /// <summary>Raised when the panel is dismissed.</summary>
    public event EventHandler? Dismissed;

    public SettingsFlyoutPanel()
    {
        ViewModel = App.Services.GetRequiredService<SettingsViewModel>();
        InitializeComponent();
        Log.Debug("SettingsFlyoutPanel initialized");
    }

    public void Show()
    {
        if (IsOpen) return;

        OverlayRoot.Visibility = Visibility.Visible;
        AnimatePanel(fromX: PanelWidth, toX: 0);
        Log.Debug("Settings flyout opened");
    }

    public void Hide()
    {
        if (!IsOpen) return;

        AnimatePanel(fromX: 0, toX: PanelWidth, onCompleted: () =>
        {
            OverlayRoot.Visibility = Visibility.Collapsed;
            Dismissed?.Invoke(this, EventArgs.Empty);
        });
        Log.Debug("Settings flyout closed");
    }

    public void Toggle()
    {
        if (IsOpen) Hide(); else Show();
    }

    private void AnimatePanel(double fromX, double toX, Action? onCompleted = null)
    {
        var animation = new DoubleAnimation
        {
            From = fromX,
            To = toX,
            Duration = new Duration(TimeSpan.FromMilliseconds(250)),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
        };

        Storyboard.SetTarget(animation, PanelTranslate);
        Storyboard.SetTargetProperty(animation, "X");

        var storyboard = new Storyboard();
        storyboard.Children.Add(animation);

        if (onCompleted is not null)
            storyboard.Completed += (_, _) => onCompleted();

        storyboard.Begin();
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Hide();

    private void Backdrop_Tapped(object sender, TappedRoutedEventArgs e) => Hide();

    /// <summary>
    /// Handles Escape key to dismiss. Called from MainWindow.
    /// </summary>
    internal void HandleKeyDown(Windows.System.VirtualKey key)
    {
        if (key == Windows.System.VirtualKey.Escape)
            Hide();
    }
}
