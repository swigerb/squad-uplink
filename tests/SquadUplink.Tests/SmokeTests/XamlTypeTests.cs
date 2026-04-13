using SquadUplink.Contracts;
using SquadUplink.Models;
using Xunit;

namespace SquadUplink.Tests.SmokeTests;

/// <summary>
/// Tests that all types referenced in XAML bindings have the expected properties.
/// Property renames that break x:Bind will be caught here instead of at runtime.
/// </summary>
public class XamlTypeTests
{
    [Fact]
    public void SessionState_HasAllBindableProperties()
    {
        var type = typeof(SessionState);

        Assert.NotNull(type.GetProperty("Id"));
        Assert.NotNull(type.GetProperty("ProcessId"));
        Assert.NotNull(type.GetProperty("Status"));
        Assert.NotNull(type.GetProperty("RepositoryName"));
        Assert.NotNull(type.GetProperty("WorkingDirectory"));
        Assert.NotNull(type.GetProperty("GitHubTaskUrl"));
        Assert.NotNull(type.GetProperty("StartedAt"));
        Assert.NotNull(type.GetProperty("Squad"));
        Assert.NotNull(type.GetProperty("IsRemoteEnabled"));
        Assert.NotNull(type.GetProperty("CommandLineArgs"));
        Assert.NotNull(type.GetProperty("IsPinned"));
        Assert.NotNull(type.GetProperty("OutputLines"));
    }

    [Fact]
    public void SquadInfo_HasAllBindableProperties()
    {
        var type = typeof(SquadInfo);

        Assert.NotNull(type.GetProperty("TeamName"));
        Assert.NotNull(type.GetProperty("Members"));
        Assert.NotNull(type.GetProperty("SubSquads"));
        Assert.NotNull(type.GetProperty("Universe"));
        Assert.NotNull(type.GetProperty("CurrentFocus"));
    }

    [Fact]
    public void SquadMember_HasAllBindableProperties()
    {
        var type = typeof(SquadMember);

        Assert.NotNull(type.GetProperty("Name"));
        Assert.NotNull(type.GetProperty("Role"));
        Assert.NotNull(type.GetProperty("Emoji"));
        Assert.NotNull(type.GetProperty("Status"));
    }

    [Fact]
    public void SquadTreeItem_HasAllBindableProperties()
    {
        var type = typeof(SquadTreeItem);

        Assert.NotNull(type.GetProperty("DisplayText"));
        Assert.NotNull(type.GetProperty("Icon"));
        Assert.NotNull(type.GetProperty("IsHeader"));
        Assert.NotNull(type.GetProperty("StatusText"));
        Assert.NotNull(type.GetProperty("IndentLevel"));
        Assert.NotNull(type.GetProperty("Role"));
    }

    [Fact]
    public void SessionHistoryEntry_HasAllBindableProperties()
    {
        var type = typeof(SessionHistoryEntry);

        Assert.NotNull(type.GetProperty("Id"));
        Assert.NotNull(type.GetProperty("SessionId"));
        Assert.NotNull(type.GetProperty("RepositoryName"));
        Assert.NotNull(type.GetProperty("WorkingDirectory"));
        Assert.NotNull(type.GetProperty("FinalStatus"));
        Assert.NotNull(type.GetProperty("StartedAt"));
        Assert.NotNull(type.GetProperty("EndedAt"));
        Assert.NotNull(type.GetProperty("ProcessId"));
        Assert.NotNull(type.GetProperty("GitHubTaskUrl"));
        Assert.NotNull(type.GetProperty("DurationSeconds"));
        Assert.NotNull(type.GetProperty("AgentCount"));
    }

    [Fact]
    public void AppSettings_HasAllBindableProperties()
    {
        var type = typeof(AppSettings);

        Assert.NotNull(type.GetProperty("ThemeId"));
        Assert.NotNull(type.GetProperty("ScanIntervalSeconds"));
        Assert.NotNull(type.GetProperty("DefaultWorkingDirectory"));
        Assert.NotNull(type.GetProperty("AudioEnabled"));
        Assert.NotNull(type.GetProperty("AutoScanOnStartup"));
        Assert.NotNull(type.GetProperty("CrtEffectsEnabled"));
        Assert.NotNull(type.GetProperty("FontSize"));
        Assert.NotNull(type.GetProperty("Volume"));
        Assert.NotNull(type.GetProperty("SoundPack"));
        Assert.NotNull(type.GetProperty("DefaultModel"));
        Assert.NotNull(type.GetProperty("AlwaysUseRemote"));
        Assert.NotNull(type.GetProperty("LayoutMode"));
        Assert.NotNull(type.GetProperty("GridSize"));
        Assert.NotNull(type.GetProperty("NotifySessionCompleted"));
        Assert.NotNull(type.GetProperty("NotifyPermissionRequest"));
        Assert.NotNull(type.GetProperty("NotifyError"));
        Assert.NotNull(type.GetProperty("NotifySessionDiscovered"));
    }

    [Fact]
    public void SessionStatus_HasExpectedValues()
    {
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Discovered));
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Launching));
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Running));
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Idle));
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Completed));
        Assert.True(Enum.IsDefined(typeof(SessionStatus), SessionStatus.Error));
    }

    [Fact]
    public void SoundEvent_HasExpectedValues()
    {
        Assert.True(Enum.IsDefined(typeof(SoundEvent), SoundEvent.SessionConnected));
        Assert.True(Enum.IsDefined(typeof(SoundEvent), SoundEvent.SessionDisconnected));
        Assert.True(Enum.IsDefined(typeof(SoundEvent), SoundEvent.AgentActivity));
        Assert.True(Enum.IsDefined(typeof(SoundEvent), SoundEvent.Error));
        Assert.True(Enum.IsDefined(typeof(SoundEvent), SoundEvent.Notification));
    }

    [Fact]
    public void LayoutMode_HasExpectedValues()
    {
        Assert.True(Enum.IsDefined(typeof(LayoutMode), LayoutMode.Tabs));
        Assert.True(Enum.IsDefined(typeof(LayoutMode), LayoutMode.Grid));
    }

    [Fact]
    public void SessionState_IsObservableObject()
    {
        var session = new SessionState();
        Assert.IsAssignableFrom<CommunityToolkit.Mvvm.ComponentModel.ObservableObject>(session);
    }

    [Fact]
    public void SessionState_PropertyChangeNotifications_Work()
    {
        var session = new SessionState();
        var changed = false;
        session.PropertyChanged += (_, args) =>
        {
            if (args.PropertyName == nameof(SessionState.Status))
                changed = true;
        };

        session.Status = SessionStatus.Running;
        Assert.True(changed);
    }
}
