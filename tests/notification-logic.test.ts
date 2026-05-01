import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

/**
 * Notification accumulation + dismiss tests.
 *
 * The upstream v0.6.1 changes the notification state machine:
 *   - Duplicate warnings increment a `count` field instead of replacing
 *   - Info messages auto-dismiss after NOTIFICATION_DISMISS_MS
 *   - Warnings persist until user sends a message (cleared in sendPrompt)
 *   - Notification render shows "(×N)" when count > 1
 *
 * This test extracts the notification reducer logic from App.tsx
 * (upstream lines 1930-1938) and validates it independently.
 */

// ── Constants (mirrored from webui/src/constants.ts) ────────────────────────

const NOTIFICATION_DISMISS_MS = 8000;
const NOTIFICATION_DISMISS_SHORT_MS = 4000;

// ── Types (planned notification state from upstream port plan §3.1) ─────────

interface Notification {
	type: 'warning' | 'info';
	message: string;
	action?: { label: string; onClick: () => void };
	count?: number;
}

// ── Notification reducer (mirrors upstream App.tsx:1930-1938) ───────────────

/**
 * Computes the next notification state given a previous state and an incoming event.
 * When the same type+message arrives again, increments count instead of replacing.
 */
function notificationReducer(
	prev: Notification | null,
	event: { type: 'warning' | 'info'; content?: string },
): Notification {
	if (prev && prev.type === event.type && prev.message === (event.content ?? '')) {
		return { ...prev, count: (prev.count ?? 1) + 1 };
	}
	return { type: event.type, message: event.content ?? '' };
}

/**
 * Formats the notification message with count suffix.
 * Mirrors upstream App.tsx:3953 render logic.
 */
function formatNotification(n: Notification): string {
	const suffix = n.count && n.count > 1 ? ` (×${n.count})` : '';
	return `${n.message}${suffix}`;
}

/**
 * Determines if a notification should auto-dismiss.
 * Upstream rule: info without action → auto-dismiss; warnings persist.
 */
