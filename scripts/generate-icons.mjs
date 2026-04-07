#!/usr/bin/env node
/**
 * Generate PWA icons from the SVG source.
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/generate-icons.mjs
 *
 * Outputs:
 *   public/icons/pwa-192x192.png
 *   public/icons/pwa-512x512.png
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const svgPath = path.resolve(__dirname, '..', 'public', 'icons', 'uplink-icon.svg');
const outDir = path.resolve(__dirname, '..', 'public', 'icons');

const sizes = [192, 512];

for (const size of sizes) {
  const outFile = path.join(outDir, `pwa-${size}x${size}.png`);
  await sharp(svgPath)
    .resize(size, size)
    .png()
    .toFile(outFile);
  console.log(`✓ Generated ${outFile} (${size}×${size})`);
}

console.log('\nDone — PWA icons generated.');
