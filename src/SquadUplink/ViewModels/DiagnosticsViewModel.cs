using System.Collections.ObjectModel;
using System.Runtime.InteropServices;
using System.Text;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Serilog.Events;
using SquadUplink.Core.Logging;

namespace SquadUplink.ViewModels;

/// <summary>
/// ViewModel for the Diagnostics dialog. Owns all filtering, source discovery,
/// and log entry projection — code-behind only wires DataContext and clipboard.
/// </summary>
public sealed partial class DiagnosticsViewModel : ViewModelBase
{
    private readonly InMemorySink _sink;
    private readonly ILogPayloadFormatter _formatter;

    /// <summary>Raised when a command needs to copy text to the clipboard.</summary>
    public event Action<string>? CopyToClipboardRequested;

    /// <summary>Raised when the export command needs a file save path from the UI layer.</summary>
    public event Func<string, Task<string?>>? SaveFileRequested;

    /// <summary>Raised after a successful export to show a confirmation tip.</summary>
    public event Action<string>? ExportCompleted;

    /// <summary>
    /// Optional UI-thread dispatcher. When set, auto-refresh dispatches through this.
    /// When null (e.g., in tests), Refresh runs synchronously on the calling thread.
    /// </summary>
    internal Action<Action>? DispatchAction { get; set; }

    public DiagnosticsViewModel(
        InMemorySink sink,
        ILogPayloadFormatter formatter,
        ILogger<DiagnosticsViewModel> logger)
        : base(logger)
    {
        _sink = sink;
        _formatter = formatter;
        _sink.LogReceived += OnLogReceived;
        Refresh();
    }

    // ── Observable properties ──────────────────────────────────

    public ObservableCollection<DiagnosticLogEntry> FilteredEntries { get; } = [];

    [ObservableProperty]
    private string _searchText = string.Empty;

    [ObservableProperty]
    private LogEventLevel? _selectedLevel;

    public ObservableCollection<SourceFilterItem> AvailableSources { get; } = [];

    [ObservableProperty]
    private int _entryCount;

    [ObservableProperty]
    private int _totalCount;

    // ── Filter change hooks ────────────────────────────────────

    partial void OnSearchTextChanged(string value) => Refresh();
    partial void OnSelectedLevelChanged(LogEventLevel? value) => Refresh();

    // ── Commands ───────────────────────────────────────────────

    [RelayCommand]
    internal void Refresh()
    {
        var events = _sink.GetEvents();
        TotalCount = events.Count;

        // Discover sources for filter toggles (preserve existing toggle states)
        var knownSources = new HashSet<string>(
            AvailableSources.Select(s => s.Name), StringComparer.OrdinalIgnoreCase);
        var currentSources = events
            .Select(e => TrimSource(GetSourceContext(e)))
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(s => s, StringComparer.OrdinalIgnoreCase);

        foreach (var src in currentSources)
        {
            if (!knownSources.Contains(src))
            {
                var item = new SourceFilterItem { Name = src, IsActive = true };
                item.PropertyChanged += (_, _) => Refresh();
                AvailableSources.Add(item);
            }
        }

        // Build active-source set
        var activeSources = new HashSet<string>(
            AvailableSources.Where(s => s.IsActive).Select(s => s.Name),
            StringComparer.OrdinalIgnoreCase);

        // 3-stage filter pipeline
        var filtered = events.AsEnumerable();

        // Stage 1: Level filter (≥ threshold)
        if (SelectedLevel.HasValue)
            filtered = filtered.Where(e => e.Level >= SelectedLevel.Value);

        // Stage 2: Text search (message + source, case-insensitive)
        if (!string.IsNullOrWhiteSpace(SearchText))
        {
            var term = SearchText;
            filtered = filtered.Where(e =>
            {
                var msg = e.RenderMessage();
                var full = msg + (e.Exception is not null ? $"\n{e.Exception}" : "");
                return full.Contains(term, StringComparison.OrdinalIgnoreCase) ||
                       (GetSourceContext(e)?.Contains(term, StringComparison.OrdinalIgnoreCase) ?? false);
            });
        }

        // Stage 3: Source filter (whitelist from toggle buttons)
        if (AvailableSources.Count > 0)
            filtered = filtered.Where(e => activeSources.Contains(TrimSource(GetSourceContext(e))));

        // Project to display models, newest first
        var entries = filtered
            .Reverse()
            .Select(e =>
            {
                var rendered = e.RenderMessage();
                var fullMsg = rendered + (e.Exception is not null ? $"\n{e.Exception}" : "");
                var formatted = _formatter.FormatPayload(fullMsg);
                var payloadType = _formatter.DetectPayloadType(fullMsg);

                return new DiagnosticLogEntry
                {
                    Time = e.Timestamp.ToString("HH:mm:ss.fff"),
                    Level = e.Level,
                    LevelTag = ToLevelTag(e.Level),
                    Source = TrimSource(GetSourceContext(e)),
                    ShortMessage = Truncate(rendered, 200),
                    FullMessage = fullMsg,
                    FormattedPayload = formatted,
                    PayloadType = payloadType,
                };
            })
            .ToList();

        FilteredEntries.Clear();
        foreach (var entry in entries)
            FilteredEntries.Add(entry);

        EntryCount = FilteredEntries.Count;
    }

