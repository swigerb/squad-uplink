using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class SquadStatusPanel : UserControl
{
    public static readonly DependencyProperty SelectedSquadProperty =
        DependencyProperty.Register(nameof(SelectedSquad), typeof(SquadInfo),
            typeof(SquadStatusPanel), new PropertyMetadata(null, OnSelectedSquadChanged));

    public SquadInfo? SelectedSquad
    {
        get => (SquadInfo?)GetValue(SelectedSquadProperty);
        set => SetValue(SelectedSquadProperty, value);
    }

    private string _teamName = string.Empty;
    private string _universeText = "—";
    private string _memberCountText = "0 members";
    private string _currentFocusText = "No focus set";
    private string _decisionsSummary = "No recent decisions";
    private Visibility _hasSelection = Visibility.Collapsed;
    private Visibility _noSelectionVisible = Visibility.Visible;

    public string TeamName { get => _teamName; private set { _teamName = value; Bindings.Update(); } }
    public string UniverseText { get => _universeText; private set { _universeText = value; Bindings.Update(); } }
    public string MemberCountText { get => _memberCountText; private set { _memberCountText = value; Bindings.Update(); } }
    public string CurrentFocusText { get => _currentFocusText; private set { _currentFocusText = value; Bindings.Update(); } }
    public string DecisionsSummary { get => _decisionsSummary; private set { _decisionsSummary = value; Bindings.Update(); } }
    public Visibility HasSelection { get => _hasSelection; private set { _hasSelection = value; Bindings.Update(); } }
    public Visibility NoSelectionVisible { get => _noSelectionVisible; private set { _noSelectionVisible = value; Bindings.Update(); } }

    public ObservableCollection<SquadTreeItem> MemberItems { get; } = [];

    public SquadStatusPanel()
    {
        InitializeComponent();
    }

    private static void OnSelectedSquadChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SquadStatusPanel panel)
            panel.UpdateDisplay();
    }

    private void UpdateDisplay()
    {
        var squad = SelectedSquad;
        if (squad is null)
        {
            HasSelection = Visibility.Collapsed;
            NoSelectionVisible = Visibility.Visible;
            return;
        }

        HasSelection = Visibility.Visible;
        NoSelectionVisible = Visibility.Collapsed;

        TeamName = squad.TeamName;
        UniverseText = squad.Universe ?? "—";
        MemberCountText = squad.Members.Count == 1 ? "1 member" : $"{squad.Members.Count} members";
        CurrentFocusText = squad.CurrentFocus ?? "No focus set";

        // Build decisions summary from recent decisions
        if (squad.RecentDecisions.Count > 0)
        {
            var summaryLines = squad.RecentDecisions
                .Take(3)
                .Select(d => $"• {d.Text}");
            DecisionsSummary = string.Join("\n", summaryLines);
        }
        else
        {
            DecisionsSummary = "No recent decisions";
        }

        MemberItems.Clear();
        foreach (var member in squad.Members)
        {
            var emoji = member.Role.ToLowerInvariant() switch
            {
                var r when r.Contains("lead") => "🏗️",
                var r when r.Contains("dev") || r.Contains("engineer") => "🔧",
                var r when r.Contains("test") || r.Contains("qa") => "🧪",
                var r when r.Contains("design") || r.Contains("ui") || r.Contains("ux") => "🎨",
                var r when r.Contains("doc") || r.Contains("write") => "📝",
                var r when r.Contains("ops") || r.Contains("devops") || r.Contains("infra") => "⚙️",
                _ => string.IsNullOrEmpty(member.Emoji) ? "👤" : member.Emoji
            };

            MemberItems.Add(new SquadTreeItem
            {
                DisplayText = member.Name,
                Icon = emoji,
                IsHeader = false,
                Role = member.Role,
                StatusText = member.Status
            });
        }
    }
}
