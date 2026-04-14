using SquadUplink.Models;

namespace SquadUplink.Contracts;

public interface ISessionStoreService
{
    /// <summary>Gets all sessions for a given repository (e.g., "swigerb/squad-uplink").</summary>
    Task<IReadOnlyList<SessionStoreEntry>> GetSessionHistoryAsync(string repository, CancellationToken ct = default);

    /// <summary>Gets turn count for a specific session.</summary>
    Task<int> GetTurnCountAsync(string sessionId, CancellationToken ct = default);

    /// <summary>Gets files changed in a specific session.</summary>
    Task<IReadOnlyList<SessionFileChange>> GetFileChangesAsync(string sessionId, CancellationToken ct = default);

    /// <summary>Gets recent activity summary across all repos (last N days).</summary>
    Task<SessionActivitySummary> GetRecentActivityAsync(int days = 7, CancellationToken ct = default);

    /// <summary>Gets commit/PR/issue references for a session.</summary>
    Task<IReadOnlyList<SessionReference>> GetSessionRefsAsync(string sessionId, CancellationToken ct = default);
}
