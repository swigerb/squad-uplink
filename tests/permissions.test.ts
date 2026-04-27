import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RulesStore } from '../src/rules.js';
import type { PermissionRequest, PermissionRequestResult } from '@github/copilot-sdk';

function makeTempDir(): string {
	const dir = path.join(os.tmpdir(), `perm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function rmDir(dir: string) {
	try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * Permission flow tests.
 *
 * SessionHandle has heavy SDK dependencies (CopilotSession, CopilotClient).
 * We test the permission decision logic by exercising the components that SessionHandle
 * delegates to: RulesStore.matchesRequest() for auto-approve, and the timeout/cleanup
 * patterns using simplified simulations of the pending-approval state machine.
 */

/** Simulates the core permission resolution logic from SessionHandle.handlePermissionRequest */
class PermissionSimulator {
	private rulesStore: RulesStore;
	private sessionId: string;
	private approveAll = false;
	private pendingApprovals = new Map<string, {
		resolve: (r: { kind: string }) => void;
		timeout: ReturnType<typeof setTimeout>;
	}>();
	private counter = 0;

	constructor(rulesStore: RulesStore, sessionId: string) {
		this.rulesStore = rulesStore;
		this.sessionId = sessionId;
	}

	setApproveAll(enabled: boolean) {
		this.approveAll = enabled;
		this.rulesStore.setApproveAll(this.sessionId, enabled);
		if (enabled) {
			// Auto-resolve any queued approvals (mirrors session.ts line 848-854)
			for (const [id, p] of this.pendingApprovals) {
				clearTimeout(p.timeout);
				this.pendingApprovals.delete(id);
				p.resolve({ kind: 'approve-once' });
			}
		}
	}

	handlePermissionRequest(req: PermissionRequest, timeoutMs = 5 * 60 * 1000): Promise<{ kind: string }> {
		const requestId = `approval-${++this.counter}`;

		// approveAll mode — instant approval
		if (this.approveAll || this.rulesStore.getApproveAll(this.sessionId)) {
			return Promise.resolve({ kind: 'approve-once' });
		}

		// Auto-approve if a matching rule exists
		const matchingRule = this.rulesStore.matchesRequest(this.sessionId, req);
		if (matchingRule) {
			return Promise.resolve({ kind: 'approve-once' });
		}

		// Queue for manual approval with timeout → deny
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				if (this.pendingApprovals.has(requestId)) {
					this.pendingApprovals.delete(requestId);
					resolve({ kind: 'reject' });
				}
			}, timeoutMs);
			this.pendingApprovals.set(requestId, { resolve, timeout });
		});
	}

	resolveApproval(approved: boolean): boolean {
		for (const [id, p] of this.pendingApprovals) {
			clearTimeout(p.timeout);
			this.pendingApprovals.delete(id);
			p.resolve(approved ? { kind: 'approve-once' } : { kind: 'reject' });
			return true;
		}
		return false;
	}

	get pendingCount(): number {
		return this.pendingApprovals.size;
	}

	cleanup() {
		for (const [, p] of this.pendingApprovals) {
			clearTimeout(p.timeout);
		}
		this.pendingApprovals.clear();
	}
}

describe('Permission flow', () => {
	let dataDir: string;
	let rulesStore: RulesStore;
	let sim: PermissionSimulator;
	const sessionId = 'test-session';

	beforeEach(() => {
		dataDir = makeTempDir();
		rulesStore = new RulesStore(dataDir);
		sim = new PermissionSimulator(rulesStore, sessionId);
	});

	afterEach(() => {
		sim.cleanup();
		rmDir(dataDir);
	});

	describe('auto-approve when rule matches', () => {
		it('auto-approves shell command matching a rule', async () => {
			rulesStore.addRule(sessionId, 'shell', 'npm *');
			const result = await sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'npm test' } as PermissionRequest & { fullCommandText: string }
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves read request matching a rule', async () => {
			rulesStore.addRule(sessionId, 'read', `src${path.sep}*`);
			const result = await sim.handlePermissionRequest(
				{ kind: 'read', path: path.join('src', 'index.ts') } as PermissionRequest & { path: string }
			);
			expect(result.kind).toBe('approve-once');
		});

		it('does not auto-approve when no rule matches', () => {
			const promise = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'rm -rf /' } as PermissionRequest & { fullCommandText: string },
				100 // short timeout for test
			);
			// Should be pending, not immediately resolved
			expect(sim.pendingCount).toBe(1);
			sim.cleanup(); // prevent timeout from firing
		});

		it('auto-approves when approveAll is enabled', async () => {
			sim.setApproveAll(true);
			const result = await sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'rm -rf /' } as PermissionRequest & { fullCommandText: string }
			);
			expect(result.kind).toBe('approve-once');
		});

		it('auto-approves MCP request matching a rule', async () => {
			rulesStore.addRule(sessionId, 'mcp', 'github/*');
			const result = await sim.handlePermissionRequest(
				{ kind: 'mcp', serverName: 'github', toolName: 'search' } as PermissionRequest & { serverName: string; toolName: string }
			);
			expect(result.kind).toBe('approve-once');
		});
	});

	describe('permission timeout behavior', () => {
		it('denies after timeout', async () => {
			const result = await sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'danger' } as PermissionRequest & { fullCommandText: string },
				50 // 50ms timeout
			);
			expect(result.kind).toBe('reject');
		});

		it('pending count increases with queued requests', () => {
			sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'cmd1' } as PermissionRequest & { fullCommandText: string },
				5000
			);
			sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'cmd2' } as PermissionRequest & { fullCommandText: string },
				5000
			);
			expect(sim.pendingCount).toBe(2);
		});
	});

	describe('permission state cleanup', () => {
		it('clears pending approvals on cleanup', () => {
			sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'cmd' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			expect(sim.pendingCount).toBe(1);
			sim.cleanup();
			expect(sim.pendingCount).toBe(0);
		});

		it('resolves pending approval manually', async () => {
			const promise = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'safe cmd' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			expect(sim.pendingCount).toBe(1);
			sim.resolveApproval(true);
			const result = await promise;
			expect(result.kind).toBe('approve-once');
			expect(sim.pendingCount).toBe(0);
		});

		it('denies pending approval manually', async () => {
			const promise = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'dangerous' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			sim.resolveApproval(false);
			const result = await promise;
			expect(result.kind).toBe('reject');
		});

		it('approveAll resolves all pending approvals', async () => {
			const p1 = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'cmd1' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			const p2 = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'cmd2' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			expect(sim.pendingCount).toBe(2);
			sim.setApproveAll(true);
			const [r1, r2] = await Promise.all([p1, p2]);
			expect(r1.kind).toBe('approve-once');
			expect(r2.kind).toBe('approve-once');
			expect(sim.pendingCount).toBe(0);
		});

		it('adding a matching rule auto-resolves queued approvals', async () => {
			const promise = sim.handlePermissionRequest(
				{ kind: 'shell', fullCommandText: 'npm test' } as PermissionRequest & { fullCommandText: string },
				60000
			);
			expect(sim.pendingCount).toBe(1);

			// Simulate addRule + check logic (mirrors session.ts line 810-818)
			rulesStore.addRule(sessionId, 'shell', 'npm *');
			// Manually check and resolve matching pending (as SessionHandle.addRule does)
			for (const [id] of (sim as any).pendingApprovals) {
				const req = { kind: 'shell', fullCommandText: 'npm test' } as PermissionRequest & { fullCommandText: string };
				if (rulesStore.matchesRequest(sessionId, req)) {
					sim.resolveApproval(true);
				}
			}

			const result = await promise;
			expect(result.kind).toBe('approve-once');
		});
	});
});
