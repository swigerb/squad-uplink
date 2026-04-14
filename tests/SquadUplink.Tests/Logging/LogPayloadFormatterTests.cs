using SquadUplink.Core.Logging;
using Xunit;

namespace SquadUplink.Tests.Logging;

public class LogPayloadFormatterTests
{
    private readonly LogPayloadFormatter _formatter = new();

    // ─── Detection tests ────────────────────────────────────────

    [Fact]
    public void DetectPayloadType_PlainText_ForSimpleMessages()
    {
        Assert.Equal(PayloadType.PlainText, _formatter.DetectPayloadType("Hello world"));
    }

    [Fact]
    public void DetectPayloadType_PlainText_ForNullOrWhitespace()
    {
        Assert.Equal(PayloadType.PlainText, _formatter.DetectPayloadType(""));
        Assert.Equal(PayloadType.PlainText, _formatter.DetectPayloadType("   "));
    }

    [Fact]
    public void DetectPayloadType_Json_ForObjectLiteral()
    {
        var json = """{"name":"test","value":42}""";
        Assert.Equal(PayloadType.Json, _formatter.DetectPayloadType(json));
    }

    [Fact]
    public void DetectPayloadType_Json_ForArrayLiteral()
    {
        var json = """[1, 2, 3]""";
        Assert.Equal(PayloadType.Json, _formatter.DetectPayloadType(json));
    }

    [Fact]
    public void DetectPayloadType_Json_WithLeadingWhitespace()
    {
        var json = """   {"key": "value"}""";
        Assert.Equal(PayloadType.Json, _formatter.DetectPayloadType(json));
    }

    [Fact]
    public void DetectPayloadType_StackTrace_ForDotNetStackTrace()
    {
        var trace = """
            System.NullReferenceException: Object reference not set
               at MyApp.Service.DoWork() in C:\src\Service.cs:line 42
               at MyApp.Program.Main() in C:\src\Program.cs:line 10
            """;
        Assert.Equal(PayloadType.StackTrace, _formatter.DetectPayloadType(trace));
    }

    [Fact]
    public void DetectPayloadType_StackTrace_ForExceptionPrefix()
    {
        var trace = "System.InvalidOperationException: Something went wrong";
        Assert.Equal(PayloadType.StackTrace, _formatter.DetectPayloadType(trace));
    }

    [Fact]
    public void DetectPayloadType_CommandOutput_ForCliPatterns()
    {
        var output = """
            Build succeeded.
            C:\Users\test\project\bin\Debug\net8.0\app.dll
            exit code 0
            """;
        Assert.Equal(PayloadType.CommandOutput, _formatter.DetectPayloadType(output));
    }

    // ─── Formatting tests ───────────────────────────────────────

    [Fact]
    public void FormatPayload_PrettyPrintsJson()
    {
        var compact = """{"name":"test","value":42}""";
        var formatted = _formatter.FormatPayload(compact);

        Assert.Contains("\"name\": \"test\"", formatted);
        Assert.Contains("\n", formatted); // indented output
    }

    [Fact]
    public void FormatPayload_HighlightsStackTraceMethods()
    {
        var trace = "   at MyApp.Service.DoWork() in C:\\src\\Service.cs:line 42\n   at MyApp.Program.Main() in C:\\src\\Program.cs:line 10";
        var formatted = _formatter.FormatPayload(trace);

        Assert.Contains("«MyApp.Service.DoWork»", formatted);
        Assert.Contains("«MyApp.Program.Main»", formatted);
    }

    [Fact]
    public void FormatPayload_ReturnsPlainTextUnchanged()
    {
        var text = "Just a regular log message";
        Assert.Equal(text, _formatter.FormatPayload(text));
    }

    [Fact]
    public void FormatPayload_ReturnsWhitespaceUnchanged()
    {
        Assert.Equal("  ", _formatter.FormatPayload("  "));
    }
}
