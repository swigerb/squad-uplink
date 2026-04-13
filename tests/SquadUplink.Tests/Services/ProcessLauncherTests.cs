using System.Diagnostics;
using Serilog;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class ProcessLauncherTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    [Fact]
    public void Launcher_CanBeConstructed()
    {
        var launcher = new ProcessLauncher();
        Assert.NotNull(launcher);
    }

    [Fact]
    public async Task LaunchAsync_ThrowsForNonexistentDirectory()
    {
        var launcher = new ProcessLauncher(TestLogger, _ => throw new InvalidOperationException("should not reach"));
        await Assert.ThrowsAsync<DirectoryNotFoundException>(
            () => launcher.LaunchAsync(@"C:\nonexistent\path\definitely\not\here"));
    }

    [Fact]
    public async Task LaunchAsync_ThrowsWhenCopilotNotFound()
    {
        // Use a real directory but ensure copilot is not in a fake empty PATH
        var tempDir = Path.Combine(Path.GetTempPath(), $"squad-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            // Override PATH to empty so ResolveCopilotPath returns null
            var originalPath = Environment.GetEnvironmentVariable("PATH");
            try
            {
                Environment.SetEnvironmentVariable("PATH", "");
                var launcher = new ProcessLauncher(TestLogger, _ => null);
                await Assert.ThrowsAsync<FileNotFoundException>(
                    () => launcher.LaunchAsync(tempDir));
            }
            finally
            {
                Environment.SetEnvironmentVariable("PATH", originalPath);
            }
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task LaunchAsync_ReturnsSessionOnSuccess()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"squad-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            // Create a fake copilot executable in a temp PATH dir
            var fakeBinDir = Path.Combine(tempDir, "bin");
            Directory.CreateDirectory(fakeBinDir);
            await File.WriteAllTextAsync(Path.Combine(fakeBinDir, "copilot.exe"), "");

            var originalPath = Environment.GetEnvironmentVariable("PATH");
            try
            {
                Environment.SetEnvironmentVariable("PATH", fakeBinDir + Path.PathSeparator + originalPath);

                // Mock process starter that returns a process-like object
                var mockProcess = CreateMockProcess(99999);

                var launcher = new ProcessLauncher(TestLogger, _ => mockProcess);
                var session = await launcher.LaunchAsync(tempDir);

                Assert.NotNull(session);
                Assert.Equal(tempDir, session.WorkingDirectory);
                Assert.Equal(SessionStatus.Launching, session.Status);
                Assert.True(session.IsRemoteEnabled);
                Assert.Contains("--remote", session.CommandLineArgs);
            }
            finally
            {
                Environment.SetEnvironmentVariable("PATH", originalPath);
            }
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task LaunchAsync_WithLaunchOptions_IncludesResumeAndModel()
    {
        var tempDir = Path.Combine(Path.GetTempPath(), $"squad-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var fakeBinDir = Path.Combine(tempDir, "bin");
            Directory.CreateDirectory(fakeBinDir);
            await File.WriteAllTextAsync(Path.Combine(fakeBinDir, "copilot.exe"), "");

            var originalPath = Environment.GetEnvironmentVariable("PATH");
            try
            {
                Environment.SetEnvironmentVariable("PATH", fakeBinDir + Path.PathSeparator + originalPath);

                ProcessStartInfo? capturedStartInfo = null;
                var mockProcess = CreateMockProcess(88888);

                var launcher = new ProcessLauncher(TestLogger, psi =>
                {
                    capturedStartInfo = psi;
                    return mockProcess;
                });

                var options = new LaunchOptions
                {
                    WorkingDirectory = tempDir,
                    ResumeSessionId = "abc123",
                    ModelOverride = "gpt-4",
                    CustomArgs = ["--verbose"]
                };

                var session = await launcher.LaunchAsync(options);

                Assert.NotNull(capturedStartInfo);
                Assert.Contains("--resume=abc123", capturedStartInfo!.Arguments);
                Assert.Contains("--model=gpt-4", capturedStartInfo.Arguments);
                Assert.Contains("--verbose", capturedStartInfo.Arguments);
                Assert.Contains("--remote", capturedStartInfo.Arguments);
            }
            finally
            {
                Environment.SetEnvironmentVariable("PATH", originalPath);
            }
        }
        finally
        {
            Directory.Delete(tempDir, true);
        }
    }

    [Fact]
    public async Task LaunchAsync_SupportsCancellation()
    {
        var launcher = new ProcessLauncher(TestLogger, _ => null);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => launcher.LaunchAsync(@"C:\", null, cts.Token));
    }

    // --- BuildArguments tests ---

    [Fact]
    public void BuildArguments_DefaultRemoteOnly()
    {
        var options = new LaunchOptions { WorkingDirectory = @"C:\test" };
        var args = ProcessLauncher.BuildArguments(options);
        Assert.Equal("--remote", args);
    }

    [Fact]
    public void BuildArguments_WithResumeId()
    {
        var options = new LaunchOptions { WorkingDirectory = @"C:\test", ResumeSessionId = "sess-42" };
        var args = ProcessLauncher.BuildArguments(options);
        Assert.Contains("--resume=sess-42", args);
        Assert.Contains("--remote", args);
    }

    [Fact]
    public void BuildArguments_WithModelOverride()
    {
        var options = new LaunchOptions { WorkingDirectory = @"C:\test", ModelOverride = "claude-sonnet" };
        var args = ProcessLauncher.BuildArguments(options);
        Assert.Contains("--model=claude-sonnet", args);
    }

    [Fact]
    public void BuildArguments_WithCustomArgs()
    {
        var options = new LaunchOptions
        {
            WorkingDirectory = @"C:\test",
            CustomArgs = ["--verbose", "--no-color"]
        };
        var args = ProcessLauncher.BuildArguments(options);
        Assert.Contains("--verbose", args);
        Assert.Contains("--no-color", args);
    }

    [Fact]
    public void BuildArguments_CombinesAll()
    {
        var options = new LaunchOptions
        {
            WorkingDirectory = @"C:\test",
            ResumeSessionId = "r1",
            ModelOverride = "gpt-5",
            CustomArgs = ["--debug"]
        };
        var args = ProcessLauncher.BuildArguments(options);
        Assert.Equal("--remote --resume=r1 --model=gpt-5 --debug", args);
    }

    /// <summary>
    /// Creates a real process (ping localhost) for testing, returns it before it exits.
    /// </summary>
    private static Process CreateMockProcess(int fakePid = -1)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c echo test",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            CreateNoWindow = true
        };
        var proc = Process.Start(psi)!;
        return proc;
    }
}
