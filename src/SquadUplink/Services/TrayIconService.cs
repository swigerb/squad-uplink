using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using H.NotifyIcon;
using H.NotifyIcon.Core;
using Microsoft.UI.Dispatching;
using Serilog;
using SquadUplink.Contracts;

namespace SquadUplink.Services;

/// <summary>
/// Manages the Windows system tray icon with animated state for active sessions.
/// Uses H.NotifyIcon.WinUI as the Shell_NotifyIcon wrapper.
/// </summary>
public sealed class TrayIconService : ITrayIconService
{
    private TrayIconWithContextMenu? _trayIcon;
    private readonly DispatcherQueue? _dispatcherQueue;
    private readonly System.Timers.Timer _animationTimer;
    private int _animationFrame;
    private int _activeSessionCount;
    private bool _isVisible;
    private bool _disposed;

    // 16×16 icons generated at runtime
    private Icon? _idleIcon;
    private readonly Icon?[] _activeIcons = new Icon?[4];

    private const int IconSize = 16;
    private const double AnimationIntervalMs = 300;

    public bool IsVisible => _isVisible;

    public int ActiveSessionCount
    {
        get => _activeSessionCount;
        set
        {
            var previous = _activeSessionCount;
            _activeSessionCount = value;
            if (previous == 0 && value > 0)
                StartAnimation();
            else if (previous > 0 && value == 0)
                StopAnimation();
            UpdateTooltip();
        }
    }

    public event Action? ShowWindowRequested;
    public event Action? LaunchSessionRequested;
    public event Action? ExitRequested;

    public TrayIconService() : this(DispatcherQueue.GetForCurrentThread()) { }

    /// <summary>
    /// Creates a TrayIconService. Pass null dispatcherQueue for unit-test scenarios.
    /// </summary>
    internal TrayIconService(DispatcherQueue? dispatcherQueue)
    {
        _dispatcherQueue = dispatcherQueue;
        _animationTimer = new System.Timers.Timer(AnimationIntervalMs);
        _animationTimer.Elapsed += OnAnimationTick;
        _animationTimer.AutoReset = true;

        GenerateIcons();
    }

    public void Show()
    {
        if (_disposed) return;
        if (_trayIcon is not null)
        {
            _isVisible = true;
            return;
        }

        try
        {
            _trayIcon = new TrayIconWithContextMenu
            {
                Icon = (_idleIcon ?? SystemIcons.Application).Handle,
                ToolTip = "Squad Uplink — No active sessions",
                ContextMenu = BuildContextMenu(),
            };
            _trayIcon.MessageWindow.MouseEventReceived += OnTrayMouseEvent;
            _trayIcon.Create();

            _isVisible = true;
            Log.Debug("Tray icon created");
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to create tray icon — tray feature unavailable");
        }
    }

    public void Hide()
    {
        if (_disposed || _trayIcon is null) return;
        StopAnimation();

        try
        {
            _trayIcon.Remove();
            _trayIcon.Dispose();
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Error removing tray icon");
        }

        _trayIcon = null;
        _isVisible = false;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        _animationTimer.Stop();
        _animationTimer.Dispose();

        Hide();
        DisposeIcons();
    }

    // ── Icon Generation ─────────────────────────────────────────

    /// <summary>
    /// Generates small 16×16 icons programmatically using System.Drawing.
    /// Idle = gray radar, Active = 4 frames with rotating green sweep.
    /// </summary>
    internal void GenerateIcons()
    {
        _idleIcon = CreateRadarIcon(Color.FromArgb(140, 140, 140), -1);

        for (var i = 0; i < 4; i++)
            _activeIcons[i] = CreateRadarIcon(Color.FromArgb(0, 200, 83), i);
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr handle);

