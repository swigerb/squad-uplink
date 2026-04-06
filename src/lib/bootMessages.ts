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

    case 'pipboy':
      return [
        'VAULT-TEC INDUSTRIES (TM) UPLINK TERMINAL',
        'MODEL: PIP-BOY 3000',
        'BIOS v1.0 ... OK',
        'SCANNING FREQUENCIES... SQUAD UPLINK DETECTED',
        'ESTABLISHING SECURE CHANNEL...',
        '',
        '> UPLINK ACTIVE. WELCOME, OVERSEER.',
        '',
        'Type /help for commands.',
      ];

    case 'muthur':
      return [
        'INTERFACE 2037 READY FOR INQUIRY',
        '',
        'MU-TH-UR 6000 — WEYLAND-YUTANI CORP',
        'NOSTROMO SYSTEMS ONLINE',
        'CREW STATUS: MONITORING',
        'SPECIAL ORDER 937: CLASSIFIED',
        '',
        'SQUAD UPLINK v1.0.0 CONNECTED',
        '',
        '> Type /help for commands.',
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

    case 'wopr':
      return [
        'LOGON: ***',
        'GREETINGS PROFESSOR FALKEN.',
        '',
        'SHALL WE PLAY A GAME?',
        '',
        'W.O.P.R. STRATEGIC DEFENSE SYSTEM',
        'NORAD COMMAND CENTER ONLINE',
        'SQUAD UPLINK v1.0.0',
        '',
        'AWAITING COMMAND...',
        'Type /help for commands.',
      ];

    case 'matrix':
      return [
        'Wake up, Neo...',
        'The Matrix has you...',
        'Follow the white rabbit.',
        'Knock, knock, Neo.',
        '',
        'SQUAD UPLINK v1.0.0',
        'Initializing neural interface...',
        'Connection established.',
        '',
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
