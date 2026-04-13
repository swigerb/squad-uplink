using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Serilog;
using SquadUplink.Contracts;

namespace SquadUplink.Services;

public partial class OutputCapture : IOutputCapture
{
    private readonly ILogger _logger;

    [GeneratedRegex(@"https?://github\.com/([^/\s]+)/([^/\s]+)/tasks/(\d+)")]
    internal static partial Regex TaskUrlRegex();

    [GeneratedRegex(@"(Session started|Waiting for input|Session completed|Error:)", RegexOptions.IgnoreCase)]
    internal static partial Regex StatusChangeRegex();

    public event Action<string>? TaskUrlDetected;
    public event Action<string>? StatusChangeDetected;

    public OutputCapture() : this(Log.Logger) { }

    public OutputCapture(ILogger logger)
    {
        _logger = logger;
    }

    public async IAsyncEnumerable<string> CaptureAsync(
        Process process,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var channel = Channel.CreateBounded<string>(new BoundedChannelOptions(1000)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false
        });

        void OnOutputData(object sender, DataReceivedEventArgs e)
        {
            if (e.Data is not null)
                channel.Writer.TryWrite(e.Data);
        }

        void OnErrorData(object sender, DataReceivedEventArgs e)
        {
            if (e.Data is not null)
                channel.Writer.TryWrite($"[stderr] {e.Data}");
        }

        void OnProcessExited(object? sender, EventArgs e)
        {
            channel.Writer.TryComplete();
        }

        try
        {
            if (process.StartInfo.RedirectStandardOutput)
            {
                process.OutputDataReceived += OnOutputData;
                process.BeginOutputReadLine();
            }

            if (process.StartInfo.RedirectStandardError)
            {
                process.ErrorDataReceived += OnErrorData;
                process.BeginErrorReadLine();
            }

            process.EnableRaisingEvents = true;
            process.Exited += OnProcessExited;

            // Handle case where process already exited before we subscribed
            try
            {
                if (process.HasExited)
                    channel.Writer.TryComplete();
            }
            catch (InvalidOperationException)
            {
                channel.Writer.TryComplete();
            }

            await foreach (var line in channel.Reader.ReadAllAsync(ct))
            {
                var urlMatch = TaskUrlRegex().Match(line);
                if (urlMatch.Success)
                {
                    TaskUrlDetected?.Invoke(urlMatch.Value);
                    _logger.Information("Detected task URL: {Url}", urlMatch.Value);
                }

                var statusMatch = StatusChangeRegex().Match(line);
                if (statusMatch.Success)
                {
                    StatusChangeDetected?.Invoke(statusMatch.Value);
                    _logger.Debug("Detected status change: {Status}", statusMatch.Value);
                }

                yield return line;
            }
        }
        finally
        {
            process.OutputDataReceived -= OnOutputData;
            process.ErrorDataReceived -= OnErrorData;
            process.Exited -= OnProcessExited;
            channel.Writer.TryComplete();
            _logger.Debug("Output capture ended for PID {Pid}", process.Id);
        }
    }
}