function shouldAutoDismiss(n: Notification): boolean {
	if (n.type === 'info' && !n.action) return true;
	return false;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Notification accumulation (upstream v0.6.1)', () => {
	describe('notificationReducer', () => {
		it('creates a new notification from null state', () => {
			const result = notificationReducer(null, { type: 'warning', content: 'Rate limited' });
			expect(result).toEqual({ type: 'warning', message: 'Rate limited' });
			expect(result.count).toBeUndefined();
		});

		it('increments count for duplicate warning', () => {
			const first = notificationReducer(null, { type: 'warning', content: 'Rate limited' });
			const second = notificationReducer(first, { type: 'warning', content: 'Rate limited' });
			expect(second.count).toBe(2);
			expect(second.message).toBe('Rate limited');
		});

		it('increments count across multiple duplicates', () => {
			let state: Notification | null = null;
			for (let i = 0; i < 5; i++) {
				state = notificationReducer(state, { type: 'warning', content: 'Slow response' });
			}
			expect(state!.count).toBe(5);
			expect(state!.message).toBe('Slow response');
		});

		it('replaces when message changes', () => {
			const first = notificationReducer(null, { type: 'warning', content: 'Error A' });
			const second = notificationReducer(first, { type: 'warning', content: 'Error B' });
			expect(second.message).toBe('Error B');
			expect(second.count).toBeUndefined();
		});

		it('replaces when type changes (warning → info)', () => {
			const first = notificationReducer(null, { type: 'warning', content: 'Same text' });
			const second = notificationReducer(first, { type: 'info', content: 'Same text' });
			expect(second.type).toBe('info');
			expect(second.count).toBeUndefined();
		});

		it('handles empty content', () => {
			const result = notificationReducer(null, { type: 'info' });
			expect(result.message).toBe('');
		});

		it('accumulates duplicate info messages too', () => {
			const first = notificationReducer(null, { type: 'info', content: 'Connected' });
			const second = notificationReducer(first, { type: 'info', content: 'Connected' });
			expect(second.count).toBe(2);
		});

		it('preserves action from previous notification on accumulation', () => {
			const action = { label: 'Reload', onClick: () => {} };
			const first: Notification = { type: 'info', message: 'Updated', action };
			const second = notificationReducer(first, { type: 'info', content: 'Updated' });
			expect(second.count).toBe(2);
			expect(second.action).toBe(action);
		});
	});

	describe('formatNotification', () => {
		it('shows plain message when count is undefined', () => {
			expect(formatNotification({ type: 'warning', message: 'Error' })).toBe('Error');
		});

		it('shows plain message when count is 1', () => {
			expect(formatNotification({ type: 'warning', message: 'Error', count: 1 })).toBe('Error');
		});

		it('shows (×2) when count is 2', () => {
			expect(formatNotification({ type: 'warning', message: 'Rate limited', count: 2 })).toBe('Rate limited (×2)');
		});

		it('shows (×10) for high counts', () => {
			expect(formatNotification({ type: 'warning', message: 'Slow', count: 10 })).toBe('Slow (×10)');
		});
	});

	describe('shouldAutoDismiss', () => {
		it('returns true for info without action', () => {
			expect(shouldAutoDismiss({ type: 'info', message: 'Connected' })).toBe(true);
		});

		it('returns false for info with action', () => {
			expect(shouldAutoDismiss({
				type: 'info',
				message: 'Updated',
				action: { label: 'Reload', onClick: () => {} },
			})).toBe(false);
		});

		it('returns false for warning without action', () => {
			expect(shouldAutoDismiss({ type: 'warning', message: 'Rate limited' })).toBe(false);
		});

		it('returns false for warning with action', () => {
			expect(shouldAutoDismiss({
				type: 'warning',
				message: 'Limit reached',
				action: { label: 'Dismiss', onClick: () => {} },
			})).toBe(false);
		});
	});

	describe('auto-dismiss timing', () => {
		beforeEach(() => { vi.useFakeTimers(); });
		afterEach(() => { vi.useRealTimers(); });

		it('info auto-dismisses after NOTIFICATION_DISMISS_MS', () => {
			let notification: Notification | null = { type: 'info', message: 'Connected' };

			if (shouldAutoDismiss(notification)) {
				setTimeout(() => { notification = null; }, NOTIFICATION_DISMISS_MS);
			}

			expect(notification).not.toBeNull();
			vi.advanceTimersByTime(NOTIFICATION_DISMISS_MS - 1);
			expect(notification).not.toBeNull();
			vi.advanceTimersByTime(1);
			expect(notification).toBeNull();
		});

		it('warning does NOT auto-dismiss', () => {
			let notification: Notification | null = { type: 'warning', message: 'Rate limited' };

			if (shouldAutoDismiss(notification)) {
				setTimeout(() => { notification = null; }, NOTIFICATION_DISMISS_MS);
			}

			vi.advanceTimersByTime(NOTIFICATION_DISMISS_MS * 2);
			expect(notification).not.toBeNull();
		});

		it('warning clears on send (simulated)', () => {
			let notification: Notification | null = { type: 'warning', message: 'Rate limited', count: 3 };

			// Simulates sendPrompt() clearing notifications
			function sendPrompt() {
				notification = null;
			}

			expect(notification).not.toBeNull();
			sendPrompt();
			expect(notification).toBeNull();
		});
	});
});

describe('Notification state machine integration', () => {
	it('accumulates then resets on different message', () => {
		let state: Notification | null = null;

		// 3 duplicate warnings
		state = notificationReducer(state, { type: 'warning', content: 'Slow' });
		state = notificationReducer(state, { type: 'warning', content: 'Slow' });
		state = notificationReducer(state, { type: 'warning', content: 'Slow' });
		expect(state.count).toBe(3);

		// Different warning resets
		state = notificationReducer(state, { type: 'warning', content: 'Timeout' });
		expect(state.count).toBeUndefined();
		expect(state.message).toBe('Timeout');
	});

	it('handles rapid alternation between types', () => {
		let state: Notification | null = null;
		state = notificationReducer(state, { type: 'warning', content: 'A' });
		state = notificationReducer(state, { type: 'info', content: 'B' });
		state = notificationReducer(state, { type: 'warning', content: 'A' });
		expect(state.type).toBe('warning');
		expect(state.message).toBe('A');
		expect(state.count).toBeUndefined(); // not accumulated because it was replaced in between
	});
});
