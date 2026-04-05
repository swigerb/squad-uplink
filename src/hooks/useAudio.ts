import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThemeId } from '@/themes';
import { AudioBufferCache } from '@/audio/bufferCache';

export type SoundType =
  | 'keystroke' | 'connect' | 'disconnect' | 'error' | 'toggle'
  | 'agent_started' | 'agent_triage' | 'agent_success' | 'agent_error'
  | 'boot' | 'crt_toggle';

interface SoundProfile {
  waveform: OscillatorType;
  freq: number;
  duration: number;
  freq2?: number;
  detune?: number;
}

/** Multi-step sequences for complex sounds (boot, agent lifecycle) */
interface SoundSequence {
  steps: { waveform: OscillatorType; freq: number; duration: number; delay: number; detune?: number; freq2?: number }[];
}

type SoundDef = SoundProfile | SoundSequence;

function isSequence(def: SoundDef): def is SoundSequence {
  return 'steps' in def;
}

const SKIN_PROFILES: Record<ThemeId, Record<SoundType, SoundDef>> = {
  // Apple IIe: Clean sine/square — Disk Drive II mechanical
  apple2e: {
    keystroke: { waveform: 'square', freq: 440, duration: 30 },
    connect: { waveform: 'sine', freq: 880, duration: 150 },
    disconnect: { waveform: 'sine', freq: 220, duration: 200 },
    error: { waveform: 'square', freq: 160, duration: 300 },
    toggle: { waveform: 'sine', freq: 660, duration: 100 },
    boot: { steps: [
      { waveform: 'square', freq: 200, duration: 100, delay: 0 },
      { waveform: 'square', freq: 400, duration: 100, delay: 100 },
      { waveform: 'square', freq: 600, duration: 100, delay: 200 },
      { waveform: 'sine', freq: 880, duration: 200, delay: 300 },
    ] },
    agent_started: { waveform: 'square', freq: 800, duration: 20 },
    agent_triage: { waveform: 'sine', freq: 550, duration: 80 },
    agent_success: { waveform: 'sine', freq: 1200, duration: 120 },
    agent_error: { waveform: 'square', freq: 120, duration: 250 },
    crt_toggle: { waveform: 'sine', freq: 440, duration: 60, freq2: 660 },
  },

  // C64: Sawtooth/pulse with detune — SID chip character
  c64: {
    keystroke: { waveform: 'sawtooth', freq: 460, duration: 35, detune: 12 },
    connect: { waveform: 'sawtooth', freq: 900, duration: 160, detune: 8 },
    disconnect: { waveform: 'sawtooth', freq: 200, duration: 250, detune: 15 },
    error: { waveform: 'sawtooth', freq: 140, duration: 350, detune: 20 },
    toggle: { waveform: 'sawtooth', freq: 680, duration: 110, detune: 10 },
    boot: { steps: [
      { waveform: 'sawtooth', freq: 1000, duration: 80, delay: 0, detune: 25 },
      { waveform: 'sawtooth', freq: 500, duration: 80, delay: 80, detune: 25 },
      { waveform: 'sawtooth', freq: 1200, duration: 80, delay: 160, detune: 25 },
      { waveform: 'sawtooth', freq: 600, duration: 80, delay: 240, detune: 25 },
      { waveform: 'sawtooth', freq: 800, duration: 120, delay: 320, detune: 15 },
    ] },
    agent_started: { steps: [
      { waveform: 'sawtooth', freq: 523, duration: 50, delay: 0, detune: 10 },
      { waveform: 'sawtooth', freq: 659, duration: 50, delay: 55, detune: 10 },
      { waveform: 'sawtooth', freq: 784, duration: 50, delay: 110, detune: 10 },
    ] },
    agent_triage: { waveform: 'sawtooth', freq: 600, duration: 100, detune: 15 },
    agent_success: { steps: [
      { waveform: 'sawtooth', freq: 523, duration: 80, delay: 0, detune: 8 },
      { waveform: 'sawtooth', freq: 659, duration: 80, delay: 85, detune: 8 },
      { waveform: 'sawtooth', freq: 784, duration: 120, delay: 170, detune: 8 },
    ] },
    agent_error: { steps: [
      { waveform: 'sawtooth', freq: 400, duration: 100, delay: 0, detune: 30 },
      { waveform: 'sawtooth', freq: 250, duration: 100, delay: 100, detune: 30 },
      { waveform: 'sawtooth', freq: 120, duration: 200, delay: 200, detune: 30 },
    ] },
    crt_toggle: { waveform: 'sawtooth', freq: 500, duration: 70, detune: 12 },
  },

  // IBM 3270: Heavy mechanical solenoid sounds
  ibm3270: {
    keystroke: { waveform: 'square', freq: 320, duration: 15 },
    connect: { waveform: 'square', freq: 600, duration: 80, freq2: 800 },
    disconnect: { waveform: 'square', freq: 180, duration: 120 },
    error: { waveform: 'square', freq: 120, duration: 400 },
    toggle: { waveform: 'square', freq: 500, duration: 60 },
    boot: { steps: [
      { waveform: 'square', freq: 300, duration: 15, delay: 0 },
      { waveform: 'square', freq: 350, duration: 15, delay: 30 },
      { waveform: 'square', freq: 280, duration: 15, delay: 60 },
      { waveform: 'square', freq: 320, duration: 15, delay: 90 },
      { waveform: 'square', freq: 340, duration: 15, delay: 120 },
      { waveform: 'square', freq: 800, duration: 100, delay: 200, freq2: 1000 },
    ] },
    agent_started: { waveform: 'square', freq: 350, duration: 20 },
    agent_triage: { waveform: 'square', freq: 500, duration: 40, freq2: 600 },
    agent_success: { waveform: 'sine', freq: 2000, duration: 100 },
    agent_error: { waveform: 'square', freq: 100, duration: 500, freq2: 120 },
    crt_toggle: { waveform: 'square', freq: 400, duration: 30 },
  },

  // Win95: Classic Windows sounds
  win95: {
    keystroke: { waveform: 'sine', freq: 520, duration: 25 },
    connect: { waveform: 'sine', freq: 740, duration: 200, freq2: 988 },
    disconnect: { waveform: 'sine', freq: 440, duration: 180, freq2: 330 },
    error: { waveform: 'sine', freq: 300, duration: 350, freq2: 260 },
    toggle: { waveform: 'sine', freq: 660, duration: 80 },
    boot: { steps: [
      { waveform: 'sine', freq: 523, duration: 250, delay: 0 },
      { waveform: 'sine', freq: 659, duration: 250, delay: 260 },
      { waveform: 'sine', freq: 784, duration: 250, delay: 520 },
      { waveform: 'sine', freq: 1047, duration: 400, delay: 780 },
    ] },
    agent_started: { waveform: 'sine', freq: 600, duration: 30 },
    agent_triage: { waveform: 'sine', freq: 500, duration: 60 },
    agent_success: { steps: [
      { waveform: 'sine', freq: 523, duration: 120, delay: 0 },
      { waveform: 'sine', freq: 659, duration: 200, delay: 130 },
    ] },
    agent_error: { steps: [
      { waveform: 'sine', freq: 440, duration: 200, delay: 0 },
      { waveform: 'sine', freq: 415, duration: 300, delay: 210 },
    ] },
    crt_toggle: { waveform: 'sine', freq: 700, duration: 50 },
  },

  // Pip-Boy 3000: Nuclear Age terminal — Geiger ticks, relay clicks, sine sweeps
  pipboy: {
    keystroke: { waveform: 'sine', freq: 1800, duration: 15 },
    connect: { waveform: 'sine', freq: 600, duration: 120, freq2: 1200 },
    disconnect: { waveform: 'sine', freq: 400, duration: 200, freq2: 200 },
    error: { waveform: 'square', freq: 180, duration: 400 },
    toggle: { waveform: 'square', freq: 900, duration: 40 },
    boot: { steps: [
      { waveform: 'sine', freq: 200, duration: 120, delay: 0 },
      { waveform: 'sine', freq: 400, duration: 120, delay: 120 },
      { waveform: 'sine', freq: 800, duration: 120, delay: 240 },
      { waveform: 'sine', freq: 1600, duration: 200, delay: 360 },
      { waveform: 'sine', freq: 2400, duration: 300, delay: 560 },
    ] },
    agent_started: { waveform: 'square', freq: 2000, duration: 10 },
    agent_triage: { waveform: 'sine', freq: 700, duration: 60 },
    agent_success: { steps: [
      { waveform: 'sine', freq: 800, duration: 60, delay: 0 },
      { waveform: 'sine', freq: 1200, duration: 80, delay: 70 },
    ] },
    agent_error: { steps: [
      { waveform: 'square', freq: 300, duration: 150, delay: 0 },
      { waveform: 'square', freq: 200, duration: 200, delay: 160 },
    ] },
    crt_toggle: { waveform: 'square', freq: 1400, duration: 25 },
  },

  // LCARS: Clean sci-fi chirps
  lcars: {
    keystroke: { waveform: 'sine', freq: 1200, duration: 20 },
    connect: { waveform: 'sine', freq: 1400, duration: 100, freq2: 1800 },
    disconnect: { waveform: 'sine', freq: 800, duration: 120, freq2: 600 },
    error: { waveform: 'sine', freq: 400, duration: 250, freq2: 350 },
    toggle: { waveform: 'sine', freq: 1600, duration: 60 },
    boot: { steps: [
      { waveform: 'sine', freq: 400, duration: 80, delay: 0 },
      { waveform: 'sine', freq: 800, duration: 80, delay: 80 },
      { waveform: 'sine', freq: 1200, duration: 80, delay: 160 },
      { waveform: 'sine', freq: 1800, duration: 150, delay: 240 },
    ] },
    agent_started: { waveform: 'sine', freq: 1500, duration: 40 },
    agent_triage: { waveform: 'sine', freq: 1000, duration: 60, freq2: 1200 },
    agent_success: { steps: [
      { waveform: 'sine', freq: 1200, duration: 60, delay: 0 },
      { waveform: 'sine', freq: 1800, duration: 80, delay: 70 },
    ] },
    agent_error: { steps: [
      { waveform: 'sine', freq: 600, duration: 120, delay: 0 },
      { waveform: 'sine', freq: 400, duration: 120, delay: 130 },
      { waveform: 'sine', freq: 600, duration: 120, delay: 260 },
    ] },
    crt_toggle: { waveform: 'sine', freq: 1400, duration: 40, freq2: 1600 },
  },
};

