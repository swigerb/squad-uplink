# squad-uplink Test Strategy

> "The best code is the code that's been proven to work under pressure."
> — Hertzfeld, Tester

**Version:** 1.0
**Created:** 2026-04-05
**Status:** Ready for implementation (awaiting scaffold from Woz)

---

## 1. Test Architecture

### 1.1 Test Runner & Environment

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Test runner | **Vitest** | Native Vite integration, fast HMR-aware watch mode, ESM-first |
| DOM environment | **jsdom** | Lightweight, sufficient for RTL component tests |
| Component testing | **React Testing Library (RTL)** | Tests behavior, not implementation details |
| Assertion library | **Vitest built-in (`expect`)** | Chai-compatible, extended with `@testing-library/jest-dom` matchers |
| Coverage tool | **v8** (via Vitest) | Built-in, fast, accurate for TypeScript |

### 1.2 File Naming & Location Conventions

```
src/
├── hooks/
│   ├── useWebSocket.ts
│   ├── useWebSocket.test.ts          ← co-located unit test
│   ├── useTheme.ts
│   ├── useTheme.test.ts
│   ├── useAudio.ts
│   └── useAudio.test.ts
├── components/
│   ├── Terminal/
│   │   ├── Terminal.tsx
│   │   └── Terminal.test.tsx         ← co-located component test
│   ├── ThemeToggle/
│   │   ├── ThemeToggle.tsx
│   │   └── ThemeToggle.test.tsx
│   └── CRTOverlay/
│       ├── CRTOverlay.tsx
│       └── CRTOverlay.test.tsx
└── __tests__/
    ├── integration/
    │   ├── ws-terminal-flow.test.tsx  ← integration tests
    │   ├── theme-terminal.test.tsx
    │   ├── command-parsing.test.tsx
    │   └── auth-flow.test.tsx
    └── edge-cases/
        ├── ws-disconnect.test.ts     ← edge case tests
        ├── rate-limiting.test.ts
        ├── replay-buffer.test.ts
        ├── session-expiry.test.ts
        └── crt-performance.test.ts
```

**Naming rules:**
- Unit/component tests: `*.test.ts(x)` co-located next to source
- Integration tests: `src/__tests__/integration/`
- Edge-case tests: `src/__tests__/edge-cases/`
- Test helpers/mocks: `src/__tests__/mocks/` and `src/__tests__/helpers/`

### 1.3 Vitest Configuration (expected in `vitest.config.ts`)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/__tests__/**', 'src/main.tsx'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
```

---

## 2. Mock Strategies

### 2.1 WebSocket Mock

A custom `MockWebSocket` class that gives tests full control over connection lifecycle and message delivery.

```ts
// src/__tests__/mocks/MockWebSocket.ts
export class MockWebSocket {
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = WebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sentMessages.push(data); }
  close(code?: number, reason?: string) {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code, reason } as CloseEvent);
  }

  // Test helpers
  simulateOpen() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
  simulateError(error?: Error) {
    this.onerror?.(new Event('error'));
  }
  simulateClose(code = 1000, reason = '') {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  static reset() { MockWebSocket.instances = []; }
  static get latest() { return this.instances[this.instances.length - 1]; }
}
```

**Usage:** `vi.stubGlobal('WebSocket', MockWebSocket)` in setup or per-test.

### 2.2 xterm.js Mock

```ts
// src/__tests__/mocks/MockTerminal.ts
export class MockTerminal {
  options: Record<string, unknown> = {};
  writtenData: string[] = [];
  private dataCallbacks: Array<(data: string) => void> = [];
  element: HTMLDivElement | null = null;

  write(data: string) { this.writtenData.push(data); }
  writeln(data: string) { this.writtenData.push(data + '\n'); }
  open(container: HTMLElement) { this.element = container as HTMLDivElement; }
  dispose() { this.element = null; }
  clear() { this.writtenData = []; }
  onData(callback: (data: string) => void) {
    this.dataCallbacks.push(callback);
    return { dispose: () => {} };
  }

  // Test helpers
  simulateInput(data: string) {
    this.dataCallbacks.forEach(cb => cb(data));
  }
}

// Mock the xterm module
vi.mock('xterm', () => ({
  Terminal: MockTerminal,
}));

