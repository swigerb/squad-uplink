using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using SquadUplink.Models;

namespace SquadUplink.Controls;

public sealed partial class CommandPalette : UserControl
{
    private List<CommandItem> _allCommands = [];
    private readonly List<CommandItem> _filteredCommands = [];

    /// <summary>
    /// Raised when the palette is dismissed without executing a command.
    /// </summary>
    public event EventHandler? Dismissed;

    public bool IsOpen => OverlayRoot.Visibility == Visibility.Visible;

    public CommandPalette()
    {
        InitializeComponent();
    }

    /// <summary>
    /// Registers the full command list to display.
    /// </summary>
    public void SetCommands(IEnumerable<CommandItem> commands)
    {
        _allCommands = commands.ToList();
        ApplyFilter(string.Empty);
    }

    /// <summary>
    /// Shows the palette overlay and focuses the search box.
    /// </summary>
    public void Show()
    {
        OverlayRoot.Visibility = Visibility.Visible;
        SearchBox.Text = string.Empty;
        ApplyFilter(string.Empty);
        SearchBox.Focus(FocusState.Programmatic);
    }

    /// <summary>
    /// Hides the palette overlay.
    /// </summary>
    public void Hide()
    {
        OverlayRoot.Visibility = Visibility.Collapsed;
        Dismissed?.Invoke(this, EventArgs.Empty);
    }

    /// <summary>
    /// Toggles visibility.
    /// </summary>
    public void Toggle()
    {
        if (IsOpen) Hide(); else Show();
    }

    /// <summary>
    /// Filters commands based on query text. Exposed for testing.
    /// </summary>
    internal List<CommandItem> FilterCommands(string query)
    {
        _filteredCommands.Clear();
        foreach (var c in _allCommands)
            if (c.MatchesQuery(query)) _filteredCommands.Add(c);
        return _filteredCommands;
    }

    private void ApplyFilter(string query)
    {
        FilterCommands(query);
        CommandList.ItemsSource = _filteredCommands;
        if (_filteredCommands.Count > 0)
            CommandList.SelectedIndex = 0;
    }

    private void SearchBox_TextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        if (args.Reason == AutoSuggestionBoxTextChangeReason.UserInput)
        {
            ApplyFilter(sender.Text);
        }
    }

    private void SearchBox_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        ExecuteSelected();
    }

    private void CommandList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is CommandItem command)
        {
            Hide();
            command.Execute();
        }
    }

    private void Overlay_Tapped(object sender, TappedRoutedEventArgs e)
    {
        Hide();
    }

    private void ExecuteSelected()
    {
        if (CommandList.SelectedItem is CommandItem command)
        {
            Hide();
            command.Execute();
        }
    }

    /// <summary>
    /// Handles Escape key to dismiss.
    /// </summary>
    internal void HandleKeyDown(Windows.System.VirtualKey key)
    {
        if (key == Windows.System.VirtualKey.Escape)
        {
            Hide();
        }
        else if (key == Windows.System.VirtualKey.Enter)
        {
            ExecuteSelected();
        }
    }
}
