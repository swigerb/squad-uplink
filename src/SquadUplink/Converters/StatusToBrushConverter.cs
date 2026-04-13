using Microsoft.UI;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Models;

namespace SquadUplink.Converters;

public class StatusToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is SessionStatus status)
        {
            return status switch
            {
                SessionStatus.Running => new SolidColorBrush(ColorHelper.FromArgb(255, 0, 200, 83)),
                SessionStatus.Launching => new SolidColorBrush(ColorHelper.FromArgb(255, 33, 150, 243)),
                SessionStatus.Idle => new SolidColorBrush(ColorHelper.FromArgb(255, 255, 193, 7)),
                SessionStatus.Error => new SolidColorBrush(ColorHelper.FromArgb(255, 244, 67, 54)),
                SessionStatus.Completed => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
                SessionStatus.Discovered => new SolidColorBrush(ColorHelper.FromArgb(255, 33, 150, 243)),
                _ => new SolidColorBrush(ColorHelper.FromArgb(255, 158, 158, 158)),
            };
        }
        return new SolidColorBrush(Colors.Gray);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

public class StatusToTextConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is SessionStatus status)
        {
            return status switch
            {
                SessionStatus.Running => "● RUNNING",
                SessionStatus.Launching => "◐ LAUNCHING",
                SessionStatus.Idle => "◑ IDLE",
                SessionStatus.Error => "✕ ERROR",
                SessionStatus.Completed => "○ COMPLETED",
                SessionStatus.Discovered => "◎ DISCOVERED",
                _ => "? UNKNOWN",
            };
        }
        return "? UNKNOWN";
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

public class StatusToIconConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is SessionStatus status)
        {
            return status switch
            {
                SessionStatus.Running => "\uE768",     // Play
                SessionStatus.Launching => "\uE895",   // Rocket
                SessionStatus.Idle => "\uE769",        // Pause
                SessionStatus.Error => "\uEA39",       // Error
                SessionStatus.Completed => "\uE73E",   // CheckMark
                SessionStatus.Discovered => "\uE773",  // Search
                _ => "\uE11B",                         // Question
            };
        }
        return "\uE11B";
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}
