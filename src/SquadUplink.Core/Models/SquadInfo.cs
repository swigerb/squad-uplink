namespace SquadUplink.Core.Models;

/// <summary>
/// Parsed squad info from team.md, returned by IMarkdownParser.
/// </summary>
public record SquadInfo
{
    public string TeamName { get; init; } = string.Empty;
    public string? Universe { get; init; }
    public string? CurrentFocus { get; init; }
    public IReadOnlyList<SquadMember> Members { get; init; } = [];
}

public record SquadMember
{
    public string Name { get; init; } = string.Empty;
    public string Role { get; init; } = string.Empty;
    public string Emoji { get; init; } = string.Empty;
    public string Status { get; init; } = string.Empty;
    public string? Charter { get; init; }
}
