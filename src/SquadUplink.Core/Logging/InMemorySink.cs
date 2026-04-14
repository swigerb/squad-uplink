using System.Collections.Concurrent;
using Serilog.Core;
using Serilog.Events;

namespace SquadUplink.Core.Logging;

/// <summary>
/// In-memory Serilog sink that buffers log events for the diagnostics UI.
/// Uses a bounded <see cref="ConcurrentQueue{T}"/> as a circular buffer.
/// </summary>
public sealed class InMemorySink : ILogEventSink
{
    private readonly ConcurrentQueue<LogEvent> _events = new();
    private readonly int _maxCapacity;

    /// <summary>Raised when a new log event is written.</summary>
    public event Action<LogEvent>? LogReceived;

    public InMemorySink(int maxCapacity = 1000)
    {
        _maxCapacity = maxCapacity;
    }

    public void Emit(LogEvent logEvent)
    {
        _events.Enqueue(logEvent);

        // Trim oldest entries when over capacity
        while (_events.Count > _maxCapacity)
            _events.TryDequeue(out _);

        LogReceived?.Invoke(logEvent);
    }

    /// <summary>Returns a snapshot of all buffered log events.</summary>
    public IReadOnlyList<LogEvent> GetEvents() => [.. _events];

    /// <summary>Clears the buffer.</summary>
    public void Clear()
    {
        while (_events.TryDequeue(out _)) { }
    }

    /// <summary>Current number of buffered events.</summary>
    public int Count => _events.Count;
}
