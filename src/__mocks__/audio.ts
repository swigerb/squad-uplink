import { vi } from 'vitest';

export class MockOscillatorNode {
  type = 'square';
  frequency = { value: 440, setValueAtTime: vi.fn() };
  detune = { value: 0, setValueAtTime: vi.fn() };
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
}

export class MockGainNode {
  gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  connect = vi.fn().mockReturnThis();
  disconnect = vi.fn();
}

/** Mock AudioBuffer returned by decodeAudioData */
export class MockAudioBuffer {
  readonly sampleRate = 44100;
  readonly length = 44100;
  readonly duration = 1;
  readonly numberOfChannels = 1;
  getChannelData = vi.fn(() => new Float32Array(44100));
  copyFromChannel = vi.fn();
  copyToChannel = vi.fn();
}

/** Mock AudioBufferSourceNode for file-based playback verification */
export class MockAudioBufferSourceNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  playbackRate = { value: 1, setValueAtTime: vi.fn() };
  connect = vi.fn().mockReturnThis();
  start = vi.fn();
  stop = vi.fn();
  disconnect = vi.fn();
  onended: (() => void) | null = null;
}

export class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};

  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
  createBufferSource = vi.fn(() => new MockAudioBufferSourceNode());
  decodeAudioData = vi.fn(async () => new MockAudioBuffer());
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
}

export function installMockAudioContext() {
  vi.stubGlobal('AudioContext', MockAudioContext);
}

/**
 * Create a mock fetch that resolves with an ArrayBuffer for audio URLs,
 * or rejects for URLs containing 'missing' or 'fail'.
 */
export function createMockAudioFetch() {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;

    if (urlStr.includes('missing') || urlStr.includes('fail')) {
      return Promise.resolve({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        arrayBuffer: () => Promise.reject(new Error('Not found')),
      } as unknown as Response);
    }

    if (urlStr.includes('network-error')) {
      return Promise.reject(new TypeError('Network error'));
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
    } as unknown as Response);
  });
}
