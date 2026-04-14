using CommunityToolkit.Mvvm.ComponentModel;
using Microsoft.Extensions.Logging;

namespace SquadUplink.ViewModels;

/// <summary>
/// Base class for all ViewModels. Provides INotifyPropertyChanged via ObservableObject,
/// a standard pattern for async busy-state tracking, error/status messaging,
/// and IDisposable for cancellation cleanup.
/// </summary>
public abstract partial class ViewModelBase : ObservableObject, IDisposable
{
    private readonly CancellationTokenSource _cts = new();

    [ObservableProperty]
    private bool _isBusy;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string? _errorMessage;

    [ObservableProperty]
    private string? _statusMessage;

    protected CancellationToken CancellationToken => _cts.Token;
    protected ILogger Logger { get; }

    protected ViewModelBase(ILogger logger)
    {
        Logger = logger;
    }

    /// <summary>
    /// Runs an async action with busy-state tracking and error handling.
    /// Re-entrant calls while busy are ignored.
    /// </summary>
    protected async Task RunBusyAsync(Func<Task> action, string? errorContext = null)
    {
        if (IsBusy) return;
        IsBusy = true;
        ErrorMessage = null;
        try
        {
            await action();
        }
        catch (OperationCanceledException) { /* Expected on dispose */ }
        catch (Exception ex)
        {
            ErrorMessage = $"{errorContext ?? "Operation"} failed: {ex.Message}";
            Logger.LogError(ex, "ViewModel operation failed: {Context}", errorContext);
        }
        finally
        {
            IsBusy = false;
        }
    }

    protected void ClearError() => ErrorMessage = null;

    public virtual void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
        GC.SuppressFinalize(this);
    }
}
