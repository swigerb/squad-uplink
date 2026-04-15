using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Core.Services;
using SquadUplink.Models;

namespace SquadUplink.Services;

public partial class SquadDetector : ISquadDetector, IDisposable
{
    private readonly Serilog.ILogger _logger;
    private readonly ILogger<SquadDetector>? _msLogger;
    private readonly IMarkdownParser _markdownParser;
    private FileSystemWatcher? _watcher;
    private string? _watchedDirectory;

    public event EventHandler<SquadInfo>? SquadStateChanged;

    [GeneratedRegex(@"^\|\s*(\S+)\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|", RegexOptions.Multiline)]
    private static partial Regex MemberRowBoldRegex();

    [GeneratedRegex(@"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", RegexOptions.Multiline)]
    private static partial Regex MemberRowPlainRegex();

    [GeneratedRegex(@"^##?\s+(.+)", RegexOptions.Multiline)]
    private static partial Regex DecisionHeaderRegex();

    [GeneratedRegex(@"^\*\*(.+?)\*\*\s*[-–—]\s*(.+)", RegexOptions.Multiline)]
    private static partial Regex DecisionLineRegex();

    [GeneratedRegex(@"^[-*]\s+\*\*(\d{4}-\d{2}-\d{2}[T ]?\d{2}:\d{2}(?::\d{2})?)\*\*\s*[-–—:]\s*(.+)", RegexOptions.Multiline)]
    private static partial Regex TimestampedDecisionRegex();

    public SquadDetector() : this(Log.Logger) { }

    public SquadDetector(Serilog.ILogger logger)
    {
        _logger = logger;
        _markdownParser = new MarkdownParser();
    }

    public SquadDetector(Serilog.ILogger logger, ILogger<SquadDetector>? msLogger) : this(logger)
    {
        _msLogger = msLogger;
    }

    public SquadDetector(Serilog.ILogger logger, IMarkdownParser markdownParser) : this(logger)
    {
        _markdownParser = markdownParser;
    }

    public async Task<SquadInfo?> DetectAsync(string workingDirectory, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(workingDirectory))
            return null;

        var squadDir = Path.Combine(workingDirectory, ".squad");
        var hasSquadDir = Directory.Exists(squadDir);

        // Secondary indicators: squad.config.ts or .github/agents/squad.agent.md
        var hasSquadConfig = File.Exists(Path.Combine(workingDirectory, "squad.config.ts"));
        var hasSquadAgentMd = File.Exists(Path.Combine(workingDirectory, ".github", "agents", "squad.agent.md"));

        if (!hasSquadDir && !hasSquadConfig && !hasSquadAgentMd)
            return null;

