# Audio Assets

Squad Uplink supports **real audio sample files** for each retro skin, with procedural Web Audio API oscillators as fallback when files are missing.

## Directory Structure

```
public/audio/
├── README.md          ← You are here
├── apple2e/           ← Disk Drive II mechanical sounds
├── c64/               ← SID Chip / Tape Load sounds
├── ibm3270/           ← Solenoid keyboard click sounds
├── win95/             ← "Ta-Da" startup / HDD whir sounds
└── lcars/             ← "Chirp" / Warp Core Hum sounds
```

## Sound Types

Each skin folder can contain files for any of these 11 sound types:

| File Name            | Trigger                        | Description                     |
|----------------------|--------------------------------|---------------------------------|
| `boot.mp3`           | App startup / skin load        | Boot sequence sound             |
| `connect.mp3`        | WebSocket connected            | Connection established          |
| `disconnect.mp3`     | WebSocket closed               | Connection lost                 |
| `error.mp3`          | Error message received         | Error alert                     |
| `keystroke.mp3`      | Each key press                 | Key click / type sound          |
| `toggle.mp3`         | Theme switch                   | Skin change confirmation        |
| `agent_started.mp3`  | Agent begins work              | Agent activation                |
| `agent_triage.mp3`   | Agent triaging request         | Processing indicator            |
| `agent_success.mp3`  | Agent completed successfully   | Success chime                   |
| `agent_error.mp3`    | Agent encountered an error     | Error buzzer                    |
| `crt_toggle.mp3`     | CRT filter toggled             | CRT on/off click                |

## Accepted Formats

- `.mp3` — Recommended (smallest file size, universal browser support)
- `.wav` — Uncompressed (highest quality, larger files)
- `.ogg` — Good compression (not supported in Safari)

The manifest in `src/audio/manifest.ts` defaults to `.mp3` paths. To use `.wav` or `.ogg`, update the manifest entry for that sound.

## Adding Custom Sounds

1. Drop your audio file into the appropriate skin folder (e.g., `public/audio/c64/boot.mp3`)
2. The manifest in `src/audio/manifest.ts` already has entries for all sounds — if a file exists at the path, it will be used automatically
3. If the file is missing or fails to load, the procedural oscillator fallback plays instead
4. Keep files short (under 2 seconds for most sounds, under 5 seconds for boot sequences)

## Where to Find Royalty-Free Sounds

- **[Freesound.org](https://freesound.org)** — Search for "floppy drive", "SID chip", "solenoid keyboard", "Windows 95 startup", "sci-fi chirp"
- **[Archive.org](https://archive.org/details/audio)** — Vintage computer sound archives
- **[ZapSplat](https://www.zapsplat.com)** — Free retro/computer sound effects
- **[Soundsnap](https://www.soundsnap.com)** — Professional sound effects (some free)

### Recommended Search Terms by Skin

| Skin     | Search Terms                                           |
|----------|--------------------------------------------------------|
| Apple IIe | "apple ii floppy", "5.25 disk drive", "disk seek"     |
| C64      | "commodore 64 SID", "tape loading", "datasette"       |
| IBM 3270 | "solenoid keyboard", "model M click", "mainframe"     |
| Win95    | "windows 95 startup", "tada wav", "hard drive spin"   |
| LCARS    | "star trek lcars", "communicator chirp", "sci-fi UI"  |

## Fallback Behavior

- If **no audio files exist** at all → app works exactly as before (pure procedural oscillators)
- If **some files exist** → those play as samples, missing ones fall back to procedural
- If a file **fails to load** (network error, corrupt file) → procedural fallback for that sound
- Files are **preloaded per-skin** — only the current skin's files are fetched, not all 5
- Preloading is **non-blocking** — if a file isn't ready yet, procedural plays as interim
