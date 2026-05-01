import '@testing-library/jest-dom/vitest';

// Mock window.matchMedia (not available in jsdom)
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// Mock WebSocket global
class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	readyState = MockWebSocket.CONNECTING;
	onopen: ((ev: Event) => void) | null = null;
	onclose: ((ev: CloseEvent) => void) | null = null;
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;

	constructor(url: string) {
		this.url = url;
	}
	send = vi.fn();
	close = vi.fn();
	addEventListener = vi.fn();
	removeEventListener = vi.fn();
}
(globalThis as Record<string, unknown>).WebSocket = MockWebSocket;

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
	writable: true,
	value: {
		writeText: vi.fn().mockResolvedValue(undefined),
		readText: vi.fn().mockResolvedValue(''),
		write: vi.fn().mockResolvedValue(undefined),
		read: vi.fn().mockResolvedValue([]),
	},
});

// Mock document.execCommand for clipboard fallback
document.execCommand = vi.fn().mockReturnValue(true);
