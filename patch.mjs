// Applies a one-line fix to @github/copilot-sdk after npm install.
// The SDK ships with a broken ESM import (missing .js extension) that
// causes a module-not-found error at runtime on Node 18+.
import { readFileSync, writeFileSync, existsSync } from 'fs';

const target = 'node_modules/@github/copilot-sdk/dist/session.js';

if (!existsSync(target)) {
	console.error('patch: target not found — run npm install first');
	process.exit(1);
}

const src = readFileSync(target, 'utf8');

// Already correct — nothing to do
if (src.includes('vscode-jsonrpc/node.js')) {
	console.log('patch: already applied, nothing to do');
	process.exit(0);
}

// Fix: vscode-jsonrpc/node (without .js) → vscode-jsonrpc/node.js
// Use regex to handle any surrounding quote style
const fixed = src.replace(/vscode-jsonrpc\/node(?!\.js)/g, 'vscode-jsonrpc/node.js');

if (fixed === src) {
	console.warn('patch: WARNING — pattern not found, skipping (SDK may have changed)');
	process.exit(0);
}

writeFileSync(target, fixed);

// Verify the fix actually landed
const verify = readFileSync(target, 'utf8');
if (verify.includes('vscode-jsonrpc/node.js') && !verify.match(/vscode-jsonrpc\/node[^.]/)) {
	console.log('patch: applied successfully');
} else {
	console.error('patch: ERROR — file was written but verification failed');
	process.exit(1);
}
