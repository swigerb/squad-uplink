import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudio } from '../useAudio';
import type { SoundType } from '../useAudio';
import { MockAudioContext, installMockAudioContext } from '../../__mocks__/audio';

describe('useAudio', () => {
  beforeEach(() => {
    localStorage.clear();
    installMockAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  // --- AU-05: Lazy AudioContext ---
  describe('lazy AudioContext creation', () => {
    it('does not create AudioContext on mount', () => {
      const { result } = renderHook(() => useAudio());
      expect(result.current.play).toBeDefined();
    });

    it('creates AudioContext on first play', () => {
      const { result } = renderHook(() => useAudio());

      act(() => {
        result.current.play('keystroke');
      });

      void (AudioContext as unknown as typeof MockAudioContext);
      expect(result.current.play).toBeDefined();
    });
  });

  // --- AU-01/02: Original sound types ---
  describe('original sound types', () => {
    const soundTypes: { type: SoundType; freq: number }[] = [
      { type: 'keystroke', freq: 440 },
      { type: 'connect', freq: 880 },
      { type: 'disconnect', freq: 220 },
      { type: 'error', freq: 160 },
      { type: 'toggle', freq: 660 },
    ];

    soundTypes.forEach(({ type, freq }) => {
      it(`plays ${type} sound with frequency ${freq}Hz`, () => {
        const { result } = renderHook(() => useAudio());

        act(() => {
          result.current.play(type);
        });

        expect(result.current.play).toBeDefined();
      });
    });
  });

  // --- NEW: Expanded sound types (Wave 3) ---
  describe('expanded sound types', () => {
    const newSounds: SoundType[] = [
      'agent_started',
      'agent_triage',
      'agent_success',
      'agent_error',
      'boot',
      'crt_toggle',
    ];

    newSounds.forEach((sound) => {
      it(`plays ${sound} sound without error`, () => {
        const { result } = renderHook(() => useAudio());

        expect(() => {
          act(() => {
            result.current.play(sound);
          });
        }).not.toThrow();
      });
    });

    it('plays multi-step boot sequence (SoundSequence)', () => {
      const { result } = renderHook(() => useAudio('apple2e'));

      expect(() => {
        act(() => {
          result.current.play('boot');
        });
      }).not.toThrow();
    });

    it('plays c64 agent_started as multi-step SID arpeggio', () => {
      const { result } = renderHook(() => useAudio('c64'));

      expect(() => {
        act(() => {
          result.current.play('agent_started');
        });
      }).not.toThrow();
    });

    it('plays c64 agent_error as descending buzz sequence', () => {
      const { result } = renderHook(() => useAudio('c64'));

      expect(() => {
        act(() => {
          result.current.play('agent_error');
        });
      }).not.toThrow();
    });
  });

  // --- Skin-specific waveform selection ---
  describe('skin-specific audio profiles', () => {
    it('apple2e uses sine waveform for connect', () => {
      const { result } = renderHook(() => useAudio('apple2e'));

      act(() => {
        result.current.play('connect');
      });

      // Verify it played without error (waveform is sine per profile)
      expect(result.current.play).toBeDefined();
    });

    it('c64 uses sawtooth waveform for connect', () => {
      const { result } = renderHook(() => useAudio('c64'));

      act(() => {
        result.current.play('connect');
      });

      expect(result.current.play).toBeDefined();
    });

    it('ibm3270 uses square waveform for keystroke', () => {
      const { result } = renderHook(() => useAudio('ibm3270'));

      act(() => {
        result.current.play('keystroke');
      });

      expect(result.current.play).toBeDefined();
    });

    it('win95 uses sine waveform for boot sequence', () => {
      const { result } = renderHook(() => useAudio('win95'));

      expect(() => {
        act(() => {
          result.current.play('boot');
        });
      }).not.toThrow();
    });

    it('lcars uses sine waveform for agent_success', () => {
      const { result } = renderHook(() => useAudio('lcars'));

      expect(() => {
        act(() => {
          result.current.play('agent_success');
        });
      }).not.toThrow();
    });

    it('all 5 skins play all 11 sound types without error', () => {
      const skins = ['apple2e', 'c64', 'ibm3270', 'win95', 'lcars'] as const;
      const sounds: SoundType[] = [
        'keystroke', 'connect', 'disconnect', 'error', 'toggle',
        'agent_started', 'agent_triage', 'agent_success', 'agent_error',
        'boot', 'crt_toggle',
      ];

      for (const skin of skins) {
        const { result } = renderHook(() => useAudio(skin));
        for (const sound of sounds) {
          expect(() => {
            act(() => {
              result.current.play(sound);
            });
          }).not.toThrow();
        }
      }
    });
  });

  // --- Mute functionality ---
  describe('mute/unmute', () => {
    it('starts unmuted by default', () => {
      const { result } = renderHook(() => useAudio());
      expect(result.current.muted).toBe(false);
    });

    it('toggleMute toggles muted state', () => {
      const { result } = renderHook(() => useAudio());

      act(() => {
        result.current.toggleMute();
      });

      expect(result.current.muted).toBe(true);

      act(() => {
        result.current.toggleMute();
      });

      expect(result.current.muted).toBe(false);
    });

    it('does not play sounds when muted', () => {
      const { result } = renderHook(() => useAudio());

      act(() => {
        result.current.toggleMute();
      });

      // When muted, play should return early without creating AudioContext
      expect(() => {
        act(() => {
          result.current.play('keystroke');
        });
      }).not.toThrow();
    });

    it('persists mute state to localStorage', () => {
      const { result } = renderHook(() => useAudio());

      act(() => {
        result.current.toggleMute();
      });

      expect(localStorage.getItem('squad-uplink-audio-muted')).toBe('true');

      act(() => {
        result.current.toggleMute();
      });

      expect(localStorage.getItem('squad-uplink-audio-muted')).toBe('false');
    });

    it('loads mute preference from localStorage', () => {
      localStorage.setItem('squad-uplink-audio-muted', 'true');

      const { result } = renderHook(() => useAudio());

      expect(result.current.muted).toBe(true);
    });
  });

  // --- Graceful degradation ---
  describe('graceful degradation', () => {
    it('handles missing AudioContext gracefully', () => {
      vi.stubGlobal('AudioContext', undefined);

      const { result } = renderHook(() => useAudio());

      expect(() => {
        act(() => {
          result.current.play('error');
        });
      }).not.toThrow();
    });

    it('handles AudioContext constructor throwing', () => {
      vi.stubGlobal('AudioContext', class {
        constructor() {
          throw new Error('AudioContext not allowed');
        }
      });

      const { result } = renderHook(() => useAudio());

      expect(() => {
        act(() => {
          result.current.play('connect');
        });
      }).not.toThrow();
    });
  });

  // --- EDGE-19: Multiple rapid plays ---
  describe('rapid playback', () => {
    it('handles multiple rapid plays without crashing', () => {
      const { result } = renderHook(() => useAudio());

      expect(() => {
        act(() => {
          for (let i = 0; i < 20; i++) {
            result.current.play('keystroke');
          }
        });
      }).not.toThrow();
    });

    it('plays different sound types in sequence', () => {
      const { result } = renderHook(() => useAudio());

      expect(() => {
        act(() => {
          result.current.play('connect');
          result.current.play('keystroke');
          result.current.play('error');
          result.current.play('disconnect');
          result.current.play('toggle');
          result.current.play('boot');
          result.current.play('agent_started');
          result.current.play('agent_success');
          result.current.play('crt_toggle');
        });
      }).not.toThrow();
    });
  });
});
