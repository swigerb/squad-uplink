using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class DecisionFeedControl : UserControl
{
    public static readonly DependencyProperty DecisionsProperty =
        DependencyProperty.Register(nameof(Decisions), typeof(ObservableCollection<DecisionEntry>),
            typeof(DecisionFeedControl), new PropertyMetadata(null, OnDecisionsChanged));

    public ObservableCollection<DecisionEntry>? Decisions
    {
        get => (ObservableCollection<DecisionEntry>?)GetValue(DecisionsProperty);
        set => SetValue(DecisionsProperty, value);
    }

    private bool _isExpanded = true;
    private Visibility _noDecisionsVisible = Visibility.Visible;

    public bool IsExpanded
    {
        get => _isExpanded;
        set
        {
            _isExpanded = value;
            Bindings.Update();
        }
    }

    public Visibility NoDecisionsVisible
    {
        get => _noDecisionsVisible;
        private set { _noDecisionsVisible = value; Bindings.Update(); }
    }

    public DecisionFeedControl()
    {
        InitializeComponent();
    }

    private static void OnDecisionsChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not DecisionFeedControl control) return;

        if (e.OldValue is ObservableCollection<DecisionEntry> oldCollection)
            oldCollection.CollectionChanged -= control.OnCollectionChanged;

        control.UpdateVisibility();

        if (e.NewValue is ObservableCollection<DecisionEntry> newCollection)
            newCollection.CollectionChanged += control.OnCollectionChanged;
    }

    private void OnCollectionChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
        => UpdateVisibility();

    private void UpdateVisibility()
    {
        var hasItems = Decisions is not null && Decisions.Count > 0;
        NoDecisionsVisible = hasItems ? Visibility.Collapsed : Visibility.Visible;
    }
}
