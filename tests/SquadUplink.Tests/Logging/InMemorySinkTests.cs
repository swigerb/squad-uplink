using Serilog.Events;
using Serilog.Parsing;
using SquadUplink.Core.Logging;
using Xunit;

namespace SquadUplink.Tests.Logging;

public class InMemorySinkTests
{
    private static LogEvent CreateEvent(string message = "test", LogEventLevel level = LogEventLevel.Information)
    {
        var template = new MessageTemplate(message, []);
        return new LogEvent(DateTimeOffset.UtcNow, level, null, template, []);
    }

    [Fact]
    public void Emit_AddsEventToBuffer()
    {
        var sink = new InMemorySink();

        sink.Emit(CreateEvent());

        Assert.Equal(1, sink.Count);
    }

    [Fact]
    public void GetEvents_ReturnsSnapshotOfAllEvents()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("first"));
        sink.Emit(CreateEvent("second"));

        var events = sink.GetEvents();

        Assert.Equal(2, events.Count);
    }

    [Fact]
    public void Emit_EvictsOldestWhenOverCapacity()
    {
        var sink = new InMemorySink(maxCapacity: 3);

        for (int i = 0; i < 5; i++)
            sink.Emit(CreateEvent($"event-{i}"));

        Assert.Equal(3, sink.Count);
        var events = sink.GetEvents();
        // Oldest events (0, 1) should have been evicted
        Assert.Equal("event-2", events[0].MessageTemplate.Text);
        Assert.Equal("event-4", events[2].MessageTemplate.Text);
    }

    [Fact]
    public void Clear_RemovesAllEvents()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent());
        sink.Emit(CreateEvent());

        sink.Clear();

        Assert.Equal(0, sink.Count);
        Assert.Empty(sink.GetEvents());
    }

    [Fact]
    public void LogReceived_FiresOnEmit()
    {
        var sink = new InMemorySink();
        LogEvent? received = null;
        sink.LogReceived += e => received = e;

        var emitted = CreateEvent("hello");
        sink.Emit(emitted);

        Assert.NotNull(received);
        Assert.Same(emitted, received);
    }

    [Fact]
    public void LogReceived_FiresForEveryEvent()
    {
        var sink = new InMemorySink();
        int count = 0;
        sink.LogReceived += _ => count++;

        sink.Emit(CreateEvent());
        sink.Emit(CreateEvent());
        sink.Emit(CreateEvent());

        Assert.Equal(3, count);
    }

    [Fact]
    public void GetEvents_ReturnsIndependentSnapshot()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("a"));

        var snapshot = sink.GetEvents();
        sink.Emit(CreateEvent("b"));

        // Original snapshot should not be affected by subsequent emits
        Assert.Single(snapshot);
        Assert.Equal(2, sink.Count);
    }
}
