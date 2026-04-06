# Decision: Consolidate All Controls to StatusBar

**By:** Kare (Frontend Dev)
**Date:** 2026-04-05
**Status:** Implemented

## Context

Duplicate control buttons existed in two locations:
1. **Upper-right toolbar** in App.tsx (`MechanicalSwitch` + `AudioToggle` + `ThemeToggle`), passed as `header` prop to all 4 layout components
2. **StatusBar** (lower-right) with its own CRT and Audio toggle buttons

Additionally, two separate audio mute systems were in conflict:
- `useAudio().toggleMute` → real mute control backed by localStorage
- `connectionStore.toggleAudio` → dead Zustand flag that did nothing to actual audio playback

## Decision

**StatusBar is the single source of truth for all controls.** The upper-right toolbar is removed entirely.

### Changes Made
1. **Removed** the `controls` toolbar variable and its `role="toolbar"` div from `App.tsx`
2. **Removed** `header` prop from all 4 layout components (`FullscreenLayout`, `Win95Layout`, `LcarsLayout`, `PipBoyLayout`) and their type signatures
3. **Removed** imports of `MechanicalSwitch`, `AudioToggle`, and `ThemeToggle` from `App.tsx`
4. **StatusBar** now contains: CRT toggle (with `crt_toggle` sound via `useAudio`), Audio toggle (wired to `useAudio().toggleMute`), and `ThemeToggle`
5. **Audio toggle** in StatusBar uses real `useAudio` hook (localStorage-backed mute state), not the dead `connectionStore.audioEnabled`
6. **CRT toggle** in StatusBar plays `crt_toggle` sound effect on every click (all 6 themes verified)
7. **`/status` command** reads audio mute state from localStorage instead of `connectionStore.audioEnabled`
8. `audioEnabled` and `toggleAudio` left in `connectionStore` but no longer referenced by any UI component

## Rationale

- Users were confused by duplicate controls in different locations
- The Zustand `audioEnabled` flag was completely disconnected from actual audio — toggling it did nothing
- StatusBar already had the right positioning (lower-right, always visible) for controls
- Centralizing controls eliminates state synchronization bugs between toolbar and StatusBar

## Impact

- `MechanicalSwitch` and `AudioToggle` components still exist but are no longer rendered — available for future reuse
- Their standalone tests are marked `describe.skip`
- All 380 active tests pass, build clean
