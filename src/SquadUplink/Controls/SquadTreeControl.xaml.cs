using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class SquadTreeControl : UserControl
{
    public static readonly DependencyProperty SquadsProperty =
        DependencyProperty.Register(nameof(Squads), typeof(ObservableCollection<SquadInfo>),
            typeof(SquadTreeControl), new PropertyMetadata(null, OnSquadsChanged));

    public ObservableCollection<SquadInfo>? Squads
    {
        get => (ObservableCollection<SquadInfo>?)GetValue(SquadsProperty);
        set => SetValue(SquadsProperty, value);
    }

    public event EventHandler<SquadInfo>? SquadSelected;

    private Visibility _hasSquads = Visibility.Collapsed;
    private Visibility _noSquadsVisible = Visibility.Visible;

    public Visibility HasSquads
    {
        get => _hasSquads;
        private set { _hasSquads = value; Bindings.Update(); }
    }

    public Visibility NoSquadsVisible
    {
        get => _noSquadsVisible;
        private set { _noSquadsVisible = value; Bindings.Update(); }
    }

    public SquadTreeControl()
    {
        InitializeComponent();
    }

    private static void OnSquadsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is SquadTreeControl control)
        {
            control.RebuildTree();

            if (e.NewValue is ObservableCollection<SquadInfo> newCollection)
            {
                newCollection.CollectionChanged += (_, _) => control.RebuildTree();
            }
        }
    }

    public void RebuildTree()
    {
        SquadTree.RootNodes.Clear();
        var squads = Squads;

        if (squads is null || squads.Count == 0)
        {
            HasSquads = Visibility.Collapsed;
            NoSquadsVisible = Visibility.Visible;
            return;
        }

        HasSquads = Visibility.Visible;
        NoSquadsVisible = Visibility.Collapsed;

        foreach (var squad in squads)
        {
            var squadNode = CreateSquadNode(squad);
            SquadTree.RootNodes.Add(squadNode);
        }
    }

    private static TreeViewNode CreateSquadNode(SquadInfo squad)
    {
        var node = new TreeViewNode
        {
            Content = new SquadTreeItem
            {
                DisplayText = squad.TeamName,
                Icon = "🏢",
                IsHeader = true,
                StatusText = squad.Universe ?? "",
                Role = $"{squad.Members.Count} members"
            },
            IsExpanded = true
        };

        // Add member nodes
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

            var memberNode = new TreeViewNode
            {
                Content = new SquadTreeItem
                {
                    DisplayText = member.Name,
                    Icon = emoji,
                    IsHeader = false,
                    Role = member.Role,
                    StatusText = member.Status
                }
            };
            node.Children.Add(memberNode);
        }

        // Add sub-squad nodes
        foreach (var subSquad in squad.SubSquads)
        {
            var subNode = CreateSquadNode(subSquad);
            node.Children.Add(subNode);
        }

        return node;
    }

    private void SquadTree_ItemInvoked(TreeView sender, TreeViewItemInvokedEventArgs args)
    {
        if (args.InvokedItem is TreeViewNode node && node.Content is SquadTreeItem item && item.IsHeader)
        {
            // Find the matching SquadInfo
            var squad = FindSquadByName(Squads, item.DisplayText);
            if (squad is not null)
                SquadSelected?.Invoke(this, squad);
        }
    }

    private static SquadInfo? FindSquadByName(ObservableCollection<SquadInfo>? squads, string name)
    {
        if (squads is null) return null;
        foreach (var squad in squads)
        {
            if (squad.TeamName == name) return squad;
            var found = FindSquadInChildren(squad.SubSquads, name);
            if (found is not null) return found;
        }
        return null;
    }

    private static SquadInfo? FindSquadInChildren(List<SquadInfo> subSquads, string name)
    {
        foreach (var sub in subSquads)
        {
            if (sub.TeamName == name) return sub;
            var found = FindSquadInChildren(sub.SubSquads, name);
            if (found is not null) return found;
        }
        return null;
    }
}
