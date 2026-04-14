# 2026-04-06T01:55 — Woz (Lead Dev) — Pip-Boy sounds + theme audio fixes

**Status:** ✅ SUCCESS  
**Duration:** Background agent  
**Tests:** 389 passing, 0 failed  

## Summary

Fixed three stacked audio bugs affecting Pip-Boy theme and all 6 skins:

1. **AudioContext autoplay suspension** — Browser policy suspends AudioContext on first interaction. Web Audio API oscillators never played. Fixed: `play()` calls `ctx.resume()` before scheduling.
2. **Multiple AudioContext instances** — PipBoyLayout, usePipBoyTransition hook, and StatusBar each created separate AudioContext via independent `useAudio` calls. Wasted memory and caused race conditions. Fixed: Single shared AudioContext singleton via `getSharedContext()`.
3. **Mute state not synced** — Per-instance `useState` for muted state meant toggling mute in StatusBar didn't silence PipBoyLayout dial sounds. Fixed: Replaced with `useSyncExternalStore` + module-level shared muted state.

## Verification

- All 6 themes verified: each has complete audio profile (all 11 SoundType entries in SKIN_PROFILES + AUDIO_MANIFEST)
- Pip-Boy theme added to 'all skins' test (was only 5/6 before)
- Added `_resetAudioForTesting()` export for test isolation
- 389 tests passing, build clean

## Files Changed

- `src/hooks/useAudio.ts` — Refactored to use shared AudioContext + useSyncExternalStore
- `src/audio/audioContext.ts` — New singleton getSharedContext() factory
- `src/audio/manifest.ts` — Added pipboy profile (6/6 themes now complete)
- Test suite — Added _resetAudioForTesting export

## Architecture Notes

- Shared AudioContext singleton survives re-renders and unmounts
- Mute state stored in module scope, synchronized across all hook instances via useSyncExternalStore
- Procedural oscillator resume() called on every play() for autoplay policy compliance
- No breaking changes to useAudio public API

## Next Steps

- Real audio files for `public/audio/{skinId}/` directories when available
- Telemetry integration for Woz's pending TelemetryDrawer tests
