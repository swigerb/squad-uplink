using Microsoft.UI;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Serilog.Events;
using SquadUplink.Core.Logging;

namespace SquadUplink.Converters;

/// <summary>
/// Maps <see cref="LogEventLevel"/> to a background <see cref="SolidColorBrush"/> for badge pills.
/// Uses Lazy to avoid static initializer failure when WinUI runtime is unavailable (unit tests).
/// </summary>
public class LevelToBrushConverter : IValueConverter
{
    private static readonly Lazy<SolidColorBrush> s_fatal = new(() => new(ColorHelper.FromArgb(255, 183, 28, 28)));
    private static readonly Lazy<SolidColorBrush> s_error = new(() => new(ColorHelper.FromArgb(255, 244, 67, 54)));
    private static readonly Lazy<SolidColorBrush> s_warning = new(() => new(ColorHelper.FromArgb(255, 255, 193, 7)));
    private static readonly Lazy<SolidColorBrush> s_info = new(() => new(ColorHelper.FromArgb(255, 33, 150, 243)));
    private static readonly Lazy<SolidColorBrush> s_debug = new(() => new(ColorHelper.FromArgb(255, 158, 158, 158)));
    private static readonly Lazy<SolidColorBrush> s_verbose = new(() => new(ColorHelper.FromArgb(255, 117, 117, 117)));
    private static readonly Lazy<SolidColorBrush> s_default = new(() => new(Colors.Gray));

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is LogEventLevel level)
        {
            return level switch
            {
                LogEventLevel.Fatal       => s_fatal.Value,
                LogEventLevel.Error       => s_error.Value,
                LogEventLevel.Warning     => s_warning.Value,
                LogEventLevel.Information => s_info.Value,
                LogEventLevel.Debug       => s_debug.Value,
                _                         => s_verbose.Value,
            };
        }
        return s_default.Value;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Maps <see cref="LogEventLevel"/> to a foreground text <see cref="SolidColorBrush"/>.
/// </summary>
public class LevelToForegroundConverter : IValueConverter
{
    private static readonly Lazy<SolidColorBrush> s_dark = new(() => new(ColorHelper.FromArgb(255, 51, 51, 51)));
    private static readonly Lazy<SolidColorBrush> s_white = new(() => new(Colors.White));

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is LogEventLevel level)
        {
            return level switch
            {
                LogEventLevel.Warning => s_dark.Value,
                _ => s_white.Value,
            };
        }
        return s_white.Value;
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}

/// <summary>
/// Maps <see cref="LogEventLevel"/> to a line-text foreground color for the inline log panel.
/// Error/Fatal=red, Warning=amber, Debug/Verbose=gray, Info=default text color.
/// </summary>
public class LogLevelToLineForegroundConverter : IValueConverter
{
    private static readonly Lazy<SolidColorBrush> s_errorRed = new(() => new(ColorHelper.FromArgb(255, 244, 67, 54)));
    private static readonly Lazy<SolidColorBrush> s_warningYellow = new(() => new(ColorHelper.FromArgb(255, 255, 193, 7)));
    private static readonly Lazy<SolidColorBrush> s_debugGray = new(() => new(ColorHelper.FromArgb(255, 158, 158, 158)));
    private static readonly Lazy<SolidColorBrush> s_verboseGray = new(() => new(ColorHelper.FromArgb(255, 117, 117, 117)));
    private static readonly Lazy<SolidColorBrush> s_white = new(() => new(Colors.White));

    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is LogEventLevel level)
        {
            return level switch
            {
                LogEventLevel.Fatal       => s_errorRed.Value,
                LogEventLevel.Error       => s_errorRed.Value,
                LogEventLevel.Warning     => s_warningYellow.Value,
                LogEventLevel.Debug       => s_debugGray.Value,
                LogEventLevel.Verbose     => s_verboseGray.Value,
                _                         => s_white.Value,
            };
        }
        return s_white.Value;
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
