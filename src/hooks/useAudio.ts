import { useCallback, useRef } from 'react';
import type { ThemeId } from '@/themes';

type SoundType = 'keystroke' | 'connect' | 'disconnect' | 'error' | 'toggle';

interface SoundProfile {
  waveform: OscillatorType;
  freq: number;
  duration: number;
  /** Optional second frequency for dual-tone effects */
  freq2?: number;
  /** Detune in cents for SID-chip wobble */
  detune?: number;
}

const SKIN_PROFILES: Record<ThemeId, Record<SoundType, SoundProfile>> = {
  // Apple IIe: Clean sine/square — Disk Drive II mechanical
  apple2e: {
    keystroke: { waveform: 'square', freq: 440, duration: 30 },
    connect: { waveform: 'sine', freq: 880, duration: 150 },
    disconnect: { waveform: 'sine', freq: 220, duration: 200 },
    error: { waveform: 'square', freq: 160, duration: 300 },
    toggle: { waveform: 'sine', freq: 660, duration: 100 },
  },
  // C64: Sawtooth/pulse with detune — SID chip character
  c64: {
    keystroke: { waveform: 'sawtooth', freq: 460, duration: 35, detune: 12 },
    connect: { waveform: 'sawtooth', freq: 900, duration: 160, detune: 8 },
    disconnect: { waveform: 'sawtooth', freq: 200, duration: 250, detune: 15 },
    error: { waveform: 'sawtooth', freq: 140, duration: 350, detune: 20 },
    toggle: { waveform: 'sawtooth', freq: 680, duration: 110, detune: 10 },
  },
  // IBM 3270: Low solenoid clicks — heavy keyboard mechanical
  ibm3270: {
    keystroke: { waveform: 'square', freq: 320, duration: 15 },
    connect: { waveform: 'square', freq: 600, duration: 80, freq2: 800 },
    disconnect: { waveform: 'square', freq: 180, duration: 120 },
    error: { waveform: 'square', freq: 120, duration: 400 },
    toggle: { waveform: 'square', freq: 500, duration: 60 },
  },
  // Win95: Classic Windows sine-wave sounds
  win95: {
    keystroke: { waveform: 'sine', freq: 520, duration: 25 },
    connect: { waveform: 'sine', freq: 740, duration: 200, freq2: 988 },
    disconnect: { waveform: 'sine', freq: 440, duration: 180, freq2: 330 },
    error: { waveform: 'sine', freq: 300, duration: 350, freq2: 260 },
    toggle: { waveform: 'sine', freq: 660, duration: 80 },
  },
  // LCARS: Clean high-pitched chirps — quick sine pips
  lcars: {
    keystroke: { waveform: 'sine', freq: 1200, duration: 20 },
    connect: { waveform: 'sine', freq: 1400, duration: 100, freq2: 1800 },
    disconnect: { waveform: 'sine', freq: 800, duration: 120, freq2: 600 },
    error: { waveform: 'sine', freq: 400, duration: 250, freq2: 350 },
    toggle: { waveform: 'sine', freq: 1600, duration: 60 },
  },
};

export function useAudio(skinId: ThemeId = 'apple2e') {
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
        const profile = SKIN_PROFILES[skinId][sound];
        const { waveform, freq, duration, freq2, detune } = profile;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = waveform;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (detune) osc.detune.setValueAtTime(detune, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          ctx.currentTime + duration / 1000,
        );

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration / 1000);

        // Dual-tone: play a second oscillator for richer sound
        if (freq2) {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = waveform;
          osc2.frequency.setValueAtTime(freq2, ctx.currentTime);
          gain2.gain.setValueAtTime(0.05, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(
            0.001,
            ctx.currentTime + duration / 1000,
          );
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(ctx.currentTime + duration / 3000);
          osc2.stop(ctx.currentTime + duration / 1000);
        }
      } catch {
        // Audio not available — silently degrade
      }
    },
    [getContext, skinId],
  );

  return { play };
}
