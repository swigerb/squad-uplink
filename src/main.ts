import { PortalServer } from './server.js';
import { TunnelManager } from './tunnel.js';
import qrcode from 'qrcode-terminal';
import { exec, execSync, spawnSync } from 'node:child_process';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { cliNodeOptions, cliSpawnEnv } from './cli-env.js';

// Prefix timestamps on [CLI subprocess] lines written directly to stderr by the SDK
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk: any, ...rest: any[]): boolean {
	const str = typeof chunk === 'string' ? chunk : chunk.toString();
	if (str.includes('[CLI subprocess]')) {
		const now = new Date();
		const h = now.getHours(); const m = now.getMinutes(); const s = now.getSeconds();
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hh = String(h > 12 ? h - 12 : h || 12).padStart(2, '0');
		const ts = `[${hh}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${ampm}]`;
		const prefixed = str.replace(/^(\[CLI subprocess\])/gm, `${ts} $1`);
		return origStderrWrite(prefixed);
	}
	return origStderrWrite(chunk, ...rest);
} as any;

const args = process.argv.slice(2);
process.title = 'Copilot Portal';

if (args.includes('--help') || args.includes('-h')) {
	console.log(`Usage: node dist/server.js [options]

Options:
  --port <n>       Port to listen on (default: 3847)
  --cli-url <url>  Connect to a running CLI server (e.g. localhost:3848)
  --data <dir>     Data directory for token, rules, and settings
  --new-token      Generate a new access token (invalidates existing URLs)
  --launch         Open the portal URL in your default browser on start
  --no-qr          Suppress the QR code output
  --help           Show this help

See README.md for full setup instructions.`);
	process.exit(0);
}

const getArg = (flag: string) => {
	const i = args.indexOf(flag);
	return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
};

const PORT = parseInt(getArg('--port') ?? '3847', 10);
const CLI_URL = getArg('--cli-url');
const DATA_DIR = getArg('--data');
const LAUNCH = args.includes('--launch');
const NO_QR = args.includes('--no-qr');
const NEW_TOKEN = args.includes('--new-token');
// In a container the LAN IP we'd encode is the container's internal Docker
// address, which is useless to a phone. Suppress console QR/URL output there;
// clients reach the portal via the host's address and use the in-portal QR.
const CONTAINER_MODE = process.env.COPILOT_CONTAINER === '1' || process.env.COPILOT_CONTAINER === 'true';

// ---- Auto-start management ----
const TASK_NAME = 'CopilotPortal';
const portalDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');

function isAutoStartEnabled(): boolean {
	if (process.platform === 'win32') {
		const r = spawnSync('schtasks', ['/query', '/tn', TASK_NAME], { stdio: 'pipe', windowsHide: true });
		return r.status === 0;
	} else if (process.platform === 'darwin') {
		const plist = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.copilot-portal.plist');
		return fs.existsSync(plist);
	} else {
		const service = path.join(os.homedir(), '.config', 'systemd', 'user', 'copilot-portal.service');
		return fs.existsSync(service);
	}
}

