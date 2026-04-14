using System.Text.Json;
using System.Text.RegularExpressions;

namespace SquadUplink.Core.Logging;

public sealed partial class LogPayloadFormatter : ILogPayloadFormatter
{
    // .NET stack trace: lines starting with "   at "
    [GeneratedRegex(@"^\s{3}at\s", RegexOptions.Multiline)]
    private static partial Regex StackTraceAtPattern();

    // Exception type prefixes common in .NET
    [GeneratedRegex(@"^(System\.|Microsoft\.)\S+Exception", RegexOptions.Multiline)]
    private static partial Regex ExceptionTypePattern();

    // Common CLI patterns: exit codes, drive-letter paths, "error:", npm/dotnet output
    [GeneratedRegex(
        @"(exit\s*code\s*\d+|[A-Z]:\\[\w\\]+|\berror\s*:|FAILED|Build\s+succeeded|npm\s+ERR!|dotnet\s+)",
        RegexOptions.IgnoreCase)]
    private static partial Regex CommandOutputPattern();

    // Method name in a stack trace line for highlighting
    [GeneratedRegex(@"at\s+(.+?)\(")]
    private static partial Regex StackTraceMethodPattern();

    private static readonly JsonSerializerOptions s_prettyJson = new()
    {
        WriteIndented = true
    };

    public PayloadType DetectPayloadType(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return PayloadType.PlainText;

        var trimmed = message.TrimStart();

        // JSON: starts with { or [
        if (trimmed.StartsWith('{') || trimmed.StartsWith('['))
        {
            try
            {
                JsonSerializer.Deserialize<JsonElement>(trimmed);
                return PayloadType.Json;
            }
            catch (JsonException) { }
        }

        // Stack trace: ≥2 lines matching "   at " or known exception types
        if (StackTraceAtPattern().Matches(message).Count >= 2
            || ExceptionTypePattern().IsMatch(message))
            return PayloadType.StackTrace;

        // Command output: ≥2 hits of CLI-style patterns
        if (CommandOutputPattern().Matches(message).Count >= 2)
            return PayloadType.CommandOutput;

        return PayloadType.PlainText;
    }

    public string FormatPayload(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return message;

        var type = DetectPayloadType(message);

        return type switch
        {
            PayloadType.Json => FormatJson(message),
            PayloadType.StackTrace => FormatStackTrace(message),
            _ => message
        };
    }

    private static string FormatJson(string message)
    {
        try
        {
            var element = JsonSerializer.Deserialize<JsonElement>(message.TrimStart());
            return JsonSerializer.Serialize(element, s_prettyJson);
        }
        catch (JsonException)
        {
            return message;
        }
    }

    private static string FormatStackTrace(string message)
    {
        // Highlight method names: wrap in «» markers for UI rendering
        return StackTraceMethodPattern().Replace(message, match =>
        {
            var method = match.Groups[1].Value;
            return $"at «{method}»(";
        });
    }
}
