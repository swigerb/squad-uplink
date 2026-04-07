# PWA Icons

## Source

`uplink-icon.svg` — Pixel-art satellite dish icon in Apple IIe green (#33FF33) on black.
Designed to be recognizable at 192px and 512px.

## Generated Files

- `pwa-192x192.png` — Standard PWA icon (192×192)
- `pwa-512x512.png` — Large PWA icon / maskable (512×512)

## How to Generate

```bash
# Install sharp (if not already installed)
npm install

# Generate the PNG icons from the SVG source
npm run generate:icons
```

This runs `scripts/generate-icons.mjs` which uses [sharp](https://sharp.pixelplumbing.com/) to
rasterize `uplink-icon.svg` at both sizes. Re-run after any SVG edits.
