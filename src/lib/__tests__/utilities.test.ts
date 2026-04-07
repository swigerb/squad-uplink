/**
 * Utility coverage tests — formatters.ts and bootMessages.ts
 *
 * These lib utilities have zero test coverage. Tests verify:
 * - formatAgentList: empty list, single agent, multi-agent, unknown status
 * - formatStatus: connected/disconnected, with/without tunnel
 * - getBootMessage: all 9 themes return non-empty arrays ending with /help
 * - getLcarsStardate: format validation
 */
import { describe, it, expect } from 'vitest';
import { formatAgentList, formatStatus } from '@/lib/formatters';
import { getBootMessage } from '@/lib/bootMessages';
import type { AgentInfo, InboundStatus } from '@/types/squad-rc';
import type { ThemeId } from '@/themes';
import { THEME_ORDER } from '@/themes';

// ============================================================
// formatAgentList
// ============================================================
describe('formatAgentList', () => {
  it('returns "No agents connected" for empty array', () => {
    const result = formatAgentList([]);
    expect(result).toContain('No agents connected');
  });

  it('returns header and agent row for single agent', () => {
    const agents: AgentInfo[] = [
      { name: 'Woz', role: 'Lead Dev', status: 'online' },
    ];
    const result = formatAgentList(agents);
    expect(result).toContain('Agent Roster:');
    expect(result).toContain('Woz');
    expect(result).toContain('Lead Dev');
    expect(result).toContain('online');
    expect(result).toContain('🟢');
  });

  it('formats multiple agents correctly', () => {
    const agents: AgentInfo[] = [
      { name: 'Woz', role: 'Lead Dev', status: 'online' },
      { name: 'Kare', role: 'Designer', status: 'busy' },
      { name: 'Hertzfeld', role: 'Tester', status: 'offline' },
    ];
    const result = formatAgentList(agents);
    expect(result).toContain('Woz');
    expect(result).toContain('Kare');
    expect(result).toContain('Hertzfeld');
    expect(result).toContain('🟢'); // online
    expect(result).toContain('🟡'); // busy
    expect(result).toContain('🔴'); // offline
  });

  it('uses default icon for unknown status', () => {
    const agents: AgentInfo[] = [
      { name: 'Unknown', role: 'Mystery', status: 'unknown' as AgentInfo['status'] },
    ];
    const result = formatAgentList(agents);
    expect(result).toContain('⚪');
  });

  it('output uses ANSI bold for header', () => {
    const agents: AgentInfo[] = [
      { name: 'Woz', role: 'Lead Dev', status: 'online' },
    ];
    const result = formatAgentList(agents);
    // \x1b[1m is ANSI bold
    expect(result).toContain('\x1b[1m');
    expect(result).toContain('\x1b[0m');
  });

  it('output uses \\r\\n line endings (terminal-style)', () => {
    const result = formatAgentList([]);
    expect(result).toContain('\r\n');
  });
});

// ============================================================
// formatStatus
// ============================================================
describe('formatStatus', () => {
  it('shows green icon and "connected" when connected', () => {
    const msg: InboundStatus = { type: 'status', connected: true };
    const result = formatStatus(msg);
    expect(result).toContain('🟢');
    expect(result).toContain('connected');
  });

  it('shows red icon and "disconnected" when not connected', () => {
    const msg: InboundStatus = { type: 'status', connected: false };
    const result = formatStatus(msg);
    expect(result).toContain('🔴');
    expect(result).toContain('disconnected');
  });

  it('includes tunnel URL when present', () => {
    const msg: InboundStatus = {
      type: 'status',
      connected: true,
      tunnel: 'https://my-tunnel.devtunnels.ms',
    };
    const result = formatStatus(msg);
    expect(result).toContain('https://my-tunnel.devtunnels.ms');
  });

  it('omits tunnel info when absent', () => {
    const msg: InboundStatus = { type: 'status', connected: true };
    const result = formatStatus(msg);
    expect(result).not.toContain('Tunnel:');
  });

  it('output ends with \\r\\n', () => {
    const msg: InboundStatus = { type: 'status', connected: true };
    const result = formatStatus(msg);
    expect(result.endsWith('\r\n')).toBe(true);
  });
});

// ============================================================
// getBootMessage
// ============================================================
describe('getBootMessage', () => {
  const ALL_THEMES: ThemeId[] = [...THEME_ORDER];

  it('returns a non-empty array for every theme', () => {
    for (const themeId of ALL_THEMES) {
      const lines = getBootMessage(themeId);
      expect(lines.length).toBeGreaterThan(0);
    }
  });

  it('every theme includes "/help" instruction', () => {
    for (const themeId of ALL_THEMES) {
      const lines = getBootMessage(themeId);
      const joined = lines.join('\n');
      expect(joined).toContain('/help');
    }
  });

  it('every theme includes "SQUAD UPLINK" in boot message', () => {
    for (const themeId of ALL_THEMES) {
      const lines = getBootMessage(themeId);
      const joined = lines.join('\n').toUpperCase();
      expect(joined).toContain('SQUAD UPLINK');
    }
  });

  it('apple2e boot message contains "CALL -151"', () => {
    const lines = getBootMessage('apple2e');
    expect(lines.some((l) => l.includes('CALL -151'))).toBe(true);
  });

  it('c64 boot message contains "COMMODORE 64"', () => {
    const lines = getBootMessage('c64');
    expect(lines.some((l) => l.includes('COMMODORE 64'))).toBe(true);
  });

  it('ibm3270 boot message contains "IBM 3270"', () => {
    const lines = getBootMessage('ibm3270');
    expect(lines.some((l) => l.includes('IBM 3270'))).toBe(true);
  });

  it('win95 boot message contains "Windows 95"', () => {
    const lines = getBootMessage('win95');
    expect(lines.some((l) => l.includes('Windows 95'))).toBe(true);
  });

  it('pipboy boot message contains "PIP-BOY"', () => {
    const lines = getBootMessage('pipboy');
    expect(lines.some((l) => l.includes('PIP-BOY'))).toBe(true);
  });

  it('lcars boot message contains "STARDATE"', () => {
    const lines = getBootMessage('lcars');
    expect(lines.some((l) => l.includes('STARDATE'))).toBe(true);
  });

  it('wopr boot message contains "PROFESSOR FALKEN"', () => {
    const lines = getBootMessage('wopr');
    expect(lines.some((l) => l.includes('PROFESSOR FALKEN'))).toBe(true);
  });

  it('muthur boot message contains "MU-TH-UR"', () => {
    const lines = getBootMessage('muthur');
    expect(lines.some((l) => l.includes('MU-TH-UR'))).toBe(true);
  });

  it('matrix boot message contains "Neo"', () => {
    const lines = getBootMessage('matrix');
    expect(lines.some((l) => l.includes('Neo'))).toBe(true);
  });

  it('unknown theme returns generic fallback', () => {
    const lines = getBootMessage('unknown-theme' as ThemeId);
    const joined = lines.join('\n');
    expect(joined).toContain('SQUAD UPLINK');
    expect(joined).toContain('/help');
    // Fallback should be short
    expect(lines.length).toBeLessThanOrEqual(5);
  });

  it('lcars stardate is in YYYY.DDD format', () => {
    const lines = getBootMessage('lcars');
    const firstLine = lines[0];
    // Should contain a date like "2026.096"
    expect(firstLine).toMatch(/\d{4}\.\d{3}/);
  });
});
