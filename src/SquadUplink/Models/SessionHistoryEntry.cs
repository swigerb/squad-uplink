namespace SquadUplink.Models;

// Class required for WinUI XAML data binding (mutable setters needed).
// Would otherwise be a record for value equality, per ERR-025.
public class SessionHistoryEntry
{
    public int Id { get; set; }
    public string SessionId { get; set; } = string.Empty;
    public string? RepositoryName { get; set; }
    public string WorkingDirectory { get; set; } = string.Empty;
    public SessionStatus FinalStatus { get; set; }
    public DateTime StartedAt { get; set; }
    public DateTime? EndedAt { get; set; }
    public int ProcessId { get; set; }
    public string? GitHubTaskUrl { get; set; }
    public int? DurationSeconds { get; set; }
    public int AgentCount { get; set; }
}