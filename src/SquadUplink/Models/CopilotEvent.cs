using System.Text.Json;

namespace SquadUplink.Models;

public class CopilotEvent
{
    public string Type { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public JsonElement Data { get; set; }

    // Convenience accessors for common data fields
    public string? GetToolName() => Type.StartsWith("tool.") && Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("name", out var n) ? n.GetString() : null;
    public string? GetContent() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("content", out var c) ? c.GetString() : null;
    public string? GetDescription() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("description", out var d) ? d.GetString() : null;
    public string? GetModel() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("model", out var m) ? m.GetString() : null;
    public bool? GetSuccess() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("success", out var s) ? s.GetBoolean() : null;
    public string? GetMessage() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("message", out var m) ? m.GetString() : null;
    public string? GetAgentType() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("agent_type", out var a) ? a.GetString() : null;
    public string? GetModelTo() => Data.ValueKind == JsonValueKind.Object && Data.TryGetProperty("to", out var t) ? t.GetString() : null;
}
