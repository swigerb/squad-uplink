# Decisions

## Hybrid Audio — Sample Files with Procedural Fallback

**By:** Kare (Frontend Dev) — Brady (via Copilot directive)  
**Date:** 2026-04-05  
**Status:** Implemented

### Context

Jobs' original architecture decision (#6) specified "Procedural Web Audio API oscillators. No sample files." Brady explicitly provided audio resource URLs for each of the 5 skins and requested real audio files for sound effects. The procedural-only constraint was overly restrictive — real audio files deliver dramatically better retro authenticity.

### Decision

Rework audio system to **hybrid model**:

1. **Primary:** Load real `.mp3`/`.wav`/`.ogg` files from `public/audio/{skinId}/` using Web Audio API `fetch` + `decodeAudioData`
2. **Fallback:** Keep all existing procedural oscillator profiles intact — used when files are missing, still loading, or fail to decode

### Implementation Details

- `src/audio/manifest.ts` — Maps each skin + sound type to a file path
- `src/audio/bufferCache.ts` — `AudioBufferCache` class fetches, decodes, and caches `AudioBuffer` per skin
- `useAudio` hook API is **unchanged** (`{ play, muted, toggleMute }`)
- Preloads only current skin's files (not all 5) via `useEffect` on skin change
- Non-blocking: if a file isn't loaded yet, procedural plays as interim
- If zero audio files exist, app works exactly as before

### Supersedes

Partially supersedes Jobs' ADR v1 decision #6 ("No sample files") — procedural is retained as fallback, but sample files are now the preferred audio source. Backward compatibility maintained.

### Verification

- `npm run build` — clean
- `npm test` — 323 tests pass, 15 skipped (pending audio files)
- Zero breaking changes to public API
- All 5 skin directories created in `public/audio/`

---

## Wave 5 Ship It — Production Readiness

**By:** Woz (Lead Dev)  
**Date:** 2026-04-05  
**Status:** Implemented

### Changes

#### 1. Build Pipeline Fix
Excluded test files (`**/__tests__/**`, `*.test.ts`, `*.test.tsx`, `test-setup.ts`, `__mocks__/**`) from `tsconfig.app.json`. Tests use Node APIs incompatible with the browser-only type configuration. Type-checking for tests is handled by Vitest's own TS pipeline.

#### 2. Code Splitting
- **TelemetryDrawer** lazy-loaded via `React.lazy()` — own chunk, not in initial bundle
- **Manual chunks:** xterm vendor (92KB gzip), react-vendor (60KB gzip)
- **Result:** All chunks under 500KB. Total initial JS ~163KB gzipped.

#### 3. Environment Variables
- `VITE_TUNNEL_URL` env var for tunnel URL — `/connect <token>` uses it as default
- Type declarations in `src/vite-env.d.ts`

#### 4. SWA Config Hardening
- Font caching: `public, max-age=31536000, immutable`
- CSP `connect-src` extended to allow `https:` (needed for `/status` API calls)
- Fonts excluded from SPA navigation fallback

#### 5. CI Workflows
- `azure-static-web-apps.yml`: lint → typecheck → test → build → deploy (push to main)
- `pr-check.yml`: lint → typecheck → test → build (PRs only, no deploy)
- Both include bundle size audit step (warns on >500KB chunks)

#### 6. README
Concise setup doc covering local dev, env vars, themes, shortcuts, architecture.

### Impact
All 319 tests pass. Build clean. No new warnings.

---

## Archive Log
(Post-release decisions logged here)
