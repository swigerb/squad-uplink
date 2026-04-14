using Microsoft.Graphics.Canvas.UI.Xaml;
using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using System.Numerics;

namespace SquadUplink.Controls;

public sealed partial class CrtEffectOverlay : UserControl
{
    public static readonly DependencyProperty IsEffectEnabledProperty =
        DependencyProperty.Register(nameof(IsEffectEnabled), typeof(bool),
            typeof(CrtEffectOverlay), new PropertyMetadata(false, OnEnabledChanged));

    public static readonly DependencyProperty IntensityProperty =
        DependencyProperty.Register(nameof(Intensity), typeof(double),
            typeof(CrtEffectOverlay), new PropertyMetadata(70.0, OnIntensityChanged));

    public bool IsEffectEnabled
    {
        get => (bool)GetValue(IsEffectEnabledProperty);
        set => SetValue(IsEffectEnabledProperty, value);
    }

    public double Intensity
    {
        get => (double)GetValue(IntensityProperty);
        set => SetValue(IntensityProperty, value);
    }

    private Visibility _effectVisibility = Visibility.Collapsed;
    public Visibility EffectVisibility
    {
        get => _effectVisibility;
        private set { _effectVisibility = value; Bindings.Update(); }
    }

    private DispatcherTimer? _flickerTimer;
    private float _flickerOpacity = 1.0f;
    private readonly Random _rng = new();

    public CrtEffectOverlay()
    {
        InitializeComponent();
    }

    private static void OnEnabledChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is CrtEffectOverlay overlay)
        {
            var enabled = (bool)e.NewValue;
            overlay.EffectVisibility = enabled ? Visibility.Visible : Visibility.Collapsed;
            if (enabled)
                overlay.StartFlicker();
            else
                overlay.StopFlicker();
        }
    }

    private static void OnIntensityChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is CrtEffectOverlay overlay)
            overlay.EffectCanvas?.Invalidate();
    }

    private void StartFlicker()
    {
        if (_flickerTimer is not null) return;
        _flickerTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(33) };
        _flickerTimer.Tick += (_, _) =>
        {
            _flickerOpacity = 0.95f + (float)_rng.NextDouble() * 0.05f;
            EffectCanvas?.Invalidate();
        };
        _flickerTimer.Start();
    }

    private void StopFlicker()
    {
        _flickerTimer?.Stop();
        _flickerTimer = null;
    }

    private void EffectCanvas_Draw(CanvasControl sender, CanvasDrawEventArgs args)
    {
        var ds = args.DrawingSession;
        var width = (float)sender.ActualWidth;
        var height = (float)sender.ActualHeight;
        var intensity = (float)(Intensity / 100.0);

        if (width <= 0 || height <= 0) return;

        ds.Transform = Matrix3x2.Identity;

        // Scan lines
        var scanLineAlpha = (byte)(40 * intensity * _flickerOpacity);
        var scanLineColor = ColorHelper.FromArgb(scanLineAlpha, 0, 0, 0);

        for (float y = 0; y < height; y += 3)
        {
            ds.DrawLine(0, y, width, y, scanLineColor, 1.0f);
        }

        // Vignette-style edge darkening
        var vignetteAlpha = (byte)(30 * intensity);
        var vignetteColor = ColorHelper.FromArgb(vignetteAlpha, 0, 0, 0);

        ds.FillRectangle(0, 0, width, 20 * intensity, vignetteColor);
        ds.FillRectangle(0, height - 20 * intensity, width, 20 * intensity, vignetteColor);
        ds.FillRectangle(0, 0, 20 * intensity, height, vignetteColor);
        ds.FillRectangle(width - 20 * intensity, 0, 20 * intensity, height, vignetteColor);

        // Subtle green tint overlay
        var tintAlpha = (byte)(8 * intensity * _flickerOpacity);
        var tintColor = ColorHelper.FromArgb(tintAlpha, 18, 255, 128);
        ds.FillRectangle(0, 0, width, height, tintColor);
    }
}
