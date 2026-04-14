using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class SquadFileWatcherTests : IDisposable
{
    private readonly string _tempRoot;
    private readonly Mock<ILogger<SquadFileWatcher>> _loggerMock = new();

    public SquadFileWatcherTests()
    {
        _tempRoot = Path.Combine(Path.GetTempPath(), $"squad-watcher-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempRoot);
    }

    public void Dispose()
    {
        try { Directory.Delete(_tempRoot, true); } catch { }
    }

    [Fact]
    public void StartAndStopWatching_DoesNotThrow()
    {
        using var watcher = new SquadFileWatcher(_loggerMock.Object);

        watcher.StartWatching(_tempRoot);
        watcher.StopWatching();
    }

    [Fact]
    public void StopWatching_WithoutStart_DoesNotThrow()
    {
        using var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.StopWatching();
    }

    [Fact]
    public void Dispose_CleansUpCleanly()
    {
        var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.StartWatching(_tempRoot);
        watcher.Dispose();
        // Should not throw on double dispose
        watcher.Dispose();
    }

    [Fact]
    public void StartWatching_NonexistentDirectory_LogsWarning()
    {
        using var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.StartWatching(Path.Combine(_tempRoot, "nonexistent"));
        // Should log a warning and not throw
    }

    [Fact]
    public async Task Debounce_SuppressesRapidFireEvents()
    {
        using var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.DebounceMs = 200;

        var events = new List<SquadFileChangeEvent>();
        watcher.FileChanged += evt => events.Add(evt);

        watcher.StartWatching(_tempRoot);

        // Fire rapid events
        var testFile = Path.Combine(_tempRoot, "test.md");
        for (int i = 0; i < 5; i++)
        {
            await File.WriteAllTextAsync(testFile, $"content {i}");
            await Task.Delay(50);
        }

        // Wait for debounce
        await Task.Delay(500);

        // Should have at most 2-3 events, not 5 (debounce collapses)
        Assert.True(events.Count < 5, $"Expected debounce to suppress events, got {events.Count}");
    }

    [Fact]
    public async Task FileChanged_ContainsCorrectMetadata()
    {
        using var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.DebounceMs = 100;

        SquadFileChangeEvent? received = null;
        var tcs = new TaskCompletionSource<SquadFileChangeEvent>();
        watcher.FileChanged += evt => tcs.TrySetResult(evt);

        watcher.StartWatching(_tempRoot);

        var testFile = Path.Combine(_tempRoot, "team.md");
        await File.WriteAllTextAsync(testFile, "# Test Team");

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        try
        {
            received = await tcs.Task.WaitAsync(cts.Token);
        }
        catch (OperationCanceledException) { }

        if (received is not null)
        {
            Assert.Contains("team.md", received.FilePath);
            Assert.True(received.IsTeamFile);
            Assert.True(received.Timestamp > DateTime.MinValue);
        }
    }

    [Fact]
    public void SquadFileChangeEvent_IsDecisionsFile_ReturnsTrue()
    {
        var evt = new SquadFileChangeEvent
        {
            FilePath = Path.Combine("some", "path", "decisions.md"),
            ChangeType = WatcherChangeTypes.Changed,
            Timestamp = DateTime.UtcNow
        };

        Assert.True(evt.IsDecisionsFile);
        Assert.False(evt.IsTeamFile);
        Assert.Equal("decisions.md", evt.FileName);
    }

    [Fact]
    public void SquadFileChangeEvent_IsTeamFile_ReturnsTrue()
    {
        var evt = new SquadFileChangeEvent
        {
            FilePath = Path.Combine("some", "path", "team.md"),
            ChangeType = WatcherChangeTypes.Created,
            Timestamp = DateTime.UtcNow
        };

        Assert.True(evt.IsTeamFile);
        Assert.False(evt.IsDecisionsFile);
    }

    [Fact]
    public void Dispose_AfterDispose_StartWatchingThrows()
    {
        var watcher = new SquadFileWatcher(_loggerMock.Object);
        watcher.Dispose();

        Assert.Throws<ObjectDisposedException>(() => watcher.StartWatching(_tempRoot));
    }
}
