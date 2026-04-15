#!/usr/bin/env node
/**
 * Automated WebSocket test client for copilot-portal.
 *
 * Usage:
 *   node tools/test-client.mjs [prompt]
 *
 * Reads connection info from debug/connection.json (written by the extension
 * when the server starts). Connects via WebSocket, sends a prompt, waits for
 * the response, prints it, then exits.
 *
 * Requirements: npm install ws (in the project root or globally)
 */

import { readFileSync, watchFile, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── config ────────────────────────────────────────────────────────────────────
const CONN_FILE = resolve(__dirname, '../debug/connection.json');
const LOG_FILE  = resolve(__dirname, '../debug/server.log');
const PROMPT    = process.argv[2] ?? 'Say exactly: PORTAL_TEST_OK';
const TIMEOUT_MS = 30_000;

// ── helpers ───────────────────────────────────────────────────────────────────
function ts() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function log(...args) { console.log(`[${ts()}]`, ...args); }
function err(...args) { console.error(`[${ts()}] ERROR:`, ...args); }

// ── wait for server if not yet started ───────────────────────────────────────
async function waitForConnection(timeoutMs = 15_000) {
  if (existsSync(CONN_FILE)) return JSON.parse(readFileSync(CONN_FILE, 'utf8'));
  log('connection.json not found — waiting up to 15s for server to start...');
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${CONN_FILE}.\nMake sure VS Code is open and "Copilot Portal: Start Server" has been run.`));
    }, timeoutMs);
    const interval = setInterval(() => {
      if (existsSync(CONN_FILE)) {
        clearInterval(interval);
        clearTimeout(deadline);
        resolve(JSON.parse(readFileSync(CONN_FILE, 'utf8')));
      }
    }, 500);
  });
}

// ── tail the server log file ──────────────────────────────────────────────────
let logOffset = 0;
function tailLog() {
  if (!existsSync(LOG_FILE)) return;
  try {
    const content = readFileSync(LOG_FILE, 'utf8');
    const newContent = content.slice(logOffset);
    if (newContent) {
      process.stdout.write('\x1b[90m' + newContent + '\x1b[0m'); // dim gray
      logOffset = content.length;
    }
  } catch {}
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await waitForConnection();
  log(`Server at ${conn.url}, started ${conn.startedAt}`);
  log(`Sending prompt: "${PROMPT}"`);

  // Reset log tail to current end so we only show new lines
  if (existsSync(LOG_FILE)) {
    logOffset = readFileSync(LOG_FILE, 'utf8').length;
  }
  const logInterval = setInterval(tailLog, 200);

  let WS;
  try { WS = require('ws'); }
  catch {
    err('ws package not found. Run: npm install ws  (in C:\\Projects\\copilot-portal)');
    process.exit(1);
  }

  const wsUrl = `${conn.url}?token=${conn.token}`;
  const ws = new WS(wsUrl);

  let responseText = '';
  let resolved = false;

  const timeout = setTimeout(() => {
    if (!resolved) {
      err(`No response within ${TIMEOUT_MS / 1000}s`);
      finish(1);
    }
  }, TIMEOUT_MS);

  function finish(code) {
    resolved = true;
    clearTimeout(timeout);
    clearInterval(logInterval);
    tailLog(); // flush remaining log
    ws.close();
    if (code === 0) {
      log(`\n✅ Response received (${responseText.length} chars):`);
      console.log('\x1b[32m' + responseText + '\x1b[0m');
    }
    // Give ws a moment to close cleanly
    setTimeout(() => process.exit(code), 200);
  }

  ws.on('open', () => {
    log('WebSocket connected');
    ws.send(JSON.stringify({ type: 'prompt', content: PROMPT }));
  });

  ws.on('message', (data) => {
    let event;
    try { event = JSON.parse(data.toString()); }
    catch { log('Unparseable message:', data.toString()); return; }

    if (event.type === 'delta') {
      responseText += event.content ?? '';
    } else if (event.type === 'idle') {
      finish(0);
    } else if (event.type === 'error') {
      err(`Agent error: ${event.content}`);
      finish(1);
    } else if (event.type === 'thinking' || event.type === 'tool_call' || event.type === 'tool_result') {
      log(`[${event.type}]`, event.toolName ?? event.content ?? '');
    }
  });

  ws.on('error', (e) => {
    err('WebSocket error:', e.message);
    finish(1);
  });

  ws.on('close', (code, reason) => {
    if (!resolved) {
      err(`WebSocket closed unexpectedly (code: ${code}, reason: ${reason.toString() || 'none'})`);
      finish(1);
    }
  });
}

main().catch((e) => { err(e.message); process.exit(1); });
