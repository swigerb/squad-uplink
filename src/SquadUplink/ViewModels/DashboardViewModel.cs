using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Microsoft.UI.Dispatching;
using Serilog;
using Serilog.Events;
using SquadUplink.Contracts;
using SquadUplink.Core.Logging;
using SquadUplink.Models;
using SquadUplink.Services;

namespace SquadUplink.ViewModels;

public partial class DashboardViewModel : ViewModelBase
{
    private readonly ISessionManager _sessionManager;
    private readonly IDataService _dataService;
    private readonly ISquadDetector _squadDetector;
    private readonly ITelemetryService _telemetryService;
    private readonly SquadFileWatcher? _fileWatcher;
    private readonly InMemorySink _diagnosticsSink;
    private readonly DispatcherQueue? _dispatcherQueue;
    private CancellationTokenSource? _uptimeCts;
    private CancellationTokenSource? _telemetryCts;

    /// <summary>Approximate time the application started (static, set once at class load).</summary>
    internal static readonly DateTime AppStartedAt = DateTime.UtcNow;

    [ObservableProperty]
    private string _sessionCount = "0 sessions";

    [ObservableProperty]
    private int _activeSessionCount;

    [ObservableProperty]
    private string _totalUptime = "0h 0m";

    [ObservableProperty]
    private int _messagesProcessed;

    [ObservableProperty]
    private double _cpuUsage;

    [ObservableProperty]
    private string _cpuUsageDisplay = "\u2014";

    [ObservableProperty]
    private double _memoryUsage;

    [ObservableProperty]
    private string _memoryUsageDisplay = "\u2014";

    [ObservableProperty]
    private int _errorCount;

    [ObservableProperty]
    private string _searchFilter = string.Empty;

    [ObservableProperty]
    private bool _isCardsView = true;

    [ObservableProperty]
    private bool _isGridView;

    [ObservableProperty]
    private bool _isTabView;

    [ObservableProperty]
    private LayoutMode _currentLayoutMode = LayoutMode.Cards;

    [ObservableProperty]
    private GridSize _currentGridSize = GridSize.Default;

    [ObservableProperty]
    private int _selectedSessionIndex = -1;

    [ObservableProperty]
    private bool _hasSquads;

    [ObservableProperty]
    private bool _noSquadsVisible = true;

    [ObservableProperty]
    private SquadInfo? _selectedSquad;

    [ObservableProperty]
    private bool _isGridSizeSelectorVisible;

    [ObservableProperty]
    private int _selectedGridSizeIndex = 3; // 2x2 default

    [ObservableProperty]
    private bool _isFocusedMode;

    [ObservableProperty]
    private bool _hasNoSessions = true;

    [ObservableProperty]
    private string _scanStatusText = "Scanning...";

    [ObservableProperty]
    private int _tokenGaugeCurrentTokens;

    [ObservableProperty]
    private int _tokenGaugeMaxTokens = 128_000;

    [ObservableProperty]
    private double _tokenGaugeEstimatedCost;

    // ─── Telemetry widget properties ─────────────────────────────

    [ObservableProperty]
    private double _burnRatePerHour;

    [ObservableProperty]
    private double _sessionTotalCost;

    [ObservableProperty]
    private int _contextCurrentTokens;

    [ObservableProperty]
    private int _contextMaxTokens = 128_000;

    [ObservableProperty]
    private IReadOnlyList<AgentTokenSummary>? _agentBreakdown;

    /// <summary>
    /// Raised when the ViewModel wants the View to show the launch dialog.
    /// </summary>
    public event Func<Task>? LaunchDialogRequested;

    public ObservableCollection<SessionState> Sessions => _sessionManager.Sessions;

    public ObservableCollection<SquadTreeItem> SquadTreeItems { get; } = [];

    public ObservableCollection<SquadInfo> Squads { get; } = [];

    public ObservableCollection<SessionHistoryEntry> RecentSessions { get; } = [];

    public ObservableCollection<DecisionEntry> DecisionFeed { get; } = [];

    public ObservableCollection<OrchestrationEntry> OrchestrationTimeline { get; } = [];

    public string[] GridSizeOptions { get; } = GridSize.Presets.Select(g => g.ToString()).ToArray();