vi.mock('@xterm/addon-canvas', () => ({
  CanvasAddon: class { activate() {} dispose() {} },
}));
```

### 2.3 Web Audio API Mock

```ts
// src/__tests__/mocks/MockAudioContext.ts
export class MockOscillatorNode {
  type = 'square';
  frequency = { value: 440, setValueAtTime: vi.fn() };
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
}

export class MockGainNode {
  gain = { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

export class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};

  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}
```

### 2.4 Browser API Mocks (in `setup.ts`)

```ts
// ResizeObserver polyfill for jsdom
global.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// localStorage mock (vitest provides this but ensure reset between tests)
beforeEach(() => {
  localStorage.clear();
});

// matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
});
```

---

## 3. Test Categories & Specifications

### 3.1 Unit Tests — Hooks

#### `useWebSocket`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| WS-01 | Connects on mount | Happy path | Hook creates WebSocket to provided URL on mount |
| WS-02 | Sends auth token | Happy path | Bearer token included in connection (query param or first message) |
| WS-03 | Receives messages | Happy path | `onmessage` events surface via hook return value |
| WS-04 | Sends messages | Happy path | `send()` function transmits prompt-type messages |
| WS-05 | Reconnects on close | Recovery | Auto-reconnects with exponential backoff after unexpected close |
| WS-06 | No reconnect on clean close | Recovery | Does not reconnect when server sends 1000/normal close |
| WS-07 | Reconnect backoff | Recovery | Backoff delays: 1s → 2s → 4s → 8s → max 30s |
| WS-08 | Max reconnect attempts | Recovery | Gives up after N attempts, surfaces error state |
| WS-09 | Cleanup on unmount | Lifecycle | WebSocket closed on component unmount, no dangling listeners |
| WS-10 | Rate limit tracking | Constraint | Tracks messages sent, blocks when 20/min exceeded |
| WS-11 | Rate limit reset | Constraint | Counter resets after 60 seconds |
| WS-12 | Error state on failure | Error | Connection failure sets error state with message |
| WS-13 | Ticket exchange | Auth | Exchanges one-time ticket at `/api/auth/ticket` before WS connect |
| WS-14 | Session TTL awareness | Lifecycle | Handles 4-hour TTL expiry gracefully |

#### `useTheme`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| TH-01 | Default theme | Init | Returns Apple IIe theme when no localStorage value |
| TH-02 | Load persisted theme | Init | Reads theme from `localStorage` on mount |
| TH-03 | Switch to C64 | Toggle | Switching sets C64 colors: `#706ce4` on `#3528be` |
| TH-04 | Switch to Apple IIe | Toggle | Switching sets Apple IIe colors: `#33ff33` on `#000000` |
| TH-05 | Persist to localStorage | Persistence | Theme choice written to `localStorage` on switch |
| TH-06 | CRT filter toggle | CRT | Mechanical Switch toggles CRT filter on/off |
| TH-07 | CRT state independent | CRT | CRT filter state persists across theme switches |
| TH-08 | Theme returns all properties | Contract | Returns `foreground`, `background`, `fontFamily`, `columns`, `crtEnabled` |
| TH-09 | C64 sets 40 columns | Constraint | C64 theme sets column width to 40 |
| TH-10 | Apple IIe sets 80 columns | Constraint | Apple IIe theme uses 80-column mode |

#### `useAudio`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| AU-01 | Success sound | Happy path | `playSuccess()` triggers floppy-seek-style audio |
| AU-02 | Error sound | Happy path | `playError()` triggers SID-chip-buzz audio |
| AU-03 | Mute silences all | Control | When muted, no oscillator nodes created |
| AU-04 | Unmute restores | Control | Unmuting allows sounds to play again |
| AU-05 | AudioContext created lazily | Lifecycle | Context created on first interaction, not on mount |
| AU-06 | AudioContext resumed | Lifecycle | Calls `resume()` if context is in `suspended` state |
| AU-07 | Autoplay policy blocked | Error | Handles `NotAllowedError` gracefully, queues for user gesture |
| AU-08 | Cleanup on unmount | Lifecycle | AudioContext closed on unmount |
| AU-09 | Mute state persisted | Persistence | Mute preference survives page reload (localStorage) |

### 3.2 Component Tests

