namespace SquadUplink.Core.Models;

/// <summary>
/// A structured decision entry parsed from decisions.md.
/// </summary>
public record DecisionEntry
{
    public required string Timestamp { get; init; }
    public required string Title { get; init; }
    public required string Author { get; init; }
    public required string Content { get; init; }
    public string? Status { get; init; }
}
