namespace SquadUplink.Models;

public class SquadTreeItem
{
    public string DisplayText { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public bool IsHeader { get; set; }
    public string StatusText { get; set; } = string.Empty;
    public int IndentLevel { get; set; }
    public string Role { get; set; } = string.Empty;
}
