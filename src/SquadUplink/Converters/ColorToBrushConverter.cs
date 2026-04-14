using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace SquadUplink.Converters;

/// <summary>
/// Converts a <see cref="Color"/> value to a <see cref="SolidColorBrush"/>.
/// Used by SettingsPage theme preview to keep UI types out of the ViewModel.
/// </summary>
public class ColorToSolidColorBrushConverter : IValueConverter
{
    public object? Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is Color color)
            return new SolidColorBrush(color);
        return null;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}
