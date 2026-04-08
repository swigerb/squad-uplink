#!/usr/bin/env node

/**
 * Squad RC Launch Helper — starts Squad RC and prints the session token.
 *
 * The official `squad rc` CLI (v0.9.1) does not print the session token
 * that is required for WebSocket authentication. This wrapper script
 * starts a Squad RC bridge directly via the squad-sdk and prints the
 * token so external clients (like Squad Uplink) can connect.
 *
 * Usage:
 *   node scripts/squad-rc-launch.mjs [port]
 *
 * Prerequisites:
 *   npm install -g @bradygaster/squad-cli
 *
 * See: https://github.com/bradygaster/squad/issues/917
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_PORT = 35555;
const port = parseInt(process.argv[2] || String(DEFAULT_PORT), 10);

if (isNaN(port) || port < 1 || port > 65535) {
  console.error(`Invalid port: ${process.argv[2]}`);
  console.error('Usage: node scripts/squad-rc-launch.mjs [port]');
  process.exit(1);
}

// Resolve squad-sdk from the global squad-cli install
const globalNpmPath = process.platform === 'win32'
  ? path.join(os.homedir(), 'AppData', 'Roaming', 'npm')
  : '/usr/local/lib';

const sdkPaths = [
  // Global install via npm
  path.join(globalNpmPath, 'node_modules', '@bradygaster', 'squad-cli', 'node_modules', '@bradygaster', 'squad-sdk', 'dist', 'remote', 'bridge.js'),
  // Fallback: try from node_modules in CWD
  path.join(process.cwd(), 'node_modules', '@bradygaster', 'squad-sdk', 'dist', 'remote', 'bridge.js'),
];

let RemoteBridge = null;
for (const sdkPath of sdkPaths) {
  try {
    const mod = await import(`file://${sdkPath.replace(/\\/g, '/')}`);
    RemoteBridge = mod.RemoteBridge;
    break;
  } catch {
    // Try next path
  }
}

if (!RemoteBridge) {
  console.error('Could not find @bradygaster/squad-sdk.');
  console.error('Install it globally: npm install -g @bradygaster/squad-cli');
  process.exit(1);
}

console.log(`\n  Starting Squad RC bridge on port ${port}...`);

const bridge = new RemoteBridge({ port });
const actualPort = await bridge.start();
const sessionToken = bridge.getSessionToken();

console.log(`
  ✓ Squad RC bridge running
  ────────────────────────────────────────
  Local URL:      http://localhost:${actualPort}?token=${sessionToken}
  Session Token:  ${sessionToken}
  Port:           ${actualPort}
  Expires:        4 hours from now
  ────────────────────────────────────────

  Connect from Squad Uplink:
    /connect http://localhost:${actualPort} ${sessionToken}

  Or open in browser:
    http://localhost:${actualPort}?token=${sessionToken}

  Press Ctrl+C to stop.
`);

// Clean shutdown
process.on('SIGINT', async () => {
  console.log('\n  Shutting down...');
  await bridge.stop();
  console.log('  ✓ Stopped.\n');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await bridge.stop();
  process.exit(0);
});

// Keep alive
await new Promise(() => {});
