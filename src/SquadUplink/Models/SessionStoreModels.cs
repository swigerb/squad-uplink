namespace SquadUplink.Models;

public record SessionStoreEntry
{
    public string Id { get; init; } = string.Empty;
    public string? Cwd { get; init; }
    public string? Repository { get; init; }
    public string? Branch { get; init; }
    public string? Summary { get; init; }
    public DateTime? CreatedAt { get; init; }
    public DateTime? UpdatedAt { get; init; }
    public string? HostType { get; init; }
    public int TurnCount { get; init; }
}

public record SessionFileChange
{
    public string FilePath { get; init; } = string.Empty;
    public string ToolName { get; init; } = string.Empty;
    public int TurnIndex { get; init; }
    public DateTime? FirstSeenAt { get; init; }
}

public record SessionReference
{
    public string RefType { get; init; } = string.Empty;
    public string RefValue { get; init; } = string.Empty;
    public int TurnIndex { get; init; }
    public DateTime? CreatedAt { get; init; }
}

public record SessionActivitySummary
{
    public int TotalSessions { get; init; }
    public int TotalTurns { get; init; }
    public int TotalFilesChanged { get; init; }
    public int TotalCommits { get; init; }
    public double AvgTurnsPerSession { get; init; }
    public IReadOnlyList<string> ActiveRepositories { get; init; } = [];
}
