using Microsoft.UI;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using SquadUplink.Models;

namespace SquadUplink.Converters;

public class StatusToBrushConverter : IValueConverter
{
    private static readonly Lazy<SolidColorBrush> s_running = new(() => new(ColorHelper.FromArgb(255, 0, 200, 83)));
    private static readonly Lazy<SolidColorBrush> s_launching = new(() => new(ColorHelper.FromArgb(255, 33, 150, 243)));
    private static readonly Lazy<SolidColorBrush> s_idle = new(() => new(ColorHelper.FromArgb(255, 255, 193, 7)));
    private static readonly Lazy<SolidColorBrush> s_error = new(() => new(ColorHelper.FromArgb(255, 244, 67, 54)));
    private static readonly Lazy<SolidColorBrush> s_completed = new(() => new(ColorHelper.FromArgb(255, 158, 158, 158)));
    private static readonly Lazy<SolidColorBrush> s_default = new(() => new(Colors.Gray));

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is SessionStatus status)
        {
            return StatusToBrush(status);
        }
        return s_default.Value;
    }

    internal static SolidColorBrush StatusToBrush(SessionStatus status) => status switch
    {
        SessionStatus.Running => s_running.Value,
        SessionStatus.Launching => s_launching.Value,
        SessionStatus.Idle => s_idle.Value,
        SessionStatus.Error => s_error.Value,
        SessionStatus.Completed => s_completed.Value,
        SessionStatus.Discovered => s_launching.Value,
        _ => s_completed.Value,
    };

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
