namespace SquadUplink.Models;

public class OrchestrationEntry
{
    public string AgentName { get; set; } = string.Empty;
    public string AgentEmoji { get; set; } = "🤖";
    public DateTime Timestamp { get; set; }
    public string Outcome { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? FullLogContent { get; set; }
    public string? FilePath { get; set; }
}
