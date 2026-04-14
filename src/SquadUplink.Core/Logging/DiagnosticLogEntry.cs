using CommunityToolkit.Mvvm.ComponentModel;
using Serilog.Events;

namespace SquadUplink.Core.Logging;

/// <summary>
/// View-model–friendly representation of a log event for the diagnostics UI.
/// </summary>
public sealed partial class DiagnosticLogEntry : ObservableObject
{
    public required string Time { get; init; }
    public required LogEventLevel Level { get; init; }
    public required string LevelTag { get; init; }
    public required string Source { get; init; }
    public required string ShortMessage { get; init; }
    public required string FullMessage { get; init; }
    public required string FormattedPayload { get; init; }
    public required PayloadType PayloadType { get; init; }

    [ObservableProperty]
    private bool _isExpanded;
}
