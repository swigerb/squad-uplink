using Microsoft.UI.Xaml.Data;

namespace SquadUplink.Converters;

public class TimeAgoConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        if (value is DateTime dt)
        {
            var elapsed = DateTime.UtcNow - dt;
            return elapsed.TotalSeconds switch
            {
                < 60 => $"{(int)elapsed.TotalSeconds}s ago",
                < 3600 => $"{(int)elapsed.TotalMinutes}m ago",
                < 86400 => $"{(int)elapsed.TotalHours}h ago",
                _ => $"{(int)elapsed.TotalDays}d ago",
            };
        }
        return "—";
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotImplementedException();
}
