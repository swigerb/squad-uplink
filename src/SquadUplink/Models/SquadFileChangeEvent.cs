namespace SquadUplink.Models;

/// <summary>
/// Represents a change event in the .squad/ directory.
/// </summary>
public record SquadFileChangeEvent
{
    public required string FilePath { get; init; }
    public required WatcherChangeTypes ChangeType { get; init; }
    public required DateTime Timestamp { get; init; }

    /// <summary>
    /// Returns the filename without path for easy pattern matching.
    /// </summary>
    public string FileName => Path.GetFileName(FilePath);

    /// <summary>
    /// True when the changed file is team.md (roster change).
    /// </summary>
    public bool IsTeamFile => FileName.Equals("team.md", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// True when the changed file is decisions.md.
    /// </summary>
    public bool IsDecisionsFile => FileName.Equals("decisions.md", StringComparison.OrdinalIgnoreCase);
}