function enableAutoStart(): string {
	if (process.platform === 'win32') {
		const cmd = path.join(portalDir, 'start-portal.cmd');
		const ps = `$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c cd /d "${portalDir}" && start-portal.cmd'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null`;
		const r = spawnSync('pwsh', ['-NoProfile', '-Command', ps], { stdio: 'pipe', windowsHide: true });
		if (r.status !== 0) throw new Error(r.stderr?.toString().trim() ?? 'Failed to create scheduled task');
		return 'Scheduled task created — Portal will start at logon';
	} else if (process.platform === 'darwin') {
		const agentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
		fs.mkdirSync(agentsDir, { recursive: true });
		const plistPath = path.join(agentsDir, 'com.copilot-portal.plist');
		const startScript = path.join(portalDir, 'start-portal.sh');
		const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>com.copilot-portal</string>
	<key>ProgramArguments</key><array>
		<string>bash</string><string>-c</string>
		<string>cd "${portalDir}" &amp;&amp; npm start</string>
	</array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><dict>
		<key>SuccessfulExit</key><false/>
	</dict>
	<key>StandardOutPath</key><string>${path.join(portalDir, 'portal.log')}</string>
	<key>StandardErrorPath</key><string>${path.join(portalDir, 'portal.log')}</string>
	<key>WorkingDirectory</key><string>${portalDir}</string>
</dict>
</plist>`;
		fs.writeFileSync(plistPath, plist);
		spawnSync('launchctl', ['load', plistPath], { stdio: 'pipe' });
		return 'Launch Agent created — Portal will start at login';
	} else {
		const serviceDir = path.join(os.homedir(), '.config', 'systemd', 'user');
		fs.mkdirSync(serviceDir, { recursive: true });
		const servicePath = path.join(serviceDir, 'copilot-portal.service');
		const service = `[Unit]
Description=Copilot Portal
After=network.target

[Service]
Type=simple
WorkingDirectory=${portalDir}
ExecStart=/usr/bin/env npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target`;
		fs.writeFileSync(servicePath, service);
		spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
		spawnSync('systemctl', ['--user', 'enable', 'copilot-portal.service'], { stdio: 'pipe' });
		return 'systemd user service created — Portal will start at login';
	}
}

function disableAutoStart(): string {
	if (process.platform === 'win32') {
		spawnSync('pwsh', ['-NoProfile', '-Command', `Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`], { stdio: 'pipe', windowsHide: true });
		return 'Scheduled task removed';
	} else if (process.platform === 'darwin') {
		const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.copilot-portal.plist');
		spawnSync('launchctl', ['unload', plistPath], { stdio: 'pipe' });
		try { fs.unlinkSync(plistPath); } catch {}
		return 'Launch Agent removed';
	} else {
		spawnSync('systemctl', ['--user', 'disable', 'copilot-portal.service'], { stdio: 'pipe' });
		const servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'copilot-portal.service');
		try { fs.unlinkSync(servicePath); } catch {}
		spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' });
		return 'systemd service removed';
	}
}

const server = new PortalServer(PORT, DATA_DIR, { newToken: NEW_TOKEN, cliUrl: CLI_URL });

process.on('SIGINT', async () => {
	console.log('\nShutting down...');
	tunnel.shutdown();
	await server.stop().catch(() => {});
	if (process.platform === 'win32') {
		spawnSync('pwsh', ['-NoProfile', '-Command',
			`Get-NetTCPConnection -LocalPort 3848 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
		], { stdio: 'ignore', windowsHide: true });
	}
	process.exit(0);
});

