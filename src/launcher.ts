/**
 * Launcher with CLI server management and restart support.
 *
 * Default (connected mode):
 *   1. Check if CLI server is already listening on port 3848
 *   2. If not, launch `copilot --server --port 3848` as a background process
 *   3. Wait for port 3848 to accept connections
 *   4. Start portal server with --cli-url localhost:3848
 *
 * Standalone mode (--standalone):
 *   Starts portal server without CLI — spawns its own CLI subprocess.
 *
 * Restart support:
 *   Exit code 75 triggers a relaunch of the portal server.
 */
import { spawn, spawnSync, exec } from 'node:child_process';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CLI_PORT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(__dirname, 'server.js');
const args = process.argv.slice(2);

const RESTART_CODE = 75;
const CLI_PORT = DEFAULT_CLI_PORT;

const standalone = args.includes('--standalone');
// Remove --standalone from args passed to server (it doesn't know about it)
const serverArgs = args.filter(a => a !== '--standalone');

/** Check if a TCP port is accepting connections */
function isPortListening(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const sock = net.createConnection({ port, host: 'localhost' }, () => {
			sock.destroy();
			resolve(true);
		});
		sock.on('error', () => resolve(false));
		sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
	});
}

/** Wait for a port to start listening, with timeout */
async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await isPortListening(port)) return true;
		await new Promise(r => setTimeout(r, 500));
	}
	return false;
}

/** Launch the CLI as a headless JSON-RPC server. Returns true if launch was attempted. */
function launchCli(port: number): boolean {
	if (process.platform === 'win32') {
		// Resolve full path to copilot.exe so Start-Process can find it
		const which = spawnSync('where.exe', ['copilot.exe'], { stdio: 'pipe', windowsHide: true });
		if (which.status !== 0) {
			console.error(`[Launcher] copilot.exe not found on PATH.`);
			console.error(`[Launcher] Install GitHub Copilot CLI: winget install GitHub.CopilotCLI`);
			return false;
		}
		const copilotPath = which.stdout.toString().trim().split(/\r?\n/)[0];
		exec(`pwsh -NoProfile -Command "Start-Process -FilePath '${copilotPath}' -ArgumentList '--server','--port','${port}' -WindowStyle Hidden"`, { windowsHide: true },
			(err) => {
				if (err) {
					console.error(`[Launcher] Failed to launch CLI: ${err.message}`);
					cliLaunched = false;
				}
			});
	} else {
		const child = spawn('copilot', ['--server', '--port', String(port)], {
			stdio: 'ignore',
			detached: true,
		});
		child.on('error', (err) => {
			console.error(`[Launcher] Failed to spawn copilot: ${err.message}`);
			console.error(`[Launcher] Install GitHub Copilot CLI: https://docs.github.com/copilot/how-tos/copilot-cli`);
			cliLaunched = false;
		});
		child.unref();
	}
	cliLaunched = true;
	console.log(`[Launcher] CLI server started`);
	return true;
}

let cliLaunched = false;

/** Stop the CLI server process if we launched it */
function stopCli(): void {
	if (!cliLaunched) return;
	cliLaunched = false;
	console.log(`[Launcher] Stopping CLI server...`);
	try {
		if (process.platform === 'win32') {
			// spawnSync so it works in 'exit' handler (synchronous only)
			spawnSync('pwsh', ['-NoProfile', '-Command',
				`Get-NetTCPConnection -LocalPort ${CLI_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
			], { stdio: 'ignore', windowsHide: true });
		}
	} catch { /* already dead */ }
}

async function start() {
	// Set terminal tab title
	process.stdout.write('\x1b]0;Copilot Portal\x07');

	let cliUrl: string | undefined;

	if (!standalone) {
		// Check if --cli-url was explicitly provided
		const cliUrlIdx = serverArgs.indexOf('--cli-url');
		if (cliUrlIdx !== -1 && cliUrlIdx + 1 < serverArgs.length) {
			cliUrl = serverArgs[cliUrlIdx + 1];
			console.log(`[Launcher] Using provided CLI server: ${cliUrl}`);
		} else {
			// Auto-detect or launch CLI server
			const alreadyRunning = await isPortListening(CLI_PORT);
			if (alreadyRunning) {
				console.log(`[Launcher] CLI server detected on port ${CLI_PORT}`);
			} else {
				console.log(`[Launcher] Starting CLI server (port ${CLI_PORT})...`);
				const launched = launchCli(CLI_PORT);
				if (launched) {
					const ready = await waitForPort(CLI_PORT, 30000);
					if (!ready) {
						console.log(`[Launcher] CLI server did not start within 30s — falling back to standalone mode`);
					}
				} else {
					console.log(`[Launcher] Falling back to standalone mode`);
				}
			}
			if (await isPortListening(CLI_PORT)) {
				cliUrl = `localhost:${CLI_PORT}`;
			}
		}
	}

	if (cliUrl) {
		console.log(`[Launcher] Connecting to CLI server at ${cliUrl}`);
	} else {
		console.log(`[Launcher] Standalone mode — spawning own CLI subprocess`);
	}

	launch(cliUrl);
}

function launch(cliUrl?: string) {
	const extraArgs = cliUrl ? ['--cli-url', cliUrl] : [];
	const child = spawn(process.execPath, [serverScript, ...serverArgs, ...extraArgs], {
		cwd: process.cwd(),
		stdio: 'inherit',
	});

	child.on('exit', (code) => {
		if (code === RESTART_CODE) {
			console.log('\n[Launcher] Restarting server...\n');
			// Don't stop CLI server on restart — it stays running
			launch(cliUrl);
		} else {
			stopCli(); // clean up CLI server on normal exit
			process.exit(code ?? 0);
		}
	});

	// Forward SIGINT/SIGTERM to child and clean up CLI
	const forward = (sig: NodeJS.Signals) => {
		child.kill(sig);
	};
	process.on('SIGINT', () => { forward('SIGINT'); stopCli(); });
	process.on('SIGTERM', () => { forward('SIGTERM'); stopCli(); });
	// Catch-all: clean up CLI on any exit (e.g. terminal window closed)
	process.on('exit', () => stopCli());
}

start();