#### `Terminal`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| TE-01 | Renders container | Render | Terminal DOM container present after mount |
| TE-02 | xterm.js initialized | Init | `Terminal.open()` called with container element |
| TE-03 | Applies Apple IIe colors | Theme | Green text, black background applied to xterm options |
| TE-04 | Applies C64 colors | Theme | Purple text, blue background applied to xterm options |
| TE-05 | Writes incoming messages | Data | WebSocket messages written to terminal via `write()` |
| TE-06 | Sends user input | Data | User keystrokes captured via `onData`, sent to WebSocket |
| TE-07 | Handles resize | Layout | Terminal resizes when container dimensions change |
| TE-08 | Cleanup on unmount | Lifecycle | `Terminal.dispose()` called, no memory leaks |
| TE-09 | Canvas renderer attached | Init | CanvasAddon loaded and activated |
| TE-10 | Shows connection status | UX | Displays connected/disconnected indicator |

#### `ThemeToggle`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| TT-01 | Renders toggle | Render | Toggle control visible in DOM |
| TT-02 | Shows current theme | State | Visual indicator shows which theme is active |
| TT-03 | Clicking switches theme | Interaction | Click toggles between Apple IIe ↔ C64 |
| TT-04 | Accessible | A11y | Has accessible name, keyboard operable |
| TT-05 | Mechanical Switch renders | Render | CRT filter toggle ("Mechanical Switch") visible |
| TT-06 | Mechanical Switch toggles CRT | Interaction | Clicking Mechanical Switch toggles CRT effects |

#### `CRTOverlay`

| # | Test Case | Category | Description |
|---|-----------|----------|-------------|
| CRT-01 | Renders when enabled | Render | Overlay DOM elements present when CRT on |
| CRT-02 | Hidden when disabled | Render | No overlay elements when CRT off |
| CRT-03 | Scanline effect | Visual | Scanline CSS class/element applied |
| CRT-04 | Phosphor glow | Visual | Glow effect CSS present |
| CRT-05 | Screen curvature | Visual | Curvature transform applied |
| CRT-06 | Toggle off removes effects | Interaction | Turning off CRT removes all overlay classes |

### 3.3 Integration Tests

#### WebSocket ↔ Terminal Flow (`ws-terminal-flow.test.tsx`)

| # | Test Case | Description |
|---|-----------|-------------|
| INT-01 | Full message flow | WS message → parsed → written to terminal display |
| INT-02 | User command sent | Typed input → captured by terminal → sent as `{ type: 'prompt', text }` via WS |
| INT-03 | Connection status reflected | WS open → terminal shows "Connected"; WS close → "Disconnected" |
| INT-04 | Reconnect restores output | After reconnect, replay buffer messages appear in terminal |

#### Theme ↔ Terminal (`theme-terminal.test.tsx`)

| # | Test Case | Description |
|---|-----------|-------------|
| INT-05 | Theme change updates terminal | Switching theme updates xterm.js `options.theme` in real-time |
| INT-06 | C64 enforces 40 columns | Switching to C64 sets terminal cols to 40 |
| INT-07 | Apple IIe restores 80 columns | Switching back to Apple IIe restores 80 cols |

#### Command Parsing (`command-parsing.test.tsx`)

| # | Test Case | Description |
|---|-----------|-------------|
| INT-08 | `/status` command routed | Input `/status` sends correct prompt type |
| INT-09 | `/agents` command routed | Input `/agents` sends correct prompt type |
| INT-10 | `@agentName` command routed | Input `@woz do something` routes to agent |
| INT-11 | Plain text sent as prompt | Non-command text sent as generic prompt |
| INT-12 | Empty input ignored | Blank/whitespace input not sent |

#### Auth Flow (`auth-flow.test.tsx`)

| # | Test Case | Description |
|---|-----------|-------------|
| INT-13 | Token → ticket → WS connect | Full auth handshake: acquire token, exchange for ticket, connect WS |
| INT-14 | Auth failure shows error | Invalid/expired token surfaces user-facing error |
| INT-15 | Re-auth on 401 | Ticket rejection triggers re-authentication flow |

### 3.4 Edge Case Tests

> These are the tests that save you at 2 AM. Every one of these has broken a real app.

#### WebSocket Edge Cases (`ws-disconnect.test.ts`)

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-01 | Disconnect mid-message | Data loss | WS closes while a multi-part message is in flight — no crash, partial data handled |
| EDGE-02 | Rapid connect/disconnect | Race condition | Fast open→close→open cycles don't leak listeners or create duplicate connections |
| EDGE-03 | Server sends invalid JSON | Crash | Malformed JSON-RPC doesn't throw unhandled exception |
| EDGE-04 | Server sends unknown method | Resilience | Unknown JSON-RPC method logged, not fatal |
| EDGE-05 | Binary message received | Type safety | Non-string message handled gracefully |

