# Architecture Fixes — Jobs

**Date:** 2026-05-01  
**Author:** Jobs (Lead)  
**Status:** Accepted

## Decisions Made

### 1. TypeScript Quality Gate Infrastructure
**Decision:** Set up typecheck infrastructure without fixing all pre-existing errors.
- Root `tsconfig.json` updated: `module: NodeNext`, `moduleResolution: NodeNext` (was CommonJS, incompatible with ESM codebase)
- Created `webui/tsconfig.json` with React/Vite-compatible settings (`module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`)
- Added `typecheck` script to root and webui `package.json`
- Added `typecheck:all` script to root for full-project typecheck
- **Known errors:** Backend: 15, WebUI: 67. These are pre-existing and should be burned down incrementally.

### 2. Release Manifest Synchronized
**Decision:** `package.dist.json` updated to match current development dependencies.
- Name: `copilot-portal` → `squad-uplink`
- Repo URL: `shannonfritz/copilot-portal` → `swigerb/squad-uplink`
- Added `@github/copilot: ^1.0.36` (was missing entirely)
- Updated `@github/copilot-sdk: ^0.2.0` → `^0.3.0`
- Removed stale `qrcode: ^1.5.4` (dead code — we use `qrcode-terminal`)
- Description aligned with root package.json

### 3. CI Workflows Aligned
**Decision:** All CI workflows now follow one contract: install → typecheck (allow failures) → test → build.
- `ci.yml`: Added typecheck steps with `continue-on-error: true`. Reordered to typecheck → test → build.
- `squad-ci.yml`: Replaced nonexistent `node --test test/*.test.cjs` with proper install + typecheck + vitest + build steps.
- `squad-release.yml`: Same fix — replaced `node --test test/*.test.cjs` with real pipeline.
- `azure-static-web-apps.yml`: Quarantined with explanatory header. References nonexistent scripts and stale SWA config. Manual-only trigger retained.

### 4. Dual-Project Topology Documented
**Decision:** Do NOT convert to npm workspaces now — too risky for the value. Instead:
- Added `install:all` script to root: `npm install && cd webui && npm install`
- **Future improvement:** Consider npm workspaces when a third project is added or when install skew causes a real bug. Not before.

### 5. Bundle Size Documented (No Code Splitting Yet)
**Decision:** Client bundle is 493 KB (146 KB gzip). Near the 500 KB warning cliff but not over.
- Enabled `build.reportCompressedSize: true` in `webui/vite.config.ts` for visibility.
- **Future work:** Lazy-load these modules via `React.lazy()` + dynamic `import()`:
  - `react-markdown` + remark plugins (~150 KB estimated)
  - `qrcode.react` + share dialog (~20 KB estimated)
  - Guide/help panels
- **Do not attempt** code splitting until App.tsx decomposition is complete (Kare's scope).

### 6. Oversized Coordinators — Architectural Debt
**Decision:** Document only. No code changes.
- `server.ts` (~400+ lines in handleHttp): Needs router extraction.
- `session.ts` (~1800 lines): Core SDK bridge, hard to split without API changes.
- `App.tsx` (~4500 lines): Kare is actively decomposing. Do not duplicate effort.
- These are tracked in the architecture review findings from 2026-04-27.

### 7. Auth Cleanup Interval — Woz's Scope
**Decision:** Skip. Woz owns backend fixes including `setInterval` cleanup in `server.ts` shutdown path. Verified: server.ts has unstaged changes from Woz's work.

### 8. Branding Updated
**Decision:** All user-visible references updated from "Copilot Portal" to "Squad Uplink".
- `webui/index.html`: title + apple-mobile-web-app-title meta tag
- `webui/public/manifest.json`: name, short_name, description
- `webui/package.json`: name → `squad-uplink-webui`
- `package.dist.json`: name, description, repo URL