    [RelayCommand]
    private void ClearLogs()
    {
        _sink.Clear();
        AvailableSources.Clear();
        Refresh();
    }

    [RelayCommand]
    private void CopyEntry(DiagnosticLogEntry? entry)
    {
        if (entry is null) return;
        var text = $"{entry.Time} [{entry.LevelTag}] {entry.Source} — {entry.FullMessage}";
        CopyToClipboardRequested?.Invoke(text);
    }

    [RelayCommand]
    private void CopyAll()
    {
        if (FilteredEntries.Count == 0) return;
        var text = string.Join(Environment.NewLine,
            FilteredEntries.Select(e => $"{e.Time} [{e.LevelTag}] {e.Source} — {e.FullMessage}"));
        CopyToClipboardRequested?.Invoke(text);
    }

    [RelayCommand]
    private async Task ExportReportAsync()
    {
        var report = BuildDiagnosticReport();
        var defaultName = $"SquadUplink-Diagnostics-{DateTime.Now:yyyyMMdd-HHmmss}.md";

        var filePath = SaveFileRequested is not null
            ? await SaveFileRequested.Invoke(defaultName)
            : null;

        if (string.IsNullOrEmpty(filePath))
            return;

        await File.WriteAllTextAsync(filePath, report);
        ExportCompleted?.Invoke(filePath);
    }

    internal string BuildDiagnosticReport()
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Squad Uplink Diagnostic Report");
        sb.AppendLine($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");
        sb.AppendLine();

        // Environment
        sb.AppendLine("## Environment");
        var version = System.Reflection.Assembly.GetEntryAssembly()?.GetName().Version;
        sb.AppendLine($"- **App version:** {version?.ToString() ?? "unknown"}");
        sb.AppendLine($"- **OS:** {RuntimeInformation.OSDescription}");
        sb.AppendLine($"- **.NET:** {RuntimeInformation.FrameworkDescription}");
        sb.AppendLine($"- **Architecture:** {RuntimeInformation.OSArchitecture}");
        sb.AppendLine();

        // Recent errors (last 50)
        sb.AppendLine("## Recent Errors (last 50)");
        var errors = _sink.GetEvents()
            .Where(e => e.Level >= LogEventLevel.Error)
            .Reverse()
            .Take(50)
            .ToList();

        if (errors.Count == 0)
        {
            sb.AppendLine("No errors recorded.");
        }
        else
        {
            foreach (var e in errors)
            {
                var source = GetSourceContext(e) ?? "Unknown";
                var msg = e.RenderMessage();
                var ex = e.Exception is not null
                    ? $"\n  Exception: {e.Exception.GetType().Name}: {e.Exception.Message}"
                    : "";
                sb.AppendLine($"- **{e.Timestamp:HH:mm:ss.fff}** [{e.Level}] `{TrimSource(source)}` — {Truncate(msg, 300)}{ex}");
            }
        }
        sb.AppendLine();

        // Session state summary
        sb.AppendLine("## Session Summary");
        var allEvents = _sink.GetEvents();
        sb.AppendLine($"- **Total buffered entries:** {allEvents.Count}");
        var grouped = allEvents.GroupBy(e => e.Level).OrderByDescending(g => g.Key);
        foreach (var g in grouped)
            sb.AppendLine($"- {g.Key}: {g.Count()}");
        sb.AppendLine();

        // Full filtered entries
        if (FilteredEntries.Count > 0)
        {
            sb.AppendLine("## Filtered Log Entries");
            sb.AppendLine($"Showing {FilteredEntries.Count} of {allEvents.Count} entries");
            sb.AppendLine();
            sb.AppendLine("```");
            foreach (var entry in FilteredEntries)
            {
                sb.AppendLine($"{entry.Time} [{entry.LevelTag}] {entry.Source} — {entry.FullMessage}");
            }
            sb.AppendLine("```");
        }

        sb.AppendLine();
        sb.AppendLine("---");
        sb.AppendLine("*Report generated by Squad Uplink Diagnostics*");
        return sb.ToString();
    }

    // ── Auto-refresh ───────────────────────────────────────────

    private void OnLogReceived(LogEvent e)
    {
        if (DispatchAction is not null)
            DispatchAction(Refresh);
        else
            Refresh();
    }

    // ── Helpers ────────────────────────────────────────────────

    internal static string? GetSourceContext(LogEvent e) =>
        e.Properties.TryGetValue("SourceContext", out var sc) ? sc.ToString().Trim('"') : null;

    internal static string TrimSource(string? source) =>
        source?.Split('.').LastOrDefault() ?? "";

    internal static string ToLevelTag(LogEventLevel level) => level switch
    {
        LogEventLevel.Fatal => "FTL",
        LogEventLevel.Error => "ERR",
        LogEventLevel.Warning => "WRN",
        LogEventLevel.Information => "INF",
        LogEventLevel.Debug => "DBG",
        _ => "VRB",
    };

    internal static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength] + "…";

    public override void Dispose()
    {
        _sink.LogReceived -= OnLogReceived;
        base.Dispose();
    }
}

/// <summary>Toggle item for source-based log filtering.</summary>
public sealed partial class SourceFilterItem : ObservableObject
{
    public string Name { get; init; } = string.Empty;

    [ObservableProperty]
    private bool _isActive = true;
}
