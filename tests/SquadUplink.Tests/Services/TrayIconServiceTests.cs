using SquadUplink.Contracts;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

/// <summary>
/// Tests for TrayIconService — icon generation, animation state, and event wiring.
/// These tests exercise the service logic without creating a real Shell_NotifyIcon
/// (no DispatcherQueue or desktop window needed).
/// </summary>
public class TrayIconServiceTests : IDisposable
{
    private readonly TrayIconService _service;

    public TrayIconServiceTests()
    {
        // Pass null dispatcher to avoid WinUI runtime dependency
        _service = new TrayIconService(dispatcherQueue: null);
    }

    public void Dispose()
    {
        _service.Dispose();
    }

    // ═══ Icon Generation ═══

    [Fact]
    public void GenerateIcons_CreatesIdleAndActiveIcons()
    {
        // GenerateIcons is called in the constructor; verify via the
        // CreateRadarIcon factory (internal) which returns a non-null Icon.
        var idleIcon = TrayIconService.CreateRadarIcon(
            System.Drawing.Color.Gray, sweepQuadrant: -1);
        Assert.NotNull(idleIcon);
        idleIcon.Dispose();

        for (var i = 0; i < 4; i++)
        {
            var icon = TrayIconService.CreateRadarIcon(
                System.Drawing.Color.Green, sweepQuadrant: i);
            Assert.NotNull(icon);
            icon.Dispose();
        }
    }

    // ═══ Session Count & Animation State ═══

    [Fact]
    public void ActiveSessionCount_ZeroByDefault()
    {
        Assert.Equal(0, _service.ActiveSessionCount);
    }

    [Fact]
    public void ActiveSessionCount_SettingPositive_StartsAnimation()
    {
        _service.ActiveSessionCount = 1;
        Assert.True(_service.IsAnimating);
    }

    [Fact]
    public void ActiveSessionCount_BackToZero_StopsAnimation()
    {
        _service.ActiveSessionCount = 3;
        Assert.True(_service.IsAnimating);

        _service.ActiveSessionCount = 0;
        Assert.False(_service.IsAnimating);
    }

    [Fact]
    public void ActiveSessionCount_StaysPositive_AnimationContinues()
    {
        _service.ActiveSessionCount = 1;
        Assert.True(_service.IsAnimating);

        _service.ActiveSessionCount = 5;
        Assert.True(_service.IsAnimating);
    }

    // ═══ Minimize-to-Tray Setting ═══

    [Fact]
    public void IsVisible_FalseByDefault()
    {
        Assert.False(_service.IsVisible);
    }

    // ═══ Event Wiring ═══

    [Fact]
    public void ShowWindowRequested_CanSubscribeWithoutError()
    {
        var fired = false;
        _service.ShowWindowRequested += () => fired = true;
        // Event fires through the tray icon mouse handler which needs a real
        // window, but we verify subscription doesn't throw.
        Assert.False(fired);
    }

    [Fact]
    public void LaunchSessionRequested_CanSubscribeWithoutError()
    {
        var fired = false;
        _service.LaunchSessionRequested += () => fired = true;
        Assert.False(fired);
    }

    [Fact]
    public void ExitRequested_CanSubscribeWithoutError()
    {
        var fired = false;
        _service.ExitRequested += () => fired = true;
        Assert.False(fired);
    }

    // ═══ Dispose ═══

    [Fact]
    public void Dispose_StopsAnimation()
    {
        _service.ActiveSessionCount = 2;
        Assert.True(_service.IsAnimating);

        _service.Dispose();
        Assert.False(_service.IsAnimating);
    }

    [Fact]
    public void Dispose_CanBeCalledTwice()
    {
        _service.Dispose();
        _service.Dispose(); // no exception
    }

    // ═══ Interface Contract ═══

    [Fact]
    public void ImplementsITrayIconService()
    {
        Assert.IsAssignableFrom<ITrayIconService>(_service);
    }
}
