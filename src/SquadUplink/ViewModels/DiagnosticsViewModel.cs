using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Serilog.Sinks.InMemory;

namespace SquadUplink.ViewModels;

public partial class DiagnosticsViewModel : ViewModelBase
{
    [ObservableProperty]
    private string _logOutput = string.Empty;

    [ObservableProperty]
    private int _selectedLevelIndex = 1; // Debug

    public ObservableCollection<string> LogEntries { get; } = [];

    public DiagnosticsViewModel(ILogger<DiagnosticsViewModel> logger) : base(logger)
    {
        RefreshLogs();
    }

    [RelayCommand]
    private void RefreshLogs()
    {
        LogEntries.Clear();
        var entries = InMemorySink.Instance?.LogEvents ?? [];
        var minLevel = SelectedLevelIndex switch
        {
            0 => Serilog.Events.LogEventLevel.Verbose,
            1 => Serilog.Events.LogEventLevel.Debug,
            2 => Serilog.Events.LogEventLevel.Information,
            3 => Serilog.Events.LogEventLevel.Warning,
            4 => Serilog.Events.LogEventLevel.Error,
            _ => Serilog.Events.LogEventLevel.Debug,
        };

        foreach (var e in entries.Where(e => e.Level >= minLevel))
        {
            LogEntries.Add($"[{e.Timestamp:HH:mm:ss}] [{e.Level.ToString()[..3].ToUpperInvariant()}] {e.RenderMessage()}");
        }

        LogOutput = string.Join(Environment.NewLine, LogEntries);
    }

    [RelayCommand]
    private void ClearLogs()
    {
        LogEntries.Clear();
        LogOutput = string.Empty;
    }

    partial void OnSelectedLevelIndexChanged(int value) => RefreshLogs();
}
