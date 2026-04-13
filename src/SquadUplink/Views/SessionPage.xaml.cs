using Microsoft.Extensions.DependencyInjection;
using Microsoft.UI.Xaml.Controls;
using SquadUplink.ViewModels;

namespace SquadUplink.Views;

public sealed partial class SessionPage : Page
{
    public SessionViewModel ViewModel { get; }

    public SessionPage()
    {
        ViewModel = App.Services.GetRequiredService<SessionViewModel>();
        InitializeComponent();
    }
}
