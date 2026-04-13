using Serilog;
using Serilog.Sinks.InMemory;

namespace SquadUplink.Services;

public static class LoggingService
{
    public static ILogger CreateLogger()
    {
        var logPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink", "logs", "squad-uplink-.log");

        return new LoggerConfiguration()
            .MinimumLevel.Debug()
            .WriteTo.File(logPath, rollingInterval: RollingInterval.Day, retainedFileCountLimit: 14)
            .WriteTo.Debug()
            .WriteTo.InMemory()
            .CreateLogger();
    }

    public static string GetLogDirectory()
    {
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "SquadUplink", "logs");
    }
}
