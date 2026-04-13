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
    private Visibility _hasSquads = Visibility.Collapsed;

    [ObservableProperty]
    private Visibility _noSquadsVisible = Visibility.Visible;

    public ObservableCollection<SessionState> Sessions => _sessionManager.Sessions;

    public ObservableCollection<SquadTreeItem> SquadTreeItems { get; } = [];

    public ObservableCollection<SquadInfo> Squads { get; } = [];

    public DashboardViewModel(ISessionManager sessionManager, IDataService dataService, ISquadDetector squadDetector)
    {
        _sessionManager = sessionManager;
        _dataService = dataService;
        _squadDetector = squadDetector;
        UpdateStats();
        Sessions.CollectionChanged += (_, _) => UpdateStats();
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
        var recent = await _dataService.GetRecentSessionsAsync();
        Log.Debug("Loaded {Count} recent sessions", recent.Count);
        UpdateStats();
    }

    [RelayCommand]
    private void OpenSession(SessionState? session)
    {
        if (session is null) return;
        Log.Debug("Opening session {Id}", session.Id);
        // Navigation handled by the page code-behind
    }

    partial void OnIsGridViewChanged(bool value)
    {
        if (value) IsTabView = false;
    }

    partial void OnIsTabViewChanged(bool value)
    {
        if (value) IsGridView = false;
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
        var squadsFound = false;

        foreach (var session in Sessions)
        {
            if (session.Squad is { } squad)
            {
                squadsFound = true;
                AddSquadToTree(squad, 0);
            }
        }

        HasSquads = squadsFound ? Visibility.Visible : Visibility.Collapsed;
        NoSquadsVisible = squadsFound ? Visibility.Collapsed : Visibility.Visible;
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
