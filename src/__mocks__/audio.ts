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

export class MockAudioContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};

  createOscillator = vi.fn(() => new MockOscillatorNode());
  createGain = vi.fn(() => new MockGainNode());
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
