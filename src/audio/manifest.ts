import type { ThemeId } from '@/themes';
import type { SoundType } from '@/hooks/useAudio';

/**
 * Maps skinId → soundType → audio file path (relative to public/).
 * When a file is listed here and exists in public/audio/{skinId}/,
 * it will be loaded via Web Audio API's decodeAudioData.
 * Missing entries fall back to procedural oscillator synthesis.
 */
export const AUDIO_MANIFEST: Record<ThemeId, Partial<Record<SoundType, string>>> = {
  // Apple IIe: Disk Drive II mechanical sounds
  apple2e: {
    boot: '/audio/apple2e/boot.mp3',
    connect: '/audio/apple2e/connect.mp3',
    disconnect: '/audio/apple2e/disconnect.mp3',
    error: '/audio/apple2e/error.mp3',
    keystroke: '/audio/apple2e/keystroke.mp3',
    toggle: '/audio/apple2e/toggle.mp3',
    agent_started: '/audio/apple2e/agent_started.mp3',
    agent_triage: '/audio/apple2e/agent_triage.mp3',
    agent_success: '/audio/apple2e/agent_success.mp3',
    agent_error: '/audio/apple2e/agent_error.mp3',
    crt_toggle: '/audio/apple2e/crt_toggle.mp3',
  },

  // C64: SID Chip / Tape Load sounds
  c64: {
    boot: '/audio/c64/boot.mp3',
    connect: '/audio/c64/connect.mp3',
    disconnect: '/audio/c64/disconnect.mp3',
    error: '/audio/c64/error.mp3',
    keystroke: '/audio/c64/keystroke.mp3',
    toggle: '/audio/c64/toggle.mp3',
    agent_started: '/audio/c64/agent_started.mp3',
    agent_triage: '/audio/c64/agent_triage.mp3',
    agent_success: '/audio/c64/agent_success.mp3',
    agent_error: '/audio/c64/agent_error.mp3',
    crt_toggle: '/audio/c64/crt_toggle.mp3',
  },

  // IBM 3270: Solenoid keyboard click sounds
  ibm3270: {
    boot: '/audio/ibm3270/boot.mp3',
    connect: '/audio/ibm3270/connect.mp3',
    disconnect: '/audio/ibm3270/disconnect.mp3',
    error: '/audio/ibm3270/error.mp3',
    keystroke: '/audio/ibm3270/keystroke.mp3',
    toggle: '/audio/ibm3270/toggle.mp3',
    agent_started: '/audio/ibm3270/agent_started.mp3',
    agent_triage: '/audio/ibm3270/agent_triage.mp3',
    agent_success: '/audio/ibm3270/agent_success.mp3',
    agent_error: '/audio/ibm3270/agent_error.mp3',
    crt_toggle: '/audio/ibm3270/crt_toggle.mp3',
  },

  // Win95: "Ta-Da" startup / HDD whir sounds
  win95: {
    boot: '/audio/win95/boot.mp3',
    connect: '/audio/win95/connect.mp3',
    disconnect: '/audio/win95/disconnect.mp3',
    error: '/audio/win95/error.mp3',
    keystroke: '/audio/win95/keystroke.mp3',
    toggle: '/audio/win95/toggle.mp3',
    agent_started: '/audio/win95/agent_started.mp3',
    agent_triage: '/audio/win95/agent_triage.mp3',
    agent_success: '/audio/win95/agent_success.mp3',
    agent_error: '/audio/win95/agent_error.mp3',
    crt_toggle: '/audio/win95/crt_toggle.mp3',
  },

  // Pip-Boy 3000: Geiger tick / Relay click sounds
  pipboy: {
    boot: '/audio/pipboy/boot.mp3',
    connect: '/audio/pipboy/connect.mp3',
    disconnect: '/audio/pipboy/disconnect.mp3',
    error: '/audio/pipboy/error.mp3',
    keystroke: '/audio/pipboy/keystroke.mp3',
    toggle: '/audio/pipboy/toggle.mp3',
    agent_started: '/audio/pipboy/agent_started.mp3',
    agent_triage: '/audio/pipboy/agent_triage.mp3',
    agent_success: '/audio/pipboy/agent_success.mp3',
    agent_error: '/audio/pipboy/agent_error.mp3',
    crt_toggle: '/audio/pipboy/crt_toggle.mp3',
  },

  // LCARS: "Chirp" / Warp Core Hum sounds
  lcars: {
    boot: '/audio/lcars/boot.mp3',
    connect: '/audio/lcars/connect.mp3',
    disconnect: '/audio/lcars/disconnect.mp3',
    error: '/audio/lcars/error.mp3',
    keystroke: '/audio/lcars/keystroke.mp3',
    toggle: '/audio/lcars/toggle.mp3',
    agent_started: '/audio/lcars/agent_started.mp3',
    agent_triage: '/audio/lcars/agent_triage.mp3',
    agent_success: '/audio/lcars/agent_success.mp3',
    agent_error: '/audio/lcars/agent_error.mp3',
    crt_toggle: '/audio/lcars/crt_toggle.mp3',
  },
};

/** All supported audio file extensions */
export const SUPPORTED_FORMATS = ['.mp3', '.wav', '.ogg'] as const;
