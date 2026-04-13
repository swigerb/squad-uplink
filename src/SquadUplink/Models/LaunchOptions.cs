namespace SquadUplink.Models;

public record LaunchOptions
{
    public required string WorkingDirectory { get; init; }
    public string? InitialPrompt { get; init; }
    public string? ResumeSessionId { get; init; }
    public string? ModelOverride { get; init; }
    public IReadOnlyList<string>? CustomArgs { get; init; }
    public IReadOnlyDictionary<string, string>? EnvironmentVariables { get; init; }
}
