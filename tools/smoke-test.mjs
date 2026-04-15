#!/usr/bin/env node
/**
 * WebSocket smoke test for copilot-portal event handling.
 *
 * Tests:
 *   1. Connect to a session → receive history → no stuck "thinking" state
 *   2. Send a simple prompt → receive thinking → deltas → idle
 *   3. Verify expected event types arrive in the right order
 *
 * Usage:
 *   node tools/smoke-test.mjs [sessionId]
 *
 * Reads connection info from debug/connection.json.
 * If no sessionId provided, connects to the most recent session.
 */

import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const CONN_FILE = resolve(__dirname, '../debug/connection.json');
const SESSION_ID = process.argv[2] ?? '';
const TIMEOUT_MS = 45_000;

function ts() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function log(...args) { console.log(`[${ts()}]`, ...args); }
function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); }

let WS;
try { WS = require('ws'); }
catch { console.error('ws package not found. Run: npm install ws'); process.exit(1); }

async function getConnection() {
  if (!existsSync(CONN_FILE)) {
    console.error(`${CONN_FILE} not found — start the server first.`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONN_FILE, 'utf8'));
}

function connect(conn, sessionId) {
  const url = sessionId
    ? `${conn.url}?token=${conn.token}&session=${sessionId}`
    : `${conn.url}?token=${conn.token}`;
  return new WS(url);
}

// Collect events until a condition is met or timeout
function collectUntil(ws, conditionFn, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timed out after ${timeoutMs / 1000}s. Events received: ${events.map(e => e.type).join(', ')}`));
    }, timeoutMs);

    function handler(data) {
      try {
        const event = JSON.parse(data.toString());
        events.push(event);
        if (conditionFn(event, events)) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(events);
        }
      } catch {}
    }
    ws.on('message', handler);
  });
}

// ── Test 1: Connect and verify no stuck thinking ──────────────────────────────
async function test1_noStuckThinking(conn) {
  log('Test 1: Connect → history → no stuck thinking');
  const ws = connect(conn, SESSION_ID);
  let passed = 0, failed = 0;

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  // Collect events until history_end (or timeout)
  const events = await collectUntil(ws, (e) => e.type === 'history_end', 15000);
  const types = events.map(e => e.type);

  // Should have session_switched
  if (types.includes('session_switched')) { pass('session_switched received'); passed++; }
  else { fail('No session_switched event'); failed++; }

  // Should have history_start and history_end
  if (types.includes('history_start') && types.includes('history_end')) { pass('History replay complete'); passed++; }
  else { fail('Missing history_start/history_end'); failed++; }

  // After history_end, check for active turn events — should NOT include 'thinking'
  const afterHistory = events.slice(types.indexOf('history_end') + 1);
  const hasThinking = afterHistory.some(e => e.type === 'thinking');
  if (!hasThinking) { pass('No stuck thinking state after connect'); passed++; }
  else { fail('Got stuck thinking state after connect — regression!'); failed++; }

  ws.close();
  return { passed, failed };
}

// ── Test 2: Send prompt → thinking → deltas → idle ───────────────────────────
async function test2_promptCycle(conn) {
  log('Test 2: Send prompt → thinking → deltas → idle');
  const ws = connect(conn, SESSION_ID);
  let passed = 0, failed = 0;

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  // Wait for history to finish first
  await collectUntil(ws, (e) => e.type === 'history_end', 15000);

  // Send a simple prompt
  ws.send(JSON.stringify({ type: 'prompt', content: 'Say exactly: SMOKE_TEST_OK' }));

  // Collect until idle or error
  const events = await collectUntil(ws, (e) => e.type === 'idle' || e.type === 'error', TIMEOUT_MS);
  const types = events.map(e => e.type);

  // Should have thinking
  if (types.includes('thinking')) { pass('thinking event received'); passed++; }
  else { fail('No thinking event'); failed++; }

  // Should have deltas or a message_end
  const hasContent = types.includes('delta') || types.includes('message_end');
  if (hasContent) { pass('Content received (delta/message_end)'); passed++; }
  else { fail('No content events'); failed++; }

  // Should end with idle (not error)
  const lastEvent = events[events.length - 1];
  if (lastEvent.type === 'idle') { pass('Turn completed with idle'); passed++; }
  else { fail(`Turn ended with ${lastEvent.type}: ${lastEvent.content ?? ''}`); failed++; }

  // Verify no error events
  const hasError = events.some(e => e.type === 'error');
  if (!hasError) { pass('No error events during turn'); passed++; }
  else { fail(`Error during turn: ${events.find(e => e.type === 'error')?.content}`); failed++; }

  ws.close();
  return { passed, failed };
}

// ── Test 3: Verify event types are valid ──────────────────────────────────────
async function test3_validEventTypes(conn) {
  log('Test 3: All received events have known types');
  const ws = connect(conn, SESSION_ID);
  let passed = 0, failed = 0;

  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  const events = await collectUntil(ws, (e) => e.type === 'history_end', 15000);

  const knownTypes = new Set([
    'session_switched', 'session_context_updated', 'session_not_found',
    'session_created', 'session_deleted', 'session_renamed', 'session_shield_changed',
    'history_start', 'history_end', 'history_user', 'history_meta',
    'thinking', 'delta', 'reasoning_delta', 'message_end', 'idle', 'error',
    'warning', 'info', 'intent', 'model_changed',
    'tool_start', 'tool_complete', 'tool_update', 'tool_call', 'tool_output',
    'approval_request', 'approval_resolved', 'input_request',
    'cli_approval_pending', 'cli_approval_resolved', 'turn_stopping',
    'sync', 'rules_list', 'pong', 'approve_all_changed', 'warning', 'info',
  ]);

  const unknown = events.filter(e => !knownTypes.has(e.type)).map(e => e.type);
  const uniqueUnknown = [...new Set(unknown)];
  if (uniqueUnknown.length === 0) { pass('All event types are known'); passed++; }
  else { fail(`Unknown event types: ${uniqueUnknown.join(', ')}`); failed++; }

  // Check history events have expected structure
  const historyUsers = events.filter(e => e.type === 'history_user');
  const historyDeltas = events.filter(e => e.type === 'delta');
  if (historyUsers.length > 0 && historyDeltas.length > 0) {
    pass(`History has ${historyUsers.length} user + ${historyDeltas.length} assistant messages`);
    passed++;
  } else {
    fail(`Sparse history: ${historyUsers.length} user, ${historyDeltas.length} assistant`);
    failed++;
  }

  ws.close();
  return { passed, failed };
}

// ── Run all tests ─────────────────────────────────────────────────────────────
async function main() {
  const conn = await getConnection();
  log(`Server: ${conn.url}`);
  log(`Session: ${SESSION_ID || '(default)'}\n`);

  let totalPassed = 0, totalFailed = 0;

  try {
    const r1 = await test1_noStuckThinking(conn);
    totalPassed += r1.passed; totalFailed += r1.failed;
  } catch (e) { fail(`Test 1 crashed: ${e.message}`); totalFailed++; }

  console.log('');

  try {
    const r3 = await test3_validEventTypes(conn);
    totalPassed += r3.passed; totalFailed += r3.failed;
  } catch (e) { fail(`Test 3 crashed: ${e.message}`); totalFailed++; }

  console.log('');

  // Test 2 is destructive (sends a prompt) — run last
  try {
    const r2 = await test2_promptCycle(conn);
    totalPassed += r2.passed; totalFailed += r2.failed;
  } catch (e) { fail(`Test 2 crashed: ${e.message}`); totalFailed++; }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`${'═'.repeat(50)}`);

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
