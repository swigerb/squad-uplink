using SquadUplink.Models;

namespace SquadUplink.Contracts;

public interface ICopilotSessionService
{
    /// <summary>
    /// Enriches a SessionState by correlating its PID with Copilot session-state data.
    /// </summary>
    Task EnrichSessionAsync(SessionState session, CancellationToken ct = default);

    /// <summary>
    /// Gets all active Copilot session directories.
    /// </summary>
    Task<IReadOnlyList<CopilotSessionInfo>> GetActiveSessionsAsync(CancellationToken ct = default);
}
