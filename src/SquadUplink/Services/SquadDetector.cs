using System.Text.RegularExpressions;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.Services;

public partial class SquadDetector : ISquadDetector
{
    private readonly ILogger _logger;

    [GeneratedRegex(@"^\|\s*(\S+)\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|", RegexOptions.Multiline)]
    private static partial Regex MemberRowRegex();

    public SquadDetector() : this(Log.Logger) { }

    public SquadDetector(ILogger logger)
    {
        _logger = logger;
    }

    public async Task<SquadInfo?> DetectAsync(string workingDirectory, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(workingDirectory))
            return null;

        var squadDir = Path.Combine(workingDirectory, ".squad");
        if (!Directory.Exists(squadDir))
            return null;

        try
        {
            var teamFile = Path.Combine(squadDir, "team.md");
            if (!File.Exists(teamFile))
                return null;

            var content = await File.ReadAllTextAsync(teamFile, ct);
            var info = ParseTeamFile(content);

            // Check for current focus
            var nowFile = Path.Combine(squadDir, "identity", "now.md");
            if (File.Exists(nowFile))
            {
                var nowContent = await File.ReadAllTextAsync(nowFile, ct);
                info.CurrentFocus = ParseCurrentFocus(nowContent);
            }

            // Detect sub-squads in child directories
            await DetectSubSquadsAsync(workingDirectory, info, ct);

            _logger.Debug("Detected squad {Team} with {MemberCount} members in {Dir}",
                info.TeamName, info.Members.Count, workingDirectory);

            return info;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Warning(ex, "Failed to detect squad in {Dir}", workingDirectory);
            return null;
        }
    }

    internal static SquadInfo ParseTeamFile(string content)
    {
        var info = new SquadInfo();
        var lines = content.Split('\n');

        // Extract team name from H1 header
        foreach (var line in lines)
        {
            var trimmed = line.TrimStart();
            if (trimmed.StartsWith("# "))
            {
                info.TeamName = trimmed[2..].Trim();
                break;
            }
        }

        // Extract universe from metadata (YAML front matter or inline)
        var universeMatch = Regex.Match(content, @"universe:\s*(.+)", RegexOptions.IgnoreCase);
        if (universeMatch.Success)
            info.Universe = universeMatch.Groups[1].Value.Trim();

        // Parse member table rows: | emoji | **name** | role | status |
        foreach (Match match in MemberRowRegex().Matches(content))
        {
            var emoji = match.Groups[1].Value.Trim();
            var name = match.Groups[2].Value.Trim();
            var role = match.Groups[3].Value.Trim();
            var status = match.Groups[4].Value.Trim();

            // Skip separator rows and header labels
            if (name.Contains("---") || name.Equals("Name", StringComparison.OrdinalIgnoreCase))
                continue;

            info.Members.Add(new SquadMember
            {
                Emoji = emoji,
                Name = name,
                Role = role,
                Status = status
            });
        }

        return info;
    }

    internal static string? ParseCurrentFocus(string content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return null;

        var lines = content.Split('\n');

        // Look for H1 or H2 describing current focus
        foreach (var line in lines)
        {
            var trimmed = line.TrimStart();
            if (trimmed.StartsWith("## ") || trimmed.StartsWith("# "))
                return trimmed.TrimStart('#').Trim();
        }

        // Fall back to first non-empty, non-frontmatter line
        bool inFrontMatter = false;
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed == "---")
            {
                inFrontMatter = !inFrontMatter;
                continue;
            }
            if (inFrontMatter) continue;
            if (!string.IsNullOrEmpty(trimmed))
                return trimmed;
        }

        return null;
    }

    private async Task DetectSubSquadsAsync(string parentDir, SquadInfo parentInfo, CancellationToken ct)
    {
        try
        {
            foreach (var childDir in Directory.GetDirectories(parentDir))
            {
                ct.ThrowIfCancellationRequested();

                var childTeamFile = Path.Combine(childDir, ".squad", "team.md");
                if (!File.Exists(childTeamFile))
                    continue;

                var childContent = await File.ReadAllTextAsync(childTeamFile, ct);
                var childInfo = ParseTeamFile(childContent);
                parentInfo.SubSquads.Add(childInfo);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Debug(ex, "Error scanning for sub-squads in {Dir}", parentDir);
        }
    }
}
