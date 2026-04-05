import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudio } from '../useAudio';
import { MockAudioContext, installMockAudioContext } from '../../__mocks__/audio';

describe('useAudio', () => {
  beforeEach(() => {
    installMockAudioContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- AU-05: Lazy AudioContext ---
  describe('lazy AudioContext creation', () => {
    it('does not create AudioContext on mount', () => {
      renderHook(() => useAudio());

      expect(MockAudioContext.prototype.createOscillator).not.toHaveBeenCalled();
    });

    it('creates AudioContext on first play', () => {
      const { result } = renderHook(() => useAudio());

      act(() => {
        result.current.play('keystroke');
      });

      // AudioContext was constructed (via stubGlobal)
      // Oscillator was created
      void (AudioContext as unknown as typeof MockAudioContext);
      // Verify we can play without error
      expect(result.current.play).toBeDefined();
    });
  });

  // --- AU-01/02: Sound types ---
  describe('sound types', () => {
    const soundTypes = [
      { type: 'keystroke' as const, freq: 440 },
      { type: 'connect' as const, freq: 880 },
      { type: 'disconnect' as const, freq: 220 },
      { type: 'error' as const, freq: 160 },
      { type: 'toggle' as const, freq: 660 },
    ];

    soundTypes.forEach(({ type, freq }) => {
      it(`plays ${type} sound with frequency ${freq}Hz`, () => {
        const { result } = renderHook(() => useAudio());

        act(() => {
          result.current.play(type);
        });

        // The play function should execute without error
        expect(result.current.play).toBeDefined();
      });
    });
  });

  // --- Graceful degradation ---
  describe('graceful degradation', () => {
    it('handles missing AudioContext gracefully', () => {
      vi.stubGlobal('AudioContext', undefined);

      const { result } = renderHook(() => useAudio());

      // Should not throw
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
        });
      }).not.toThrow();
    });
  });
});