process.on('SIGTERM', async () => {
	tunnel.shutdown();
	await server.stop().catch(() => {});
	if (process.platform === 'win32') {
		spawnSync('pwsh', ['-NoProfile', '-Command',
			`Get-NetTCPConnection -LocalPort 3848 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
		], { stdio: 'ignore', windowsHide: true });
	}
	process.exit(0);
});

try {
	await server.start();
} catch (e) {
	// start() now binds the listener before auth, so this only fires on a hard
	// listen/bind failure. Auth problems are handled non-fatally inside the server.
	console.error('[Server] Fatal startup error:', e);
	process.exit(1);
}

// Initialize tunnel manager
const dataDir = DATA_DIR ?? 'data';
const tunnel = new TunnelManager(dataDir, PORT);

// Timestamped console logger for runtime/background events (tunnel health checks,
// auto-restarts) so their lines match the `[hh:mm:ss AM]` prefix that PortalServer.log
// stamps on `[Update]`/`[History]`/etc. Startup TUI banner lines stay unstamped on purpose.
const stampedLog = (msg: string) => {
	const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
	console.log(`[${ts}] ${msg}`);
};

// Print QR code for easy phone access (desktop only — see CONTAINER_MODE note).
if (!NO_QR && !CONTAINER_MODE) {
	console.log('\nScan to open on your phone:');
	qrcode.generate(server.getURL(), { small: true });
	if (!server.getToken()) {
		console.log('  No session token yet — open the portal and choose "Generate session token" to secure it.');
	}
}

if (LAUNCH) {
	const url = server.getLocalURL();
	const cmd = process.platform === 'win32' ? `start "" "${url}"`
		: process.platform === 'darwin' ? `open "${url}"`
		: `xdg-open "${url}"`;
	exec(cmd);
}

// Console key commands
if (process.stdin.isTTY) {
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	let cliPickerState: { sessions: Array<{ sessionId: string; summary?: string }>; page: number } | null = null;

	const showCliPicker = async () => {
		const sessions = await server.listSessions();
		if (sessions.length === 0) {
			console.log('\n  No sessions found. Press [n] to create a new one.\n');
		}
		cliPickerState = { sessions, page: 0 };
		renderCliPage();
	};

	const renderCliPage = () => {
		if (!cliPickerState) return;
		const { sessions, page } = cliPickerState;
		const pageSize = 9;
		const start = page * pageSize;
		const pageItems = sessions.slice(start, start + pageSize);
		console.log('\n  Open CLI TUI for session:');
		pageItems.forEach((s, i) => {
			const label = (s.summary ?? '(untitled)').split('\n')[0].slice(0, 60);
			console.log(`    [${i + 1}] ${s.sessionId.slice(0, 8)} ${label}`);
		});
		const hasMore = start + pageSize < sessions.length;
		console.log(`\n    [n] New session${hasMore ? '  [m] More' : ''}  [c] Cancel\n`);
	};

	const handleCliPick = (key: string) => {
		if (!cliPickerState) return;
		if (key === 'c') {
			cliPickerState = null;
			console.log('  Cancelled.\n');
			return;
		}
		if (key === 'n') {
			cliPickerState = null;
			launchCliTui();
			return;
		}
		if (key === 'm') {
			const pageSize = 9;
			const maxPage = Math.floor((cliPickerState.sessions.length - 1) / pageSize);
			cliPickerState.page = cliPickerState.page >= maxPage ? 0 : cliPickerState.page + 1;
			renderCliPage();
			return;
		}
		const idx = parseInt(key, 10);
		if (idx >= 1 && idx <= 9) {
			const start = cliPickerState.page * 9;
			const session = cliPickerState.sessions[start + idx - 1];
			if (session) {
				cliPickerState = null;
				launchCliTui(session.sessionId);
				return;
			}
		}
		// Unrecognized key — re-show the menu
		renderCliPage();
	};

	let confirmingCliLaunch: { sessionId?: string } | null = null;

	const launchCliTui = (sessionId?: string) => {
		// Show confirmation — switching from headless to TUI requires server restart
		confirmingCliLaunch = { sessionId };
		console.log('\n  This will restart the CLI server in TUI mode.');
		console.log('  The portal will briefly disconnect and reconnect.');
		console.log('\n  [y] Continue  [n] Cancel\n');
	};

	const handleConfirm = (key: string) => {
		if (!confirmingCliLaunch) return;
		if (key === 'n' || key === 'c') {
			confirmingCliLaunch = null;
			console.log('  Cancelled.\n');
			return;
		}
		if (key === 'y') {
			const sessionId = confirmingCliLaunch.sessionId;
			confirmingCliLaunch = null;

			console.log('  Stopping headless CLI server...');
			// Notify portal clients that the CLI server is switching
			server.broadcastAll({ type: 'info', content: 'Switching CLI Server to TUI mode - reloading...' });
			// Kill the process on port 3848
			if (process.platform === 'win32') {
				spawnSync('pwsh', ['-NoProfile', '-Command',
					`Get-NetTCPConnection -LocalPort 3848 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
				], { stdio: 'ignore', windowsHide: true });
			}

			// Wait a moment for port to free, then launch TUI server
			setTimeout(() => {
				const tuiArgs = ['--ui-server', '--port', '3848'];
				if (sessionId) tuiArgs.push('--resume', sessionId);
				if (process.platform === 'win32') {
					// Resolve full path to copilot.exe so wt/Start-Process can find it
					const which = spawnSync('where.exe', ['copilot.exe'], { stdio: 'pipe', windowsHide: true });
					const copilotPath = which.status === 0 ? which.stdout.toString().trim().split(/\r?\n/)[0] : 'copilot';
					const cmd = `"${copilotPath}" ${tuiArgs.join(' ')}`;
					exec(`wt -w 0 new-tab --title "Copilot CLI" ${cmd}`);
				} else if (process.platform === 'darwin') {
					const cmd = `copilot ${tuiArgs.join(' ')}`;
					exec(`osascript -e 'tell app "Terminal" to do script "${cmd}"'`);
				} else {
					const cmd = `copilot ${tuiArgs.join(' ')}`;
					exec(`x-terminal-emulator -e "${cmd}" 2>/dev/null || xterm -e "${cmd}" &`);
				}
				console.log(`  CLI TUI opening${sessionId ? ` (session ${sessionId.slice(0, 8)})` : ' (new session)'}...`);
				console.log('  Portal will reconnect automatically.\n');
				// Tell clients to reload so they reconnect to the new CLI server
				setTimeout(() => {
					server.broadcastAll({ type: 'reload' });
				}, 3000);
				// Watch for TUI exit — when port 3848 stops listening, restart headless server
				const watchTuiExit = setInterval(() => {
					const sock = net.createConnection({ port: 3848, host: 'localhost' }, () => { sock.destroy(); });
					sock.on('error', () => {
						clearInterval(watchTuiExit);
						console.log('TUI exited — restarting headless CLI server');
						if (process.platform === 'win32') {
							const which = spawnSync('where.exe', ['copilot.exe'], { stdio: 'pipe', windowsHide: true });
							if (which.status === 0) {
								const copilotPath = which.stdout.toString().trim().split(/\r?\n/)[0];
								// Raise CLI heap on the headless relaunch too (cli-env.ts).
								exec(`pwsh -NoProfile -Command "$env:NODE_OPTIONS='${cliNodeOptions()}'; Start-Process -FilePath '${copilotPath}' -ArgumentList '--server','--port','3848' -WindowStyle Hidden"`, { windowsHide: true });
							}
						} else {
							exec('copilot --server --port 3848 &', { env: cliSpawnEnv() });
						}
					});
					sock.setTimeout(1000, () => { sock.destroy(); });
				}, 3000);
			}, 1500);
			return;
		}
		// Unrecognized — re-show prompt
		console.log('\n  [y] Continue  [n] Cancel\n');
	};

	let updateInProgress = false;
	let tunnelSetupState: 'asking-access' | null = null;

	const handleTunnelSetup = (key: string) => {
		if (tunnelSetupState === 'asking-access') {
			if (key === '1') {
				tunnelSetupState = null;
				startTunnel({ name: TunnelManager.generateName(), allowAnonymous: true });
			} else if (key === '2') {
				tunnelSetupState = null;
				startTunnel({ name: TunnelManager.generateName(), allowAnonymous: false });
			} else {
				console.log('\n  Press [1] or [2]\n');
			}
		}
	};

	const startTunnel = async (config: { name: string; allowAnonymous: boolean }) => {
		console.log(`  Connecting tunnel "${config.name}"...`);
		try {
			const tunnelUrl = await tunnel.start(config);
			const fullUrl = `${tunnelUrl}?token=${server.getToken()}`;
			console.log(`\n  Tunnel: ${fullUrl}\n`);
			console.log('  Scan to open remotely:');
			qrcode.generate(fullUrl, { small: true });
			console.log('  Note: First visit shows a Microsoft security interstitial (one-time).');
			console.log('  Warning: URL contains your access token — do not share in recordings or public channels.');
			if (!config.allowAnonymous) {
				console.log('  Access: Visitors must sign in with a Microsoft or GitHub account.');
			}
			// Start periodic health checks
			tunnel.startHealthCheck(
				() => server.getToken(),
				(newUrl) => stampedLog(`[Tunnel] Restarted → ${newUrl}?token=${server.getToken()}`),
				stampedLog,
			);
		} catch (e) {
			console.log(`  Failed to start tunnel: ${e}\n`);
		}
	};

	let tunnelBusy = false;

	const toggleTunnel = async () => {
		const state = tunnel.getState();

		// If running, stop it
		if (state.running) {
			tunnel.stop();
			console.log('\n  Tunnel stopped.\n');
			return;
		}

		// Guard against double-press while starting
		if (tunnelBusy) { console.log('\n  Tunnel is starting...\n'); return; }
		tunnelBusy = true;

		console.log('\n  Starting tunnel...');

		// Check prerequisites
		if (!tunnel.isInstalled()) {
			tunnelBusy = false;
			console.log('  devtunnel is not installed.');
			if (process.platform === 'win32') {
				console.log('  Install: winget install Microsoft.devtunnel');
			} else if (process.platform === 'darwin') {
				console.log('  Install: brew install devtunnel');
			} else {
				console.log('  Install: curl -sL https://aka.ms/DevTunnelCliInstall | bash');
			}
			console.log('  Then restart your terminal and run: devtunnel user login\n');
			return;
		}
		if (!tunnel.isLoggedIn()) {
			tunnelBusy = false;
			console.log('  devtunnel is not logged in.');
			console.log('  Run: devtunnel user login\n');
			return;
		}

		// If we have saved config, use it
		if (tunnel.hasConfig()) {
			await startTunnel(tunnel.getConfig()!);
			tunnelBusy = false;
			return;
		}

		// First time — ask about access
		tunnelBusy = false;
		tunnelSetupState = 'asking-access';
		console.log('\n  Tunnel Access:');
		console.log('    [1] Anonymous — anyone with the URL can connect (portal token still required)');
		console.log('    [2] Authenticated — visitors must sign in with Microsoft/GitHub\n');
	};

	const killCliServer = () => {
		if (process.platform === 'win32') {
			spawnSync('pwsh', ['-NoProfile', '-Command',
				`Get-NetTCPConnection -LocalPort 3848 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
			], { stdio: 'ignore', windowsHide: true });
		}
	};

	const shutdown = async () => {
		console.log('\nShutting down...');
		tunnel.shutdown();
		await server.stop().catch(() => {}); // disconnect SDK first
		killCliServer(); // then kill CLI process
		process.exit(0);
	};

	const showHelp = () => {
		const tunnelState = tunnel.getState();
		const tunnelLabel = tunnelState.running ? '[t] Stop Tunnel' : '[t] Tunnel';
		const autoStart = isAutoStartEnabled();
		console.log(`\n  Access:  [q] QR Code  [l] Launch Browser  ${tunnelLabel}  [T] Reset Access`);
		console.log(`  Server:  [c] CLI Console  [u] Check Updates  [s] Auto-start: ${autoStart ? 'ON' : 'OFF'}  [r] Restart  [x] Exit\n`);
	};
	showHelp();

	// Auto-restart tunnel if it was running before a server restart
	if (tunnel.shouldAutoStart() && tunnel.isInstalled() && tunnel.isLoggedIn()) {
		console.log('\n  Restarting tunnel...');
		startTunnel(tunnel.getConfig()!);
	}

	process.stdin.on('data', (key: string) => {
		// If confirming CLI launch, handle y/n
		if (confirmingCliLaunch) {
			handleConfirm(key.toLowerCase());
			return;
		}
		// If tunnel setup is active, route keys there
		if (tunnelSetupState) {
			handleTunnelSetup(key.toLowerCase());
			return;
		}
		// If CLI picker is active, route keys there
		if (cliPickerState) {
			handleCliPick(key.toLowerCase());
			return;
		}
		// Handle shift-sensitive keys before lowercasing
		if (key === 'T') {
			console.log('\n  Security reset: revoking all access...');
			const result = tunnel.reset();
			if (result.deleted) {
				console.log(`  ✓ Tunnel "${result.name}" deleted — old tunnel URL is dead`);
			}
			const cleared = server.clearToken();
			if (cleared) {
				console.log(`  ✓ Session token cleared — all existing URLs are now invalid`);
				console.log(`  ✓ All connected clients disconnected`);
				console.log(`\n  Portal URL: ${server.getURL()}`);
				console.log(`  Open it and choose "Generate session token" to set a new one, then press [q] for a QR code.\n`);
			} else {
				console.log(`  ⚠ Session token is pinned via PORTAL_TOKEN — change that env var and restart to rotate it.\n`);
			}
			return;
		}
		switch (key.toLowerCase()) {
			case 'c':
				showCliPicker();
				break;
			case 'l': {
				const url = server.getLocalURL();
				const cmd = process.platform === 'win32' ? `start "" "${url}"`
					: process.platform === 'darwin' ? `open "${url}"`
					: `xdg-open "${url}"`;
				exec(cmd);
				console.log(`\n  Opened in browser\n`);
				break;
			}
			case 'q': {
				console.log(`\n  Local: ${server.getURL()}`);
				const ts = tunnel.getState();
				if (ts.running && ts.url) {
					const tunnelFull = `${ts.url}?token=${server.getToken()}`;
					console.log(`  Tunnel: ${tunnelFull}\n`);
					console.log('  Scan for remote access:');
					qrcode.generate(tunnelFull, { small: true });
				} else {
					console.log('');
					console.log('  Scan to open on your phone (same network):');
					qrcode.generate(server.getURL(), { small: true });
					if (!server.getToken()) {
						console.log('  No session token yet — open the portal and choose "Generate session token" to secure it.');
					}
				}
				break;
			}
			case 't':
				toggleTunnel();
				break;
			case 'u':
				if (updateInProgress) { console.log('\n  Update already in progress...\n'); break; }
				console.log('\n  Checking for updates...');
				server.checkForUpdates().then(async (result) => {
					if (!result.hasUpdates) {
						console.log(`  ${result.summary}\n`);
						return;
					}
					console.log(`  Available: ${result.summary}`);
					console.log('  Applying updates...');
					updateInProgress = true;
					const msg = await server.applyUpdates();
					updateInProgress = false;
					console.log(`  ${msg}\n`);
				}).catch((e) => {
					updateInProgress = false;
					console.log(`  Update check failed: ${e}\n`);
				});
				break;
			case 's': {
				const enabled = isAutoStartEnabled();
				if (enabled) {
					console.log('\n  Disabling auto-start...');
					try {
						const msg = disableAutoStart();
						console.log(`  ✓ ${msg}\n`);
					} catch (e) {
						console.log(`  ✗ Failed: ${e}\n`);
					}
				} else {
					console.log('\n  Enabling auto-start...');
					try {
						const msg = enableAutoStart();
						console.log(`  ✓ ${msg}\n`);
					} catch (e) {
						console.log(`  ✗ Failed: ${e}\n`);
					}
				}
				break;
			}
			case 'r':
				if (updateInProgress || server.isUpdateBusy()) {
					console.log('\n  Update in progress — wait for it to finish before restarting.\n');
					break;
				}
				console.log('\nRestarting...');
				process.exit(75); // launcher catches this and relaunches
				break;
			case 'x':
				shutdown();
				break;
			case '\u0003': // Ctrl+C
				shutdown();
				break;
			default:
				showHelp();
				break;
		}
	});
}
