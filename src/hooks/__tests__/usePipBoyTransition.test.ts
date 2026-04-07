/**
 * usePipBoyTransition hook tests
 *
 * Tests the vacuum-tube CRT transition sequence for Pip-Boy tab switching:
 * tab navigation (next/prev/direct), transition phases (static→fade→sweep→idle),
 * timing behavior, wraparound, and edge cases.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePipBoyTransition, PIPBOY_TABS } from '@/hooks/usePipBoyTransition';
import type { PipBoyTab } from '@/hooks/usePipBoyTransition';
import { installMockAudioContext } from '@//__mocks__/audio';
import { _resetAudioForTesting } from '@/hooks/useAudio';

// Mock useAudio to avoid audio context issues in unit tests
vi.mock('@/hooks/useAudio', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useAudio')>('@/hooks/useAudio');
  return {
    ...actual,
    useAudio: () => ({
      play: vi.fn(),
      muted: true,
      toggleMute: vi.fn(),
    }),
  };
});

describe('usePipBoyTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    installMockAudioContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('Initial state', () => {
    it('defaults to DATA tab', () => {
      const { result } = renderHook(() => usePipBoyTransition());
      expect(result.current.activeTab).toBe('DATA');
      expect(result.current.displayTab).toBe('DATA');
      expect(result.current.tabIndex).toBe(2);
    });

    it('accepts a custom initial tab', () => {
      const { result } = renderHook(() => usePipBoyTransition('STAT'));
      expect(result.current.activeTab).toBe('STAT');
      expect(result.current.displayTab).toBe('STAT');
      expect(result.current.tabIndex).toBe(0);
    });

    it('starts in idle phase with no transition', () => {
      const { result } = renderHook(() => usePipBoyTransition());
      expect(result.current.transitionPhase).toBe('idle');
      expect(result.current.isTransitioning).toBe(false);
    });
  });

  describe('PIPBOY_TABS constant', () => {
    it('has exactly 5 tabs in order', () => {
      expect(PIPBOY_TABS).toEqual(['STAT', 'INV', 'DATA', 'MAP', 'RADIO']);
      expect(PIPBOY_TABS).toHaveLength(5);
    });
  });

  describe('switchTab — direct tab switching', () => {
    it('sets activeTab immediately on switch', () => {
      const { result } = renderHook(() => usePipBoyTransition());

      act(() => {
        result.current.switchTab('MAP');
      });

      expect(result.current.activeTab).toBe('MAP');
      expect(result.current.tabIndex).toBe(3);
    });

    it('does not switch if target is already active', () => {
      const { result } = renderHook(() => usePipBoyTransition('DATA'));

      act(() => {
        result.current.switchTab('DATA');
      });

      expect(result.current.transitionPhase).toBe('idle');
      expect(result.current.isTransitioning).toBe(false);
    });

    it('blocks concurrent switches during transition', () => {
      const { result } = renderHook(() => usePipBoyTransition('DATA'));

      // Start a transition
      act(() => {
        result.current.switchTab('MAP');
      });
      expect(result.current.isTransitioning).toBe(true);

      // Try to switch again while transitioning — should be ignored
      act(() => {
        result.current.switchTab('STAT');
      });
      expect(result.current.activeTab).toBe('MAP'); // not STAT
    });
  });

  describe('Transition phase timing', () => {
    it('enters static phase at t=0ms', () => {
      const { result } = renderHook(() => usePipBoyTransition());

      act(() => {
        result.current.switchTab('INV');
      });

      expect(result.current.transitionPhase).toBe('static');
      expect(result.current.isTransitioning).toBe(true);
    });

    it('enters fade phase at t=50ms', () => {
      const { result } = renderHook(() => usePipBoyTransition());

      act(() => {
        result.current.switchTab('INV');
      });

      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(result.current.transitionPhase).toBe('fade');
    });

    it('enters sweep phase at t=200ms and swaps displayTab', () => {
      const { result } = renderHook(() => usePipBoyTransition());

      act(() => {
        result.current.switchTab('INV');
      });

      // displayTab should still be DATA before sweep
      expect(result.current.displayTab).toBe('DATA');

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.transitionPhase).toBe('sweep');
      expect(result.current.displayTab).toBe('INV');
    });

    it('returns to idle at t=400ms', () => {
      const { result } = renderHook(() => usePipBoyTransition());

      act(() => {
        result.current.switchTab('INV');
      });

      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(result.current.transitionPhase).toBe('idle');
      expect(result.current.isTransitioning).toBe(false);
    });

    it('full transition cycle: static → fade → sweep → idle', () => {
      const { result } = renderHook(() => usePipBoyTransition());
      const phases: string[] = [];

      act(() => {
        result.current.switchTab('RADIO');
      });
      phases.push(result.current.transitionPhase);

      act(() => { vi.advanceTimersByTime(50); });
      phases.push(result.current.transitionPhase);

      act(() => { vi.advanceTimersByTime(150); }); // total 200ms
      phases.push(result.current.transitionPhase);

      act(() => { vi.advanceTimersByTime(200); }); // total 400ms
      phases.push(result.current.transitionPhase);

      expect(phases).toEqual(['static', 'fade', 'sweep', 'idle']);
    });
  });

  describe('nextTab — forward navigation', () => {
    it('advances to the next tab', () => {
      const { result } = renderHook(() => usePipBoyTransition('DATA'));

      act(() => {
        result.current.nextTab();
      });

      expect(result.current.activeTab).toBe('MAP');

      act(() => { vi.advanceTimersByTime(400); });

      expect(result.current.displayTab).toBe('MAP');
    });

    it('wraps around from RADIO to STAT', () => {
      const { result } = renderHook(() => usePipBoyTransition('RADIO'));

      act(() => {
        result.current.nextTab();
      });

      expect(result.current.activeTab).toBe('STAT');

      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.displayTab).toBe('STAT');
    });
  });

  describe('prevTab — backward navigation', () => {
    it('goes to the previous tab', () => {
      const { result } = renderHook(() => usePipBoyTransition('DATA'));

      act(() => {
        result.current.prevTab();
      });

      expect(result.current.activeTab).toBe('INV');

      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.displayTab).toBe('INV');
    });

    it('wraps around from STAT to RADIO', () => {
      const { result } = renderHook(() => usePipBoyTransition('STAT'));

      act(() => {
        result.current.prevTab();
      });

      expect(result.current.activeTab).toBe('RADIO');

      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.displayTab).toBe('RADIO');
    });
  });

  describe('tabIndex', () => {
    it('returns correct index for each tab', () => {
      for (let i = 0; i < PIPBOY_TABS.length; i++) {
        const tab = PIPBOY_TABS[i];
        const { result } = renderHook(() => usePipBoyTransition(tab));
        expect(result.current.tabIndex).toBe(i);
      }
    });
  });

  describe('Edge cases', () => {
    it('allows new switch after transition completes', () => {
      const { result } = renderHook(() => usePipBoyTransition('DATA'));

      // First switch
      act(() => { result.current.switchTab('MAP'); });
      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.isTransitioning).toBe(false);

      // Second switch — should work
      act(() => { result.current.switchTab('STAT'); });
      expect(result.current.activeTab).toBe('STAT');
      expect(result.current.isTransitioning).toBe(true);

      act(() => { vi.advanceTimersByTime(400); });
      expect(result.current.displayTab).toBe('STAT');
    });

    it('cycling through all tabs sequentially works', () => {
      const { result } = renderHook(() => usePipBoyTransition('STAT'));

      const visited: PipBoyTab[] = ['STAT'];
      for (let i = 0; i < 4; i++) {
        act(() => { result.current.nextTab(); });
        act(() => { vi.advanceTimersByTime(400); });
        visited.push(result.current.activeTab);
      }

      expect(visited).toEqual(['STAT', 'INV', 'DATA', 'MAP', 'RADIO']);
    });
  });
});
