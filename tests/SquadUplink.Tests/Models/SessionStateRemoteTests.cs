using SquadUplink.Models;
using Xunit;

namespace SquadUplink.Tests.Services;

public class SessionStateRemoteTests
{
    [Fact]
    public void RemoteSteeringUrl_SetsHasRemoteUrl()
    {
        var session = new SessionState();
        Assert.False(session.HasRemoteUrl);

        session.RemoteSteeringUrl = "https://copilot.github.com/session/abc123";
        Assert.True(session.HasRemoteUrl);
    }

    [Fact]
    public void RemoteSteeringUrl_SetsRemoteSteeringUri()
    {
        var session = new SessionState();
        session.RemoteSteeringUrl = "https://copilot.github.com/session/abc123";

        Assert.NotNull(session.RemoteSteeringUri);
        Assert.Equal("copilot.github.com", session.RemoteSteeringUri!.Host);
    }

    [Fact]
    public void RemoteSteeringUrl_InvalidUri_DoesNotSetUri()
    {
        var session = new SessionState();
        session.RemoteSteeringUrl = "not-a-valid-url";

        Assert.True(session.HasRemoteUrl);
        Assert.Null(session.RemoteSteeringUri);
    }

    [Fact]
    public void RemoteSteeringUrl_ClearingUrl_ResetsFlags()
    {
        var session = new SessionState();
        session.RemoteSteeringUrl = "https://copilot.github.com/session/abc123";
        Assert.True(session.HasRemoteUrl);

        session.RemoteSteeringUrl = null;
        Assert.False(session.HasRemoteUrl);
        Assert.Null(session.RemoteSteeringUri);
    }

    [Fact]
    public void RemoteSteeringUrl_SetsIsRemoteEnabled()
    {
        var session = new SessionState { IsRemoteEnabled = false };
        session.RemoteSteeringUrl = "https://copilot.github.com/session/abc123";
        Assert.True(session.IsRemoteEnabled);
    }

    [Fact]
    public void CastingAssignmentId_CanBeSet()
    {
        var session = new SessionState();
        session.CastingAssignmentId = "abc-123";
        Assert.Equal("abc-123", session.CastingAssignmentId);
    }

    [Fact]
    public void AgentLatencyMs_CanBeSet()
    {
        var session = new SessionState();
        session.AgentLatencyMs = 150.5;
        Assert.Equal(150.5, session.AgentLatencyMs);
    }
}
