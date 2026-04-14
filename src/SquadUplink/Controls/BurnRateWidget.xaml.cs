using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using System.Collections.ObjectModel;

namespace SquadUplink.Controls;

public sealed partial class BurnRateWidget : UserControl
{
    public static readonly DependencyProperty BurnRatePerHourProperty =
        DependencyProperty.Register(nameof(BurnRatePerHour), typeof(double),
            typeof(BurnRateWidget), new PropertyMetadata(0.0, OnMetricsChanged));

    public static readonly DependencyProperty SessionTotalCostProperty =
        DependencyProperty.Register(nameof(SessionTotalCost), typeof(double),
            typeof(BurnRateWidget), new PropertyMetadata(0.0, OnMetricsChanged));

    public double BurnRatePerHour
    {
        get => (double)GetValue(BurnRatePerHourProperty);
        set => SetValue(BurnRatePerHourProperty, value);
    }

    public double SessionTotalCost
    {
        get => (double)GetValue(SessionTotalCostProperty);
        set => SetValue(SessionTotalCostProperty, value);
    }

    // Bindable computed properties
    private string _burnRateDisplay = "$0.00/hr";
    private string _sessionTotalDisplay = "Session total: $0.00";
    private Brush _burnRateBrush = GreenBrush;

    public string BurnRateDisplay { get => _burnRateDisplay; private set { _burnRateDisplay = value; Bindings.Update(); } }
    public string SessionTotalDisplay { get => _sessionTotalDisplay; private set { _sessionTotalDisplay = value; Bindings.Update(); } }
    public Brush BurnRateBrush { get => _burnRateBrush; private set { _burnRateBrush = value; Bindings.Update(); } }

    // Trend data: last 10 data points as bar heights (0-32 pixels)
    public ObservableCollection<double> TrendHeights { get; } = new();

    private readonly List<double> _trendValues = [];
    private const int MaxTrendPoints = 10;

    // Color brushes (lazy to avoid static ctor issues in non-UI contexts)
    private static SolidColorBrush? _greenBrush;
    private static SolidColorBrush? _yellowBrush;
    private static SolidColorBrush? _redBrush;

    internal static SolidColorBrush GreenBrush => _greenBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83));
    internal static SolidColorBrush YellowBrush => _yellowBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7));
    internal static SolidColorBrush RedBrush => _redBrush ??= new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54));

    public BurnRateWidget()
    {
        InitializeComponent();
    }

    private static void OnMetricsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is BurnRateWidget w) w.UpdateDisplay();
    }

    private void UpdateDisplay()
    {
        BurnRateDisplay = $"${BurnRatePerHour:F2}/hr";
        SessionTotalDisplay = $"Session total: ${SessionTotalCost:F2}";
        BurnRateBrush = GetBrushForRate(BurnRatePerHour);
    }

    /// <summary>Adds a data point to the mini trend line.</summary>
    public void AddTrendPoint(double burnRate)
    {
        _trendValues.Add(burnRate);
        if (_trendValues.Count > MaxTrendPoints)
            _trendValues.RemoveAt(0);

        RebuildTrendBars();
    }

    private void RebuildTrendBars()
    {
        TrendHeights.Clear();
        if (_trendValues.Count == 0) return;

        var max = _trendValues.Max();
        if (max <= 0) max = 1;

        foreach (var v in _trendValues)
        {
            var height = Math.Max(2, v / max * 28);
            TrendHeights.Add(height);
        }
    }

    /// <summary>
    /// Returns the color for a given burn rate.
    /// Green: &lt;$1/hr, Yellow: $1-5/hr, Red: &gt;$5/hr
    /// </summary>
    internal static SolidColorBrush GetBrushForRate(double rate) => rate switch
    {
        < 1.0 => GreenBrush,
        < 5.0 => YellowBrush,
        _ => RedBrush
    };
}