#### Rate Limiting (`rate-limiting.test.ts`)

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-06 | 20 msg/min WS limit | UX | 21st message in 60s is queued or rejected with user feedback |
| EDGE-07 | Rate limit countdown | UX | User shown when they can send again |
| EDGE-08 | Rate limit resets cleanly | Logic | After 60s window, counter resets to 0 |

#### Replay Buffer (`replay-buffer.test.ts`)

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-09 | 500 messages replayed | Correctness | All 500 replay messages rendered in correct order |
| EDGE-10 | Replay memory pressure | Performance | 500 large messages don't cause OOM or UI freeze |
| EDGE-11 | Replay vs live dedup | Correctness | Replay messages not duplicated with live messages |

#### Session Expiry (`session-expiry.test.ts`)

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-12 | 4-hour TTL expiry | UX | Session timeout shows clear message, offers re-auth |
| EDGE-13 | Activity near expiry | UX | Warning shown before session expires (e.g., 5 min warning) |
| EDGE-14 | Expired token on send | Error | Sending after expiry doesn't silently fail |

#### Theme Edge Cases

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-15 | Rapid theme toggling | Race condition | Switching themes 10x/sec doesn't corrupt terminal state |
| EDGE-16 | 40-col mode line wrapping | Display | Long lines wrap correctly in C64 40-column mode |
| EDGE-17 | Theme + CRT simultaneous | State | Changing theme while CRT is on doesn't break overlay |

#### Audio Edge Cases

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-18 | Autoplay policy blocked | Browser | AudioContext `resume()` rejected — app continues without audio |
| EDGE-19 | Rapid sound triggers | Performance | 20 quick success beeps don't stack or leak oscillator nodes |

#### Cleanup & Memory

| # | Test Case | Risk | Description |
|---|-----------|------|-------------|
| EDGE-20 | xterm.js dispose on unmount | Memory leak | Terminal disposed, canvas freed |
| EDGE-21 | WS listeners removed on unmount | Memory leak | No orphaned event listeners after component unmount |
| EDGE-22 | Audio context closed on unmount | Resource leak | AudioContext closed when app unmounts |

---

## 4. Coverage Targets

| Category | Target | Rationale |
|----------|--------|-----------|
| Hooks (`src/hooks/`) | **95%+** | Pure business logic, most critical, highly testable |
| Components (`src/components/`) | **85%+** | Behavior-focused (RTL), not snapshot testing |
| Integration flows | **Key flows covered** | All happy paths + critical error paths |
| Edge cases | **All specified cases** | These are the production fire starters |
| **Overall floor** | **80%** | Enforced in CI — build fails below this |

### Coverage Enforcement

- Vitest `thresholds` in config will fail CI if coverage drops below floor
- New code must not decrease coverage (ratchet up, never down)
- Coverage reports generated as HTML for local review and LCOV for CI integration

---

## 5. Test Setup File (`src/__tests__/setup.ts` — specification)

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Cleanup RTL after each test
afterEach(() => {
  cleanup();
});

// Reset localStorage between tests
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ResizeObserver polyfill
global.ResizeObserver = class {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
};

// matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

---

## 6. CI Integration Notes

- Tests run on every PR via GitHub Actions
- Coverage report uploaded as artifact
- Failing tests or coverage below threshold blocks merge
- Edge case tests tagged with `describe.concurrent` where safe for parallel execution
- Integration tests may need sequential execution (shared mock state)

---

## 7. Test Priority Order (Implementation Plan)

When Woz's scaffold is ready, implement tests in this order:

1. **Setup & mocks first** — `setup.ts`, `MockWebSocket`, `MockTerminal`, `MockAudioContext`
2. **Hook unit tests** — `useWebSocket`, `useTheme`, `useAudio` (highest value, pure logic)
3. **Component tests** — `Terminal`, `ThemeToggle`, `CRTOverlay`
4. **Integration tests** — WS↔Terminal, Theme↔Terminal, command parsing, auth flow
5. **Edge cases** — layer these on as features stabilize

---

*Hertzfeld out. The tests are specified. Now we wait for the scaffold, then we prove it works.*