        try
        {
            // Primary path: parse .squad/team.md
            if (hasSquadDir)
            {
                var teamFile = Path.Combine(squadDir, "team.md");
                if (File.Exists(teamFile))
                {
                    var content = await File.ReadAllTextAsync(teamFile, ct);
                    var info = ParseTeamFile(content);

                    // Check for current focus
                    var nowFile = Path.Combine(squadDir, "identity", "now.md");
                    if (File.Exists(nowFile))
                    {
                        var nowContent = await File.ReadAllTextAsync(nowFile, ct);
                        info.CurrentFocus = ParseCurrentFocus(nowContent);
                    }

                    // Read recent decisions
                    var decisionsFile = Path.Combine(squadDir, "decisions.md");
                    if (File.Exists(decisionsFile))
                    {
                        var decisionsContent = await File.ReadAllTextAsync(decisionsFile, ct);
                        info.RecentDecisions = ParseDecisions(decisionsContent, 5);
                    }

                    // Detect sub-squads in child directories
                    await DetectSubSquadsAsync(workingDirectory, info, ct);

                    // Read agent charters for mission summaries
                    await ReadMemberChartersAsync(workingDirectory, info.Members, ct);

                    _logger.Debug("Detected squad {Team} with {MemberCount} members in {Dir}",
                        info.TeamName, info.Members.Count, workingDirectory);
                    _msLogger?.SquadDetected(info.TeamName, info.Members.Count, info.Universe);

                    return info;
                }
            }

            // Fallback: secondary indicators found but no team.md
            if (!hasSquadConfig && !hasSquadAgentMd)
                return null;

            var fallbackInfo = new SquadInfo
            {
                TeamName = Path.GetFileName(workingDirectory) ?? "Unknown",
            };

            if (hasSquadConfig)
                _logger.Information("Squad detected via squad.config.ts in {Dir}", workingDirectory);
            else if (hasSquadAgentMd)
                _logger.Information("Squad detected via .github/agents/squad.agent.md in {Dir}", workingDirectory);

            // Still try to read agent charters from .github/agents/
            await ReadMemberChartersAsync(workingDirectory, fallbackInfo.Members, ct);

            return fallbackInfo;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.Warning(ex, "Failed to detect squad in {Dir}", workingDirectory);
            return null;
        }
    }

    public void StartWatching(string workingDirectory)
    {
        StopWatching();

        var squadDir = Path.Combine(workingDirectory, ".squad");
        if (!Directory.Exists(squadDir))
            return;

        _watchedDirectory = workingDirectory;
        _watcher = new FileSystemWatcher(squadDir)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.LastWrite | NotifyFilters.FileName | NotifyFilters.CreationTime,
            EnableRaisingEvents = true
        };

        _watcher.Changed += OnSquadFileChanged;
        _watcher.Created += OnSquadFileChanged;
        _watcher.Deleted += OnSquadFileChanged;

        _logger.Debug("Started watching .squad/ in {Dir}", workingDirectory);
    }

    public void StopWatching()
    {
        if (_watcher is not null)
        {
            _watcher.EnableRaisingEvents = false;
            _watcher.Changed -= OnSquadFileChanged;
            _watcher.Created -= OnSquadFileChanged;
            _watcher.Deleted -= OnSquadFileChanged;
            _watcher.Dispose();
            _watcher = null;
            _watchedDirectory = null;
        }
    }

    // async void is required by FileSystemWatcher delegate signature — full-body try-catch ensures
    // no exception can escape and crash the process.
    private async void OnSquadFileChanged(object sender, FileSystemEventArgs e)
    {
        if (_watchedDirectory is null) return;

        try
        {
            // Small delay to allow file writes to complete
            await Task.Delay(200).ConfigureAwait(false);
            var info = await DetectAsync(_watchedDirectory);
            if (info is not null)
                SquadStateChanged?.Invoke(this, info);
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Error re-detecting squad after file change: {File}", e.FullPath);
        }
    }

    internal SquadInfo ParseTeamFile(string content)
    {
        // Try Markdig-based parsing first
        try
        {
            var parsed = _markdownParser.ParseTeamFile(content);
            if (parsed.Members.Count > 0 || !string.IsNullOrEmpty(parsed.TeamName))
            {
                var info = new SquadInfo
                {
                    TeamName = parsed.TeamName,
                    Universe = parsed.Universe
                };
                foreach (var m in parsed.Members)
                {
                    info.Members.Add(new SquadMember
                    {
                        Name = m.Name,
                        Role = m.Role,
                        Emoji = m.Emoji,
                        Status = m.Status
                    });
                }
                return info;
            }
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Markdig parsing failed, falling back to regex");
        }

        return ParseTeamFileRegex(content);
    }

    internal static SquadInfo ParseTeamFileRegex(string content)
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

        // Try bold format first: | emoji | **name** | role | status |
        var boldMatches = MemberRowBoldRegex().Matches(content);
        if (boldMatches.Count > 0)
        {
            foreach (Match match in boldMatches)
            {
                var emoji = match.Groups[1].Value.Trim();
                var name = match.Groups[2].Value.Trim();
                var role = match.Groups[3].Value.Trim();
                var status = match.Groups[4].Value.Trim();

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
        }
        else
        {
            // Fall back to plain format: | name | role | charter | status |
            foreach (Match match in MemberRowPlainRegex().Matches(content))
            {
                var col1 = match.Groups[1].Value.Trim();
                var col2 = match.Groups[2].Value.Trim();
                var col3 = match.Groups[3].Value.Trim();
                var col4 = match.Groups[4].Value.Trim();

                // Skip separator rows and header rows
                if (col1.Contains("---") || col1.Equals("Name", StringComparison.OrdinalIgnoreCase)
                    || col1.Equals("Emoji", StringComparison.OrdinalIgnoreCase))
                    continue;

                // Extract status emoji if present in the last column
                var statusEmoji = "";
                var statusText = col4;
                if (col4.Length > 0 && !char.IsLetterOrDigit(col4[0]))
                {
                    var parts = col4.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length == 2)
                    {
                        statusEmoji = parts[0];
                        statusText = parts[1];
                    }
                }

                info.Members.Add(new SquadMember
                {
                    Emoji = statusEmoji,
                    Name = col1,
                    Role = col2,
                    Status = statusText
                });
            }
        }

        return info;
    }

    internal string? ParseCurrentFocus(string content)
    {
        // Try Markdig-based parsing first
        try
        {
            var result = _markdownParser.ParseNowFile(content);
            if (result is not null)
                return result;
        }
        catch (Exception ex)
        {
            _logger.Debug(ex, "Markdig now-file parsing failed, falling back to regex");
        }

        return ParseCurrentFocusRegex(content);
    }

    internal static string? ParseCurrentFocusRegex(string content)
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

    internal static List<DecisionEntry> ParseDecisions(string content, int maxCount = 5)
    {
        var decisions = new List<DecisionEntry>();
        if (string.IsNullOrWhiteSpace(content))
            return decisions;

        var lines = content.Split('\n');
        string? currentAuthor = null;

        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
                continue;

            // Try timestamped format: - **2025-01-15 14:30** — Decision text
            var tsMatch = TimestampedDecisionRegex().Match(line);
            if (tsMatch.Success)
            {
                if (DateTime.TryParse(tsMatch.Groups[1].Value, out var ts))
                {
                    decisions.Add(new DecisionEntry
                    {
                        Timestamp = ts,
                        Author = currentAuthor ?? "Squad",
                        Text = tsMatch.Groups[2].Value.Trim()
                    });
                    if (decisions.Count >= maxCount) break;
                    continue;
                }
            }

            // Try author-prefixed: **Author** — Decision text
            var authorMatch = DecisionLineRegex().Match(line);
            if (authorMatch.Success)
            {
                currentAuthor = authorMatch.Groups[1].Value.Trim();
                decisions.Add(new DecisionEntry
                {
                    Timestamp = DateTime.UtcNow,
                    Author = currentAuthor,
                    Text = authorMatch.Groups[2].Value.Trim()
                });
                if (decisions.Count >= maxCount) break;
                continue;
            }

            // Simple bullet-point decision: - Some decision text
            if (trimmed.StartsWith("- ") || trimmed.StartsWith("* "))
            {
                decisions.Add(new DecisionEntry
                {
                    Timestamp = DateTime.UtcNow,
                    Author = currentAuthor ?? "Squad",
                    Text = trimmed[2..].Trim()
                });
                if (decisions.Count >= maxCount) break;
            }
        }

        return decisions;
    }

    internal static List<DecisionEntry> ParseDecisionInboxFile(string content, string? filePath = null)
    {
        var decisions = new List<DecisionEntry>();
        if (string.IsNullOrWhiteSpace(content))
            return decisions;

        var lines = content.Split('\n');
        string? title = null;
        string? author = null;
        DateTime timestamp = DateTime.UtcNow;
        var bodyLines = new List<string>();

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            if (trimmed.StartsWith("# ") && title is null)
            {
                title = trimmed[2..].Trim();
                continue;
            }

            var authorMatch = Regex.Match(trimmed, @"^(?:author|by|from):\s*(.+)", RegexOptions.IgnoreCase);
            if (authorMatch.Success)
            {
                author = authorMatch.Groups[1].Value.Trim();
                continue;
            }

            var dateMatch = Regex.Match(trimmed, @"^(?:date|timestamp):\s*(.+)", RegexOptions.IgnoreCase);
            if (dateMatch.Success && DateTime.TryParse(dateMatch.Groups[1].Value.Trim(), out var dt))
            {
                timestamp = dt;
                continue;
            }

            if (trimmed == "---") continue;

            if (!string.IsNullOrEmpty(trimmed))
                bodyLines.Add(trimmed);
        }

        var text = title ?? (bodyLines.Count > 0 ? string.Join(" ", bodyLines.Take(3)) : "");
        if (!string.IsNullOrEmpty(text))
        {
            decisions.Add(new DecisionEntry
            {
                Timestamp = timestamp,
                Author = author ?? "Squad",
                Text = text,
                FilePath = filePath
            });
        }

        return decisions;
    }

    internal static List<OrchestrationEntry> ParseOrchestrationLog(string content, string? filePath = null)
    {
        var entries = new List<OrchestrationEntry>();
        if (string.IsNullOrWhiteSpace(content))
            return entries;

        var lines = content.Split('\n');
        string? agentName = null;
        string? agentEmoji = null;
        DateTime timestamp = DateTime.UtcNow;
        string? outcome = null;
        var summaryLines = new List<string>();

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            // Agent name from H1: # 🧙 Woz
            if (trimmed.StartsWith("# "))
            {
                var header = trimmed[2..].Trim();
                // First token may be emoji
                var parts = header.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length == 2 && !char.IsLetterOrDigit(parts[0][0]))
                {
                    agentEmoji = parts[0];
                    agentName = parts[1];
                }
                else
                {
                    agentName = header;
                }
                continue;
            }

            // Agent/outcome from metadata lines
            var agentMatch = Regex.Match(trimmed, @"^agent:\s*(.+)", RegexOptions.IgnoreCase);
            if (agentMatch.Success) { agentName = agentMatch.Groups[1].Value.Trim(); continue; }

            var outcomeMatch = Regex.Match(trimmed, @"^(?:outcome|status|result):\s*(.+)", RegexOptions.IgnoreCase);
            if (outcomeMatch.Success) { outcome = outcomeMatch.Groups[1].Value.Trim(); continue; }

            var dateMatch = Regex.Match(trimmed, @"^(?:date|timestamp|time):\s*(.+)", RegexOptions.IgnoreCase);
            if (dateMatch.Success && DateTime.TryParse(dateMatch.Groups[1].Value.Trim(), out var dt))
            {
                timestamp = dt;
                continue;
            }

            if (trimmed == "---") continue;

            if (!string.IsNullOrEmpty(trimmed) && !trimmed.StartsWith("##"))
                summaryLines.Add(trimmed);
        }

        if (agentName is not null || summaryLines.Count > 0)
        {
            var emojiForAgent = agentEmoji ?? GetAgentEmoji(agentName ?? "Unknown");
            entries.Add(new OrchestrationEntry
            {
                AgentName = agentName ?? "Unknown",
                AgentEmoji = emojiForAgent,
                Timestamp = timestamp,
                Outcome = outcome ?? "completed",
                Summary = summaryLines.Count > 0 ? string.Join(" ", summaryLines.Take(3)) : "",
                FullLogContent = content,
                FilePath = filePath
            });
        }

        return entries;
    }

    internal static string GetAgentEmoji(string agentName)
    {
        return agentName.ToLowerInvariant() switch
        {
            var n when n.Contains("lead") || n.Contains("woz") => "🏗️",
            var n when n.Contains("devops") || n.Contains("ops") || n.Contains("infra") => "⚙️",
            var n when n.Contains("dev") || n.Contains("eng") => "🔧",
            var n when n.Contains("test") || n.Contains("qa") => "🧪",
            var n when n.Contains("design") || n.Contains("pixel") => "🎨",
            var n when n.Contains("doc") || n.Contains("write") => "📝",
            _ => "🤖"
        };
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

    public void Dispose()
    {
        StopWatching();
        GC.SuppressFinalize(this);
    }

    private async Task ReadMemberChartersAsync(string workingDirectory, List<SquadMember> members, CancellationToken ct)
    {
        foreach (var member in members)
        {
            ct.ThrowIfCancellationRequested();
            var nameLower = member.Name.ToLowerInvariant();

            // Search for charter in multiple locations
            string[] charterPaths =
            [
                Path.Combine(workingDirectory, ".squad", "agents", nameLower, "charter.md"),
                Path.Combine(workingDirectory, ".squad", "agents", nameLower, "AGENT.md"),
                Path.Combine(workingDirectory, ".github", "agents", $"{nameLower}.agent.md"),
            ];

            foreach (var path in charterPaths)
            {
                if (!File.Exists(path)) continue;

                try
                {
                    var content = await File.ReadAllTextAsync(path, ct);
                    member.MissionSummary = ExtractMissionSummary(content);
                    if (member.MissionSummary is not null) break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _logger.Debug(ex, "Failed to read charter at {Path}", path);
                }
            }
        }
    }

    internal static string? ExtractMissionSummary(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return null;

        var lines = content.Split('\n');

        // Look for ## Mission or ## Charter section
        for (int i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].Trim();
            if (trimmed.StartsWith("## Mission", StringComparison.OrdinalIgnoreCase) ||
                trimmed.StartsWith("## Charter", StringComparison.OrdinalIgnoreCase))
            {
                // Collect the paragraph after the heading
                var paragraph = new System.Text.StringBuilder();
                for (int j = i + 1; j < lines.Length; j++)
                {
                    var line = lines[j].Trim();
                    if (line.StartsWith('#')) break; // next section
                    if (string.IsNullOrEmpty(line))
                    {
                        if (paragraph.Length > 0) break; // end of paragraph
                        continue; // skip leading blank lines
                    }
                    if (paragraph.Length > 0) paragraph.Append(' ');
                    paragraph.Append(line);
                }

                if (paragraph.Length > 0)
                    return Truncate(paragraph.ToString(), 200);
            }
        }

        // Fallback: first non-empty, non-heading paragraph
        var fallback = new System.Text.StringBuilder();
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith('#') || trimmed.StartsWith("---")) continue;
            if (string.IsNullOrEmpty(trimmed))
            {
                if (fallback.Length > 0) break;
                continue;
            }
            if (fallback.Length > 0) fallback.Append(' ');
            fallback.Append(trimmed);
        }

        return fallback.Length > 0 ? Truncate(fallback.ToString(), 200) : null;
    }

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..(maxLength - 3)] + "...";
}
