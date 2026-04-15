import * as fs from 'node:fs';
import * as path from 'node:path';

/** Metadata for a discoverable .squad/ file */
export interface SquadFileInfo {
	name: string;
	path: string;
	size: number;
	lastModified: string;
}

// Exact file allowlist (relative to .squad/)
const ALLOWED_FILES = new Set([
	'team.md',
	'decisions.md',
	'routing.md',
	'ceremonies.md',
]);

// Glob-style directory patterns: dir prefix + required suffix
const ALLOWED_PATTERNS: Array<{ dir: string; suffix: string }> = [
	{ dir: 'orchestration-log', suffix: '.md' },
	{ dir: path.join('agents', ''), suffix: path.sep + 'charter.md' },
];

/**
 * Check whether a relative path (inside .squad/) is on the allowlist.
 * All paths must be normalized, forward-slash–safe, and free of traversal.
 */
function isAllowedPath(relative: string): boolean {
	// Normalize to OS separators and resolve any . segments
	const norm = path.normalize(relative);

	// Block traversal and absolute paths
	if (norm.startsWith('..') || path.isAbsolute(norm)) return false;
	if (norm.includes(`..${path.sep}`)) return false;

	// Exact match
	if (ALLOWED_FILES.has(norm)) return true;

	// Pattern match
	for (const p of ALLOWED_PATTERNS) {
		if (norm.startsWith(p.dir + path.sep) && norm.endsWith(p.suffix)) {
			// Ensure no deeper traversal within the pattern
			const inner = norm.slice(p.dir.length + 1);
			if (!inner.includes(`..${path.sep}`) && !path.isAbsolute(inner)) return true;
		}
	}

	return false;
}

export class SquadReader {
	private squadDir: string;

	constructor(projectRoot: string) {
		this.squadDir = path.join(projectRoot, '.squad');
	}

	/** True if .squad/ directory exists */
	exists(): boolean {
		return fs.existsSync(this.squadDir);
	}

	/** Discover all allowed files and return metadata */
	listFiles(): SquadFileInfo[] {
		if (!this.exists()) return [];
		const results: SquadFileInfo[] = [];
		this.scanDir('', results);
		return results.sort((a, b) => a.path.localeCompare(b.path));
	}

	private scanDir(relative: string, results: SquadFileInfo[]) {
		const abs = path.join(this.squadDir, relative);
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(abs, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const rel = relative ? path.join(relative, entry.name) : entry.name;
			if (entry.isDirectory()) {
				this.scanDir(rel, results);
			} else if (entry.isFile()) {
				if (isAllowedPath(rel)) {
					try {
						const stat = fs.statSync(path.join(this.squadDir, rel));
						results.push({
							name: entry.name,
							path: rel.split(path.sep).join('/'), // always forward-slash in API
							size: stat.size,
							lastModified: stat.mtime.toISOString(),
						});
					} catch {
						// skip unreadable files
					}
				}
			}
		}
	}

	/**
	 * Read a specific allowed file's content.
	 * @returns `{ content }` on success, `{ error, status }` on failure
	 */
	readFile(requestedPath: string): { content: string } | { error: string; status: number } {
		// Normalize: convert forward slashes to OS separator
		const norm = path.normalize(requestedPath.replace(/\//g, path.sep));

		if (!isAllowedPath(norm)) {
			return { error: 'Path not allowed', status: 403 };
		}

		const abs = path.resolve(path.join(this.squadDir, norm));
		const squadResolved = path.resolve(this.squadDir);

		// Double-check resolved path stays inside .squad/
		if (!abs.startsWith(squadResolved + path.sep)) {
			return { error: 'Path not allowed', status: 403 };
		}

		if (!fs.existsSync(abs)) {
			return { error: 'File not found', status: 404 };
		}

		try {
			const content = fs.readFileSync(abs, 'utf8');
			return { content };
		} catch {
			return { error: 'Failed to read file', status: 500 };
		}
	}
}
