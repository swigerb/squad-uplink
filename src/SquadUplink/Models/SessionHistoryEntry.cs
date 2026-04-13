namespace SquadUplink.Models;

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