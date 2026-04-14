namespace SquadUplink.Models;

public class CopilotSessionInfo
{
    public string SessionId { get; set; } = string.Empty;
    public string Cwd { get; set; } = string.Empty;
    public string? GitRoot { get; set; }
    public string? Repository { get; set; }
    public string? Branch { get; set; }
    public string? Summary { get; set; }
    public string? HostType { get; set; }
    public int? OwnerPid { get; set; }
    public string EventsJsonlPath { get; set; } = string.Empty;
    public DateTime? CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
}
