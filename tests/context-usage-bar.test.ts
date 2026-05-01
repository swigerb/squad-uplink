import { describe, it, expect } from 'vitest';

/**
 * Context Usage Bar calculation tests.
 *
 * The ContextUsageBar component (planned: webui/src/components/ContextUsageBar.tsx)
 * displays a stacked progress bar showing token usage. This test validates the
 * calculation logic extracted from upstream App.tsx:843-869.
 *
 * The component receives:
 *   { tokenLimit, currentTokens, systemTokens, conversationTokens, toolDefinitionsTokens }
 * and computes percentages, formatted token counts, and segment widths.
 */

// ── Types (planned interface from porting plan §2.4) ───────────────────────

interface ContextUsageData {
	tokenLimit: number;
	currentTokens: number;
	systemTokens: number;
	conversationTokens: number;
	toolDefinitionsTokens: number;
}

// ── Extracted calculation logic (mirrors upstream ContextUsageBar) ──────────

/**
 * Computes display values for the context usage bar.
 * Mirrors the inline calculations from upstream App.tsx:843-869.
 */
function computeContextUsage(data: ContextUsageData) {
	const { tokenLimit, currentTokens, systemTokens, conversationTokens, toolDefinitionsTokens } = data;
	const systemTotal = systemTokens + toolDefinitionsTokens;
	const free = tokenLimit - currentTokens;
	const pct = Math.round(currentTokens / tokenLimit * 100);
	const sysPct = Math.round(systemTotal / tokenLimit * 100);
	const convPct = Math.round(conversationTokens / tokenLimit * 100);
	const freePct = Math.round(free / tokenLimit * 100);

	return { systemTotal, free, pct, sysPct, convPct, freePct };
}

/**
 * Formats a token count as "Nk" (e.g., 128000 → "128k").
 * Mirrors the upstream render: `(tokens / 1000).toFixed(0)`.
 */
function formatTokens(tokens: number): string {
	return `${(tokens / 1000).toFixed(0)}k`;
}

/**
 * Determines if the context bar should be shown.
 * Upstream: show when `contextUsage && contextUsage.tokenLimit > 0 && !draft`
 */
