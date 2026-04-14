namespace SquadUplink.Models;

public class SquadInfo
{
    public string TeamName { get; set; } = string.Empty;
    public string? Universe { get; set; }
    public string? CurrentFocus { get; set; }
    public List<SquadMember> Members { get; set; } = [];
    public List<SquadInfo> SubSquads { get; set; } = [];
    public List<DecisionEntry> RecentDecisions { get; set; } = [];
}

public class SquadMember
{
    public string Name { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Emoji { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? MissionSummary { get; set; }
}
