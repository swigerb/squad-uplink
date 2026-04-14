using SquadUplink.Core.Models;

namespace SquadUplink.Core.Services;

/// <summary>
/// Markdig-based markdown parser for squad files.
/// Replaces regex-based parsing with proper AST walking.
/// </summary>
public interface IMarkdownParser
{
    SquadInfo ParseTeamFile(string markdown);
    IReadOnlyList<DecisionEntry> ParseDecisionsFile(string markdown);
    string? ParseNowFile(string markdown);
}
