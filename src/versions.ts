/**
 * Version inventory — a one-shot snapshot of what this Portal process is actually
 * running: the Portal build, the bundled Copilot CLI + SDK, the Node runtime, and
 * the agent-capability tools (pwsh, uv, python) that the CLI/MCP servers depend on.
 *
 * Two consumers:
 *  - the startup console log (see PortalServer.start) — runtime-ACTUAL versions, so
 *    the zip channel correctly shows whatever it self-updated to, and the container
 *    shows exactly its pins.
 *  - (future) a Settings modal — `collectVersionInventory()` returns a structured
 *    object so the UI can render the same data with no rework.
 *
 * npm package versions are read from disk (free, reliable). The external binaries
 * (pwsh/uv/python) are probed best-effort ONCE at startup with a short timeout —
 * never per-session — and report `null` when absent (normal on the zip channel,
 * where these are host-provided rather than baked in).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

export interface VersionInventory {
	portal: string;
	cli: string;
	sdk: string;
	node: string;
	pwsh: string | null;
	uv: string | null;
	python: string | null;
}

/** Read a version from an installed npm package's package.json. */
function pkgVersion(name: string): string {
	try {
		const p = path.join(PROJECT_ROOT, 'node_modules', ...name.split('/'), 'package.json');
		return JSON.parse(fs.readFileSync(p, 'utf8')).version ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

/** Read the Portal version from the root package.json. */
function rootVersion(): string {
	try {
		return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8')).version ?? 'unknown';
	} catch {
		return 'unknown';
	}
}

/**
 * Best-effort version probe for an external binary. Runs once at startup with a
 * short timeout; returns null if the binary is missing, errors, or doesn't match.
 * Never throws.
 */
function binVersion(cmd: string, args: string[], re: RegExp): string | null {
	try {
		const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 3000, windowsHide: true });
		if (r.error || typeof r.status !== 'number') return null;
		const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
		if (!out) return null;
		const m = out.match(re);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

/** Collect the full runtime version inventory. Cheap; safe to call once at boot. */
export function collectVersionInventory(): VersionInventory {
	return {
		portal: rootVersion(),
		cli: pkgVersion('@github/copilot'),
		sdk: pkgVersion('@github/copilot-sdk'),
		node: process.versions.node,
		pwsh: binVersion('pwsh', ['--version'], /PowerShell\s+([\d.]+)/i),
		uv: binVersion('uv', ['--version'], /\b([\d]+\.[\d.]+)\b/),
		python: binVersion(process.platform === 'win32' ? 'python' : 'python3', ['--version'], /Python\s+([\d.]+)/i),
	};
}

/** Format the inventory as a single console line. Missing tools show `not found`. */
export function formatVersionInventory(inv: VersionInventory): string {
	const f = (v: string | null) => v ?? 'not found';
	return `[Versions] Portal ${inv.portal} · CLI ${inv.cli} · SDK ${inv.sdk} · Node ${inv.node}`
		+ ` · pwsh ${f(inv.pwsh)} · uv ${f(inv.uv)} · python ${f(inv.python)}`;
}
