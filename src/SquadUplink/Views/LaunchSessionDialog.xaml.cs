using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Serilog;
using SquadUplink.Models;

namespace SquadUplink.Views;

public sealed partial class LaunchSessionDialog : ContentDialog
{
    private string _workingDirectory = string.Empty;
    private string _initialPrompt = string.Empty;
    private int _selectedModelIndex;
    private bool _isRemote = true;
    private string _validationMessage = string.Empty;

    public string WorkingDirectory
    {
        get => _workingDirectory;
        set
        {
            _workingDirectory = value;
            Validate();
            Bindings.Update();
        }
    }

    public string InitialPrompt
    {
        get => _initialPrompt;
        set { _initialPrompt = value; Bindings.Update(); }
    }

    public int SelectedModelIndex
    {
        get => _selectedModelIndex;
        set { _selectedModelIndex = value; Bindings.Update(); }
    }

    public bool IsRemote
    {
        get => _isRemote;
        set { _isRemote = value; Bindings.Update(); }
    }

    public string ValidationMessage
    {
        get => _validationMessage;
        private set { _validationMessage = value; Bindings.Update(); }
    }

    public bool IsValid => !string.IsNullOrWhiteSpace(WorkingDirectory)
                           && Directory.Exists(WorkingDirectory);

    public bool HasValidationError => !string.IsNullOrEmpty(ValidationMessage);

    public ObservableCollection<string> RecentDirectories { get; } = [];

    public LaunchSessionDialog()
    {
        InitializeComponent();
    }

    public void LoadRecentDirectories(IEnumerable<string> dirs)
    {
        RecentDirectories.Clear();
        foreach (var dir in dirs)
            RecentDirectories.Add(dir);
    }

    public void SetDefaultDirectory(string dir)
    {
        WorkingDirectory = dir;
    }

    public LaunchOptions GetLaunchOptions()
    {
        var modelTag = SelectedModelIndex switch
        {
            1 => "sonnet",
            2 => "opus",
            3 => "haiku",
            _ => null
        };

        return new LaunchOptions
        {
            WorkingDirectory = WorkingDirectory.Trim(),
            InitialPrompt = string.IsNullOrWhiteSpace(InitialPrompt) ? null : InitialPrompt.Trim(),
            ModelOverride = modelTag,
        };
    }

    private void Validate()
    {
        if (string.IsNullOrWhiteSpace(WorkingDirectory))
        {
            ValidationMessage = "Working directory is required.";
        }
        else if (!Directory.Exists(WorkingDirectory))
        {
            ValidationMessage = "Directory does not exist.";
        }
        else
        {
            ValidationMessage = string.Empty;
        }
    }

    private async void BrowseButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var picker = new Windows.Storage.Pickers.FolderPicker();
            picker.SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.ComputerFolder;
            picker.FileTypeFilter.Add("*");

            // Initialize with window handle
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(
                ((App)Application.Current).MainWindow!);
            WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

            var folder = await picker.PickSingleFolderAsync();
            if (folder is not null)
            {
                WorkingDirectory = folder.Path;
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "FolderPicker failed");
        }
    }

    private void RecentDirsCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (RecentDirsCombo.SelectedItem is string dir)
        {
            WorkingDirectory = dir;
        }
    }
}
