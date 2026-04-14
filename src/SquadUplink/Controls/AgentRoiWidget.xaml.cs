using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Models;
using System.Collections.ObjectModel;

namespace SquadUplink.Controls;

public sealed partial class AgentRoiWidget : UserControl
{
    public static readonly DependencyProperty AgentBreakdownProperty =
        DependencyProperty.Register(nameof(AgentBreakdown), typeof(IReadOnlyList<AgentTokenSummary>),
            typeof(AgentRoiWidget), new PropertyMetadata(null, OnBreakdownChanged));

    public IReadOnlyList<AgentTokenSummary>? AgentBreakdown
    {
        get => (IReadOnlyList<AgentTokenSummary>?)GetValue(AgentBreakdownProperty);
        set => SetValue(AgentBreakdownProperty, value);
    }

    public ObservableCollection<AgentRoiRow> AgentItems { get; } = new();

    private Visibility _emptyStateVisible = Visibility.Visible;
    private Visibility _tableVisible = Visibility.Collapsed;

    public Visibility EmptyStateVisible { get => _emptyStateVisible; private set { _emptyStateVisible = value; Bindings.Update(); } }
    public Visibility TableVisible { get => _tableVisible; private set { _tableVisible = value; Bindings.Update(); } }

    public AgentRoiWidget()
    {
        InitializeComponent();
    }

    private static void OnBreakdownChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is AgentRoiWidget w) w.UpdateTable();
    }

    private void UpdateTable()
    {
        AgentItems.Clear();
        var data = AgentBreakdown;
        if (data is null || data.Count == 0)
        {
            EmptyStateVisible = Visibility.Visible;
            TableVisible = Visibility.Collapsed;
            return;
        }

        EmptyStateVisible = Visibility.Collapsed;
        TableVisible = Visibility.Visible;

        foreach (var agent in data.OrderByDescending(a => a.TotalCost))
        {
            AgentItems.Add(AgentRoiRow.FromSummary(agent));
        }
    }
}
