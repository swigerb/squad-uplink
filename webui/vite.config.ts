import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };
// BUILD file format: "YYMMDD-NN" (e.g. "260323-01") or legacy plain number
const buildRaw = readFileSync('../BUILD', 'utf8').trim();
const build = /^\d{6}-\d+$/.test(buildRaw) ? buildRaw : `000000-${String(buildRaw).padStart(2, '0')}`;

export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: {
		__VERSION__: JSON.stringify(version),
		__BUILD__: JSON.stringify(build),
	},
	build: {
		outDir: '../dist/webui',
		emptyOutDir: true,
		reportCompressedSize: true,
	},
	server: {
		proxy: {
			'/ws': { target: 'ws://localhost:3847', ws: true },
		},
	},
});
