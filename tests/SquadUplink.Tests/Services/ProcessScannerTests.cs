using Serilog;
using SquadUplink.Models;
using SquadUplink.Services;
using Xunit;

namespace SquadUplink.Tests.Services;

public class ProcessScannerTests
{
    private static readonly ILogger TestLogger = new LoggerConfiguration().CreateLogger();

    [Fact]
    public void Scanner_CanBeConstructed()
    {
        var scanner = new ProcessScanner();
        Assert.NotNull(scanner);
    }

    [Fact]
    public async Task ScanAsync_ReturnsEmptyListWhenNoCopilotProcesses()
    {
        var scanner = new ProcessScanner(TestLogger, () => []);
        var results = await scanner.ScanAsync();
        Assert.NotNull(results);
        Assert.Empty(results);
        Assert.IsAssignableFrom<IReadOnlyList<SessionState>>(results);
    }

    [Fact]
    public async Task ScanAsync_SupportsCancellation()
    {
        var scanner = new ProcessScanner(TestLogger, () => []);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => scanner.ScanAsync(cts.Token));
    }

    [Fact]
    public async Task ScanAsync_DiscoversCopilotProcesses()
    {
        var fakeProcesses = new[]
        {
            new ProcessInfoSnapshot(1001, "copilot", "--remote --cwd=C:\\projects\\app", null, DateTime.UtcNow),
            new ProcessInfoSnapshot(1002, "notepad", null, null, DateTime.UtcNow),
        };

        var scanner = new ProcessScanner(TestLogger, () => fakeProcesses);
        var results = await scanner.ScanAsync();

        Assert.Single(results);
        Assert.Equal(1001, results[0].ProcessId);
        Assert.Equal("scan-1001", results[0].Id);
        Assert.Equal(SessionStatus.Discovered, results[0].Status);
    }

    [Fact]
    public async Task ScanAsync_DiscoversGitHubCopilotCliProcesses()
    {
        var fakeProcesses = new[]
        {
            new ProcessInfoSnapshot(2001, "github-copilot-cli", "--remote", null, DateTime.UtcNow),
        };

        var scanner = new ProcessScanner(TestLogger, () => fakeProcesses);
        var results = await scanner.ScanAsync();

        Assert.Single(results);
        Assert.Equal(2001, results[0].ProcessId);
    }

    [Fact]
    public async Task ScanAsync_DiscoversNodeWithCopilotArgs()
    {
        var fakeProcesses = new[]
        {
            new ProcessInfoSnapshot(3001, "node", "/usr/lib/copilot/index.js --remote", null, DateTime.UtcNow),
            new ProcessInfoSnapshot(3002, "node", "/usr/lib/express/server.js", null, DateTime.UtcNow),
        };

        var scanner = new ProcessScanner(TestLogger, () => fakeProcesses);
        var results = await scanner.ScanAsync();

        Assert.Single(results);
        Assert.Equal(3001, results[0].ProcessId);
    }

    [Fact]
    public async Task ScanAsync_HandlesProcessProviderError()
    {
        var scanner = new ProcessScanner(TestLogger, () => throw new UnauthorizedAccessException("Access denied"));
        var results = await scanner.ScanAsync();
        Assert.NotNull(results);
        Assert.Empty(results);
    }

    // --- IsCopilotProcess tests ---

    [Theory]
    [InlineData("copilot", "copilot --remote", true)]
    [InlineData("Copilot", "copilot --resume=abc123", true)]
    [InlineData("copilot", "copilot \"fix the login bug\"", true)]
    [InlineData("copilot", null, false)]                          // daemon — no cmdline
    [InlineData("copilot", "copilot.exe", false)]                 // daemon — bare exe, no args
    [InlineData("copilot", "\"C:\\Program Files\\copilot.exe\"", false)] // daemon — quoted path, no args
    [InlineData("github-copilot-cli", "--remote", true)]
    [InlineData("copilot-language-server", "--stdio", false)]     // VS Code extension
    [InlineData("M365Copilot", null, false)]                      // Microsoft 365 Copilot
    [InlineData("node", "/usr/lib/copilot/index.js", true)]
    [InlineData("node", "/usr/lib/express/server.js", false)]
    [InlineData("node", null, false)]
    [InlineData("notepad", null, false)]
    [InlineData("chrome", null, false)]
    public void IsCopilotProcess_ClassifiesCorrectly(string name, string? cmdLine, bool expected)
    {
        var snapshot = new ProcessInfoSnapshot(100, name, cmdLine, null, DateTime.UtcNow);
        Assert.Equal(expected, ProcessScanner.IsCopilotProcess(snapshot));
    }

    // --- ClassifyCopilotProcess diagnostic tests ---

    [Fact]
    public void ClassifyCopilotProcess_ExcludesBareCopilotDaemon()
    {
        var proc = new ProcessInfoSnapshot(33156, "copilot", "copilot.exe", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.False(isMatch);
        Assert.Contains("daemon", reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ClassifyCopilotProcess_ExcludesCopilotLanguageServer()
    {
        var proc = new ProcessInfoSnapshot(5001, "copilot-language-server", "--stdio --node-ipc", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.False(isMatch);
        Assert.Contains("Excluded", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_ExcludesM365Copilot()
    {
        var proc = new ProcessInfoSnapshot(5002, "M365Copilot", null, null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.False(isMatch);
        Assert.Contains("Excluded", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_IncludesCopilotWithPromptArgs()
    {
        var proc = new ProcessInfoSnapshot(6001, "copilot", "copilot.exe \"fix the login page CSS\"", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.True(isMatch);
        Assert.Contains("Interactive", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_IncludesCopilotRemote()
    {
        var proc = new ProcessInfoSnapshot(6002, "copilot", "copilot.exe --remote", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.True(isMatch);
        Assert.Contains("--remote", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_IncludesCopilotResume()
    {
        var proc = new ProcessInfoSnapshot(6003, "copilot", "copilot.exe --resume=SESSION_ID", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.True(isMatch);
        Assert.Contains("--resume", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_IncludesCopilotContinue()
    {
        var proc = new ProcessInfoSnapshot(6004, "copilot", "copilot.exe --continue", null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.True(isMatch);
        Assert.Contains("--continue", reason);
    }

    [Fact]
    public void ClassifyCopilotProcess_ExcludesNullCommandLineDaemon()
    {
        // Bare copilot.exe with no WMI command line = daemon
        var proc = new ProcessInfoSnapshot(40596, "copilot", null, null, DateTime.UtcNow);
        var (isMatch, reason) = ProcessScanner.ClassifyCopilotProcess(proc);
        Assert.False(isMatch);
        Assert.Contains("daemon", reason, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ScanAsync_ExcludesDaemonsFromSessionCount()
    {
        var fakeProcesses = new[]
        {
            // Daemon processes — should be excluded
            new ProcessInfoSnapshot(33156, "copilot", "copilot.exe", null, DateTime.UtcNow),
            new ProcessInfoSnapshot(40596, "copilot", null, null, DateTime.UtcNow),
            new ProcessInfoSnapshot(5001, "copilot-language-server", "--stdio", null, DateTime.UtcNow),
            new ProcessInfoSnapshot(5002, "M365Copilot", null, null, DateTime.UtcNow),
            // Interactive session — should be included
            new ProcessInfoSnapshot(7001, "copilot", "copilot.exe --remote", null, DateTime.UtcNow),
            new ProcessInfoSnapshot(7002, "copilot", "copilot.exe \"fix bug in auth\"", null, DateTime.UtcNow),
        };

        var scanner = new ProcessScanner(TestLogger, () => fakeProcesses);
        var results = await scanner.ScanAsync();

        Assert.Equal(2, results.Count);
        Assert.Equal(7001, results[0].ProcessId);
        Assert.Equal(7002, results[1].ProcessId);
    }

    // --- BuildSessionState tests ---

    [Fact]
    public void BuildSessionState_DetectsRemoteFlag()
    {
        var snapshot = new ProcessInfoSnapshot(500, "copilot", "copilot --remote --verbose", null, DateTime.UtcNow);
        var session = ProcessScanner.BuildSessionState(snapshot);

        Assert.NotNull(session);
        Assert.True(session.IsRemoteEnabled);
    }

    [Fact]
    public void BuildSessionState_DetectsNonRemote()
    {
        var snapshot = new ProcessInfoSnapshot(501, "copilot", "copilot --local", null, DateTime.UtcNow);
        var session = ProcessScanner.BuildSessionState(snapshot);

        Assert.NotNull(session);
        Assert.False(session.IsRemoteEnabled);
    }

    [Fact]
    public void BuildSessionState_ExtractsTaskUrl()
    {
        var snapshot = new ProcessInfoSnapshot(
            502, "copilot",
            "copilot --remote https://github.com/octocat/hello-world/tasks/42",
            null, DateTime.UtcNow);
        var session = ProcessScanner.BuildSessionState(snapshot);

        Assert.NotNull(session);
        Assert.Equal("https://github.com/octocat/hello-world/tasks/42", session.GitHubTaskUrl);
    }

    [Fact]
    public void BuildSessionState_UsesSnapshotStartTime()
    {
        var expected = new DateTime(2025, 1, 15, 10, 30, 0);
        var snapshot = new ProcessInfoSnapshot(503, "copilot", null, null, expected);
        var session = ProcessScanner.BuildSessionState(snapshot);

        Assert.NotNull(session);
        Assert.Equal(expected, session.StartedAt);
    }

    // --- ExtractWorkingDirectory tests ---

    [Theory]
    [InlineData("--cwd=C:\\projects\\app", "C:\\projects\\app")]
    [InlineData("--working-directory=/home/user/repo", "/home/user/repo")]
    [InlineData("--cwd=\"C:\\my projects\\app\"", "C:\\my projects\\app")]
    [InlineData("copilot --remote", null)]
    [InlineData("", null)]
    public void ExtractWorkingDirectory_ParsesCorrectly(string commandLine, string? expected)
    {
        Assert.Equal(expected, ProcessScanner.ExtractWorkingDirectory(commandLine));
    }

    // --- ExtractTaskUrl tests ---

    [Theory]
    [InlineData("github.com/owner/repo/tasks/123", "https://github.com/owner/repo/tasks/123")]
    [InlineData("Visit https://github.com/octo/cat/tasks/99 for details", "https://github.com/octo/cat/tasks/99")]
    [InlineData("no url here", null)]
    [InlineData("github.com/owner/repo/issues/5", null)]
    [InlineData("", null)]
    public void ExtractTaskUrl_ParsesCorrectly(string text, string? expected)
    {
        Assert.Equal(expected, ProcessScanner.ExtractTaskUrl(text));
    }
}
