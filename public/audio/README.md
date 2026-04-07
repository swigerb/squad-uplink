# Audio Assets

Squad Uplink supports **real audio sample files** for each retro theme, with procedural Web Audio API oscillators as automatic fallback when files are missing.

## Directory Structure

```
public/audio/
├── README.md          ← You are here
├── apple2e/           ← Apple IIe — Disk Drive II mechanical sounds
├── c64/               ← Commodore 64 — SID Chip / Tape Load sounds
├── ibm3270/           ← IBM 3270 — Solenoid keyboard click sounds
├── win95/             ← Windows 95 — "Ta-Da" startup / HDD whir sounds
├── lcars/             ← LCARS — Sci-fi chirps / Warp Core Hum
├── pipboy/            ← Pip-Boy 3000 — Geiger ticks / Relay clicks
├── muthur/            ← MU-TH-UR 6000 — Industrial mechanical
├── wopr/              ← W.O.P.R. — Cold military digital tones
└── matrix/            ← Matrix — Cyberpunk digital / sine sweeps
```

## Themes

All 9 themes have procedural sound definitions. Themes with audio files in the manifest can override procedural sounds with real samples.

| Theme ID  | Display Name    | Manifest Entries | Audio Character                     |
|-----------|-----------------|------------------|-------------------------------------|
| `apple2e` | Apple IIe       | All 12 sounds    | Clean sine/square, Disk Drive II    |
| `c64`     | Commodore 64    | 11 sounds        | Sawtooth/pulse, SID chip detune     |
| `ibm3270` | IBM 3270        | 11 sounds        | Heavy square wave, solenoid clicks  |
| `win95`   | Windows 95      | 11 sounds        | Smooth sine, classic Windows tones  |
| `pipboy`  | Pip-Boy 3000    | 11 sounds        | Geiger ticks, relay clicks, sweeps  |
| `lcars`   | LCARS           | 11 sounds        | Clean sci-fi sine chirps            |
| `muthur`  | MU-TH-UR 6000  | Procedural only  | Industrial mechanical, stark/alien  |
| `wopr`    | W.O.P.R.        | Procedural only  | Crisp digital sine tones            |
| `matrix`  | Matrix          | Procedural only  | Cyberpunk sine sweeps, sawtooth     |

## Sound Types

Each theme folder can contain files for any of these **12** sound types:

| File Name            | Trigger                        | Description                     |
|----------------------|--------------------------------|---------------------------------|
| `keystroke.mp3`      | Each key press                 | Key click / type sound          |
| `connect.mp3`        | WebSocket connected            | Connection established          |
| `disconnect.mp3`     | WebSocket closed               | Connection lost                 |
| `error.mp3`          | Error message received         | Error alert                     |
| `toggle.mp3`         | Theme switch                   | Skin change confirmation        |
| `boot.mp3`           | App startup / skin load        | Boot sequence sound             |
| `agent_started.mp3`  | Agent begins work              | Agent activation                |
| `agent_triage.mp3`   | Agent triaging request         | Processing indicator            |
| `agent_success.mp3`  | Agent completed successfully   | Success chime                   |
| `agent_error.mp3`    | Agent encountered an error     | Error buzzer                    |
| `crt_toggle.mp3`     | CRT filter toggled             | CRT on/off click                |
| `disk_drive.mp3`     | Disk activity during loading   | Mechanical disk drive sound     |

## Procedural vs. File-Based Audio

The audio system is **hybrid**:

- **Procedural (oscillator synthesis):** Every theme has procedural sound definitions in `useAudio.ts` using the Web Audio API `OscillatorNode`. These use waveforms (sine, square, sawtooth), frequencies, detune, and multi-step sequences to generate sounds in real time. Procedural sounds work with zero external files.
- **File-based (audio samples):** Themes can optionally provide `.mp3`/`.wav`/`.ogg` sample files. When a file exists in the manifest (`src/audio/manifest.ts`) and loads successfully, it plays instead of the procedural version. This allows richer, more authentic sounds.
- **Fallback chain:** On `play(sound)` → check cache for decoded sample → if found, play it → if not, synthesize via oscillator.

Currently, `muthur`, `wopr`, and `matrix` are **procedural-only** (no manifest entries). All other themes have manifest entries but may not have the actual files yet — missing files fall back gracefully to procedural.

## Accepted Formats

- `.mp3` — Recommended (smallest file size, universal browser support)
- `.wav` — Uncompressed (highest quality, larger files)
- `.ogg` — Good compression (not supported in Safari)

The manifest in `src/audio/manifest.ts` defaults to `.mp3` paths. To use `.wav` or `.ogg`, update the manifest entry for that sound.

## Adding Custom Sounds

1. Drop your audio file into the appropriate theme folder (e.g., `public/audio/c64/boot.mp3`)
2. The manifest in `src/audio/manifest.ts` already has entries for most themes — if a file exists at the path, it will be used automatically
3. For `muthur`, `wopr`, or `matrix`, you'll also need to add manifest entries in `src/audio/manifest.ts`
4. If the file is missing or fails to load, the procedural oscillator fallback plays instead
5. Keep files short (under 2 seconds for most sounds, under 5 seconds for boot sequences)

## Where to Find Royalty-Free Sounds

- **[Freesound.org](https://freesound.org)** — Search for "floppy drive", "SID chip", "solenoid keyboard", "Windows 95 startup", "sci-fi chirp"
- **[Archive.org](https://archive.org/details/audio)** — Vintage computer sound archives
- **[ZapSplat](https://www.zapsplat.com)** — Free retro/computer sound effects
- **[Soundsnap](https://www.soundsnap.com)** — Professional sound effects (some free)

### Recommended Search Terms by Theme

| Theme    | Search Terms                                           |
|----------|--------------------------------------------------------|
| Apple IIe | "apple ii floppy", "5.25 disk drive", "disk seek"     |
| C64      | "commodore 64 SID", "tape loading", "datasette"       |
| IBM 3270 | "solenoid keyboard", "model M click", "mainframe"     |
| Win95    | "windows 95 startup", "tada wav", "hard drive spin"   |
| Pip-Boy  | "geiger counter tick", "relay click", "vacuum tube"   |
| LCARS    | "star trek lcars", "communicator chirp", "sci-fi UI"  |
| MU-TH-UR | "industrial alarm", "airlock", "alien computer"      |
| W.O.P.R. | "war games computer", "military terminal", "NORAD"   |
| Matrix   | "digital rain", "cyberpunk UI", "hacker terminal"     |

## Fallback Behavior

- If **no audio files exist** at all → app works exactly as before (pure procedural oscillators)
- If **some files exist** → those play as samples, missing ones fall back to procedural
- If a file **fails to load** (network error, corrupt file) → procedural fallback for that sound
- Files are **preloaded per-skin** — only the current theme's files are fetched, not all 9
- Preloading is **non-blocking** — if a file isn't ready yet, procedural plays as interim
