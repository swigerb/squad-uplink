using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Serilog.Events;
using Serilog.Parsing;
using SquadUplink.Core.Logging;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

public class DiagnosticsViewModelTests
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

    // ── Level filtering ────────────────────────────────────────

    [Fact]
    public void Filter_ErrorsOnly_ShowsOnlyErrors()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug msg", LogEventLevel.Debug));
        sink.Emit(CreateEvent("info msg", LogEventLevel.Information));
        sink.Emit(CreateEvent("error msg", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = LogEventLevel.Error;

        Assert.Single(vm.FilteredEntries);
        Assert.Equal("ERR", vm.FilteredEntries[0].LevelTag);
    }

    [Fact]
    public void Filter_WarningsAndAbove_ExcludesInfoAndDebug()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug", LogEventLevel.Debug));
        sink.Emit(CreateEvent("info", LogEventLevel.Information));
        sink.Emit(CreateEvent("warning", LogEventLevel.Warning));
        sink.Emit(CreateEvent("error", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = LogEventLevel.Warning;

        Assert.Equal(2, vm.FilteredEntries.Count);
        Assert.All(vm.FilteredEntries, e =>
            Assert.True(e.Level >= LogEventLevel.Warning));
    }

    [Fact]
    public void Filter_AllLevels_ShowsEverything()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug", LogEventLevel.Debug));
        sink.Emit(CreateEvent("info", LogEventLevel.Information));
        sink.Emit(CreateEvent("error", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = null; // All

        Assert.Equal(3, vm.FilteredEntries.Count);
    }

    // ── Text search filtering ──────────────────────────────────

    [Fact]
    public void Search_ByMessage_FiltersCorrectly()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("session launched PID=123"));
        sink.Emit(CreateEvent("database initialized"));
        sink.Emit(CreateEvent("session closed PID=456"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "session";

        Assert.Equal(2, vm.FilteredEntries.Count);
        Assert.All(vm.FilteredEntries, e =>
            Assert.Contains("session", e.FullMessage, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Search_BySource_FiltersCorrectly()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("msg1", source: "SquadUplink.Services.SessionManager"));
        sink.Emit(CreateEvent("msg2", source: "SquadUplink.ViewModels.Dashboard"));
        sink.Emit(CreateEvent("msg3", source: "SquadUplink.Services.Scanner"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "Dashboard";

        Assert.Single(vm.FilteredEntries);
    }

    [Fact]
    public void Search_IsCaseInsensitive()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("Connection FAILED"));

        var vm = CreateViewModel(sink);
        vm.SearchText = "connection failed";

        Assert.Single(vm.FilteredEntries);
    }

    // ── Source toggle filtering ─────────────────────────────────

    [Fact]
    public void SourceToggle_DisablingSourceHidesEntries()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("msg1", source: "App.Services.Alpha"));
        sink.Emit(CreateEvent("msg2", source: "App.Services.Beta"));
        sink.Emit(CreateEvent("msg3", source: "App.Services.Alpha"));

        var vm = CreateViewModel(sink);
        Assert.Equal(3, vm.FilteredEntries.Count);
        Assert.Equal(2, vm.AvailableSources.Count);

        // Disable "Alpha" source
        var alphaSource = vm.AvailableSources.First(s => s.Name == "Alpha");
        alphaSource.IsActive = false;

        Assert.Single(vm.FilteredEntries);
        Assert.Equal("Beta", vm.FilteredEntries[0].Source);
    }

    // ── Combined filters ───────────────────────────────────────

    [Fact]
    public void CombinedFilters_LevelAndSearch()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("startup complete", LogEventLevel.Information));
        sink.Emit(CreateEvent("startup failed", LogEventLevel.Error));
        sink.Emit(CreateEvent("shutdown complete", LogEventLevel.Information));

        var vm = CreateViewModel(sink);
        vm.SelectedLevel = LogEventLevel.Error;
        vm.SearchText = "startup";

        Assert.Single(vm.FilteredEntries);
        Assert.Equal("ERR", vm.FilteredEntries[0].LevelTag);
        Assert.Contains("startup failed", vm.FilteredEntries[0].FullMessage);
    }

    // ── Auto-refresh on new log event ──────────────────────────

    [Fact]
    public void AutoRefresh_NewEventAppearsInEntries()
    {
        var sink = new InMemorySink();
        var vm = CreateViewModel(sink);
        Assert.Empty(vm.FilteredEntries);

        // Emit a new event — auto-refresh should pick it up
        sink.Emit(CreateEvent("new event after construction"));

        Assert.Single(vm.FilteredEntries);
        Assert.Contains("new event", vm.FilteredEntries[0].FullMessage);
    }

    // ── Export report generation ────────────────────────────────

    [Fact]
    public void ExportReport_ContainsExpectedSections()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("info msg", LogEventLevel.Information));
        sink.Emit(CreateEvent("error msg", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("# Squad Uplink Diagnostic Report", report);
        Assert.Contains("## Environment", report);
        Assert.Contains("## Recent Errors (last 50)", report);
        Assert.Contains("## Session Summary", report);
        Assert.Contains("## Filtered Log Entries", report);
        Assert.Contains("error msg", report);
    }

    [Fact]
    public void ExportReport_IncludesErrorDetails()
    {
        var sink = new InMemorySink();
        var ex = new InvalidOperationException("test failure");
        sink.Emit(CreateEvent("something broke", LogEventLevel.Error, exception: ex));

        var vm = CreateViewModel(sink);
        var report = vm.BuildDiagnosticReport();

        Assert.Contains("InvalidOperationException", report);
        Assert.Contains("test failure", report);
    }

    // ── Clear empties entries ──────────────────────────────────

    [Fact]
    public void Clear_EmptiesEntriesAndSources()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("msg1", source: "App.SomeService"));
        sink.Emit(CreateEvent("msg2", source: "App.OtherService"));

        var vm = CreateViewModel(sink);
        Assert.NotEmpty(vm.FilteredEntries);
        Assert.NotEmpty(vm.AvailableSources);

        vm.ClearLogsCommand.Execute(null);

        Assert.Empty(vm.FilteredEntries);
        Assert.Empty(vm.AvailableSources);
        Assert.Equal(0, vm.EntryCount);
        Assert.Equal(0, vm.TotalCount);
    }

    // ── Entry/Total count tracking ─────────────────────────────

    [Fact]
    public void Counts_TrackFilteredAndTotalSeparately()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("debug1", LogEventLevel.Debug));
        sink.Emit(CreateEvent("debug2", LogEventLevel.Debug));
        sink.Emit(CreateEvent("error1", LogEventLevel.Error));

        var vm = CreateViewModel(sink);
        Assert.Equal(3, vm.EntryCount);
        Assert.Equal(3, vm.TotalCount);

        vm.SelectedLevel = LogEventLevel.Error;
        Assert.Equal(1, vm.EntryCount);
        Assert.Equal(3, vm.TotalCount);
    }

    // ── Entries are newest-first ───────────────────────────────

    [Fact]
    public void Entries_AreNewestFirst()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("first"));
        sink.Emit(CreateEvent("second"));
        sink.Emit(CreateEvent("third"));

        var vm = CreateViewModel(sink);

        Assert.Equal("third", vm.FilteredEntries[0].FullMessage);
        Assert.Equal("first", vm.FilteredEntries[2].FullMessage);
    }

    // ── CopyEntry raises event ─────────────────────────────────

    [Fact]
    public void CopyEntry_RaisesClipboardEvent()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("copy me"));

        var vm = CreateViewModel(sink);
        string? copied = null;
        vm.CopyToClipboardRequested += text => copied = text;

        vm.CopyEntryCommand.Execute(vm.FilteredEntries[0]);

        Assert.NotNull(copied);
        Assert.Contains("copy me", copied);
    }

    // ── Dispose unsubscribes ───────────────────────────────────

    [Fact]
    public void Dispose_UnsubscribesFromLogReceived()
    {
        var sink = new InMemorySink();
        var vm = CreateViewModel(sink);
        vm.Dispose();

        // After dispose, emitting should not cause refresh (no crash either)
        sink.Emit(CreateEvent("after dispose"));

        // The entry won't appear because auto-refresh is unsubscribed
        Assert.Empty(vm.FilteredEntries);
    }

    // ── Source discovery preserves toggle states ────────────────

    [Fact]
    public void SourceDiscovery_PreservesExistingToggleStates()
    {
        var sink = new InMemorySink();
        sink.Emit(CreateEvent("m1", source: "App.Alpha"));

        var vm = CreateViewModel(sink);
        Assert.Single(vm.AvailableSources);
        vm.AvailableSources[0].IsActive = false;

        // Add a new source — Alpha's state should be preserved
        sink.Emit(CreateEvent("m2", source: "App.Beta"));
        vm.Refresh();

        Assert.Equal(2, vm.AvailableSources.Count);
        Assert.False(vm.AvailableSources.First(s => s.Name == "Alpha").IsActive);
        Assert.True(vm.AvailableSources.First(s => s.Name == "Beta").IsActive);
    }
}
