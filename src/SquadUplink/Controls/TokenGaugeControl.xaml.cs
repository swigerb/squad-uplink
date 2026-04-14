using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class TokenGaugeControl : UserControl
{
    // Dependency properties
    public static readonly DependencyProperty CurrentTokensProperty =
        DependencyProperty.Register(nameof(CurrentTokens), typeof(int),
            typeof(TokenGaugeControl), new PropertyMetadata(0, OnTokensChanged));

    public static readonly DependencyProperty MaxTokensProperty =
        DependencyProperty.Register(nameof(MaxTokens), typeof(int),
            typeof(TokenGaugeControl), new PropertyMetadata(0, OnTokensChanged));

    public static readonly DependencyProperty EstimatedCostProperty =
        DependencyProperty.Register(nameof(EstimatedCost), typeof(double),
            typeof(TokenGaugeControl), new PropertyMetadata(0.0, OnCostChanged));

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

    public double EstimatedCost
    {
        get => (double)GetValue(EstimatedCostProperty);
        set => SetValue(EstimatedCostProperty, value);
    }

    // Computed bindable properties
    private double _percentage;
    private string _percentageDisplay = "0%";
    private string _costDisplay = "$0.00 est.";
    private Brush _gaugeBrush = new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83)); // green

    public double Percentage { get => _percentage; private set { _percentage = value; Bindings.Update(); } }
    public string PercentageDisplay { get => _percentageDisplay; private set { _percentageDisplay = value; Bindings.Update(); } }
    public string CostDisplay { get => _costDisplay; private set { _costDisplay = value; Bindings.Update(); } }
    public Brush GaugeBrush { get => _gaugeBrush; private set { _gaugeBrush = value; Bindings.Update(); } }

    // Color constants — lazily initialized to avoid static constructor failures in non-UI contexts
    private static SolidColorBrush? _greenBrush;
    private static SolidColorBrush? _yellowBrush;
    private static SolidColorBrush? _redBrush;

    private static SolidColorBrush GreenBrush => _greenBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83));
    private static SolidColorBrush YellowBrush => _yellowBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7));
    private static SolidColorBrush RedBrush => _redBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54));

    public TokenGaugeControl()
    {
        InitializeComponent();
        // Start with empty state — real data will be bound when available
    }

    private static void OnTokensChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TokenGaugeControl ctrl)
            ctrl.UpdateGauge();
    }

    private static void OnCostChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TokenGaugeControl ctrl)
            ctrl.CostDisplay = $"${ctrl.EstimatedCost:F2} est.";
    }

    private void UpdateGauge()
    {
        var usage = new TokenUsage(CurrentTokens, MaxTokens, (decimal)EstimatedCost);
        Percentage = usage.Percentage;
        PercentageDisplay = usage.PercentageDisplay;
        CostDisplay = usage.CostDisplay;
        GaugeBrush = GetBrushForTier(usage.Tier);
    }

    /// <summary>
    /// Returns the appropriate color brush for a token usage tier.
    /// Exposed as internal static for testability.
    /// </summary>
    internal static SolidColorBrush GetBrushForTier(TokenTier tier) => tier switch
    {
        TokenTier.Green => GreenBrush,
        TokenTier.Yellow => YellowBrush,
        TokenTier.Red => RedBrush,
        _ => GreenBrush
    };
}
