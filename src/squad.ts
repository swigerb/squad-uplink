import { EventEmitter } from 'node:events';
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
	if (relative.includes('\0')) return false;
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

export class SquadReader extends EventEmitter {
	private squadDir: string;
	private watcher: fs.FSWatcher | null = null;
	private debounceTimer: NodeJS.Timeout | null = null;

	// Cache for generateGuide() — TTL 30s
	private guideCache: { value: string; expiry: number } | null = null;
	// Cache for generatePrompts() — TTL 30s
	private promptsCache: { value: Array<{ label: string; text: string }>; expiry: number } | null = null;
	private static readonly CACHE_TTL = 30_000;

	constructor(projectRoot: string) {
		super();
		this.squadDir = path.join(projectRoot, '.squad');
	}

	/** Start watching .squad/ directory for changes */
	startWatching(): void {
		if (this.watcher || !this.exists()) return;
		try {
			this.watcher = fs.watch(this.squadDir, { recursive: true }, (eventType, filename) => {
				if (!filename) return;
				const relativePath = path.normalize(filename);
				if (!isAllowedPath(relativePath)) return;

				// Debounce rapid writes (agents write frequently)
				if (this.debounceTimer) clearTimeout(this.debounceTimer);
				this.debounceTimer = setTimeout(() => {
					this.debounceTimer = null;
					this.emit('change', {
						path: relativePath.split(path.sep).join('/'),
						type: eventType as 'change' | 'rename',
					});
				}, 500);
			});
			this.watcher.on('error', () => this.stopWatching());
		} catch {
			// .squad/ may not exist yet — that's fine
		}
	}

	/** Stop watching .squad/ directory */
	stopWatching(): void {
		if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
		if (this.watcher) { this.watcher.close(); this.watcher = null; }
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

	/**
	 * Generate a compact markdown guide (~2KB max) from team.md and decisions.md
	 * for injecting into Copilot sessions. Cached for 30 seconds.
	 */
	generateGuide(): string {
		if (this.guideCache && Date.now() < this.guideCache.expiry) {
			return this.guideCache.value;
		}

		if (!this.exists()) {
			this.guideCache = { value: '', expiry: Date.now() + SquadReader.CACHE_TTL };
			return '';
		}

		const sections: string[] = [];
		sections.push('## Squad Context\n');

		// Extract team info from team.md
		const teamResult = this.readFile('team.md');
		if ('content' in teamResult) {
			const content = teamResult.content;

			// Extract roster table (markdown table block)
			const tableMatch = content.match(/(\|.+\|[\s\S]*?\|.+\|(?:\n|$)(?:\|.+\|(?:\n|$))*)/);
			if (tableMatch) {
				sections.push('### Team\n');
				sections.push(tableMatch[0].trim());
				sections.push('');
			}

			// Extract project context — first paragraph or section before the table
			const projectMatch = content.match(/^#[^\n]*\n+([\s\S]*?)(?=\n\||\n##|\n---)/);
			if (projectMatch && projectMatch[1].trim()) {
				sections.push('### Project\n');
				sections.push(projectMatch[1].trim());
				sections.push('');
			}
		}

		// Extract last 5 decisions from decisions.md
		const decisionsResult = this.readFile('decisions.md');
		if ('content' in decisionsResult) {
			const content = decisionsResult.content;
			// Split on ## headers (each decision is a ## section)
			const entries = content.split(/^(?=## )/m).filter(s => s.trim().startsWith('## '));
			const recent = entries.slice(-5);
			if (recent.length > 0) {
				sections.push('### Recent Decisions\n');
				sections.push(recent.join('\n').trim());
				sections.push('');
			}
		}

		let guide = sections.join('\n').trim();

		// Enforce ~2KB max by truncating if needed
		if (guide.length > 2048) {
			guide = guide.slice(0, 2045) + '...';
		}

		this.guideCache = { value: guide, expiry: Date.now() + SquadReader.CACHE_TTL };
		return guide;
	}

	/**
	 * Generate one-click prompt shortcuts from .squad/ state.
	 * Cached for 30 seconds.
	 */
	generatePrompts(): Array<{ label: string; text: string }> {
		if (this.promptsCache && Date.now() < this.promptsCache.expiry) {
			return this.promptsCache.value;
		}

		const prompts: Array<{ label: string; text: string }> = [];

		if (!this.exists()) {
			this.promptsCache = { value: prompts, expiry: Date.now() + SquadReader.CACHE_TTL };
			return prompts;
		}

		// Static prompts
		prompts.push({
			label: "Who's on the team?",
			text: 'Read the team roster from .squad/team.md and summarize the team members, their roles, and what they own.',
		});
		prompts.push({
			label: 'Recent decisions',
			text: 'Read .squad/decisions.md and summarize the most recent team decisions.',
		});
		prompts.push({
			label: 'Team status',
			text: 'Summarize the current state of the Squad — who\'s on the team, recent decisions, and any active work.',
		});

		// Dynamic per-agent prompts from agents/*/charter.md
		try {
			const agentsDir = path.join(this.squadDir, 'agents');
			if (fs.existsSync(agentsDir)) {
				const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
					.filter(d => d.isDirectory())
					.sort((a, b) => a.name.localeCompare(b.name));
				for (const dir of agentDirs) {
					const charterPath = path.join(agentsDir, dir.name, 'charter.md');
					if (fs.existsSync(charterPath)) {
						// Capitalize agent name for display
						const displayName = dir.name.charAt(0).toUpperCase() + dir.name.slice(1);
						prompts.push({
							label: `What is ${displayName} responsible for?`,
							text: `Read ${displayName}'s charter from .squad/agents/${dir.name}/charter.md and summarize their role, expertise, and what they own.`,
						});
					}
				}
			}
		} catch {
			// agents dir may not exist — that's fine
		}

		this.promptsCache = { value: prompts, expiry: Date.now() + SquadReader.CACHE_TTL };
		return prompts;
	}
}
