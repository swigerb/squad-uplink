namespace SquadUplink.Models;

public record SquadTreeItem
{
    public string DisplayText { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public bool IsHeader { get; set; }
    public string StatusText { get; set; } = string.Empty;
    public int IndentLevel { get; set; }
    public string Role { get; set; } = string.Empty;
    public string? MissionSummary { get; set; }

    public override string ToString() => DisplayText;
}
