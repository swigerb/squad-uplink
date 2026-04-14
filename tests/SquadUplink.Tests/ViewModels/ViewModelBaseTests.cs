using Microsoft.Extensions.Logging;
using Moq;
using SquadUplink.ViewModels;
using Xunit;

namespace SquadUplink.Tests.ViewModels;

/// <summary>
/// Comprehensive tests for ViewModelBase — busy-state tracking, error handling,
/// cancellation, reentrant guards, and disposal.
/// </summary>
public class ViewModelBaseTests
{
    /// <summary>Concrete test double to exercise the abstract base class.</summary>
    private sealed class TestViewModel : ViewModelBase
    {
        public TestViewModel(ILogger logger) : base(logger) { }
        public new CancellationToken CancellationToken => base.CancellationToken;
        public new ILogger Logger => base.Logger;
        public new Task RunBusyAsync(Func<Task> action, string? errorContext = null) => base.RunBusyAsync(action, errorContext);
        public new void ClearError() => base.ClearError();
    }

    private static (TestViewModel vm, Mock<ILogger> logger) Create()
    {
        var logger = new Mock<ILogger>();
        return (new TestViewModel(logger.Object), logger);
    }

    // ─── Construction ──────────────────────────────────────────

    [Fact]
    public void Constructor_SetsLoggerProperty()
    {
        var (vm, logger) = Create();
        Assert.Same(logger.Object, vm.Logger);
    }

    [Fact]
    public void Constructor_DefaultState()
    {
        var (vm, _) = Create();
        Assert.False(vm.IsBusy);
        Assert.False(vm.IsLoading);
        Assert.Null(vm.ErrorMessage);
        Assert.Null(vm.StatusMessage);
    }

    // ─── IsBusy tracking ───────────────────────────────────────

    [Fact]
    public async Task RunBusyAsync_TogglesIsBusy()
    {
        var (vm, _) = Create();
        bool wasBusyDuringAction = false;

        await vm.RunBusyAsync(async () =>
        {
            wasBusyDuringAction = vm.IsBusy;
            await Task.CompletedTask;
        });

        Assert.True(wasBusyDuringAction, "Should be busy during action");
        Assert.False(vm.IsBusy, "Should not be busy after completion");
    }

