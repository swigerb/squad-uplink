using Microsoft.Extensions.Logging.Abstractions;
using Serilog.Events;
using Serilog.Parsing;
using SquadUplink.Core.Logging;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.UxTests;

/// <summary>
/// Tier 1: Diagnostics dialog UX logic tests — verifies level filter,
/// search filter, source toggle, and export without rendering XAML.
/// </summary>
public class DiagnosticsUxTests
{
    private static readonly MessageTemplateParser s_parser = new();

    private static LogEvent CreateEvent(
        string message = "test message",
        LogEventLevel level = LogEventLevel.Information,
        string? source = null,
        Exception? exception = null)
    {
        var template = s_parser.Parse(message);
        var properties = new List<LogEventProperty>();
        if (source is not null)
            properties.Add(new LogEventProperty("SourceContext", new ScalarValue(source)));
        return new LogEvent(DateTimeOffset.UtcNow, level, exception, template, properties);
    }

    private static DiagnosticsViewModel CreateViewModel(InMemorySink? sink = null)
    {
        sink ??= new InMemorySink();
        var formatter = new LogPayloadFormatter();
        var logger = NullLogger<DiagnosticsViewModel>.Instance;
        return new DiagnosticsViewModel(sink, formatter, logger);
    }

    // ── Level filter reduces entry count ───────────────────────

    [Fact]
    public void LevelFilter_ErrorOnly_ReducesCount()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug msg", LogEventLevel.Debug));
        sink.Emit(CreateEvent("info msg", LogEventLevel.Information));
        sink.Emit(CreateEvent("warn msg", LogEventLevel.Warning));
        sink.Emit(CreateEvent("error msg", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        Assert.Equal(4, vm.FilteredEntries.Count);

        vm.SelectedLevel = LogEventLevel.Error;
        Assert.Single(vm.FilteredEntries);
        Assert.Equal(4, vm.TotalCount);
    }

    [Fact]
    public void LevelFilter_WarningAndAbove_ReducesCount()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug", LogEventLevel.Debug));
        sink.Emit(CreateEvent("info", LogEventLevel.Information));
        sink.Emit(CreateEvent("warn", LogEventLevel.Warning));
        sink.Emit(CreateEvent("error", LogEventLevel.Error));
        sink.Emit(CreateEvent("fatal", LogEventLevel.Fatal));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = LogEventLevel.Warning;

        Assert.Equal(3, vm.FilteredEntries.Count);
    }

