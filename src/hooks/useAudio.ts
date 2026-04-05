import { useCallback, useRef } from 'react';

type SoundType = 'keystroke' | 'connect' | 'disconnect' | 'error' | 'toggle';

const FREQUENCIES: Record<SoundType, { freq: number; duration: number }> = {
  keystroke: { freq: 440, duration: 30 },
  connect: { freq: 880, duration: 150 },
  disconnect: { freq: 220, duration: 200 },
  error: { freq: 160, duration: 300 },
  toggle: { freq: 660, duration: 100 },
};

export function useAudio() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback(
    (sound: SoundType) => {
      try {
        const ctx = getContext();
        const { freq, duration } = FREQUENCIES[sound];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + duration / 1000,
        );

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration / 1000);
      } catch {
        // Audio not available — silently degrade
      }
    },
    [getContext],
  );

  return { play };
}
