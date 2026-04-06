import { useCallback, useRef, useState } from 'react';
import { useAudio } from '@/hooks/useAudio';

export type TransitionPhase = 'idle' | 'static' | 'fade' | 'sweep';

export const PIPBOY_TABS = ['STAT', 'INV', 'DATA', 'MAP', 'RADIO'] as const;
export type PipBoyTab = (typeof PIPBOY_TABS)[number];

export interface PipBoyTransition {
  activeTab: PipBoyTab;
  /** Numeric index of the active tab (0–4) */
  tabIndex: number;
  /** The tab currently being displayed (lags activeTab during transitions) */
  displayTab: PipBoyTab;
  switchTab: (tab: PipBoyTab) => void;
  /** Advance to the next tab (wraps around) */
  nextTab: () => void;
  /** Go to the previous tab (wraps around) */
  prevTab: () => void;
  isTransitioning: boolean;
  transitionPhase: TransitionPhase;
}

/**
 * Encapsulates the 1950s vacuum-tube CRT transition sequence for Pip-Boy tab switches.
 *
 * Timing on tab click:
 *   t=0ms   — Play mechanical click. Show static burst overlay.
 *   t=50ms  — Remove static. Apply phosphor-fade to old content.
 *   t=200ms — Start scanline sweep. Swap to new tab content.
 *   t=400ms — Sweep completes. Remove all transition classes.
 */
export function usePipBoyTransition(initialTab: PipBoyTab = 'DATA'): PipBoyTransition {
  const [activeTab, setActiveTab] = useState<PipBoyTab>(initialTab);
  const [displayTab, setDisplayTab] = useState<PipBoyTab>(initialTab);
  const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const { play } = useAudio('pipboy');

  const clearTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  const switchTab = useCallback(
    (tab: PipBoyTab) => {
      if (tab === activeTab) return;
      if (transitionPhase !== 'idle') return;

      // Immediately record the target tab
      setActiveTab(tab);

      // t=0ms — mechanical click + static burst
      play('toggle');
      setTransitionPhase('static');

      const t1 = setTimeout(() => {
        // t=50ms — remove static, apply phosphor fade
        setTransitionPhase('fade');
      }, 50);

      const t2 = setTimeout(() => {
        // t=200ms — scanline sweep + swap content
        setTransitionPhase('sweep');
        setDisplayTab(tab);
      }, 200);

      const t3 = setTimeout(() => {
        // t=400ms — done
        setTransitionPhase('idle');
      }, 400);

      timersRef.current = [t1, t2, t3];
    },
    [activeTab, transitionPhase, play, clearTimers],
  );

  const tabIndex = PIPBOY_TABS.indexOf(activeTab);

  const nextTab = useCallback(() => {
    const currentIdx = PIPBOY_TABS.indexOf(activeTab);
    const nextIdx = (currentIdx + 1) % PIPBOY_TABS.length;
    switchTab(PIPBOY_TABS[nextIdx]);
  }, [activeTab, switchTab]);

  const prevTab = useCallback(() => {
    const currentIdx = PIPBOY_TABS.indexOf(activeTab);
    const prevIdx = (currentIdx - 1 + PIPBOY_TABS.length) % PIPBOY_TABS.length;
    switchTab(PIPBOY_TABS[prevIdx]);
  }, [activeTab, switchTab]);

  return {
    activeTab,
    tabIndex,
    displayTab,
    switchTab,
    nextTab,
    prevTab,
    isTransitioning: transitionPhase !== 'idle',
    transitionPhase,
  };
}