    [Fact]
    public async Task RunBusyAsync_IsBusyFalseAfterException()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new InvalidOperationException("boom"));

        Assert.False(vm.IsBusy, "IsBusy must reset even after exceptions");
    }

    [Fact]
    public async Task RunBusyAsync_IsBusyFalseAfterCancellation()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new OperationCanceledException());

        Assert.False(vm.IsBusy, "IsBusy must reset after cancellation");
    }

    // ─── ErrorMessage handling ─────────────────────────────────

    [Fact]
    public async Task RunBusyAsync_SetsErrorMessageOnException()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(
            () => throw new InvalidOperationException("disk full"),
            "Save file");

        Assert.Equal("Save file failed: disk full", vm.ErrorMessage);
    }

    [Fact]
    public async Task RunBusyAsync_UsesDefaultContext_WhenNullProvided()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new InvalidOperationException("oops"));

        Assert.Equal("Operation failed: oops", vm.ErrorMessage);
    }

    [Fact]
    public async Task RunBusyAsync_ClearsErrorMessage_BeforeRunning()
    {
        var (vm, _) = Create();

        // Set an initial error
        await vm.RunBusyAsync(() => throw new InvalidOperationException("first"));
        Assert.NotNull(vm.ErrorMessage);

        // Run a successful action — error should be cleared
        await vm.RunBusyAsync(() => Task.CompletedTask);
        Assert.Null(vm.ErrorMessage);
    }

    [Fact]
    public async Task RunBusyAsync_DoesNotSetErrorOnCancellation()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new OperationCanceledException());

        Assert.Null(vm.ErrorMessage);
    }

    [Fact]
    public async Task RunBusyAsync_DoesNotSetErrorOnTaskCancelledException()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new TaskCanceledException());

        Assert.Null(vm.ErrorMessage);
    }

    // ─── ClearError ────────────────────────────────────────────

    [Fact]
    public void ClearError_ResetsErrorMessage()
    {
        var (vm, _) = Create();
        vm.ErrorMessage = "some error";
        vm.ClearError();
        Assert.Null(vm.ErrorMessage);
    }

    [Fact]
    public void ClearError_IsIdempotent()
    {
        var (vm, _) = Create();
        vm.ClearError();
        vm.ClearError();
        Assert.Null(vm.ErrorMessage);
    }

    // ─── Reentrant safety ──────────────────────────────────────

    [Fact]
    public async Task RunBusyAsync_ReentrantCallIsIgnored()
    {
        var (vm, _) = Create();
        int callCount = 0;
        var tcs = new TaskCompletionSource();

        var firstCall = vm.RunBusyAsync(async () =>
        {
            Interlocked.Increment(ref callCount);
            await tcs.Task; // Hold busy
        });

        // Second call while first is still busy
        await vm.RunBusyAsync(async () =>
        {
            Interlocked.Increment(ref callCount);
            await Task.CompletedTask;
        });

        tcs.SetResult();
        await firstCall;

        Assert.Equal(1, callCount);
    }

    [Fact]
    public async Task RunBusyAsync_CanRunAgainAfterCompletion()
    {
        var (vm, _) = Create();
        int callCount = 0;

        await vm.RunBusyAsync(async () =>
        {
            callCount++;
            await Task.CompletedTask;
        });
        await vm.RunBusyAsync(async () =>
        {
            callCount++;
            await Task.CompletedTask;
        });

        Assert.Equal(2, callCount);
    }

    [Fact]
    public async Task RunBusyAsync_CanRunAgainAfterError()
    {
        var (vm, _) = Create();
        int callCount = 0;

        await vm.RunBusyAsync(() => { callCount++; throw new Exception("fail"); });
        await vm.RunBusyAsync(() => { callCount++; return Task.CompletedTask; });

        Assert.Equal(2, callCount);
    }

    // ─── CancellationToken and Dispose ─────────────────────────

    [Fact]
    public void CancellationToken_NotCancelled_BeforeDispose()
    {
        var (vm, _) = Create();
        Assert.False(vm.CancellationToken.IsCancellationRequested);
    }

    [Fact]
    public void Dispose_CancelsCancellationToken()
    {
        var (vm, _) = Create();
        var token = vm.CancellationToken;
        vm.Dispose();
        Assert.True(token.IsCancellationRequested);
    }

    [Fact]
    public void Dispose_CanBeCalledOnce()
    {
        var (vm, _) = Create();
        vm.Dispose(); // Should not throw
    }

    [Fact]
    public void CancellationToken_ThrowsAfterDispose()
    {
        var (vm, _) = Create();
        var token = vm.CancellationToken;
        vm.Dispose();
        // Token was cancelled before CTS was disposed, so ThrowIfCancellationRequested throws
        Assert.Throws<OperationCanceledException>(() => token.ThrowIfCancellationRequested());
    }

    // ─── Logging ───────────────────────────────────────────────

    [Fact]
    public async Task RunBusyAsync_LogsErrorOnException()
    {
        var (vm, logger) = Create();

        await vm.RunBusyAsync(
            () => throw new InvalidOperationException("test error"),
            "TestOp");

        logger.Verify(
            x => x.Log(
                LogLevel.Error,
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => true),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Once);
    }

    [Fact]
    public async Task RunBusyAsync_DoesNotLogOnCancellation()
    {
        var (vm, logger) = Create();

        await vm.RunBusyAsync(() => throw new OperationCanceledException());

        logger.Verify(
            x => x.Log(
                It.IsAny<LogLevel>(),
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => true),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Never);
    }

    [Fact]
    public async Task RunBusyAsync_DoesNotLogOnSuccess()
    {
        var (vm, logger) = Create();

        await vm.RunBusyAsync(() => Task.CompletedTask);

        logger.Verify(
            x => x.Log(
                It.IsAny<LogLevel>(),
                It.IsAny<EventId>(),
                It.Is<It.IsAnyType>((v, t) => true),
                It.IsAny<Exception>(),
                It.IsAny<Func<It.IsAnyType, Exception?, string>>()),
            Times.Never);
    }

    // ─── Observable properties ─────────────────────────────────

    [Fact]
    public void StatusMessage_RaisesPropertyChanged()
    {
        var (vm, _) = Create();
        var changed = false;
        vm.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(ViewModelBase.StatusMessage))
                changed = true;
        };

        vm.StatusMessage = "Ready";
        Assert.True(changed);
    }

    [Fact]
    public void ErrorMessage_RaisesPropertyChanged()
    {
        var (vm, _) = Create();
        var changed = false;
        vm.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(ViewModelBase.ErrorMessage))
                changed = true;
        };

        vm.ErrorMessage = "Failure";
        Assert.True(changed);
    }

    [Fact]
    public void IsBusy_RaisesPropertyChanged()
    {
        var (vm, _) = Create();
        var changed = false;
        vm.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(ViewModelBase.IsBusy))
                changed = true;
        };

        vm.IsBusy = true;
        Assert.True(changed);
    }

    [Fact]
    public void IsLoading_RaisesPropertyChanged()
    {
        var (vm, _) = Create();
        var changed = false;
        vm.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(ViewModelBase.IsLoading))
                changed = true;
        };

        vm.IsLoading = true;
        Assert.True(changed);
    }

    [Fact]
    public void IsLoading_CanBeSetAndRead()
    {
        var (vm, _) = Create();
        vm.IsLoading = true;
        Assert.True(vm.IsLoading);
        vm.IsLoading = false;
        Assert.False(vm.IsLoading);
    }

    [Fact]
    public void StatusMessage_CanBeSetAndRead()
    {
        var (vm, _) = Create();
        vm.StatusMessage = "test message";
        Assert.Equal("test message", vm.StatusMessage);
    }

    // ─── IDisposable pattern ───────────────────────────────────

    [Fact]
    public void ImplementsIDisposable()
    {
        var (vm, _) = Create();
        Assert.IsAssignableFrom<IDisposable>(vm);
    }

    [Fact]
    public void InheritsFromObservableObject()
    {
        var (vm, _) = Create();
        Assert.IsAssignableFrom<CommunityToolkit.Mvvm.ComponentModel.ObservableObject>(vm);
    }

    // ─── Successive error replacement ──────────────────────────

    [Fact]
    public async Task RunBusyAsync_ReplacesError_OnSubsequentFailure()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(() => throw new Exception("first"), "Op1");
        Assert.Equal("Op1 failed: first", vm.ErrorMessage);

        await vm.RunBusyAsync(() => throw new Exception("second"), "Op2");
        Assert.Equal("Op2 failed: second", vm.ErrorMessage);
    }

    [Fact]
    public async Task RunBusyAsync_PreservesErrorContext_InMessage()
    {
        var (vm, _) = Create();

        await vm.RunBusyAsync(
            () => throw new ArgumentException("bad arg"),
            "Validate input");

        Assert.StartsWith("Validate input failed:", vm.ErrorMessage);
        Assert.Contains("bad arg", vm.ErrorMessage!);
    }
}
