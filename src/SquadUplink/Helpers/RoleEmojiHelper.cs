namespace SquadUplink.Helpers;

/// <summary>
/// Shared role-to-emoji mapping for squad member display.
/// Consolidates the duplicate logic from SquadStatusPanel and SquadTreeControl.
/// </summary>
internal static class RoleEmojiHelper
{
    /// <summary>
    /// Returns an emoji for a squad member role, falling back to the member's
    /// own emoji or a default person icon.
    /// </summary>
    internal static string GetRoleEmoji(string role, string? memberEmoji = null)
    {
        return role.ToLowerInvariant() switch
        {
            var r when r.Contains("lead") => "🏗️",
            var r when r.Contains("dev") || r.Contains("engineer") => "🔧",
            var r when r.Contains("test") || r.Contains("qa") => "🧪",
            var r when r.Contains("design") || r.Contains("ui") || r.Contains("ux") => "🎨",
            var r when r.Contains("doc") || r.Contains("write") => "📝",
            var r when r.Contains("ops") || r.Contains("devops") || r.Contains("infra") => "⚙️",
            _ => string.IsNullOrEmpty(memberEmoji) ? "👤" : memberEmoji
        };
    }
}
