# Decisions

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
