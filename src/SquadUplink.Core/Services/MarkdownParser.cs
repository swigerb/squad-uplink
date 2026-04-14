using System.Text;
using System.Text.RegularExpressions;
using Markdig;
using Markdig.Extensions.Tables;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using SquadUplink.Core.Models;

namespace SquadUplink.Core.Services;

/// <summary>
/// Parses squad markdown files using Markdig AST instead of regex.
/// Handles malformed/partial files gracefully.
/// </summary>
public partial class MarkdownParser : IMarkdownParser
{
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .UsePipeTables()
        .UseYamlFrontMatter()
        .Build();

    [GeneratedRegex(@"universe:\s*(.+)", RegexOptions.IgnoreCase)]
    private static partial Regex UniverseRegex();

    public SquadInfo ParseTeamFile(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return new SquadInfo();

        try
        {
            var doc = Markdig.Markdown.Parse(markdown, Pipeline);

            var teamName = ExtractFirstHeading(doc, 1);
            var universe = ExtractUniverse(markdown);
            var members = ExtractMembersFromTables(doc);

            return new SquadInfo
            {
                TeamName = teamName ?? string.Empty,
                Universe = universe,
                Members = members
            };
        }
        catch
        {
            return new SquadInfo();
        }
    }

    public IReadOnlyList<DecisionEntry> ParseDecisionsFile(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [];

        try
        {
            var doc = Markdig.Markdown.Parse(markdown, Pipeline);
            var decisions = new List<DecisionEntry>();

            // Walk headings looking for decision entries:
            // ### timestamp: title  or  ### title
            HeadingBlock? currentHeading = null;
            string? currentTimestamp = null;
            string? currentTitle = null;
            string? currentAuthor = null;
            string? currentStatus = null;
            var contentLines = new List<string>();

            foreach (var block in doc)
            {
                if (block is HeadingBlock heading && heading.Level == 3)
                {
                    // Flush previous decision
                    if (currentTitle is not null)
                    {
                        decisions.Add(CreateDecisionEntry(
                            currentTimestamp, currentTitle, currentAuthor, currentStatus, contentLines));
                    }

                    // Parse new heading
                    var headingText = GetInlineText(heading.Inline);
                    ParseDecisionHeading(headingText, out currentTimestamp, out currentTitle);
                    currentAuthor = null;
                    currentStatus = null;
                    contentLines.Clear();
                    currentHeading = heading;
                    continue;
                }

                if (currentHeading is null) continue;

                if (block is ParagraphBlock para)
                {
                    var fullText = GetInlineText(para.Inline).Trim();

                    // Paragraph may contain multiple metadata lines merged by Markdig
                    foreach (var paraLine in fullText.Split('\n'))
                    {
                        var text = paraLine.Trim();
                        if (string.IsNullOrEmpty(text)) continue;

                        if (text.StartsWith("By:", StringComparison.OrdinalIgnoreCase))
                        {
                            currentAuthor = text[3..].Trim().TrimEnd('(', ')');
                            var parenIdx = currentAuthor.IndexOf('(');
                            if (parenIdx > 0)
                                currentAuthor = currentAuthor[..parenIdx].Trim();
                        }
                        else if (text.StartsWith("Status:", StringComparison.OrdinalIgnoreCase))
                        {
                            currentStatus = text[7..].Trim();
                        }
                        else if (text.StartsWith("Date:", StringComparison.OrdinalIgnoreCase))
                        {
                            // Skip date line (timestamp is in heading)
                        }
                        else
                        {
                            contentLines.Add(text);
                        }
                    }
                }
                else if (block is HeadingBlock h2 && h2.Level == 2)
                {
                    var sectionTitle = GetInlineText(h2.Inline).Trim();
                    contentLines.Add($"## {sectionTitle}");
                }
                else if (block is ListBlock || block is FencedCodeBlock)
                {
                    contentLines.Add(ExtractBlockText(block, markdown));
                }
                else if (block is ThematicBreakBlock)
                {
                    // --- separator: flush decision
                    if (currentTitle is not null)
                    {
                        decisions.Add(CreateDecisionEntry(
                            currentTimestamp, currentTitle, currentAuthor, currentStatus, contentLines));
                        currentHeading = null;
                        currentTimestamp = null;
                        currentTitle = null;
                        currentAuthor = null;
                        currentStatus = null;
                        contentLines.Clear();
                    }
                }
            }

            // Flush last decision
            if (currentTitle is not null)
            {
                decisions.Add(CreateDecisionEntry(
                    currentTimestamp, currentTitle, currentAuthor, currentStatus, contentLines));
            }

            return decisions;
        }
        catch
        {
            return [];
        }
    }

