using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace SquadUplink.Controls;

public sealed partial class TimelineScrubber : UserControl
{
    public static readonly DependencyProperty TotalDurationSecondsProperty =
        DependencyProperty.Register(nameof(TotalDurationSeconds), typeof(int),
            typeof(TimelineScrubber), new PropertyMetadata(3600, OnDurationChanged));

    public int TotalDurationSeconds
    {
        get => (int)GetValue(TotalDurationSecondsProperty);
        set => SetValue(TotalDurationSecondsProperty, value);
    }

    // Bindable properties
    private double _playheadPosition; // start at 0 — no placeholder offset
    private string _durationDisplay = "01:00:00";
    private double _playheadWidth = 0;
    private Thickness _playheadMargin = new(0);
    private string _timeMarker0 = "00:00";
    private string _timeMarker1 = "00:15";
    private string _timeMarker2 = "00:30";
    private string _timeMarker3 = "00:45";
    private string _timeMarker4 = "01:00";

    public double PlayheadPosition
    {
        get => _playheadPosition;
        set { _playheadPosition = value; UpdatePlayhead(); Bindings.Update(); }
    }

    public string DurationDisplay { get => _durationDisplay; private set { _durationDisplay = value; Bindings.Update(); } }
    public double PlayheadWidth { get => _playheadWidth; private set { _playheadWidth = value; Bindings.Update(); } }
    public Thickness PlayheadMargin { get => _playheadMargin; private set { _playheadMargin = value; Bindings.Update(); } }
    public string TimeMarker0 { get => _timeMarker0; private set { _timeMarker0 = value; Bindings.Update(); } }
    public string TimeMarker1 { get => _timeMarker1; private set { _timeMarker1 = value; Bindings.Update(); } }
    public string TimeMarker2 { get => _timeMarker2; private set { _timeMarker2 = value; Bindings.Update(); } }
    public string TimeMarker3 { get => _timeMarker3; private set { _timeMarker3 = value; Bindings.Update(); } }
    public string TimeMarker4 { get => _timeMarker4; private set { _timeMarker4 = value; Bindings.Update(); } }

    public TimelineScrubber()
    {
        InitializeComponent();
        UpdateTimeMarkers();
        UpdatePlayhead();
    }

    private static void OnDurationChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is TimelineScrubber ctrl)
        {
            ctrl.UpdateTimeMarkers();
            ctrl.UpdatePlayhead();
        }
    }

    private int _cachedTotalSeconds = -1;

    private void UpdateTimeMarkers()
    {
        var total = TotalDurationSeconds;
        if (total == _cachedTotalSeconds) return;
        _cachedTotalSeconds = total;
        DurationDisplay = FormatTime(total);
        TimeMarker0 = FormatTime(0);
        TimeMarker1 = FormatTime(total / 4);
        TimeMarker2 = FormatTime(total / 2);
        TimeMarker3 = FormatTime(total * 3 / 4);
        TimeMarker4 = FormatTime(total);
    }

    private void UpdatePlayhead()
    {
        // Calculate width based on the track width (approximate)
        var trackWidth = Math.Max(ActualWidth - 24, 200); // padding offset
        PlayheadWidth = trackWidth * (PlayheadPosition / 100.0);
        PlayheadMargin = new Thickness(trackWidth * (PlayheadPosition / 100.0) - 6, 0, 0, 0);
    }

    /// <summary>
    /// Formats seconds into mm:ss or hh:mm:ss. Exposed for testing.
    /// </summary>
    internal static string FormatTime(int totalSeconds)
    {
        var ts = TimeSpan.FromSeconds(Math.Max(0, totalSeconds));
        return ts.TotalHours >= 1
            ? ts.ToString(@"hh\:mm\:ss")
            : ts.ToString(@"mm\:ss");
    }
}