    [Fact]
    public void LevelFilter_NullShowsAll()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("d", LogEventLevel.Debug));
        sink.Emit(CreateEvent("i", LogEventLevel.Information));
        sink.Emit(CreateEvent("e", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = LogEventLevel.Error;
        Assert.Single(vm.FilteredEntries);

        vm.SelectedLevel = null;
        Assert.Equal(3, vm.FilteredEntries.Count);
    }

    // ── Search filter matches text ─────────────────────────────

    [Fact]
    public void SearchFilter_MatchesMessage()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("session started PID=123"));
        sink.Emit(CreateEvent("database connection ready"));
        sink.Emit(CreateEvent("session stopped PID=456"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "session";

        Assert.Equal(2, vm.FilteredEntries.Count);
    }

    [Fact]
    public void SearchFilter_MatchesSource()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("m1", source: "App.Services.Scanner"));
        sink.Emit(CreateEvent("m2", source: "App.ViewModels.Dashboard"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "Dashboard";

        Assert.Single(vm.FilteredEntries);
    }

    [Fact]
    public void SearchFilter_CaseInsensitive()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("Connection TIMEOUT"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "connection timeout";

        Assert.Single(vm.FilteredEntries);
    }

    [Fact]
    public void SearchFilter_EmptyString_ShowsAll()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("a"));
        sink.Emit(CreateEvent("b"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "a";
        Assert.Single(vm.FilteredEntries);

        vm.SearchText = "";
        Assert.Equal(2, vm.FilteredEntries.Count);
    }

    // ── Source toggle hides/shows entries ───────────────────────

    [Fact]
    public void SourceToggle_DisablingSourceReducesEntries()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("msg1", source: "App.Services.Alpha"));
        sink.Emit(CreateEvent("msg2", source: "App.Services.Beta"));
        sink.Emit(CreateEvent("msg3", source: "App.Services.Alpha"));

        var vm = CreateViewModel(sink);
        Assert.Equal(3, vm.FilteredEntries.Count);

        var alpha = vm.AvailableSources.First(s => s.Name == "Alpha");
        alpha.IsActive = false;

        Assert.Single(vm.FilteredEntries);
    }

    [Fact]
    public void SourceToggle_ReenablingSourceRestoresEntries()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("m1", source: "App.Alpha"));
        sink.Emit(CreateEvent("m2", source: "App.Beta"));

        var vm = CreateViewModel(sink);
        var alpha = vm.AvailableSources.First(s => s.Name == "Alpha");

        alpha.IsActive = false;
        Assert.Single(vm.FilteredEntries);

        alpha.IsActive = true;
        Assert.Equal(2, vm.FilteredEntries.Count);
    }

    [Fact]
    public void SourceToggle_DefaultAllActive()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("m1", source: "App.Svc1"));
        sink.Emit(CreateEvent("m2", source: "App.Svc2"));

        var vm = CreateViewModel(sink);
        Assert.All(vm.AvailableSources, s => Assert.True(s.IsActive));
    }

    // ── Export generates valid markdown ─────────────────────────

    [Fact]
    public void Export_ContainsMarkdownHeaders()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("test entry", LogEventLevel.Information));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("# Squad Uplink Diagnostic Report", report);
        Assert.Contains("## Environment", report);
        Assert.Contains("## Recent Errors (last 50)", report);
        Assert.Contains("## Session Summary", report);
    }

    [Fact]
    public void Export_IncludesFilteredEntries()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("visible entry", LogEventLevel.Information));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("## Filtered Log Entries", report);
        Assert.Contains("visible entry", report);
    }

    [Fact]
    public void Export_IncludesErrorDetails()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("crash", LogEventLevel.Error,
            exception: new InvalidOperationException("null ref")));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("InvalidOperationException", report);
        Assert.Contains("null ref", report);
    }

    [Fact]
    public void Export_WithNoErrors_ShowsNoErrorsMessage()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("info only", LogEventLevel.Information));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("No errors recorded", report);
    }

    // ── EntryCount and TotalCount tracking ─────────────────────

    [Fact]
    public void Counts_EntryCountMatchesFilteredCount()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("d", LogEventLevel.Debug));
        sink.Emit(CreateEvent("e", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        Assert.Equal(2, vm.EntryCount);
        Assert.Equal(2, vm.TotalCount);

        vm.SelectedLevel = LogEventLevel.Error;
        Assert.Equal(1, vm.EntryCount);
        Assert.Equal(2, vm.TotalCount);
    }

    // ── Static helper tests ────────────────────────────────────

    [Theory]
    [InlineData(LogEventLevel.Fatal, "FTL")]
    [InlineData(LogEventLevel.Error, "ERR")]
    [InlineData(LogEventLevel.Warning, "WRN")]
    [InlineData(LogEventLevel.Information, "INF")]
    [InlineData(LogEventLevel.Debug, "DBG")]
    [InlineData(LogEventLevel.Verbose, "VRB")]
    public void ToLevelTag_MapsAllLevels(LogEventLevel level, string expected)
    {
        Assert.Equal(expected, DiagnosticsViewModel.ToLevelTag(level));
    }

    [Theory]
    [InlineData("SquadUplink.Services.SessionManager", "SessionManager")]
    [InlineData("App.Scanner", "Scanner")]
    [InlineData("SingleWord", "SingleWord")]
    [InlineData(null, "")]
    public void TrimSource_ExtractsLastSegment(string? input, string expected)
    {
        Assert.Equal(expected, DiagnosticsViewModel.TrimSource(input));
    }

    [Fact]
    public void Truncate_ShortString_Unchanged()
    {
        Assert.Equal("hello", DiagnosticsViewModel.Truncate("hello", 200));
    }

    [Fact]
    public void Truncate_LongString_TruncatesWithEllipsis()
    {
        var long_msg = new string('x', 300);
        var result = DiagnosticsViewModel.Truncate(long_msg, 200);
        Assert.Equal(201, result.Length); // 200 chars + ellipsis
        Assert.EndsWith("…", result);
    }
}
