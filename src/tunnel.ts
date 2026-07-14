import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export interface TunnelConfig {
	name: string;
	allowAnonymous: boolean;
	wasRunning?: boolean;
}

export interface TunnelState {
	running: boolean;
	url?: string;
	config?: TunnelConfig;
}

export class TunnelManager {
	private process: ChildProcess | null = null;
	private url: string | null = null;
	private config: TunnelConfig | null = null;
	private configPath: string;
	private port: number;

	private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
	private log: ((msg: string) => void) | null = null;

	constructor(dataDir: string, port: number) {
		this.configPath = join(dataDir, 'tunnel.json');
		this.port = port;
		this.loadConfig();
	}

	private loadConfig(): void {
		try {
			if (existsSync(this.configPath)) {
				this.config = JSON.parse(readFileSync(this.configPath, 'utf8'));
			}
		} catch { /* ignore corrupt config */ }
	}

	private saveConfig(config: TunnelConfig): void {
		this.config = config;
		writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n');
	}

	/** Check if devtunnel CLI is available */
	isInstalled(): boolean {
		try {
			execSync(process.platform === 'win32' ? 'where.exe devtunnel' : 'which devtunnel', { stdio: 'ignore' });
			return true;
		} catch { return false; }
	}

	/** Check if user is logged in */
	isLoggedIn(): boolean {
		try {
			const result = execSync('devtunnel user show', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
			return result.includes('Logged in');
		} catch { return false; }
	}

	/** Generate a random tunnel name */
	static generateName(): string {
		return `portal-${randomBytes(4).toString('hex')}`;
	}

	/** Check if a named tunnel already exists */
	private tunnelExists(name: string): boolean {
		try {
			execSync(`devtunnel show ${name}`, { stdio: 'ignore' });
			return true;
		} catch { return false; }
	}

	/** Create a named tunnel with port forwarding */
	private createTunnel(name: string, allowAnonymous: boolean): void {
		const anonFlag = allowAnonymous ? ' --allow-anonymous' : '';
		execSync(`devtunnel create ${name}${anonFlag}`, { stdio: 'ignore' });
		execSync(`devtunnel port create ${name} -p ${this.port}`, { stdio: 'ignore' });
	}

	/** Start hosting the tunnel, returns the public URL */
	async start(config: TunnelConfig): Promise<string> {
		if (this.process) {
			throw new Error('Tunnel is already running');
		}

		// Ensure tunnel exists
		if (!this.tunnelExists(config.name)) {
			this.createTunnel(config.name, config.allowAnonymous);
		}

		this.saveConfig(config);
		this.setWasRunning(true);

		return new Promise<string>((resolve, reject) => {
			const proc = spawn('devtunnel', ['host', config.name], {
				stdio: ['pipe', 'pipe', 'pipe'],
				windowsHide: true,
			});
			this.process = proc;

			let output = '';
			const timeout = setTimeout(() => {
				reject(new Error('Tunnel failed to start within 15 seconds'));
				this.stop();
			}, 15000);

			proc.stdout?.on('data', (data: Buffer) => {
				output += data.toString();
				// Look for the connect URL
				const match = output.match(/Connect via browser:\s+(https:\/\/\S+)/);
				if (match) {
					clearTimeout(timeout);
					this.url = match[1];
					resolve(this.url);
				}
			});

			proc.stderr?.on('data', (data: Buffer) => {
				output += data.toString();
			});

			proc.on('error', (err) => {
				clearTimeout(timeout);
				this.process = null;
				reject(err);
			});

			proc.on('exit', (code) => {
				clearTimeout(timeout);
				this.process = null;
				this.url = null;
				if (code !== 0 && code !== null) {
					reject(new Error(`devtunnel exited with code ${code}: ${output.trim()}`));
				}
			});
		});
	}

	/** Stop the tunnel (user-initiated — clears wasRunning so it won't auto-restart) */
	stop(): void {
		this.stopHealthCheck();
		this.setWasRunning(false);
		this.killProcess();
	}

	/** Shutdown the tunnel process (preserves wasRunning for auto-restart on next launch) */
	shutdown(): void {
		this.stopHealthCheck();
		this.killProcess();
	}

	private killProcess(): void {
		if (this.process) {
			const pid = this.process.pid;
			this.process.kill('SIGINT');
			// Give it a moment, then force kill
			setTimeout(() => {
				try { if (pid) process.kill(pid, 0); process.kill(pid!, 'SIGKILL'); } catch { /* already dead */ }
			}, 3000);
			this.process = null;
			this.url = null;
		}
	}

	/** Persist running flag so tunnel can auto-restart after server restart */
	private setWasRunning(running: boolean): void {
		if (this.config) {
			this.config.wasRunning = running;
			this.saveConfig(this.config);
		}
	}

	/** Check if tunnel should auto-start (was running before server restart) */
	shouldAutoStart(): boolean {
		return this.config?.wasRunning === true;
	}

	/** Get current state */
	getState(): TunnelState {
		return {
			running: this.process !== null,
			url: this.url ?? undefined,
			config: this.config ?? undefined,
		};
	}

	/** Get the stored config (if any) */
	getConfig(): TunnelConfig | null {
		return this.config;
	}

	/** Check if config exists */
	hasConfig(): boolean {
		return this.config !== null;
	}

	/** Delete the tunnel from devtunnel service and remove local config */
	reset(): { deleted: boolean; name?: string } {
		this.stop();
		const config = this.config;
		if (config) {
			try {
				execSync(`devtunnel delete ${config.name} --force`, { stdio: 'ignore' });
			} catch { /* tunnel may not exist */ }
			try {
				if (existsSync(this.configPath)) unlinkSync(this.configPath);
			} catch {}
			this.config = null;
			return { deleted: true, name: config.name };
		}
		return { deleted: false };
	}

	/** Start periodic health checks — restarts tunnel if the relay connection goes stale. */
	startHealthCheck(getToken: () => string, onRestart: (url: string) => void, logFn: (msg: string) => void): void {
		this.stopHealthCheck();
		this.log = logFn;
		this.healthCheckTimer = setInterval(async () => {
			if (!this.process || !this.url) return;
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 10000);
				const resp = await fetch(`${this.url}/api/info?token=${getToken()}`, { signal: controller.signal });
				clearTimeout(timeout);
				if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
			} catch {
				this.log?.(`[Tunnel] Health check failed — restarting tunnel`);
				const config = this.config;
				if (!config) return;
				this.stop();
				try {
					const newUrl = await this.start(config);
					this.log?.(`[Tunnel] Restarted: ${newUrl}`);
					onRestart(newUrl);
				} catch (e) {
					this.log?.(`[Tunnel] Restart failed: ${e}`);
				}
			}
		}, 5 * 60 * 1000); // Every 5 minutes
	}

	stopHealthCheck(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
			this.healthCheckTimer = null;
		}
	}
}
