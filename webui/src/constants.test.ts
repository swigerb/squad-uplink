import { describe, it, expect } from 'vitest';
import {
	COPY_FEEDBACK_MS,
	TOOL_COLLAPSE_DELAY_MS,
	STOP_CLEAR_DEBOUNCE_MS,
	NOTIFICATION_DISMISS_MS,
	NOTIFICATION_DISMISS_SHORT_MS,
	RECENTLY_ADDED_HIGHLIGHT_MS,
	WS_RECONNECT_DELAY_MS,
	HEARTBEAT_INTERVAL_MS,
	HEARTBEAT_TIMEOUT_MS,
	UPDATE_POLL_DELAY_MS,
	UPDATE_POLL_INTERVAL_MS,
	RETRY_INTERVAL_MS,
	FAST_FAIL_THRESHOLD_MS,
	VISIBILITY_CHECK_GUARD_MS,
	TICK_INTERVAL_MS,
} from './constants';

describe('constants', () => {
	it('exports timing constants as positive numbers', () => {
		const timings = [
			COPY_FEEDBACK_MS,
			TOOL_COLLAPSE_DELAY_MS,
			STOP_CLEAR_DEBOUNCE_MS,
			NOTIFICATION_DISMISS_MS,
			NOTIFICATION_DISMISS_SHORT_MS,
			RECENTLY_ADDED_HIGHLIGHT_MS,
			WS_RECONNECT_DELAY_MS,
			HEARTBEAT_INTERVAL_MS,
			HEARTBEAT_TIMEOUT_MS,
			UPDATE_POLL_DELAY_MS,
			UPDATE_POLL_INTERVAL_MS,
			RETRY_INTERVAL_MS,
			FAST_FAIL_THRESHOLD_MS,
			VISIBILITY_CHECK_GUARD_MS,
			TICK_INTERVAL_MS,
		];

		for (const t of timings) {
			expect(t).toBeGreaterThan(0);
			expect(typeof t).toBe('number');
		}
	});

	it('heartbeat timeout is less than heartbeat interval', () => {
		expect(HEARTBEAT_TIMEOUT_MS).toBeLessThan(HEARTBEAT_INTERVAL_MS);
	});

	it('short notification dismiss is less than standard', () => {
		expect(NOTIFICATION_DISMISS_SHORT_MS).toBeLessThan(NOTIFICATION_DISMISS_MS);
	});

	it('tick interval is 1 second', () => {
		expect(TICK_INTERVAL_MS).toBe(1000);
	});

	it('update poll interval is 5 minutes', () => {
		expect(UPDATE_POLL_INTERVAL_MS).toBe(5 * 60 * 1000);
	});
});