function shouldShowContextBar(data: ContextUsageData | null, isDraft: boolean): boolean {
	return data !== null && data.tokenLimit > 0 && !isDraft;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Context Usage Bar calculations', () => {
	const typicalUsage: ContextUsageData = {
		tokenLimit: 128000,
		currentTokens: 45000,
		systemTokens: 8000,
		conversationTokens: 32000,
		toolDefinitionsTokens: 5000,
	};

	describe('computeContextUsage', () => {
		it('computes correct percentages for typical usage', () => {
			const result = computeContextUsage(typicalUsage);
			expect(result.pct).toBe(35); // 45000/128000 = 35.15% → 35
			expect(result.sysPct).toBe(10); // (8000+5000)/128000 = 10.15% → 10
			expect(result.convPct).toBe(25); // 32000/128000 = 25% → 25
			expect(result.freePct).toBe(65); // (128000-45000)/128000 = 64.84% → 65
		});

		it('computes systemTotal as sum of system + tool tokens', () => {
			const result = computeContextUsage(typicalUsage);
			expect(result.systemTotal).toBe(13000); // 8000 + 5000
		});

		it('computes free tokens correctly', () => {
			const result = computeContextUsage(typicalUsage);
			expect(result.free).toBe(83000); // 128000 - 45000
		});

		it('handles zero tokens (empty session)', () => {
			const result = computeContextUsage({
				tokenLimit: 128000,
				currentTokens: 0,
				systemTokens: 0,
				conversationTokens: 0,
				toolDefinitionsTokens: 0,
			});
			expect(result.pct).toBe(0);
			expect(result.sysPct).toBe(0);
			expect(result.convPct).toBe(0);
			expect(result.freePct).toBe(100);
			expect(result.free).toBe(128000);
		});

		it('handles 100% usage (completely full)', () => {
			const result = computeContextUsage({
				tokenLimit: 128000,
				currentTokens: 128000,
				systemTokens: 20000,
				conversationTokens: 100000,
				toolDefinitionsTokens: 8000,
			});
			expect(result.pct).toBe(100);
			expect(result.free).toBe(0);
			expect(result.freePct).toBe(0);
		});

		it('handles very small values (rounding to 0%)', () => {
			const result = computeContextUsage({
				tokenLimit: 128000,
				currentTokens: 100,
				systemTokens: 50,
				conversationTokens: 50,
				toolDefinitionsTokens: 0,
			});
			expect(result.pct).toBe(0); // 100/128000 rounds to 0
			expect(result.sysPct).toBe(0);
			expect(result.convPct).toBe(0);
			expect(result.freePct).toBe(100);
		});

		it('handles high system overhead (tools dominate)', () => {
			const result = computeContextUsage({
				tokenLimit: 128000,
				currentTokens: 100000,
				systemTokens: 30000,
				conversationTokens: 10000,
				toolDefinitionsTokens: 60000,
			});
			expect(result.systemTotal).toBe(90000);
			expect(result.sysPct).toBe(70); // 90000/128000 = 70.3% → 70
			expect(result.convPct).toBe(8); // 10000/128000 = 7.8% → 8
		});

		it('handles small token limit (e.g., 4k model)', () => {
			const result = computeContextUsage({
				tokenLimit: 4096,
				currentTokens: 3500,
				systemTokens: 500,
				conversationTokens: 2800,
				toolDefinitionsTokens: 200,
			});
			expect(result.pct).toBe(85); // 3500/4096 = 85.4% → 85
			expect(result.free).toBe(596);
		});

		it('handles very large token limit (1M context)', () => {
			const result = computeContextUsage({
				tokenLimit: 1000000,
				currentTokens: 250000,
				systemTokens: 50000,
				conversationTokens: 180000,
				toolDefinitionsTokens: 20000,
			});
			expect(result.pct).toBe(25);
			expect(result.free).toBe(750000);
		});
	});

	describe('formatTokens', () => {
		it('formats thousands correctly', () => {
			expect(formatTokens(128000)).toBe('128k');
			expect(formatTokens(45000)).toBe('45k');
			expect(formatTokens(1000)).toBe('1k');
		});

		it('formats zero', () => {
			expect(formatTokens(0)).toBe('0k');
		});

		it('rounds sub-thousand to 0k or 1k', () => {
			expect(formatTokens(500)).toBe('1k'); // 0.5 → toFixed(0) → "1"
			expect(formatTokens(499)).toBe('0k'); // 0.499 → "0"
		});

		it('formats million-scale tokens', () => {
			expect(formatTokens(1000000)).toBe('1000k');
		});

		it('rounds mid-thousands', () => {
			expect(formatTokens(13500)).toBe('14k'); // 13.5 → toFixed(0) → "14"
		});
	});

	describe('shouldShowContextBar', () => {
		it('shows when valid data and not draft', () => {
			expect(shouldShowContextBar(typicalUsage, false)).toBe(true);
		});

		it('hides when data is null', () => {
			expect(shouldShowContextBar(null, false)).toBe(false);
		});

		it('hides when in draft mode', () => {
			expect(shouldShowContextBar(typicalUsage, true)).toBe(false);
		});

		it('hides when tokenLimit is 0', () => {
			expect(shouldShowContextBar({
				tokenLimit: 0,
				currentTokens: 0,
				systemTokens: 0,
				conversationTokens: 0,
				toolDefinitionsTokens: 0,
			}, false)).toBe(false);
		});

		it('hides when both null and draft', () => {
			expect(shouldShowContextBar(null, true)).toBe(false);
		});
	});

	describe('percentage segments sum', () => {
		it('segments approximately sum to 100% (rounding may cause ±1)', () => {
			const data: ContextUsageData = {
				tokenLimit: 128000,
				currentTokens: 128000,
				systemTokens: 40000,
				conversationTokens: 80000,
				toolDefinitionsTokens: 8000,
			};
			const result = computeContextUsage(data);
			// sysPct + convPct + freePct should be close to 100
			const sum = result.sysPct + result.convPct + result.freePct;
			expect(sum).toBeGreaterThanOrEqual(99);
			expect(sum).toBeLessThanOrEqual(101);
		});

		it('handles case where rounding causes segments to exceed 100', () => {
			// This tests a known Math.round edge case
			const data: ContextUsageData = {
				tokenLimit: 3,
				currentTokens: 3,
				systemTokens: 1,
				conversationTokens: 1,
				toolDefinitionsTokens: 1,
			};
			const result = computeContextUsage(data);
			expect(result.pct).toBe(100);
			expect(result.sysPct).toBe(67); // 2/3 → 66.7 → 67
			expect(result.convPct).toBe(33); // 1/3 → 33.3 → 33
			// sum = 67 + 33 + 0 = 100 ✓
		});
	});
});
