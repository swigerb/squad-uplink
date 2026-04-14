namespace SquadUplink.Models;

/// <summary>
/// Represents a single command available in the command palette.
/// </summary>
public class CommandItem
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public string? Description { get; init; }
    public string? IconGlyph { get; init; }
    public required Action Execute { get; init; }
    public string? Category { get; init; }

    /// <summary>
    /// Returns true if this command matches the given search query (case-insensitive fuzzy match).
    /// </summary>
    public bool MatchesQuery(string query)
    {
        if (string.IsNullOrWhiteSpace(query)) return true;

        var q = query.Trim();
        // Match against display name, description, or category
        return DisplayName.Contains(q, StringComparison.OrdinalIgnoreCase)
            || (Description?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false)
            || (Category?.Contains(q, StringComparison.OrdinalIgnoreCase) ?? false);
    }
}
