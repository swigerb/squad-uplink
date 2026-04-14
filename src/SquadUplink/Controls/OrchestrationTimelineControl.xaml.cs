using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class OrchestrationTimelineControl : UserControl
{
    public static readonly DependencyProperty EntriesProperty =
        DependencyProperty.Register(nameof(Entries), typeof(ObservableCollection<OrchestrationEntry>),
            typeof(OrchestrationTimelineControl), new PropertyMetadata(null, OnEntriesChanged));

    public ObservableCollection<OrchestrationEntry>? Entries
    {
        get => (ObservableCollection<OrchestrationEntry>?)GetValue(EntriesProperty);
        set => SetValue(EntriesProperty, value);
    }

    private Visibility _noEntriesVisible = Visibility.Visible;

    public Visibility NoEntriesVisible
    {
        get => _noEntriesVisible;
        private set { _noEntriesVisible = value; Bindings.Update(); }
    }

    public OrchestrationTimelineControl()
    {
        InitializeComponent();
    }

    private static void OnEntriesChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is not OrchestrationTimelineControl control) return;

        if (e.OldValue is ObservableCollection<OrchestrationEntry> oldCollection)
            oldCollection.CollectionChanged -= control.OnCollectionChanged;

        control.UpdateVisibility();

        if (e.NewValue is ObservableCollection<OrchestrationEntry> newCollection)
            newCollection.CollectionChanged += control.OnCollectionChanged;
    }

    private void OnCollectionChanged(object? sender, System.Collections.Specialized.NotifyCollectionChangedEventArgs e)
        => UpdateVisibility();

    private void UpdateVisibility()
    {
        var hasItems = Entries is not null && Entries.Count > 0;
        NoEntriesVisible = hasItems ? Visibility.Collapsed : Visibility.Visible;
    }
}
