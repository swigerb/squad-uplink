using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Serilog.Events;
using SquadUplink.Core.Logging;

namespace SquadUplink.Converters;

/// <summary>
/// Maps <see cref="LogEventLevel"/> to a background <see cref="SolidColorBrush"/> for badge pills.
/// </summary>
public class LevelToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is LogEventLevel level)
        {
            return level switch
            {
                LogEventLevel.Fatal   => new SolidColorBrush(ColorHelper.FromArgb(255, 183, 28, 28)),
                LogEventLevel.Error   => new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54)),
                LogEventLevel.Warning => new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7)),
                LogEventLevel.Information => new SolidColorBrush(ColorHelper.FromArgb(255, 33, 150, 243)),
                LogEventLevel.Debug   => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
                _                     => new SolidColorBrush(ColorHelper.FromArgb(255, 117, 117, 117)),
            };
        }
        return new SolidColorBrush(Colors.Gray);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Maps <see cref="LogEventLevel"/> to a foreground text <see cref="SolidColorBrush"/>.
/// </summary>
public class LevelToForegroundConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is LogEventLevel level)
        {
            return level switch
            {
                LogEventLevel.Warning => new SolidColorBrush(ColorHelper.FromArgb(255, 51, 51, 51)),
                _ => new SolidColorBrush(Colors.White),
            };
        }
        return new SolidColorBrush(Colors.White);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Maps <see cref="PayloadType"/> to a user-friendly display string.
/// </summary>
public class PayloadTypeToStringConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is PayloadType type)
        {
            return type switch
            {
                PayloadType.Json          => "JSON",
                PayloadType.StackTrace    => "Stack Trace",
                PayloadType.CommandOutput => "Command Output",
                _                         => "Text",
            };
        }
        return "Text";
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Shows the payload-type badge only for non-PlainText payloads.
/// </summary>
public class PayloadTypeToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is PayloadType type)
            return type != PayloadType.PlainText ? Visibility.Visible : Visibility.Collapsed;
        return Visibility.Collapsed;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}
