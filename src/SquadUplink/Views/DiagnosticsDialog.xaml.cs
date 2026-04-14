using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Serilog.Events;
using SquadUplink.Core.Logging;
using SquadUplink.ViewModels;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage.Pickers;

namespace SquadUplink.Views;

public sealed partial class DiagnosticsDialog : ContentDialog
{
    private readonly DiagnosticsViewModel _viewModel;

    public DiagnosticsDialog(DiagnosticsViewModel viewModel)
    {
        _viewModel = viewModel;
        DataContext = _viewModel;
        InitializeComponent();

        // Wire UI-thread dispatcher for auto-refresh from background log events
        _viewModel.DispatchAction = action => DispatcherQueue.TryEnqueue(() => action());

        _viewModel.CopyToClipboardRequested += OnCopyToClipboard;
        _viewModel.ExportCompleted += OnExportCompleted;
        _viewModel.SaveFileRequested += OnSaveFileRequested;

        // Auto-scroll to top (newest entry) when entries change
        _viewModel.FilteredEntries.CollectionChanged += (_, _) =>
        {
            if (LogList.Items.Count > 0)
                LogList.ScrollIntoView(LogList.Items[0]);
        };
    }

    private void OnCopyToClipboard(string text)
    {
        var dp = new DataPackage();
        dp.SetText(text);
        Clipboard.SetContent(dp);
        ShowCopyTip();
    }

    private void CopyEntry_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button btn && btn.Tag is DiagnosticLogEntry entry)
        {
            _viewModel.CopyEntryCommand.Execute(entry);
        }
    }

    private async void ExportReport_Click(object sender, RoutedEventArgs e)
    {
        await _viewModel.ExportReportCommand.ExecuteAsync(null);
    }

    private async Task<string?> OnSaveFileRequested(string defaultFileName)
    {
        var picker = new FileSavePicker();
        picker.SuggestedStartLocation = PickerLocationId.Desktop;
        picker.FileTypeChoices.Add("Markdown", [".md"]);
        picker.FileTypeChoices.Add("Text", [".txt"]);
        picker.SuggestedFileName = defaultFileName;

        // WinUI 3 requires setting the window handle
        var hWnd = WinRT.Interop.WindowNative.GetWindowHandle(((App)Application.Current).MainWindow);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hWnd);

        var file = await picker.PickSaveFileAsync();
        return file?.Path;
    }

    private void OnExportCompleted(string filePath)
    {
        ExportTip.Subtitle = $"Saved to {filePath}";
        ExportTip.IsOpen = true;

        var timer = DispatcherQueue.CreateTimer();
        timer.Interval = TimeSpan.FromSeconds(4);
        timer.IsRepeating = false;
        timer.Tick += (_, _) => ExportTip.IsOpen = false;
        timer.Start();
    }

    private void LevelFilter_Changed(object sender, SelectionChangedEventArgs e)
    {
        if (LevelFilter.SelectedItem is ComboBoxItem item && item.Tag is string tag)
        {
            _viewModel.SelectedLevel = tag switch
            {
                "Error"       => LogEventLevel.Error,
                "Warning"     => LogEventLevel.Warning,
                "Information" => LogEventLevel.Information,
                "Debug"       => LogEventLevel.Debug,
                _             => null,
            };
        }
    }

    private void ShowCopyTip()
    {
        CopyTip.IsOpen = true;

        var timer = DispatcherQueue.CreateTimer();
        timer.Interval = TimeSpan.FromSeconds(2);
        timer.IsRepeating = false;
        timer.Tick += (_, _) => CopyTip.IsOpen = false;
        timer.Start();
    }
}
