using Microsoft.UI.Xaml.Controls;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class DiagnosticsDialog : ContentDialog
{
    public DiagnosticsViewModel ViewModel { get; }

    public DiagnosticsDialog(DiagnosticsViewModel viewModel)
    {
        ViewModel = viewModel;
        InitializeComponent();
    }
}
