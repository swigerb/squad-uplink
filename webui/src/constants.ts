// ── Timing constants (milliseconds) ─────────────────────────────────────────

/** Feedback flash after copy-to-clipboard actions */
export const COPY_FEEDBACK_MS = 1500;

/** Delay before tool-call boxes collapse after all tools complete */
export const TOOL_COLLAPSE_DELAY_MS = 2000;

/** Debounce window: clears the "stopping" flag when late deltas arrive */
export const STOP_CLEAR_DEBOUNCE_MS = 800;

/** Auto-dismiss notification banners (standard) */
export const NOTIFICATION_DISMISS_MS = 8000;

/** Auto-dismiss notification banners (short, e.g. prompts loaded) */
export const NOTIFICATION_DISMISS_SHORT_MS = 4000;

/** Highlight duration for recently-added items */
export const RECENTLY_ADDED_HIGHLIGHT_MS = 3000;

// ── WebSocket / connectivity ────────────────────────────────────────────────

/** Base reconnect delay after WebSocket close */
export const WS_RECONNECT_DELAY_MS = 2000;

/** Application-level heartbeat ping interval */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Max time to wait for a heartbeat pong before closing */
export const HEARTBEAT_TIMEOUT_MS = 5000;

/** Delayed update-status re-poll after connect */
export const UPDATE_POLL_DELAY_MS = 15_000;

/** Interval for polling /api/updates */
export const UPDATE_POLL_INTERVAL_MS = 5 * 60 * 1000;

/** iOS retry interval for stale connections */
export const RETRY_INTERVAL_MS = 2000;

/** Minimum elapsed time to classify a close as "fast fail" */
export const FAST_FAIL_THRESHOLD_MS = 5000;

/** Minimum elapsed time to skip duplicate visibility checks */
export const VISIBILITY_CHECK_GUARD_MS = 1500;

// ── Counter tick ────────────────────────────────────────────────────────────

/** Interval for 1-second counter ticks (elapsed timers, connecting counter) */
export const TICK_INTERVAL_MS = 1000;