    public DashboardViewModel(
        ISessionManager sessionManager,
        IDataService dataService,
        ISquadDetector squadDetector,
        ITelemetryService telemetryService,
        InMemorySink diagnosticsSink,
        ILogger<DashboardViewModel> logger,
        SquadFileWatcher? fileWatcher = null)
        : base(logger)
    {
        _sessionManager = sessionManager;
        _dataService = dataService;
        _squadDetector = squadDetector;
        _telemetryService = telemetryService;
        _fileWatcher = fileWatcher;
        _diagnosticsSink = diagnosticsSink;
        try { _dispatcherQueue = DispatcherQueue.GetForCurrentThread(); }
        catch (System.Runtime.InteropServices.COMException) { _dispatcherQueue = null; }
        Log.Debug("DashboardViewModel created");
        UpdateStats();
        Sessions.CollectionChanged += OnSessionsChanged;
        _diagnosticsSink.LogReceived += OnLogReceived;
        _ = LoadRecentSessionsAsync().ContinueWith(
            t => Log.Warning(t.Exception, "Failed to load recent sessions on startup"),
            TaskContinuationOptions.OnlyOnFaulted);
        _ = LoadLayoutPreferencesAsync().ContinueWith(
            t => Log.Warning(t.Exception, "Failed to load layout preferences on startup"),
            TaskContinuationOptions.OnlyOnFaulted);
        StartUptimeTimer();
        StartTelemetryRefresh();
        SubscribeToFileWatcher();
    }

