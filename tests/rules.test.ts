import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RulesStore } from '../src/rules.js';
import type { PermissionRequest } from '@github/copilot-sdk';

function makeTempDir(): string {
	const dir = path.join(os.tmpdir(), `rules-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function rmDir(dir: string) {
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

describe('RulesStore', () => {
	let dataDir: string;
	let store: RulesStore;

	beforeEach(() => {
		dataDir = makeTempDir();
		store = new RulesStore(dataDir);
	});

	afterEach(() => {
		rmDir(dataDir);
	});

	describe('loading rules', () => {
		it('returns empty rules for a new session (no file)', () => {
			const rules = store.getRules('nonexistent-session');
			expect(rules).toEqual([]);
		});

		it('loads rules from a valid JSON file', () => {
			const rulesDir = path.join(dataDir, 'rules');
			fs.mkdirSync(rulesDir, { recursive: true });
			const sessionId = 'test-session';
			const ruleData = {
				rules: [
					{ id: 'r1', sessionId, kind: 'shell', pattern: 'git *', createdAt: 1000 },
				],
				approveAll: false,
			};
			fs.writeFileSync(path.join(rulesDir, `${sessionId}.json`), JSON.stringify(ruleData));

			const rules = store.getRules(sessionId);
			expect(rules).toHaveLength(1);
			expect(rules[0].kind).toBe('shell');
			expect(rules[0].pattern).toBe('git *');
		});

		it('loads old format (plain array) gracefully', () => {
			const rulesDir = path.join(dataDir, 'rules');
			fs.mkdirSync(rulesDir, { recursive: true });
			const sessionId = 'legacy-session';
			const ruleArray = [
				{ id: 'r1', sessionId, kind: 'read', pattern: 'src/*', createdAt: 1000 },
			];
			fs.writeFileSync(path.join(rulesDir, `${sessionId}.json`), JSON.stringify(ruleArray));

			const rules = store.getRules(sessionId);
			expect(rules).toHaveLength(1);
			expect(store.getApproveAll(sessionId)).toBe(false);
		});
	});

	describe('addRule', () => {
		it('adds a rule and returns it', () => {
			const rule = store.addRule('s1', 'shell', 'npm *');
			expect(rule.kind).toBe('shell');
			expect(rule.pattern).toBe('npm *');
			expect(rule.sessionId).toBe('s1');
			expect(rule.id).toBeTruthy();
		});

		it('deduplicates identical rules', () => {
			store.addRule('s1', 'shell', 'npm *');
			store.addRule('s1', 'shell', 'npm *');
			expect(store.getRules('s1')).toHaveLength(1);
		});

		it('allows different patterns for the same kind', () => {
			store.addRule('s1', 'shell', 'npm *');
			store.addRule('s1', 'shell', 'git *');
			expect(store.getRules('s1')).toHaveLength(2);
		});
	});

	describe('matchesRequest', () => {
		it('matches a shell auto-approve rule', () => {
			store.addRule('s1', 'shell', 'npm *');
			const req = { kind: 'shell', fullCommandText: 'npm install vitest' } as PermissionRequest & { fullCommandText: string };
			const match = store.matchesRequest('s1', req);
			expect(match).not.toBeNull();
			expect(match!.pattern).toBe('npm *');
		});

		it('does not match a shell command against a different pattern', () => {
			store.addRule('s1', 'shell', 'npm *');
			const req = { kind: 'shell', fullCommandText: 'git push' } as PermissionRequest & { fullCommandText: string };
			expect(store.matchesRequest('s1', req)).toBeNull();
		});

		it('matches a wildcard shell rule (* *)', () => {
			store.addRule('s1', 'shell', '* *');
			const req = { kind: 'shell', fullCommandText: 'anything goes' } as PermissionRequest & { fullCommandText: string };
			expect(store.matchesRequest('s1', req)).not.toBeNull();
		});

		it('matches a read rule with directory wildcard', () => {
			store.addRule('s1', 'read', `src${path.sep}*`);
			const req = { kind: 'read', path: path.join('src', 'index.ts') } as PermissionRequest & { path: string };
			expect(store.matchesRequest('s1', req)).not.toBeNull();
		});

		it('does not match a read rule for wrong directory', () => {
			store.addRule('s1', 'read', `src${path.sep}*`);
			const req = { kind: 'read', path: path.join('lib', 'index.ts') } as PermissionRequest & { path: string };
			expect(store.matchesRequest('s1', req)).toBeNull();
		});

		it('does not match wrong kind', () => {
			store.addRule('s1', 'shell', 'npm *');
			const req = { kind: 'read', path: 'npm' } as PermissionRequest & { path: string };
			expect(store.matchesRequest('s1', req)).toBeNull();
		});

		it('matches an MCP rule', () => {
			store.addRule('s1', 'mcp', 'github/*');
			const req = { kind: 'mcp', serverName: 'github', toolName: 'search' } as PermissionRequest & { serverName: string; toolName: string };
			expect(store.matchesRequest('s1', req)).not.toBeNull();
		});

		it('matches a URL rule by hostname', () => {
			store.addRule('s1', 'url', 'github.com');
			const req = { kind: 'url', url: 'https://github.com/repo' } as PermissionRequest & { url: string };
			expect(store.matchesRequest('s1', req)).not.toBeNull();
		});
	});

	describe('removeRule', () => {
		it('removes a specific rule by id', () => {
			const rule = store.addRule('s1', 'shell', 'npm *');
			store.addRule('s1', 'shell', 'git *');
			store.removeRule('s1', rule.id);
			const rules = store.getRules('s1');
			expect(rules).toHaveLength(1);
			expect(rules[0].pattern).toBe('git *');
		});
	});

	describe('clearRules', () => {
		it('removes all rules for a session', () => {
			store.addRule('s1', 'shell', 'npm *');
			store.addRule('s1', 'shell', 'git *');
			store.clearRules('s1');
			expect(store.getRules('s1')).toHaveLength(0);
		});
	});

	describe('approveAll', () => {
		it('defaults to false', () => {
			expect(store.getApproveAll('s1')).toBe(false);
		});

		it('can be enabled and persisted', () => {
			store.setApproveAll('s1', true);
			expect(store.getApproveAll('s1')).toBe(true);
		});

		it('persists across new RulesStore instances', () => {
			store.setApproveAll('s1', true);
			const store2 = new RulesStore(dataDir);
			expect(store2.getApproveAll('s1')).toBe(true);
		});
	});

	describe('persistence (save then reload)', () => {
		it('rules survive across RulesStore instances', () => {
			store.addRule('s1', 'shell', 'npm *');
			store.addRule('s1', 'read', `docs${path.sep}*`);

			const store2 = new RulesStore(dataDir);
			const rules = store2.getRules('s1');
			expect(rules).toHaveLength(2);
			expect(rules.map(r => r.pattern)).toContain('npm *');
			expect(rules.map(r => r.pattern)).toContain(`docs${path.sep}*`);
		});
	});

	describe('computePattern', () => {
		it('extracts base command from shell kind', () => {
			const req = { kind: 'shell', fullCommandText: 'npm install vitest' } as PermissionRequest & { fullCommandText: string };
			expect(RulesStore.computePattern(req)).toBe('npm *');
		});

		it('extracts directory pattern for read kind', () => {
			const req = { kind: 'read', path: path.join('src', 'index.ts') } as PermissionRequest & { path: string };
			expect(RulesStore.computePattern(req)).toBe(path.join('src', '*'));
		});

		it('returns hostname for url kind', () => {
			const req = { kind: 'url', url: 'https://api.github.com/repos' } as PermissionRequest & { url: string };
			expect(RulesStore.computePattern(req)).toBe('api.github.com');
		});

		it('returns server/tool for mcp kind', () => {
			const req = { kind: 'mcp', serverName: 'github', toolName: 'search' } as PermissionRequest & { serverName: string; toolName: string };
			expect(RulesStore.computePattern(req)).toBe('github/search');
		});
	});
});
