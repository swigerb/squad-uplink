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
    [InlineData("copilot", null, true)]
    [InlineData("Copilot", null, true)]
    [InlineData("github-copilot-cli", null, true)]
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
