using System.Diagnostics;
using Serilog;
using SquadUplink.Contracts;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class OutputCaptureTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    [Fact]
    public void OutputCapture_CanBeConstructed()
    {
        var capture = new OutputCapture();
        Assert.NotNull(capture);
    }

    [Fact]
    public void OutputCapture_ImplementsInterface()
    {
        var capture = new OutputCapture();
        Assert.IsAssignableFrom<IOutputCapture>(capture);
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_CapturesStdout()
    {
        var capture = new OutputCapture(TestLogger);
        // Use ping to produce output over a short duration, avoiding the race
        // where a single echo exits before CaptureAsync subscribes to events.
        var process = StartProcess("cmd.exe", "/c echo Hello from stdout & ping -n 2 127.0.0.1 >nul");

        var lines = new List<string>();
        await foreach (var line in capture.CaptureAsync(process))
        {
            lines.Add(line);
        }

        Assert.Contains(lines, l => l.Contains("Hello from stdout"));
        process.Dispose();
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_CapturesStderr()
    {
        var capture = new OutputCapture(TestLogger);
        var process = StartProcess("cmd.exe", "/c echo error_output 1>&2");

        var lines = new List<string>();
        await foreach (var line in capture.CaptureAsync(process))
        {
            lines.Add(line);
        }

        Assert.Contains(lines, l => l.Contains("[stderr]") && l.Contains("error_output"));
        process.Dispose();
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_HandlesProcessExit()
    {
        var capture = new OutputCapture(TestLogger);
        var process = StartEchoProcess("done");

        var lines = new List<string>();
        await foreach (var line in capture.CaptureAsync(process))
        {
            lines.Add(line);
        }

        // Enumeration should complete after process exits
        Assert.NotEmpty(lines);
        process.Dispose();
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_SupportsCancellation()
    {
        var capture = new OutputCapture(TestLogger);
        // Start a long-running process
        var process = StartProcess("cmd.exe", "/c ping -n 100 127.0.0.1");

        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(200));

        var lines = new List<string>();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await foreach (var line in capture.CaptureAsync(process, cts.Token))
            {
                lines.Add(line);
            }
        });

        try { process.Kill(entireProcessTree: true); } catch { }
        process.Dispose();
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_DetectsTaskUrl()
    {
        var capture = new OutputCapture(TestLogger);
        string? detectedUrl = null;
        capture.TaskUrlDetected += url => detectedUrl = url;

        var process = StartEchoProcess("Visit https://github.com/owner/repo/tasks/42 for details");

        await foreach (var _ in capture.CaptureAsync(process)) { }

        Assert.Equal("https://github.com/owner/repo/tasks/42", detectedUrl);
        process.Dispose();
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_DetectsStatusChange()
    {
        var capture = new OutputCapture(TestLogger);
        var statusChanges = new List<string>();
        capture.StatusChangeDetected += status => statusChanges.Add(status);

        var process = StartEchoProcess("Session started");

        await foreach (var _ in capture.CaptureAsync(process)) { }

        Assert.Contains(statusChanges, s => s.Contains("Session started"));
        process.Dispose();
    }

    // --- Regex tests ---

    [Theory]
    [InlineData("https://github.com/owner/repo/tasks/123", true)]
    [InlineData("http://github.com/a/b/tasks/1", true)]
    [InlineData("github.com/owner/repo/issues/5", false)]
    [InlineData("no url here", false)]
    public void TaskUrlRegex_MatchesCorrectly(string input, bool shouldMatch)
    {
        Assert.Equal(shouldMatch, OutputCapture.TaskUrlRegex().IsMatch(input));
    }

    [Theory]
    [InlineData("Session started", true)]
    [InlineData("Waiting for input", true)]
    [InlineData("Session completed", true)]
    [InlineData("Error: something broke", true)]
    [InlineData("normal output line", false)]
    public void StatusChangeRegex_MatchesCorrectly(string input, bool shouldMatch)
    {
        Assert.Equal(shouldMatch, OutputCapture.StatusChangeRegex().IsMatch(input));
    }

    [Fact(Timeout = 10_000)]
    public async Task CaptureAsync_MultipleLines()
    {
        var capture = new OutputCapture(TestLogger);
        var process = StartProcess("cmd.exe", "/c echo line1 & echo line2 & echo line3");

        var lines = new List<string>();
        await foreach (var line in capture.CaptureAsync(process))
        {
            lines.Add(line);
        }

        Assert.True(lines.Count >= 3, $"Expected at least 3 lines but got {lines.Count}: {string.Join(", ", lines)}");
        process.Dispose();
    }

    private static Process StartEchoProcess(string message)
    {
        return StartProcess("cmd.exe", $"/c echo {message}");
    }

    private static Process StartProcess(string fileName, string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        return Process.Start(psi)!;
    }
}
