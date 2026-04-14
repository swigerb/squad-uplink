using System.Collections.ObjectModel;
using System.Text.Json;
using Serilog;
using SquadUplink.Models;

namespace SquadUplink.Services;

/// <summary>
/// Tails an events.jsonl file produced by Copilot CLI sessions and pushes
/// parsed high-interest events into an <see cref="OrchestrationEntry"/> timeline.
/// </summary>
public sealed class EventStreamWatcher : IDisposable
{
    private CancellationTokenSource? _cts;
    private readonly Action<Action> _dispatchToUI;
    private readonly ObservableCollection<OrchestrationEntry> _timeline;
    private const int MaxEntries = 100;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    // Event types we skip (too noisy or low-value for the timeline)
    private static readonly HashSet<string> SkippedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "tool.execution_start",
        "assistant.turn_start",
        "assistant.turn_end",
        "session.start",
        "assistant.message"
    };

    public DateTime? LastEventTimestamp { get; private set; }
    public string? CurrentPath { get; private set; }

    public EventStreamWatcher(
        ObservableCollection<OrchestrationEntry> timeline,
        Action<Action> dispatchToUI)
    {
        _timeline = timeline;
        _dispatchToUI = dispatchToUI;
    }

    public void StartWatching(string eventsJsonlPath)
    {
        if (string.Equals(CurrentPath, eventsJsonlPath, StringComparison.OrdinalIgnoreCase))
            return; // already watching this path

        StopWatching();

        CurrentPath = eventsJsonlPath;
        _cts = new CancellationTokenSource();
        var token = _cts.Token;

        _ = Task.Run(() => PollLoopAsync(eventsJsonlPath, token), token);
        Log.Information("EventStreamWatcher started watching {Path}", eventsJsonlPath);
    }

    public void StopWatching()
    {
        if (_cts is null) return;

        _cts.Cancel();
        _cts.Dispose();
        _cts = null;
        Log.Debug("EventStreamWatcher stopped watching {Path}", CurrentPath);
        CurrentPath = null;
    }

    private async Task PollLoopAsync(string path, CancellationToken ct)
    {
        FileStream? stream = null;
        StreamReader? reader = null;

        try
        {
            // Wait for the file to exist
            while (!File.Exists(path) && !ct.IsCancellationRequested)
            {
                await Task.Delay(1000, ct).ConfigureAwait(false);
            }

            ct.ThrowIfCancellationRequested();

            stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            stream.Seek(0, SeekOrigin.End); // Only read NEW events
            reader = new StreamReader(stream);

            while (!ct.IsCancellationRequested)
            {
                var linesRead = false;

                try
                {
                    string? line;
                    while ((line = reader.ReadLine()) is not null)
                    {
                        linesRead = true;
                        if (string.IsNullOrWhiteSpace(line)) continue;

                        try
                        {
                            var evt = JsonSerializer.Deserialize<CopilotEvent>(line, JsonOptions);
                            if (evt is null) continue;

                            LastEventTimestamp = evt.Timestamp;

                            if (SkippedTypes.Contains(evt.Type)) continue;

                            var entry = MapToOrchestrationEntry(evt);
                            if (entry is null) continue;

                            _dispatchToUI(() =>
                            {
                                _timeline.Add(entry);
                                while (_timeline.Count > MaxEntries)
                                    _timeline.RemoveAt(0);
                            });
                        }
                        catch (JsonException ex)
                        {
                            Log.Debug(ex, "EventStreamWatcher: failed to parse JSONL line");
                        }
                    }
                }
                catch (IOException ex)
                {
                    Log.Debug(ex, "EventStreamWatcher: IO error reading {Path}", path);
                    // File may have been deleted or locked; bail if gone
                    if (!File.Exists(path)) break;
                }

                if (!linesRead)
                {
                    await Task.Delay(500, ct).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown
        }
        catch (FileNotFoundException)
        {
            Log.Warning("EventStreamWatcher: file not found {Path}", path);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "EventStreamWatcher: unexpected error watching {Path}", path);
        }
        finally
        {
            reader?.Dispose();
            stream?.Dispose();
        }
    }

    private static OrchestrationEntry? MapToOrchestrationEntry(CopilotEvent evt)
    {
        string emoji;
        string summary;

        switch (evt.Type)
        {
            case "tool.execution_complete":
                var toolName = evt.GetToolName() ?? "unknown";
                var success = evt.GetSuccess();
                emoji = "🔧";
                summary = success == false
                    ? $"{toolName} failed"
                    : $"{toolName} completed";
                break;

            case "subagent.started":
                var desc = evt.GetDescription() ?? evt.GetAgentType() ?? "sub-agent";
                emoji = "🤖";
                summary = $"Agent spawned: {desc}";
                break;

            case "session.task_complete":
                emoji = "✅";
                summary = evt.GetDescription() ?? "Task completed";
                break;

            case "user.message":
                var content = evt.GetContent() ?? "";
                emoji = "💬";
                summary = content.Length > 80
                    ? $"User: {content[..80]}..."
                    : $"User: {content}";
                break;

            case "session.model_change":
                var modelTo = evt.GetModelTo() ?? "unknown";
                emoji = "🔄";
                summary = $"Model → {modelTo}";
                break;

            case "session.warning":
                emoji = "⚠️";
                summary = evt.GetMessage() ?? "Warning";
                break;

            case "session.compaction_complete":
                emoji = "📦";
                summary = "Context compacted";
                break;

            default:
                return null; // Unknown type, skip
        }

        return new OrchestrationEntry
        {
            AgentEmoji = emoji,
            Timestamp = evt.Timestamp,
            Summary = summary,
            AgentName = evt.Type,
            Outcome = evt.Type
        };
    }

    public void Dispose()
    {
        StopWatching();
    }
}
