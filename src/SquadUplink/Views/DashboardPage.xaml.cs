using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Text;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.Models;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class DashboardPage : Page
{
    public DashboardViewModel ViewModel { get; }

    public DashboardPage()
    {
        ViewModel = App.Services.GetRequiredService<DashboardViewModel>();
        InitializeComponent();
    }

    private void SessionCard_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is SessionState session)
        {
            ViewModel.OpenSessionCommand.Execute(session);
        }
    }

    // Helper functions for x:Bind in DataTemplates
    public static Thickness GetIndentPadding(int indentLevel)
        => new(indentLevel * 16, 0, 0, 0);

    public static Windows.UI.Text.FontWeight GetFontWeight(bool isHeader)
        => isHeader ? FontWeights.SemiBold : FontWeights.Normal;

    public static double GetFontSize(bool isHeader)
        => isHeader ? 13 : 12;
}
