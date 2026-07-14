// Offline harness: validate SessionHandle.buildHistoryEvents against a real
// events.jsonl — confirms tool-produced images resolve to history_image events at
// the right positions, with NO live SDK connection. Usage:
//   node tools/img-history-harness.mjs <sessionId>
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const sessionId = process.argv[2] || '90aa1943-9b54-4477-828a-3e9c07e456d0';
const eventsPath = path.join(os.homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
if (!fs.existsSync(eventsPath)) { console.error('No events.jsonl at', eventsPath); process.exit(1); }

// Bundle session.ts (exports SessionHandle) to a temp ESM module we can import.
const outFile = path.join(path.resolve('node_modules', '.cache'), `harness-session-${Date.now()}.mjs`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const entry = path.join(os.tmpdir(), `harness-entry-${Date.now()}.ts`);
fs.writeFileSync(entry, `export { SessionHandle } from ${JSON.stringify(path.resolve('src/session.ts'))};\n`);
await esbuild.build({
  entryPoints: [entry], outfile: outFile, bundle: true, platform: 'node',
  format: 'esm', logLevel: 'error', packages: 'external',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { SessionHandle } = await import(pathToFileURL(outFile).href);

// Read events.jsonl (one JSON object per line).
const events = [];
for (const line of fs.readFileSync(eventsPath, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  try { events.push(JSON.parse(line)); } catch { /* skip partial */ }
}
const binAssets = events.filter(e => e.type === 'session.binary_asset');
const toolCompletes = events.filter(e => e.type === 'tool.execution_complete'
  && Array.isArray(e.data?.result?.binaryResultsForLlm));
console.log(`Loaded ${events.length} events — ${binAssets.length} binary_asset, ${toolCompletes.length} tool_complete w/ binaryResultsForLlm`);

const out = SessionHandle.buildHistoryEvents(events, undefined, false);
const imgEvents = out.filter(e => e.type === 'history_image');
console.log(`buildHistoryEvents -> ${out.length} PortalEvents, ${imgEvents.length} history_image`);

// Assertions
let ok = true;
const assert = (cond, msg) => { if (!cond) { ok = false; console.error('  FAIL:', msg); } else console.log('  ok:', msg); };

// Every binary_asset image should be resolvable; expect history_image count to match
// the number of image assets referenced by tool completes.
const imageAssetIds = new Set(binAssets.filter(a => /^image\//.test(a.data?.mimeType || '')).map(a => a.data.assetId));
const referenced = new Set();
for (const tc of toolCompletes) for (const b of tc.data.result.binaryResultsForLlm) if (b.assetId && imageAssetIds.has(b.assetId)) referenced.add(b.assetId);
console.log(`Image assets: ${imageAssetIds.size}; referenced by a tool_complete: ${referenced.size}`);

assert(imgEvents.length === referenced.size, `history_image count (${imgEvents.length}) == referenced image assets (${referenced.size})`);
assert(imgEvents.every(e => Array.isArray(e.images) && e.images.length === 1 && e.images[0].startsWith('data:image/')), 'each history_image carries one data:image/ URI');

// Positional sanity: a history_image must appear AFTER at least one delta/idle (i.e.
// not before any assistant content) — images come from tools mid/after a turn.
const firstImgIdx = out.findIndex(e => e.type === 'history_image');
if (firstImgIdx >= 0) {
  const before = out.slice(0, firstImgIdx);
  assert(before.some(e => e.type === 'delta' || e.type === 'idle' || e.type === 'history_user'),
    'history_image is positioned after some conversation content');
}

// --- LIVE path: feed binary_asset then resolveToolImages (private methods; TS private
// is compile-time only, so call via prototype with a minimal `this`). Validates the
// generic live resolution for BOTH the MCP (contents[] fallback) and built-in
// (binaryResultsForLlm assetId) shapes using the real captured event pairs.
console.log('\n--- LIVE path (onBinaryAsset -> resolveToolImages) ---');
const proto = SessionHandle.prototype;
for (const tc of toolCompletes) {
  const ctx = { assetCache: new Map() };
  // Replay the binary_asset that precedes this tool_complete (match by referenced assetId).
  const refIds = new Set((tc.data.result.binaryResultsForLlm || []).map(b => b.assetId).filter(Boolean));
  for (const a of binAssets) if (refIds.has(a.data.assetId)) proto.onBinaryAsset.call(ctx, a.data);
  const imgs = proto.resolveToolImages.call(ctx, tc.data.result);
  const mime = binAssets.find(a => refIds.has(a.data.assetId))?.data?.mimeType;
  assert(imgs.length === 1 && imgs[0].startsWith('data:image/'),
    `live resolve ${tc.data.toolCallId?.slice(0,12)} (${mime}) -> 1 image`);
}
// Also: contents[]-only fallback (simulated MCP live with no cached asset).
{
  const ctx = { assetCache: new Map() };
  const imgs = proto.resolveToolImages.call(ctx, { contents: [{ type: 'image', data: 'QUJD', mimeType: 'image/webp' }] });
  assert(imgs.length === 1 && imgs[0] === 'data:image/webp;base64,QUJD', 'contents[] inline fallback resolves');
}
// Dedup: assetId-resolved present => contents[] NOT double-counted.
{
  const ctx = { assetCache: new Map([['sha256:x', { src: 'data:image/png;base64,AAA', mimeType: 'image/png', byteLength: 3 }]]) };
  const imgs = proto.resolveToolImages.call(ctx, {
    binaryResultsForLlm: [{ assetId: 'sha256:x' }],
    contents: [{ type: 'image', data: 'QUJD', mimeType: 'image/webp' }],
  });
  assert(imgs.length === 1 && imgs[0] === 'data:image/png;base64,AAA', 'no double-render when assetId resolves AND contents[] present');
}

fs.rmSync(entry, { force: true }); fs.rmSync(outFile, { force: true });
console.log(ok ? '\nALL ASSERTIONS PASSED' : '\nSOME ASSERTIONS FAILED');
process.exit(ok ? 0 : 1);