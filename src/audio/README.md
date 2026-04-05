# Audio System

Retro sound effects for squad-uplink using a **hybrid audio model**:

1. **Primary:** Real audio sample files loaded from `public/audio/{skinId}/` via Web Audio API's `AudioBuffer` (fetch + decodeAudioData)
2. **Fallback:** Procedural Web Audio API oscillators when files are missing or fail to load

## Architecture

| File | Purpose |
|------|---------|
| `manifest.ts` | Maps each skin + sound type → file path in `public/audio/` |
| `bufferCache.ts` | `AudioBufferCache` class — fetches, decodes, and caches `AudioBuffer` instances per skin |
| `../hooks/useAudio.ts` | React hook — tries sample files first, falls back to procedural oscillators |

## How It Works

1. When a skin is active, `useAudio` calls `bufferCache.preloadSkin()` to fetch all audio files for that skin
2. On `play(sound)`, the hook checks the cache for a decoded `AudioBuffer`
3. If found → plays the sample via `createBufferSource()`
4. If not found → plays the procedural oscillator (same as before)

## Sound Types (11 total)

`keystroke` · `connect` · `disconnect` · `error` · `toggle` · `boot` · `agent_started` · `agent_triage` · `agent_success` · `agent_error` · `crt_toggle`

## Adding Audio Files

Drop `.mp3`, `.wav`, or `.ogg` files into `public/audio/{skinId}/`. See `public/audio/README.md` for full instructions.
