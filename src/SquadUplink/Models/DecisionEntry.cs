namespace SquadUplink.Models;

public record DecisionEntry
{
    public DateTime Timestamp { get; set; }
    public string Author { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string? FilePath { get; set; }
}
