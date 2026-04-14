using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Windows.Graphics;

namespace SquadUplink;

/// <summary>
/// Borderless splash window shown during app startup.
/// Displays branding with animations while services initialize.
/// </summary>
public sealed partial class SplashWindow : Window
{
    private const int SplashWidth = 400;
    private const int SplashHeight = 300;

    public SplashWindow()
    {
        this.InitializeComponent();
        ExtendsContentIntoTitleBar = true;
        ConfigureWindow();

        var version = typeof(SplashWindow).Assembly.GetName().Version;
        VersionText.Text = version is not null ? $"v{version.ToString(3)}" : "";
    }

    /// <summary>
    /// Updates the splash status text on the UI thread.
    /// </summary>
    public void UpdateStatus(string message)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            LoadingText.Text = message;
        });
    }

    private void ConfigureWindow()
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWindow = AppWindow.GetFromWindowId(windowId);

        appWindow.Resize(new SizeInt32(SplashWidth, SplashHeight));

        // Center on primary display
        var displayArea = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Primary);
        var centerX = (displayArea.WorkArea.Width - SplashWidth) / 2;
        var centerY = (displayArea.WorkArea.Height - SplashHeight) / 2;
        appWindow.Move(new PointInt32(centerX, centerY));

        // Borderless, non-resizable splash
        if (appWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsResizable = false;
            presenter.IsMaximizable = false;
            presenter.IsMinimizable = false;
            presenter.SetBorderAndTitleBar(false, false);
        }
    }

    private void RootGrid_Loaded(object sender, RoutedEventArgs e)
    {
        PulseAnimation.Begin();
        FadeAnimation.Begin();
    }
}