const AUDIO_STORAGE_KEY = 'squad-uplink-audio-muted';

// Shared cache singleton — survives re-renders, shared across hook instances
export const bufferCache = new AudioBufferCache();

function loadMutePreference(): boolean {
  try {
    return localStorage.getItem(AUDIO_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function useAudio(skinId: ThemeId = 'apple2e') {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(loadMutePreference);

  const getContext = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }, []);

  // Preload audio files for the current skin when it changes
  useEffect(() => {
    try {
      const ctx = getContext();
      bufferCache.preloadSkin(ctx, skinId);
    } catch {
      // AudioContext not available — procedural fallback only
    }
  }, [skinId, getContext]);

  /** Play a cached AudioBuffer sample through the Web Audio graph */
  const playSample = useCallback(
    (ctx: AudioContext, buffer: AudioBuffer) => {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(0);
    },
    [],
  );

  const playTone = useCallback(
    (ctx: AudioContext, profile: SoundProfile, startOffset: number = 0) => {
      const { waveform, freq, duration, freq2, detune } = profile;
      const start = ctx.currentTime + startOffset;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = waveform;
      osc.frequency.setValueAtTime(freq, start);
      if (detune) osc.detune.setValueAtTime(detune, start);
      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration / 1000);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration / 1000);

      if (freq2) {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = waveform;
        osc2.frequency.setValueAtTime(freq2, start);
        gain2.gain.setValueAtTime(0.05, start);
        gain2.gain.exponentialRampToValueAtTime(0.001, start + duration / 1000);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(start + duration / 3000);
        osc2.stop(start + duration / 1000);
      }
    },
    [],
  );

  /** Play procedural oscillator fallback */
  const playProcedural = useCallback(
    (ctx: AudioContext, sound: SoundType) => {
      const def = SKIN_PROFILES[skinId][sound];
      if (isSequence(def)) {
        for (const step of def.steps) {
          playTone(ctx, step, step.delay / 1000);
        }
      } else {
        playTone(ctx, def);
      }
    },
    [skinId, playTone],
  );

  const play = useCallback(
    (sound: SoundType) => {
      if (muted) return;
      try {
        const ctx = getContext();

        // Try sample file first — if cached buffer exists, use it
        const buffer = bufferCache.get(skinId, sound);
        if (buffer) {
          playSample(ctx, buffer);
          return;
        }

        // If a manifest entry exists but isn't loaded yet, use procedural
        // as interim fallback (the file will be ready next time)
        playProcedural(ctx, sound);
      } catch {
        // Audio not available — silently degrade
      }
    },
    [getContext, skinId, muted, playSample, playProcedural],
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AUDIO_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  return { play, muted, toggleMute };
}
