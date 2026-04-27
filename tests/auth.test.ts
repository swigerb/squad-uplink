import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Auth + rate limiting tests.
 *
 * The auth logic (checkToken, isRateLimited, failedAuth map) is private to PortalServer
 * and tightly coupled to the HTTP server. We extract the core rate-limiting algorithm
 * into a testable helper that mirrors the server's exact logic.
 */

/** Mirrors the failedAuth map pattern from server.ts (lines 45-51, 86-104, 448-476) */
class AuthRateLimiter {
	private failedAuth = new Map<string, { count: number; resetTime: number }>();
	private readonly maxAttempts: number;
	private readonly windowMs: number;

	constructor(maxAttempts = 15, windowMs = 60_000) {
		this.maxAttempts = maxAttempts;
		this.windowMs = windowMs;
	}

	/** Returns true if the IP is currently rate-limited */
	isRateLimited(ip: string): boolean {
		const attempt = this.failedAuth.get(ip);
		return !!(attempt && Date.now() < attempt.resetTime && attempt.count >= this.maxAttempts);
	}

	/** Record a failed auth attempt. Returns the current count. */
	recordFailure(ip: string): number {
		const now = Date.now();
		const attempt = this.failedAuth.get(ip);
		const entry = attempt && now < attempt.resetTime
			? { count: attempt.count + 1, resetTime: attempt.resetTime }
			: { count: 1, resetTime: now + this.windowMs };
		this.failedAuth.set(ip, entry);
		return entry.count;
	}

	/** Clear tracking for an IP (on successful auth) */
	clearIp(ip: string): void {
		this.failedAuth.delete(ip);
	}

	/** Cleanup expired entries */
	cleanup(): void {
		const now = Date.now();
		for (const [ip, entry] of this.failedAuth) {
			if (now > entry.resetTime) this.failedAuth.delete(ip);
		}
	}
}

/** Mirrors checkToken from server.ts (lines 448-464) */
function checkToken(provided: string | null, actual: string, bearerHeader?: string): boolean {
	if (provided === actual) return true;
	if (bearerHeader === `Bearer ${actual}`) return true;
	return false;
}

describe('Auth token validation', () => {
	const TOKEN = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';

	it('accepts a valid token via query param', () => {
		expect(checkToken(TOKEN, TOKEN)).toBe(true);
	});

	it('rejects an invalid token', () => {
		expect(checkToken('wrong-token', TOKEN)).toBe(false);
	});

	it('rejects null token', () => {
		expect(checkToken(null, TOKEN)).toBe(false);
	});

	it('accepts a valid Bearer token', () => {
		expect(checkToken(null, TOKEN, `Bearer ${TOKEN}`)).toBe(true);
	});

	it('rejects an invalid Bearer token', () => {
		expect(checkToken(null, TOKEN, 'Bearer wrong')).toBe(false);
	});

	it('rejects empty Bearer header', () => {
		expect(checkToken(null, TOKEN, '')).toBe(false);
	});

	it('query param takes precedence over bearer', () => {
		expect(checkToken(TOKEN, TOKEN, 'Bearer wrong')).toBe(true);
	});
});

describe('Rate limiting', () => {
	let limiter: AuthRateLimiter;

	beforeEach(() => {
		limiter = new AuthRateLimiter(15, 60_000);
	});

	it('is not rate-limited with no failures', () => {
		expect(limiter.isRateLimited('1.2.3.4')).toBe(false);
	});

	it('is not rate-limited after a few failures', () => {
		for (let i = 0; i < 5; i++) limiter.recordFailure('1.2.3.4');
		expect(limiter.isRateLimited('1.2.3.4')).toBe(false);
	});

	it('becomes rate-limited after 15 failures', () => {
		for (let i = 0; i < 15; i++) limiter.recordFailure('1.2.3.4');
		expect(limiter.isRateLimited('1.2.3.4')).toBe(true);
	});

	it('rate limits one IP without affecting others', () => {
		for (let i = 0; i < 15; i++) limiter.recordFailure('1.2.3.4');
		expect(limiter.isRateLimited('1.2.3.4')).toBe(true);
		expect(limiter.isRateLimited('5.6.7.8')).toBe(false);
	});

	it('clears rate limit on successful auth', () => {
		for (let i = 0; i < 15; i++) limiter.recordFailure('1.2.3.4');
		expect(limiter.isRateLimited('1.2.3.4')).toBe(true);
		limiter.clearIp('1.2.3.4');
		expect(limiter.isRateLimited('1.2.3.4')).toBe(false);
	});

	it('resets after the time window expires', () => {
		// Use a very short window to test expiration
		const shortLimiter = new AuthRateLimiter(3, 1); // 1ms window
		for (let i = 0; i < 3; i++) shortLimiter.recordFailure('1.2.3.4');
		// After a brief delay the window should expire, and a new failure starts fresh
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				// The old window has expired. A new failure starts count at 1.
				shortLimiter.recordFailure('1.2.3.4');
				expect(shortLimiter.isRateLimited('1.2.3.4')).toBe(false);
				resolve();
			}, 10);
		});
	});

	it('cleanup removes expired entries', () => {
		const shortLimiter = new AuthRateLimiter(3, 1);
		for (let i = 0; i < 3; i++) shortLimiter.recordFailure('1.2.3.4');
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				shortLimiter.cleanup();
				expect(shortLimiter.isRateLimited('1.2.3.4')).toBe(false);
				resolve();
			}, 10);
		});
	});

	it('tracks failure count correctly', () => {
		expect(limiter.recordFailure('1.2.3.4')).toBe(1);
		expect(limiter.recordFailure('1.2.3.4')).toBe(2);
		expect(limiter.recordFailure('1.2.3.4')).toBe(3);
	});
});
