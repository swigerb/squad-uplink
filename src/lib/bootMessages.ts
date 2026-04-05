import type { ThemeId } from '@/themes';

/** Return skin-aware boot message lines for the terminal */
export function getBootMessage(themeId: ThemeId): string[] {
  switch (themeId) {
    case 'apple2e':
      return [
        ']CALL -151',
        '*',
        '* SQUAD UPLINK v0.1.0',
        '* REMOTE AGENT CONTROL TERMINAL',
        '*',
        '* 64K RAM SYSTEM  48K AVAILABLE',
        '',
        'Type /help for commands.',
      ];

    case 'c64':
      return [
        '',
        '    **** COMMODORE 64 BASIC V2 ****',
        '',
        ' 64K RAM SYSTEM  38911 BASIC BYTES FREE',
        '',
        ' ╔══════════════════════════════════╗',
        ' ║     SQUAD UPLINK v0.1.0         ║',
        ' ║  REMOTE AGENT CONTROL TERMINAL  ║',
        ' ╚══════════════════════════════════╝',
        '',
        'READY.',
        'Type /help for commands.',
      ];

    case 'ibm3270':
      return [
        '═══════════════════════════════════════',
        ' IBM 3270 SYSTEM READY',
        ' SQUAD UPLINK TERMINAL v0.1.0',
        ' REMOTE AGENT CONTROL INTERFACE',
        '═══════════════════════════════════════',
        '',
        'LOGON ACCEPTED. SESSION ACTIVE.',
        'Type /help for commands.',
      ];

    case 'win95':
      return [
        'Microsoft(R) Windows 95',
        '   (C)Copyright Microsoft Corp 1981-1996.',
        '',
        'C:\\SQUAD>uplink.exe /v0.1.0',
        'SQUAD UPLINK - Remote Agent Control Terminal',
        '',
        'Type /help for commands.',
      ];

    case 'lcars':
      return [
        `LCARS TERMINAL ONLINE — STARDATE ${getLcarsStardate()}`,
        '',
        '╭─────────────────────────────────────╮',
        '│  SQUAD UPLINK v0.1.0                │',
        '│  REMOTE AGENT CONTROL TERMINAL      │',
        '│  FEDERATION COMMS ARRAY ACTIVE      │',
        '╰─────────────────────────────────────╯',
        '',
        'AWAITING COMMAND INPUT...',
        'Type /help for commands.',
      ];

    default:
      return [
        'SQUAD UPLINK v0.1.0',
        'Remote Agent Control Terminal',
        '',
        'Type /help for commands.',
      ];
  }
}

function getLcarsStardate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const start = new Date(year, 0, 1);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return `${year}.${String(dayOfYear).padStart(3, '0')}`;
}
