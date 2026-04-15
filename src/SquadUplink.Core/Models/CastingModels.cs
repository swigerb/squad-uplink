using System.Text.Json.Serialization;

namespace SquadUplink.Core.Models;

/// <summary>Parsed representation of .squad/casting/history.json.</summary>
public class CastingHistory
{
    [JsonPropertyName("universe_usage_history")]
    public List<UniverseUsageEntry> UniverseUsageHistory { get; set; } = [];

    [JsonPropertyName("assignment_cast_snapshots")]
    public Dictionary<string, CastingSnapshot> AssignmentCastSnapshots { get; set; } = [];
}

public class UniverseUsageEntry
{
    [JsonPropertyName("universe")]
    public string Universe { get; set; } = string.Empty;

    [JsonPropertyName("used_at")]
    public DateTime UsedAt { get; set; }

    [JsonPropertyName("project")]
    public string Project { get; set; } = string.Empty;

    [JsonPropertyName("reason")]
    public string? Reason { get; set; }
}

public class CastingSnapshot
{
    [JsonPropertyName("assignment_id")]
    public string AssignmentId { get; set; } = string.Empty;

    [JsonPropertyName("universe")]
    public string Universe { get; set; } = string.Empty;

    [JsonPropertyName("agents")]
    public Dictionary<string, string> Agents { get; set; } = [];
}

/// <summary>Parsed representation of .squad/casting/registry.json.</summary>
public class CastingRegistry
{
    [JsonPropertyName("agents")]
    public Dictionary<string, CastingAgent> Agents { get; set; } = [];
}

public class CastingAgent
{
    [JsonPropertyName("persistent_name")]
    public string PersistentName { get; set; } = string.Empty;

    [JsonPropertyName("universe")]
    public string Universe { get; set; } = string.Empty;

    [JsonPropertyName("role")]
    public string Role { get; set; } = string.Empty;

    [JsonPropertyName("created_at")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("legacy_named")]
    public bool LegacyNamed { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}
