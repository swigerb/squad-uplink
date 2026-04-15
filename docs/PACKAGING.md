# Packaging & Releases

## Quick Reference

```bash
npm run package
```

This single command does everything: bumps the build number, builds the server and UI,
stages release files, and creates a versioned zip in `releases/`.

## What It Does

1. **Bumps BUILD** — `BUILD` file tracks `YYMMDD-NN` format (e.g. `260323-01`).
   Counter resets to 01 each day, increments within the same day.

2. **Builds** — Runs `npm run build` which compiles the server (esbuild) and UI (vite).
   The build stamp (`__VERSION__` and `__BUILD__`) is embedded at compile time.

3. **Stages files** — Copies release-relevant files to a temp directory:
   - `dist/` — compiled server, launcher, and web UI
   - `patches/` — SDK compatibility patches (applied by `postinstall`)
   - `package.json` — release version (from `package.dist.json`, not the dev one)
   - `patch.mjs` — fallback patch script
   - `start-portal.cmd` / `start-portal.sh` — single entry point for users
   - `README.md`, `CHANGELOG.md`, `BUILD`

4. **Creates zip** — `releases/copilot-portal-v{version}-build-{build}.zip`

5. **Cleans up** — Removes the temp staging directory

## After Packaging

```bash
# Commit the bumped BUILD file
git add BUILD && git commit -m "Bump build"
```

The zip is in `releases/` — distribute via GitHub Releases or other channels.

## Versioning Scheme

- **Version** (semver) — Lives in `package.json`, bumped manually for releases.
  Currently `0.2.0`. Bump when shipping a significant feature set.

- **Build** (daily counter) — Lives in `BUILD` file, auto-incremented on each `npm run package`.
  Format: `YYMMDD-NN` (e.g. `260323-03` = third build on March 23, 2026).

- **Zip name** — `copilot-portal-v{version}-build-{build}.zip`

- **UI display** — Shows `v0.2.0 · build 260323-03` in the session drawer.

## What's In the Release vs Dev Repo

| File | In release | In dev repo | Notes |
|------|-----------|-------------|-------|
| `dist/` | ✅ | ✅ | Compiled output |
| `patches/` | ✅ | ✅ | SDK patches |
| `package.json` | ✅ (from `package.dist.json`) | ✅ (dev version) | Different! Release has fewer deps, no build tools |
| `start-portal.cmd/.sh` | ✅ | ✅ | User entry point |
| `patch.mjs` | ✅ | ✅ | Fallback patch |
| `README.md` | ✅ | ✅ | |
| `CHANGELOG.md` | ✅ | ✅ | |
| `BUILD` | ✅ | ✅ | |
| `src/` | ❌ | ✅ | TypeScript source |
| `webui/` | ❌ | ✅ | React source |
| `node_modules/` | ❌ | ✅ | Dev deps; release users run `npm install` |
| `esbuild.cjs` | ❌ | ✅ | Build tooling |
| `package.mjs` | ❌ | ✅ | This packaging script |
| `docs/` | ❌ | ✅ | Internal planning docs |

## package.dist.json vs package.json

The dev `package.json` has build tools (esbuild, typescript, vite, etc.) as devDependencies.
The release `package.dist.json` is a minimal version that becomes `package.json` in the zip:

- Only runtime dependencies (`@github/copilot-sdk`, `ws`, `qrcode`, `patch-package`)
- `scripts.start` points to `dist/launcher.js`
- `postinstall` runs `patch-package` to apply SDK compatibility patches
- No build scripts (release is pre-built)

## User Experience

End users:
1. Unzip
2. Double-click `start-portal.cmd` (or `./start-portal.sh`)
3. First run: installs Node.js (if needed), npm dependencies, checks PowerShell 7, GitHub auth
4. Subsequent runs: skips checks, starts immediately

## Update Flow

The portal checks for SDK/CLI updates every 4 hours. When updates are available:
1. Blue banner in UI: "copilot-sdk 0.1.32 → 0.2.0"
2. User clicks "Update now"
3. Server runs `npm install pkg@latest` (not `npm update` — crosses semver boundaries)
4. Skips rebuild (no build script in release package)
5. Green banner: "Restart now"
6. User clicks restart → launcher relaunches server process
