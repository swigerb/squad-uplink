import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SquadReader } from '../src/squad.js';

function makeTempDir(): string {
	const dir = path.join(os.tmpdir(), `squad-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function rmDir(dir: string) {
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * We test isAllowedPath() indirectly through SquadReader.readFile().
 * A 403 response means the path was disallowed; 404 means allowed but missing.
 */
describe('SquadReader allowlist (isAllowedPath)', () => {
	let projectRoot: string;
	let squadDir: string;
	let reader: SquadReader;

	beforeEach(() => {
		projectRoot = makeTempDir();
		squadDir = path.join(projectRoot, '.squad');
		fs.mkdirSync(squadDir, { recursive: true });
		reader = new SquadReader(projectRoot);
	});

	afterEach(() => {
		reader.stopWatching();
		rmDir(projectRoot);
	});

	describe('allowed paths', () => {
		it('allows team.md', () => {
			fs.writeFileSync(path.join(squadDir, 'team.md'), '# Team');
			const result = reader.readFile('team.md');
			expect('content' in result).toBe(true);
		});

		it('allows decisions.md', () => {
			fs.writeFileSync(path.join(squadDir, 'decisions.md'), '# Decisions');
			const result = reader.readFile('decisions.md');
			expect('content' in result).toBe(true);
		});

		it('allows routing.md', () => {
			fs.writeFileSync(path.join(squadDir, 'routing.md'), '# Routing');
			const result = reader.readFile('routing.md');
			expect('content' in result).toBe(true);
		});

		it('allows ceremonies.md', () => {
			fs.writeFileSync(path.join(squadDir, 'ceremonies.md'), '# Ceremonies');
			const result = reader.readFile('ceremonies.md');
			expect('content' in result).toBe(true);
		});

		it('allows orchestration-log/*.md', () => {
			const logDir = path.join(squadDir, 'orchestration-log');
			fs.mkdirSync(logDir, { recursive: true });
			fs.writeFileSync(path.join(logDir, 'entry.md'), '# Log entry');
			const result = reader.readFile('orchestration-log/entry.md');
			expect('content' in result).toBe(true);
		});

		it('allows agents/<name>/charter.md', () => {
			const agentDir = path.join(squadDir, 'agents', 'hertzfeld');
			fs.mkdirSync(agentDir, { recursive: true });
			fs.writeFileSync(path.join(agentDir, 'charter.md'), '# Charter');
			const result = reader.readFile('agents/hertzfeld/charter.md');
			expect('content' in result).toBe(true);
		});

		it('returns 404 for allowed path that does not exist on disk', () => {
			const result = reader.readFile('team.md');
			expect(result).toEqual({ error: 'File not found', status: 404 });
		});
	});

	describe('disallowed paths', () => {
		it('blocks directory traversal (../../../etc/passwd)', () => {
			const result = reader.readFile('../../../etc/passwd');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks traversal with backslashes', () => {
			const result = reader.readFile('..\\..\\..\\etc\\passwd');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks paths not in allowlist', () => {
			const result = reader.readFile('secrets.json');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks absolute paths', () => {
			const result = reader.readFile('C:\\Windows\\System32\\cmd.exe');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks paths with embedded traversal', () => {
			const result = reader.readFile('team.md/../../../etc/passwd');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks files not matching pattern suffix', () => {
			// orchestration-log requires .md suffix
			const result = reader.readFile('orchestration-log/entry.txt');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});
	});

	describe('null byte injection (Sprint 1 fix)', () => {
		it('blocks paths containing null bytes', () => {
			const result = reader.readFile('team.md\0.txt');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks null byte at start of path', () => {
			const result = reader.readFile('\0team.md');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks null byte in middle of path', () => {
			const result = reader.readFile('orchestration-log/\0entry.md');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});
	});

	describe('edge cases', () => {
		it('blocks empty string', () => {
			const result = reader.readFile('');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('blocks bare dot', () => {
			const result = reader.readFile('.');
			expect(result).toEqual({ error: 'Path not allowed', status: 403 });
		});

		it('handles forward slashes in paths (normalized to OS separator)', () => {
			const agentDir = path.join(squadDir, 'agents', 'hertzfeld');
			fs.mkdirSync(agentDir, { recursive: true });
			fs.writeFileSync(path.join(agentDir, 'charter.md'), '# Charter');
			const result = reader.readFile('agents/hertzfeld/charter.md');
			expect('content' in result).toBe(true);
		});
	});

	describe('listFiles', () => {
		it('lists only allowed files', () => {
			fs.writeFileSync(path.join(squadDir, 'team.md'), '# Team');
			fs.writeFileSync(path.join(squadDir, 'secrets.json'), '{}');
			const files = reader.listFiles();
			expect(files.map(f => f.name)).toContain('team.md');
			expect(files.map(f => f.name)).not.toContain('secrets.json');
		});

		it('returns empty array when .squad/ does not exist', () => {
			const emptyReader = new SquadReader(path.join(projectRoot, 'nonexistent'));
			expect(emptyReader.listFiles()).toEqual([]);
		});
	});
});
