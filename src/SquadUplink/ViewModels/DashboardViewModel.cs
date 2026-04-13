using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.UI.Xaml;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Models;

namespace SquadUplink.ViewModels;

public partial class DashboardViewModel : ObservableObject
{
    private readonly ISessionManager _sessionManager;
    private readonly IDataService _dataService;
    private readonly ISquadDetector _squadDetector;

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
    private string _cpuUsageDisplay = "0%";

    [ObservableProperty]
    private double _memoryUsage;

    [ObservableProperty]
    private string _memoryUsageDisplay = "0%";

    [ObservableProperty]
    private int _errorCount;

    [ObservableProperty]
    private string _searchFilter = string.Empty;

    [ObservableProperty]
    private bool _isGridView = true;

    [ObservableProperty]
    private bool _isTabView;

    [ObservableProperty]
    private LayoutMode _currentLayoutMode = LayoutMode.Tabs;

    [ObservableProperty]
    private GridSize _currentGridSize = GridSize.Default;

    [ObservableProperty]
    private int _selectedSessionIndex = -1;

    [ObservableProperty]
    private Visibility _hasSquads = Visibility.Collapsed;

    [ObservableProperty]
    private Visibility _noSquadsVisible = Visibility.Visible;

    [ObservableProperty]
    private SquadInfo? _selectedSquad;

    [ObservableProperty]
    private bool _isGridSizeSelectorVisible;

    [ObservableProperty]
    private int _selectedGridSizeIndex;

    [ObservableProperty]
    private bool _isFocusedMode;

    public ObservableCollection<SessionState> Sessions => _sessionManager.Sessions;

    public ObservableCollection<SquadTreeItem> SquadTreeItems { get; } = [];

    public ObservableCollection<SquadInfo> Squads { get; } = [];

    public ObservableCollection<SessionHistoryEntry> RecentSessions { get; } = [];

    public string[] GridSizeOptions { get; } = GridSize.Presets.Select(g => g.ToString()).ToArray();

    public DashboardViewModel(ISessionManager sessionManager, IDataService dataService, ISquadDetector squadDetector)
    {
        _sessionManager = sessionManager;
        _dataService = dataService;
        _squadDetector = squadDetector;
        UpdateStats();
        Sessions.CollectionChanged += (_, _) => UpdateStats();
        _ = LoadRecentSessionsAsync();
        _ = LoadLayoutPreferencesAsync();
    }

    [RelayCommand]
    private async Task LaunchSessionAsync()
    {
        var workingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        try
        {
            await _sessionManager.LaunchSessionAsync(workingDirectory);
            Log.Information("Session launched from dashboard");
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to launch session");
        }
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
        // Navigation handled by the page code-behind
    }

    [RelayCommand]
    private async Task CloseSessionAsync(SessionState? session)
    {
        if (session is null) return;
        try
        {
            await _sessionManager.StopSessionAsync(session.Id);
            Log.Information("Session {Id} closed from dashboard", session.Id);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to close session {Id}", session.Id);
        }
    }

    [RelayCommand]
    private async Task ResumeSessionAsync(SessionHistoryEntry? entry)
    {
        if (entry is null) return;
        try
        {
            await _sessionManager.LaunchSessionAsync(entry.WorkingDirectory);
            Log.Information("Resumed session in {Dir}", entry.WorkingDirectory);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "Failed to resume session in {Dir}", entry.WorkingDirectory);
        }
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

    partial void OnIsGridViewChanged(bool value)
    {
        if (value)
        {
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

        // Compute total uptime
        var totalMinutes = Sessions
            .Where(s => s.StartedAt != default)
            .Sum(s => (DateTime.UtcNow - s.StartedAt).TotalMinutes);
        var hours = (int)totalMinutes / 60;
        var mins = (int)totalMinutes % 60;
        TotalUptime = $"{hours}h {mins}m";

        // Aggregate output lines
        MessagesProcessed = Sessions.Sum(s => s.OutputLines.Count);

        // Error count
        ErrorCount = Sessions.Count(s => s.Status == SessionStatus.Error);

        // Rebuild squad tree
        RebuildSquadTree();
    }

    private void RebuildSquadTree()
    {
        SquadTreeItems.Clear();
        Squads.Clear();
        var squadsFound = false;

        foreach (var session in Sessions)
        {
            if (session.Squad is { } squad)
            {
                squadsFound = true;
                if (!Squads.Any(s => s.TeamName == squad.TeamName))
                    Squads.Add(squad);
                AddSquadToTree(squad, 0);
            }
        }

        HasSquads = squadsFound ? Visibility.Visible : Visibility.Collapsed;
        NoSquadsVisible = squadsFound ? Visibility.Collapsed : Visibility.Visible;

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