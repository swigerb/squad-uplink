import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

// Create a standalone SVG with fixed background for the iOS icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="36" fill="#1e1e2e"/>
  <g transform="translate(15, 15) scale(6.25)">
    <defs>
      <clipPath id="o"><ellipse cx="8" cy="12" rx="7.5" ry="10" transform="rotate(20, 8, 12)"/></clipPath>
    </defs>
    <ellipse cx="8" cy="12" rx="7.5" ry="10" fill="#e8eaed" transform="rotate(20, 8, 12)"/>
    <ellipse cx="8.2" cy="13" rx="4.8" ry="7.8" fill="#1e1e2e" transform="rotate(20, 8.2, 13)"/>
    <g clip-path="url(#o)">
      <rect x="8" y="4" width="17" height="16" rx="2.5" fill="#1e1e2e"/>
    </g>
    <rect x="11" y="8" width="13" height="10" rx="1.5" fill="#2a2a3e" stroke="#e8eaed" stroke-width="1.5"/>
    <line x1="11" y1="10" x2="24" y2="10" stroke="#e8eaed" stroke-width="1.5"/>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg))
    .resize(180, 180)
    .png()
    .toBuffer();
writeFileSync('webui/public/apple-touch-icon.png', png);
console.log('Created apple-touch-icon.png:', png.length, 'bytes');
