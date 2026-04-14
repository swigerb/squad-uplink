using Microsoft.Extensions.Logging;
using SquadUplink.Core.Logging;
using SquadUplink.Models;

namespace SquadUplink.Services;

/// <summary>
/// Monitors the .squad/ directory for file changes with debounce to prevent
/// UI flicker during heavy writes (e.g., agent orchestration bursts).
/// </summary>
public class SquadFileWatcher : IDisposable
{
    private FileSystemWatcher? _watcher;
    private Timer? _debounceTimer;
    private readonly object _lock = new();
    private FileSystemEventArgs? _lastArgs;
    private readonly ILogger<SquadFileWatcher> _logger;
    private bool _disposed;

    /// <summary>Debounce interval in milliseconds. Exposed for testability.</summary>
    internal int DebounceMs { get; set; } = 500;

    /// <summary>Raised after the debounce window closes with the most recent change.</summary>
    public event Action<SquadFileChangeEvent>? FileChanged;

    public SquadFileWatcher(ILogger<SquadFileWatcher> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Begins watching the specified .squad/ directory for .md file changes.
    /// </summary>
    public void StartWatching(string squadDirectory)
    {
        if (_disposed) throw new ObjectDisposedException(nameof(SquadFileWatcher));

        StopWatching();

        if (!Directory.Exists(squadDirectory))
        {
            _logger.LogWarning("Squad directory does not exist: {Path}", squadDirectory);
            return;
        }

        _watcher = new FileSystemWatcher(squadDirectory)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
            Filter = "*.md"
        };
        _watcher.Changed += OnChanged;
        _watcher.Created += OnChanged;
        _watcher.EnableRaisingEvents = true;

        _logger.SquadFileWatcherTriggered("Started", squadDirectory);
    }

    /// <summary>Stops watching and disposes the internal watcher.</summary>
    public void StopWatching()
    {
        if (_watcher is not null)
        {
            _watcher.EnableRaisingEvents = false;
            _watcher.Changed -= OnChanged;
            _watcher.Created -= OnChanged;
            _watcher.Dispose();
            _watcher = null;
        }
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        lock (_lock)
        {
            _lastArgs = e;
            _debounceTimer?.Dispose();
            _debounceTimer = new Timer(OnDebounceElapsed, null, DebounceMs, Timeout.Infinite);
        }
    }

    private void OnDebounceElapsed(object? state)
    {
        FileSystemEventArgs? args;
        lock (_lock)
        {
            args = _lastArgs;
            _lastArgs = null;
        }

        if (args is null) return;

        var evt = new SquadFileChangeEvent
        {
            FilePath = args.FullPath,
            ChangeType = args.ChangeType,
            Timestamp = DateTime.UtcNow
        };

        _logger.SquadFileWatcherTriggered(evt.ChangeType.ToString(), evt.FilePath);
        FileChanged?.Invoke(evt);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopWatching();
        _debounceTimer?.Dispose();
        GC.SuppressFinalize(this);
    }
}
