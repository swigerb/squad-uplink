/**
 * Heap sizing for the spawned Copilot CLI (`copilot --server`).
 *
 * The CLI is a Node process. Resuming a very large session loads the whole
 * event history into memory and, on big sessions, drove it into Node's ~4GB
 * default V8 old-space ceiling and crashed with "FATAL ERROR: Reached heap
 * limit — JavaScript heap out of memory" (observed 2026-07-11 on a
 * ~13k-message session). That kills the shared CLI and takes every connected
 * client down with it (the mobile "black screen" incident).
 *
 * Raising `--max-old-space-size` via NODE_OPTIONS gives the CLI headroom so a
 * large-but-reasonable session resumes instead of OOM-crashing. NODE_OPTIONS is
 * inherited by child Node processes, so it applies whether `copilot` is the
 * Node process itself or a thin launcher that spawns one.
 *
 * This is applied at EVERY point where the portal spawns `copilot --server`
 * (launcher, restart handler, TUI-exit relauncher) on every platform.
 */

/** V8 old-space ceiling (MB) for the spawned CLI server. */
export const CLI_HEAP_MB = 8192;

/** The Node flag that raises the CLI's heap limit. */
export const CLI_HEAP_FLAG = `--max-old-space-size=${CLI_HEAP_MB}`;

/**
 * Compute the NODE_OPTIONS string for the spawned CLI: the caller's existing
 * NODE_OPTIONS with our heap flag appended. Idempotent — if a
 * `--max-old-space-size` is already present (user-set or a prior call) we leave
 * it untouched rather than stacking a second, conflicting flag.
 */
export function cliNodeOptions(base: NodeJS.ProcessEnv = process.env): string {
	const existing = (base.NODE_OPTIONS ?? '').trim();
	if (existing.includes('--max-old-space-size')) return existing;
	return existing ? `${existing} ${CLI_HEAP_FLAG}` : CLI_HEAP_FLAG;
}

/**
 * process.env clone with NODE_OPTIONS augmented for the CLI heap. Pass as the
 * `env` option to spawn/exec so the child `copilot` inherits the larger heap.
 */
export function cliSpawnEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
	return { ...base, NODE_OPTIONS: cliNodeOptions(base) };
}