    private void OnSessionsChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e) => UpdateStats();
    private void OnLogReceived(Serilog.Events.LogEvent _) => UpdateErrorCount();

    [RelayCommand]
    private async Task LaunchSessionAsync()
    {
        if (LaunchDialogRequested is not null)
        {
            await LaunchDialogRequested.Invoke();
        }
        else
        {
            // Fallback: launch with default directory
            await RunBusyAsync(async () =>
            {
                var workingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                await _sessionManager.LaunchSessionAsync(workingDirectory);
                StatusMessage = "Session launched";
                Log.Information("Session launched from dashboard");
            }, "Launch session");
        }
    }

    public async Task LaunchWithOptionsAsync(LaunchOptions options)
    {
        await RunBusyAsync(async () =>
        {
            await _sessionManager.LaunchSessionAsync(
                options.WorkingDirectory, options.InitialPrompt);
            StatusMessage = "Session launched";
            Log.Information("Session launched from dialog in {Dir}", options.WorkingDirectory);
        }, "Launch session");
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await LoadRecentSessionsAsync();
        UpdateStats();
    }

    [RelayCommand]
    private void OpenSession(SessionState? session)
    {
        if (session is null) return;
        Log.Debug("Opening session {Id}", session.Id);
    }

    [RelayCommand]
    private async Task CloseSessionAsync(SessionState? session)
    {
        if (session is null) return;
        await RunBusyAsync(async () =>
        {
            await _sessionManager.StopSessionAsync(session.Id);
            StatusMessage = $"Session {session.Id} closed";
            Log.Information("Session {Id} closed from dashboard", session.Id);
        }, "Close session");
    }

    [RelayCommand]
    private async Task ResumeSessionAsync(SessionHistoryEntry? entry)
    {
        if (entry is null) return;
        await RunBusyAsync(async () =>
        {
            await _sessionManager.LaunchSessionAsync(entry.WorkingDirectory);
            StatusMessage = "Session resumed";
            Log.Information("Resumed session in {Dir}", entry.WorkingDirectory);
        }, "Resume session");
    }

    [RelayCommand]
    private void SelectNextSession()
    {
        if (Sessions.Count == 0) return;
        SelectedSessionIndex = (SelectedSessionIndex + 1) % Sessions.Count;
    }

    [RelayCommand]
    private void SelectPreviousSession()
    {
        if (Sessions.Count == 0) return;
        SelectedSessionIndex = (SelectedSessionIndex - 1 + Sessions.Count) % Sessions.Count;
    }

    [RelayCommand]
    private void SelectSessionByIndex(int index)
    {
        if (index >= 0 && index < Sessions.Count)
        {
            SelectedSessionIndex = index;
        }
    }

    [RelayCommand]
    private void ToggleFocusedMode()
    {
        IsFocusedMode = !IsFocusedMode;
        Log.Debug("Focused mode toggled: {Mode}", IsFocusedMode);
    }

    partial void OnIsCardsViewChanged(bool value)
    {
        if (value)
        {
            IsTabView = false;
            IsGridView = false;
            CurrentLayoutMode = LayoutMode.Cards;
            IsGridSizeSelectorVisible = false;
            _ = SaveLayoutPreferencesAsync();
        }
    }

    partial void OnIsGridViewChanged(bool value)
    {
        if (value)
        {
            IsCardsView = false;
            IsTabView = false;
            CurrentLayoutMode = LayoutMode.Grid;
            IsGridSizeSelectorVisible = true;
            _ = SaveLayoutPreferencesAsync();
        }
    }

    partial void OnIsTabViewChanged(bool value)
    {
        if (value)
        {
            IsCardsView = false;
            IsGridView = false;
            CurrentLayoutMode = LayoutMode.Tabs;
            IsGridSizeSelectorVisible = false;
            _ = SaveLayoutPreferencesAsync();
        }
    }

    partial void OnSelectedGridSizeIndexChanged(int value)
    {
        if (value >= 0 && value < GridSize.Presets.Length)
        {
            CurrentGridSize = GridSize.Presets[value];
            _ = SaveLayoutPreferencesAsync();
        }
    }

    private async Task LoadLayoutPreferencesAsync()
    {
        try
        {
            var settings = await _dataService.GetSettingsAsync();
            if (Enum.TryParse<LayoutMode>(settings.LayoutMode, out var mode))
            {
                CurrentLayoutMode = mode;
                IsCardsView = mode == LayoutMode.Cards;
                IsTabView = mode == LayoutMode.Tabs;
                IsGridView = mode == LayoutMode.Grid;
            }
            CurrentGridSize = GridSize.Parse(settings.GridSize);
            SelectedGridSizeIndex = Array.IndexOf(GridSizeOptions, CurrentGridSize.ToString());
            if (SelectedGridSizeIndex < 0) SelectedGridSizeIndex = 3; // default 2x2
            IsGridSizeSelectorVisible = CurrentLayoutMode == LayoutMode.Grid;
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load layout preferences");
        }
    }

    private async Task SaveLayoutPreferencesAsync()
    {
        try
        {
            var settings = await _dataService.GetSettingsAsync();
            settings.LayoutMode = CurrentLayoutMode.ToString();
            settings.GridSize = CurrentGridSize.ToString();
            await _dataService.SaveSettingsAsync(settings);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to save layout preferences");
        }
    }

    private async Task LoadRecentSessionsAsync()
    {
        try
        {
            var recent = await _dataService.GetRecentSessionsAsync(10);
            RecentSessions.Clear();
            foreach (var entry in recent)
            {
                RecentSessions.Add(entry);
            }
            Log.Debug("Loaded {Count} recent sessions", recent.Count);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to load recent sessions");
        }
    }

    private void UpdateStats()
    {
        var count = Sessions.Count;
        SessionCount = count == 1 ? "1 session" : $"{count} sessions";
        ActiveSessionCount = Sessions.Count(s => s.Status is SessionStatus.Running or SessionStatus.Launching);
        HasNoSessions = count == 0;

        ScanStatusText = count == 0
            ? "Scanning..."
            : $"{count} session{(count != 1 ? "s" : "")} active";

        // Aggregate output lines
        MessagesProcessed = Sessions.Sum(s => s.OutputLines.Count);

        UpdateUptime();
        UpdateErrorCount();
        UpdateTokenGauge();

        // Rebuild squad tree
        RebuildSquadTree();
    }

    private void UpdateUptime()
    {
        var elapsed = DateTime.UtcNow - AppStartedAt;
        var hours = (int)elapsed.TotalHours;
        var mins = elapsed.Minutes;
        TotalUptime = $"{hours}h {mins}m";
    }

    private void UpdateErrorCount()
    {
        ErrorCount = _diagnosticsSink.GetEvents().Count(e => e.Level >= LogEventLevel.Error);
    }

    private void StartUptimeTimer()
    {
        _uptimeCts = new CancellationTokenSource();
        var token = _uptimeCts.Token;
        _ = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), token).ConfigureAwait(false);
                _dispatcherQueue?.TryEnqueue(UpdateUptime);
            }
        }, token);
    }

    public override void Dispose()
    {
        _uptimeCts?.Cancel();
        _uptimeCts?.Dispose();
        _telemetryCts?.Cancel();
        _telemetryCts?.Dispose();
        Sessions.CollectionChanged -= OnSessionsChanged;
        _diagnosticsSink.LogReceived -= OnLogReceived;
        if (_fileWatcher is not null)
            _fileWatcher.FileChanged -= OnSquadFileChanged;
        base.Dispose();
    }

    private void UpdateTokenGauge()
    {
        var metrics = _telemetryService.GetCurrentMetrics();
        if (metrics is null) return;
        TokenGaugeCurrentTokens = metrics.TotalTokens;
        TokenGaugeEstimatedCost = (double)metrics.TotalCost;
    }

    // ─── Telemetry widget refresh ───────────────────────────────

    private void StartTelemetryRefresh()
    {
        _telemetryCts = new CancellationTokenSource();
        var token = _telemetryCts.Token;
        _ = Task.Run(async () =>
        {
            while (!token.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(10), token).ConfigureAwait(false);
                _dispatcherQueue?.TryEnqueue(RefreshTelemetryWidgets);
            }
        }, token);
    }

    /// <summary>
    /// Refreshes all telemetry widget data from the TelemetryService.
    /// Called on a 10-second timer and also on-demand after file changes.
    /// </summary>
    internal void RefreshTelemetryWidgets()
    {
        try
        {
            var metrics = _telemetryService.GetCurrentMetrics();
            if (metrics is null) return;
            BurnRatePerHour = (double)metrics.BurnRatePerHour;
            SessionTotalCost = (double)metrics.TotalCost;

            // Context pressure: use the aggregate tokens against a default model window
            ContextCurrentTokens = metrics.TotalTokens;
            ContextMaxTokens = 128_000; // default; updated per-session if available

            AgentBreakdown = _telemetryService.GetAgentBreakdown();
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Failed to refresh telemetry widgets");
        }
    }

    // ─── File watcher integration ───────────────────────────────

    private void SubscribeToFileWatcher()
    {
        if (_fileWatcher is null) return;
        _fileWatcher.FileChanged += OnSquadFileChanged;
    }

    private void OnSquadFileChanged(SquadFileChangeEvent evt)
    {
        Logger.SquadFileWatcherTriggered(evt.ChangeType.ToString(), evt.FilePath);

        if (evt.IsTeamFile)
        {
            // Rebuild squad tree/roster
            RebuildSquadTree();
        }
        else if (evt.IsDecisionsFile)
        {
            // Refresh decision feed
            RebuildSquadTree(); // decisions are populated during tree rebuild
        }

        // Always refresh telemetry on file changes
        RefreshTelemetryWidgets();
    }

    private void RebuildSquadTree()
    {
        SquadTreeItems.Clear();
        Squads.Clear();
        DecisionFeed.Clear();
        var squadsFound = false;
        var seenTeams = new HashSet<string>(StringComparer.Ordinal);
        var seenDecisions = new HashSet<string>(StringComparer.Ordinal);

        foreach (var session in Sessions)
        {
            if (session.Squad is { } squad)
            {
                squadsFound = true;
                if (seenTeams.Add(squad.TeamName))
                {
                    Squads.Add(squad);

                    // Populate decision feed from squad decisions
                    foreach (var decision in squad.RecentDecisions)
                    {
                        if (seenDecisions.Add(decision.Text))
                            DecisionFeed.Add(decision);
                    }
                }
                AddSquadToTree(squad, 0);
            }
        }

        HasSquads = squadsFound;
        NoSquadsVisible = !squadsFound;

        // Auto-select first squad if none selected
        if (SelectedSquad is null && Squads.Count > 0)
            SelectedSquad = Squads[0];
    }

    private void AddSquadToTree(SquadInfo squad, int indent)
    {
        // Don't add duplicate squad headers
        if (SquadTreeItems.Any(i => i.IsHeader && i.DisplayText == squad.TeamName))
            return;

        SquadTreeItems.Add(new SquadTreeItem
        {
            DisplayText = squad.TeamName,
            Icon = "🏢",
            IsHeader = true,
            IndentLevel = indent,
            StatusText = squad.Universe ?? ""
        });

        foreach (var member in squad.Members)
        {
            SquadTreeItems.Add(new SquadTreeItem
            {
                DisplayText = member.Name,
                Icon = string.IsNullOrEmpty(member.Emoji) ? "👤" : member.Emoji,
                IsHeader = false,
                IndentLevel = indent + 1,
                Role = member.Role,
                StatusText = member.Status
            });
        }

        foreach (var sub in squad.SubSquads)
        {
            AddSquadToTree(sub, indent + 1);
        }
    }
}