    public string? ParseNowFile(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return null;

        try
        {
            var doc = Markdig.Markdown.Parse(markdown, Pipeline);

            // Look for first H1 or H2 heading
            foreach (var block in doc)
            {
                if (block is HeadingBlock heading && heading.Level <= 2)
                {
                    var text = GetInlineText(heading.Inline).Trim();
                    if (!string.IsNullOrEmpty(text))
                        return text;
                }
            }

            // Fall back to first non-empty paragraph, skipping front matter
            bool inFrontMatter = false;
            var lines = markdown.Split('\n');
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
        catch
        {
            return null;
        }
    }

    private static string? ExtractFirstHeading(MarkdownDocument doc, int level)
    {
        foreach (var block in doc)
        {
            if (block is HeadingBlock heading && heading.Level == level)
                return GetInlineText(heading.Inline).Trim();
        }
        return null;
    }

    private static string? ExtractUniverse(string markdown)
    {
        var match = UniverseRegex().Match(markdown);
        return match.Success ? match.Groups[1].Value.Trim().Trim('*').Trim() : null;
    }

    private static List<SquadMember> ExtractMembersFromTables(MarkdownDocument doc)
    {
        var members = new List<SquadMember>();

        foreach (var block in doc)
        {
            if (block is not Table table) continue;

            // Determine column mapping from header row
            var headerRow = table.FirstOrDefault() as TableRow;
            if (headerRow is null || !headerRow.IsHeader) continue;

            var columnMap = MapColumns(headerRow);
            if (!columnMap.ContainsKey("name")) continue;

            // Parse data rows
            foreach (var row in table.Skip(1))
            {
                if (row is not TableRow dataRow || dataRow.IsHeader) continue;

                var cells = dataRow.Cast<TableCell>().ToList();
                var member = ExtractMemberFromRow(cells, columnMap);
                if (member is not null)
                    members.Add(member);
            }
        }

        return members;
    }

    private static Dictionary<string, int> MapColumns(TableRow headerRow)
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        int idx = 0;
        foreach (var cell in headerRow)
        {
            if (cell is TableCell tc)
            {
                var text = GetCellText(tc).ToLowerInvariant().Trim();
                if (text.Contains("name")) map["name"] = idx;
                else if (text.Contains("role")) map["role"] = idx;
                else if (text.Contains("emoji")) map["emoji"] = idx;
                else if (text.Contains("status")) map["status"] = idx;
                else if (text.Contains("charter")) map["charter"] = idx;
                else if (text.Contains("notes")) map["notes"] = idx;
            }
            idx++;
        }
        return map;
    }

    private static SquadMember? ExtractMemberFromRow(List<TableCell> cells, Dictionary<string, int> columnMap)
    {
        string GetCell(string key) =>
            columnMap.TryGetValue(key, out var i) && i < cells.Count
                ? GetCellText(cells[i]).Trim()
                : string.Empty;

        var name = StripMarkdownFormatting(GetCell("name"));
        if (string.IsNullOrWhiteSpace(name) || name.Contains("---"))
            return null;

        // Skip header-like rows
        if (name.Equals("Name", StringComparison.OrdinalIgnoreCase))
            return null;

        var role = StripMarkdownFormatting(GetCell("role"));
        var emoji = GetCell("emoji");
        var status = StripMarkdownFormatting(GetCell("status"));
        var charter = GetCell("charter");

        return new SquadMember
        {
            Name = name,
            Role = role,
            Emoji = emoji,
            Status = status,
            Charter = string.IsNullOrWhiteSpace(charter) ? null : charter
        };
    }

    private static string GetCellText(TableCell cell)
    {
        var sb = new StringBuilder();
        foreach (var inline in cell.Descendants<LiteralInline>())
            sb.Append(inline.Content);
        return sb.ToString();
    }

    private static string GetInlineText(ContainerInline? container)
    {
        if (container is null) return string.Empty;
        var sb = new StringBuilder();
        foreach (var inline in container.Descendants())
        {
            if (inline is LiteralInline literal)
                sb.Append(literal.Content);
            else if (inline is LineBreakInline)
                sb.Append('\n');
        }
        return sb.ToString();
    }

    private static string StripMarkdownFormatting(string text)
    {
        // Remove bold/italic markers
        return text.Replace("**", "").Replace("__", "").Replace("*", "").Replace("_", "").Trim();
    }

    private static void ParseDecisionHeading(string headingText, out string? timestamp, out string? title)
    {
        // Format: "2026-04-08T030500Z: WebSocket Auth via Subprotocol..."
        // Use ": " (colon-space) as separator since timestamps may contain colons (e.g., 03:19:17Z)
        var sepIdx = headingText.IndexOf(": ", StringComparison.Ordinal);
        if (sepIdx > 8 && IsTimestampLike(headingText[..sepIdx].Trim()))
        {
            timestamp = headingText[..sepIdx].Trim();
            title = headingText[(sepIdx + 2)..].Trim();
        }
        else
        {
            timestamp = null;
            title = headingText.Trim();
        }
    }

    private static bool IsTimestampLike(string text)
    {
        // Check if it looks like a timestamp (starts with year-like digits)
        return text.Length >= 8 && char.IsDigit(text[0]) && char.IsDigit(text[1])
            && char.IsDigit(text[2]) && char.IsDigit(text[3]) && text[4] == '-';
    }

    private static DecisionEntry CreateDecisionEntry(
        string? timestamp, string title, string? author, string? status, List<string> contentLines)
    {
        return new DecisionEntry
        {
            Timestamp = timestamp ?? string.Empty,
            Title = title,
            Author = author ?? "Squad",
            Content = string.Join("\n", contentLines).Trim(),
            Status = status
        };
    }

    private static string ExtractBlockText(Block block, string sourceMarkdown)
    {
        // Use the source span to extract original text
        if (block.Span.Start >= 0 && block.Span.End < sourceMarkdown.Length)
        {
            return sourceMarkdown[block.Span.Start..(block.Span.End + 1)].Trim();
        }
        return string.Empty;
    }
}
