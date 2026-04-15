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
    private FileSystemWatcher? _mdWatcher;
    private FileSystemWatcher? _jsonWatcher;
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
    /// Begins watching the specified .squad/ directory for .md and .json file changes.
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

        _mdWatcher = CreateWatcher(squadDirectory, "*.md");
        _jsonWatcher = CreateWatcher(squadDirectory, "*.json");

        _logger.SquadFileWatcherTriggered("Started", squadDirectory);
    }

    private FileSystemWatcher CreateWatcher(string directory, string filter)
    {
        var watcher = new FileSystemWatcher(directory)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName,
            Filter = filter
        };
        watcher.Changed += OnChanged;
        watcher.Created += OnChanged;
        watcher.EnableRaisingEvents = true;
        return watcher;
    }

    /// <summary>Stops watching and disposes the internal watchers.</summary>
    public void StopWatching()
    {
        DisposeWatcher(ref _mdWatcher);
        DisposeWatcher(ref _jsonWatcher);
    }

    private void DisposeWatcher(ref FileSystemWatcher? watcher)
    {
        if (watcher is not null)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Changed -= OnChanged;
            watcher.Created -= OnChanged;
            watcher.Dispose();
            watcher = null;
        }
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        lock (_lock)
        {
            _lastArgs = e;
            // Reuse existing timer via Change() to avoid allocation churn on rapid file changes
            if (_debounceTimer is not null)
            {
                _debounceTimer.Change(DebounceMs, Timeout.Infinite);
            }
            else
            {
                _debounceTimer = new Timer(OnDebounceElapsed, null, DebounceMs, Timeout.Infinite);
            }
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
