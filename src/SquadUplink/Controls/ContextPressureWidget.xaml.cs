using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;

namespace SquadUplink.Controls;

public sealed partial class ContextPressureWidget : UserControl
{
    public static readonly DependencyProperty CurrentTokensProperty =
        DependencyProperty.Register(nameof(CurrentTokens), typeof(int),
            typeof(ContextPressureWidget), new PropertyMetadata(0, OnChanged));

    public static readonly DependencyProperty MaxTokensProperty =
        DependencyProperty.Register(nameof(MaxTokens), typeof(int),
            typeof(ContextPressureWidget), new PropertyMetadata(128_000, OnChanged));

    public static readonly DependencyProperty ModelNameProperty =
        DependencyProperty.Register(nameof(ModelName), typeof(string),
            typeof(ContextPressureWidget), new PropertyMetadata("", OnChanged));

    public int CurrentTokens
    {
        get => (int)GetValue(CurrentTokensProperty);
        set => SetValue(CurrentTokensProperty, value);
    }

    public int MaxTokens
    {
        get => (int)GetValue(MaxTokensProperty);
        set => SetValue(MaxTokensProperty, value);
    }

    public string ModelName
    {
        get => (string)GetValue(ModelNameProperty);
        set => SetValue(ModelNameProperty, value);
    }

    // Computed bindable properties
    private double _pressurePercent;
    private string _pressureDisplay = "0% of 128K";
    private string _tokenDetailDisplay = "0 / 128,000 tokens";
    private Brush _pressureBrush = GreenBrush;
    private Visibility _warningVisible = Visibility.Collapsed;

    public double PressurePercent { get => _pressurePercent; private set { _pressurePercent = value; Bindings.Update(); } }
    public string PressureDisplay { get => _pressureDisplay; private set { _pressureDisplay = value; Bindings.Update(); } }
    public string TokenDetailDisplay { get => _tokenDetailDisplay; private set { _tokenDetailDisplay = value; Bindings.Update(); } }
    public Brush PressureBrush { get => _pressureBrush; private set { _pressureBrush = value; Bindings.Update(); } }
    public Visibility WarningVisible { get => _warningVisible; private set { _warningVisible = value; Bindings.Update(); } }

    private static SolidColorBrush? _greenBrush;
    private static SolidColorBrush? _yellowBrush;
    private static SolidColorBrush? _redBrush;

    internal static SolidColorBrush GreenBrush => _greenBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83));
    internal static SolidColorBrush YellowBrush => _yellowBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7));
    internal static SolidColorBrush RedBrush => _redBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54));

    public ContextPressureWidget()
    {
        InitializeComponent();
    }

    private static void OnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is ContextPressureWidget w) w.UpdateDisplay();
    }

    private void UpdateDisplay()
    {
        var max = MaxTokens > 0 ? MaxTokens : 128_000;
        var pct = max > 0 ? (double)CurrentTokens / max * 100.0 : 0;
        PressurePercent = Math.Min(pct, 100.0);

        PressureDisplay = $"{pct:F0}% of {FormatTokenCount(max)}";
        TokenDetailDisplay = $"{CurrentTokens:N0} / {max:N0} tokens";
        PressureBrush = GetBrushForPressure(pct);
        WarningVisible = pct >= 80 ? Visibility.Visible : Visibility.Collapsed;
    }

    internal static string FormatTokenCount(int tokens) => tokens switch
    {
        >= 1_000_000 => $"{tokens / 1_000_000.0:F0}M",
        >= 1_000 => $"{tokens / 1_000.0:F0}K",
        _ => tokens.ToString()
    };

    /// <summary>
    /// Green: 0-50%, Yellow: 50-80%, Red: 80-100%
    /// </summary>
    internal static SolidColorBrush GetBrushForPressure(double percent) => percent switch
    {
        < 50 => GreenBrush,
        < 80 => YellowBrush,
        _ => RedBrush
    };
}
