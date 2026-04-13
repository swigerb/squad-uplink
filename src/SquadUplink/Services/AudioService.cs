using Serilog;
using SquadUplink.Contracts;

namespace SquadUplink.Services;

public class AudioService : IAudioService, IDisposable
{
    private bool _isEnabled = true;
    private double _volume = 0.8;
    private string _soundPack = "Fluent";
    private bool _isMuted;

    // Frequency tables per sound pack (Hz, duration ms)
    private static readonly Dictionary<string, Dictionary<SoundEvent, (int[] Frequencies, int[] DurationsMs)>> s_soundPacks = new()
    {
        ["Fluent"] = new()
        {
            [SoundEvent.SessionConnected] = ([880, 1100], [80, 80]),
            [SoundEvent.SessionDisconnected] = ([660, 440], [80, 120]),
            [SoundEvent.AgentActivity] = ([1200], [40]),
            [SoundEvent.Error] = ([440, 220], [120, 200]),
            [SoundEvent.Notification] = ([880], [60]),
        },
        ["AppleIIe"] = new()
        {
            [SoundEvent.SessionConnected] = ([1000, 1500], [100, 100]),
            [SoundEvent.SessionDisconnected] = ([1500, 800], [100, 150]),
            [SoundEvent.AgentActivity] = ([2000], [30]),
            [SoundEvent.Error] = ([400, 200], [150, 250]),
            [SoundEvent.Notification] = ([1000], [80]),
        },
        ["C64"] = new()
        {
            [SoundEvent.SessionConnected] = ([523, 659, 784], [80, 80, 120]),
            [SoundEvent.SessionDisconnected] = ([784, 523], [80, 160]),
            [SoundEvent.AgentActivity] = ([1047], [40]),
            [SoundEvent.Error] = ([262, 131], [120, 200]),
            [SoundEvent.Notification] = ([659, 784], [60, 60]),
        },
        ["PipBoy"] = new()
        {
            [SoundEvent.SessionConnected] = ([600, 800, 1000], [60, 60, 100]),
            [SoundEvent.SessionDisconnected] = ([400, 300], [100, 150]),
            [SoundEvent.AgentActivity] = ([3000, 3200], [20, 20]),
            [SoundEvent.Error] = ([200, 150, 100], [100, 100, 200]),
            [SoundEvent.Notification] = ([800, 1000], [50, 50]),
        },
    };

    public bool IsEnabled
    {
        get => _isEnabled;
        set => _isEnabled = value;
    }

    public double Volume
    {
        get => _volume;
        set => _volume = Math.Clamp(value, 0.0, 1.0);
    }

    public string SoundPack
    {
        get => _soundPack;
        set => _soundPack = s_soundPacks.ContainsKey(value) ? value : "Fluent";
    }

    public bool IsMuted => _isMuted;

    public void SetMuted(bool muted) => _isMuted = muted;

    public void PlaySound(SoundEvent soundEvent)
    {
        if (!_isEnabled || _isMuted)
            return;

        try
        {
            var pack = s_soundPacks.GetValueOrDefault(_soundPack) ?? s_soundPacks["Fluent"];
            if (!pack.TryGetValue(soundEvent, out var toneSpec))
                return;

            // Play tones on a background thread to avoid blocking UI
            _ = Task.Run(() =>
            {
                try
                {
                    for (int i = 0; i < toneSpec.Frequencies.Length; i++)
                    {
                        var freq = toneSpec.Frequencies[i];
                        var dur = (int)(toneSpec.DurationsMs[i] * _volume);
                        if (dur < 10) dur = 10;
                        Console.Beep(freq, dur);
                    }
                }
                catch (Exception ex)
                {
                    Log.Debug(ex, "Audio playback failed for {Event}", soundEvent);
                }
            });
        }
        catch (Exception ex)
        {
            Log.Debug(ex, "Failed to initiate audio for {Event}", soundEvent);
        }
    }

    public void Dispose()
    {
        // No unmanaged resources to clean up with Console.Beep approach
        GC.SuppressFinalize(this);
    }
}