    internal static Icon CreateRadarIcon(Color accentColor, int sweepQuadrant)
    {
        using var bmp = new Bitmap(IconSize, IconSize, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            // Outer ring
            using var ringPen = new Pen(accentColor, 1.5f);
            g.DrawEllipse(ringPen, 1, 1, IconSize - 3, IconSize - 3);

            // Inner ring
            using var innerPen = new Pen(Color.FromArgb(100, accentColor), 1f);
            g.DrawEllipse(innerPen, 4, 4, IconSize - 9, IconSize - 9);

            // Center dot
            using var dotBrush = new SolidBrush(accentColor);
            g.FillEllipse(dotBrush, 6, 6, 3, 3);

            // Sweep arc (active only)
            if (sweepQuadrant >= 0)
            {
                var startAngle = sweepQuadrant * 90 - 90;
                using var sweepBrush = new SolidBrush(Color.FromArgb(80, accentColor));
                g.FillPie(sweepBrush, 1, 1, IconSize - 3, IconSize - 3, startAngle, 90);
            }
        }

        // Clone the icon so we own the handle, then destroy the original GDI handle
        var hicon = bmp.GetHicon();
        var icon = (Icon)Icon.FromHandle(hicon).Clone();
        DestroyIcon(hicon);
        return icon;
    }

    private void DisposeIcons()
    {
        _idleIcon?.Dispose();
        _idleIcon = null;
        for (var i = 0; i < _activeIcons.Length; i++)
        {
            _activeIcons[i]?.Dispose();
            _activeIcons[i] = null;
        }
    }

    // ── Animation ───────────────────────────────────────────────

    internal bool IsAnimating => _animationTimer.Enabled;

    private void StartAnimation()
    {
        _animationFrame = 0;
        _animationTimer.Start();
    }

    private void StopAnimation()
    {
        _animationTimer.Stop();
        _animationFrame = 0;
        SetIcon(_idleIcon);
    }

    private void OnAnimationTick(object? sender, System.Timers.ElapsedEventArgs e)
    {
        _animationFrame = (_animationFrame + 1) % 4;
        var icon = _activeIcons[_animationFrame];
        SetIcon(icon);
    }

    private void SetIcon(Icon? icon)
    {
        if (_trayIcon is null || icon is null) return;

        try
        {
            if (_dispatcherQueue is not null)
                _dispatcherQueue.TryEnqueue(() => _trayIcon.UpdateIcon(icon.Handle));
            else
                _trayIcon.UpdateIcon(icon.Handle);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to update tray icon frame");
        }
    }

    private void UpdateTooltip()
    {
        if (_trayIcon is null) return;
        var msg = _activeSessionCount == 0
            ? "Squad Uplink — No active sessions"
            : $"Squad Uplink — {_activeSessionCount} session{(_activeSessionCount != 1 ? "s" : "")} active";

        try
        {
            _trayIcon.UpdateToolTip(msg);
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to update tray icon tooltip");
        }
    }

    // ── Context Menu ────────────────────────────────────────────

    private PopupMenu BuildContextMenu()
    {
        var menu = new PopupMenu();

        menu.Items.Add(new PopupMenuItem("Show Squad Uplink", (_, _) =>
        {
            _dispatcherQueue?.TryEnqueue(() => ShowWindowRequested?.Invoke());
        }));

        menu.Items.Add(new PopupMenuSeparator());

        menu.Items.Add(new PopupMenuItem("Launch New Session", (_, _) =>
        {
            _dispatcherQueue?.TryEnqueue(() => LaunchSessionRequested?.Invoke());
        }));

        menu.Items.Add(new PopupMenuSeparator());

        menu.Items.Add(new PopupMenuItem("Exit", (_, _) =>
        {
            _dispatcherQueue?.TryEnqueue(() => ExitRequested?.Invoke());
        }));

        return menu;
    }

    // ── Mouse Handling ──────────────────────────────────────────

    private void OnTrayMouseEvent(object? sender, MessageWindow.MouseEventReceivedEventArgs e)
    {
        if (e.MouseEvent == MouseEvent.IconLeftDoubleClick)
        {
            _dispatcherQueue?.TryEnqueue(() => ShowWindowRequested?.Invoke());
        }
    }
}
