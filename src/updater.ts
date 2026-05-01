/**
 * Update checker — periodically polls the npm registry for newer versions
 * of key dependencies and exposes the results via a simple API.
 */
import * as https from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { getGitHubToken } from './github-token.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

export interface PackageUpdate {
	name: string;
	installed: string;
	latest: string;
	hasUpdate: boolean;
}

export interface PortalUpdate {
	installed: string;
	latest: string;
	hasUpdate: boolean;
	downloadUrl: string | null;
}

export interface UpdateStatus {
	packages: PackageUpdate[];
	portal: PortalUpdate | null;
	lastChecked: number | null;  // ms epoch
	checking: boolean;
	applying: boolean;
	restartNeeded: boolean;
	error: string | null;
}

/** Packages to monitor for updates */
const TRACKED_PACKAGES = ['@github/copilot-sdk'] as const;

/** How often to auto-check (ms) — default 4 hours, configurable via SQUAD_UPDATE_INTERVAL */
const CHECK_INTERVAL_MS = parseInt(process.env.SQUAD_UPDATE_INTERVAL || String(4 * 60 * 60 * 1000), 10);

export class UpdateChecker {
	private packages: PackageUpdate[] = [];
	private portal: PortalUpdate | null = null;
	private lastChecked: number | null = null;
	private checking = false;
	private applying = false;
	private portalRestartNeeded = false;
	private error: string | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	private log: (msg: string) => void;
	/** Versions at process start — if on-disk versions differ after an apply, restart is needed */
	private startupVersions: Record<string, string> = {};
	private hasLoggedVersions = false;
	private repoOwner: string;
	private repoName: string;

	constructor(log: (msg: string) => void) {
		this.log = log;
		// Snapshot versions at startup
		for (const name of TRACKED_PACKAGES) {
			const v = getInstalledVersion(name);
			if (v) this.startupVersions[name] = v;
		}
		const cliV = getInstalledVersion('@github/copilot');
		if (cliV) this.startupVersions['@github/copilot'] = cliV;
		// Parse GitHub repo from package.json for portal self-update
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
			const repoUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url ?? '';
			const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
			this.repoOwner = match?.[1] ?? '';
			this.repoName = match?.[2] ?? '';
		} catch {
			this.repoOwner = '';
			this.repoName = '';
		}
	}

	/** Start periodic checking. First check runs immediately. */
	start(): void {
		this.check(); // fire-and-forget first check
		this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
	}

	stop(): void {
		if (this.timer) { clearInterval(this.timer); this.timer = null; }
	}

	/** Current status snapshot */
	getStatus(): UpdateStatus {
		return {
			packages: this.packages,
			portal: this.portal,
			lastChecked: this.lastChecked,
			checking: this.checking,
			applying: this.applying,
			restartNeeded: this.isRestartNeeded(),
			error: this.error,
		};
	}

	/** True if on-disk versions differ from what this process loaded at startup */
	private isRestartNeeded(): boolean {
		if (this.portalRestartNeeded) return true;
		for (const [name, startVer] of Object.entries(this.startupVersions)) {
			const currentOnDisk = getInstalledVersion(name);
			if (currentOnDisk && currentOnDisk !== startVer) return true;
		}
		return false;
	}

	/** Returns true if any tracked package has an update available */
	get hasUpdates(): boolean {
		return this.packages.some(p => p.hasUpdate);
	}

	/** Manually trigger a check */
	async check(): Promise<UpdateStatus> {
		if (this.checking) return this.getStatus();
		this.checking = true;
		this.error = null;
		try {
			const results: PackageUpdate[] = [];
			const versionChecks = TRACKED_PACKAGES.map(async (name) => {
				const installed = getInstalledVersion(name);
				const latest = await fetchLatestVersion(name, this.log);
				const hasUpdate = !!(installed && latest && latest !== installed && isNewer(latest, installed));
				return { name, installed: installed ?? 'unknown', latest: latest ?? 'unknown', hasUpdate };
			});
			// Also check the CLI binary version (bundled as @github/copilot via copilot-sdk)
			const cliCheck = (async () => {
				const cliInstalled = getInstalledVersion('@github/copilot');
				const cliLatest = await fetchLatestVersion('@github/copilot', this.log);
				const cliHasUpdate = !!(cliInstalled && cliLatest && cliLatest !== cliInstalled && isNewer(cliLatest, cliInstalled));
				return { name: '@github/copilot', installed: cliInstalled ?? 'unknown', latest: cliLatest ?? 'unknown', hasUpdate: cliHasUpdate };
			})();
			results.push(...await Promise.all([...versionChecks, cliCheck]));

			this.packages = results;
			this.lastChecked = Date.now();

			// Check for portal self-update via GitHub Releases
			if (this.repoOwner && this.repoName) {
				this.log(`[Update] Checking portal releases for ${this.repoOwner}/${this.repoName}...`);
				try {
					const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
					const installed = pkg.version ?? 'unknown';
					const release = await fetchLatestRelease(this.repoOwner, this.repoName, this.log);
					if (release) {
						const latestVer = release.tag.replace(/^v/, '');
						const hasUpdate = isNewer(latestVer, installed);
						this.portal = { installed, latest: latestVer, hasUpdate, downloadUrl: release.zipUrl };
						if (hasUpdate) {
							this.log(`[Update] Portal update available: v${installed} → v${latestVer}`);
						} else {
							this.log(`[Update] Portal v${installed} is up to date (latest: v${latestVer})`);
						}
					} else {
						this.log(`[Update] No release found for ${this.repoOwner}/${this.repoName}`);
					}
				} catch (e) {
					this.log(`[Update] Portal version check failed: ${e}`);
				}
			} else {
				this.log(`[Update] No repository configured — skipping portal update check`);
			}

			// Log installed versions on first check (startup)
			if (!this.hasLoggedVersions) {
				this.hasLoggedVersions = true;
				for (const p of results) {
					this.log(`[Version] ${p.name} ${p.installed}`);
				}
			}

			const updatable = results.filter(p => p.hasUpdate);
			if (updatable.length > 0) {
				this.log(`[Update] Updates available: ${updatable.map(p => `${p.name} ${p.installed} → ${p.latest}`).join(', ')}`);
			} else {
				this.log(`[Update] All packages up to date`);
			}
		} catch (e) {
			this.error = String(e);
			this.log(`[Update] Check failed: ${this.error}`);
		} finally {
			this.checking = false;
		}
		return this.getStatus();
	}

	/** Apply available updates: npm update + rebuild. Returns the new status. */
	async apply(): Promise<UpdateStatus> {
		if (this.applying) return this.getStatus();
		this.applying = true;
		this.error = null;
		try {
			this.log(`[Update] Applying updates...`);

			// Update packages. Use `npm install pkg@latest` instead of `npm update`
			// because npm update respects the semver range in package.json (e.g. ^0.1.32
			// won't update to 0.2.0). Install @latest forces the newest version.
			const updatable = this.packages.filter(p => p.hasUpdate).map(p => `${p.name}@latest`);
			if (updatable.length > 0) {
				await runCommand(`npm install --no-fund --no-audit ${updatable.join(' ')}`, PROJECT_ROOT);
				this.log(`[Update] npm install complete`);
			}

			// 2. Rebuild the server and UI (skip if no build script — e.g. release packages ship pre-built)
			const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf8'));
			if (pkg.scripts?.build) {
				await runCommand('npm run build', PROJECT_ROOT);
				this.log(`[Update] Rebuild complete`);
			} else {
				this.log(`[Update] No build script — skipping rebuild (pre-built release)`);
			}

			// 3. Re-check versions so the status reflects post-update state
			await this.check();

			this.log(`[Update] Update applied successfully. Restart required to use new versions.`);
		} catch (e) {
			this.error = String(e);
			this.log(`[Update] Apply failed: ${this.error}`);
		} finally {
			this.applying = false;
		}
		return this.getStatus();
	}

	/** Download and extract a portal update from GitHub Releases */
	async applyPortalUpdate(): Promise<UpdateStatus> {
		if (this.applying || !this.portal?.hasUpdate || !this.portal.downloadUrl) return this.getStatus();
		this.applying = true;
		this.error = null;
		try {
			this.log(`[Update] Downloading portal v${this.portal.latest}...`);
			const zipPath = path.join(PROJECT_ROOT, 'portal-update.zip');
			await downloadFile(this.portal.downloadUrl, zipPath, this.log);
			this.log(`[Update] Extracting update...`);
			// Extract zip — overwrite existing files
			if (process.platform === 'win32') {
				await runCommand(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${PROJECT_ROOT}' -Force"`, PROJECT_ROOT);
			} else {
				await runCommand(`unzip -o "${zipPath}" -d "${PROJECT_ROOT}"`, PROJECT_ROOT);
			}
			// Clean up zip
			try { fs.unlinkSync(zipPath); } catch { /* ignore */ }
			this.log(`[Update] Portal updated to v${this.portal.latest}. Restart required.`);
			this.portalRestartNeeded = true;
			// Mark as needing restart
			this.portal = { ...this.portal, hasUpdate: false };
		} catch (e) {
			this.error = String(e);
			this.log(`[Update] Portal update failed: ${this.error}`);
			// Clean up partial download
			try { fs.unlinkSync(path.join(PROJECT_ROOT, 'portal-update.zip')); } catch { /* ignore */ }
		} finally {
			this.applying = false;
		}
		return this.getStatus();
	}
}

/** Read the installed version of a package from its package.json in node_modules */
function getInstalledVersion(name: string): string | null {
	try {
		const pkgPath = path.join(PROJECT_ROOT, 'node_modules', ...name.split('/'), 'package.json');
		const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
		return pkg.version ?? null;
	} catch {
		return null;
	}
}

/** Fetch the latest published version from the npm registry */
function fetchLatestVersion(name: string, log?: (msg: string) => void): Promise<string | null> {
	return new Promise((resolve) => {
		const url = `https://registry.npmjs.org/${name}/latest`;
		const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: 10_000 }, (res) => {
			if (res.statusCode !== 200) { log?.(`[Update] Registry returned ${res.statusCode} for ${name}`); resolve(null); res.resume(); return; }
			let body = '';
			res.on('data', (chunk: Buffer) => { body += chunk; });
			res.on('end', () => {
				try {
					const data = JSON.parse(body);
					resolve(data.version ?? null);
				} catch { resolve(null); }
			});
		});
		req.on('error', (e) => { log?.(`[Update] Network error fetching ${name}: ${(e as Error).message}`); resolve(null); });
		req.on('timeout', () => { log?.(`[Update] Timeout fetching ${name}`); req.destroy(); resolve(null); });
	});
}

/** Simple semver comparison: is `a` newer than `b`? (handles x.y.z format) */
function isNewer(a: string, b: string): boolean {
	const pa = a.replace(/^v/, '').split('.').map(Number);
	const pb = b.replace(/^v/, '').split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const va = pa[i] ?? 0;
		const vb = pb[i] ?? 0;
		if (va > vb) return true;
		if (va < vb) return false;
	}
	return false;
}

/** Run a shell command and return stdout. Rejects on non-zero exit. */
function runCommand(cmd: string, cwd: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(cmd, { cwd, timeout: 10 * 60 * 1000 }, (err, stdout, stderr) => {
			if (err) {
				const details = [stderr, stdout, err.message].filter(s => s?.trim()).join('\n');
				reject(new Error(`${cmd} failed: ${details}`));
			}
			else resolve(stdout);
		});
	});
}

/** Fetch the latest releasefrom GitHub Releases API (tries unauthenticated first, falls back to auth for private repos) */
function fetchLatestRelease(owner: string, repo: string, log?: (msg: string) => void): Promise<{ tag: string; zipUrl: string } | null> {
	const doFetch = (token?: string): Promise<{ tag: string; zipUrl: string } | null> => new Promise((resolve) => {
		const url = `/repos/${owner}/${repo}/releases/latest`;
		const headers: Record<string, string> = { 'User-Agent': 'copilot-portal', Accept: 'application/vnd.github+json' };
		if (token) headers['Authorization'] = `Bearer ${token}`;
		const req = https.get({
			hostname: 'api.github.com',
			path: url,
			headers,
			timeout: 10_000,
		}, (res) => {
			if (res.statusCode === 404 && !token) {
				// Private repo — resolve null to trigger auth fallback
				resolve(null); res.resume(); return;
			}
			if (res.statusCode !== 200) { log?.(`[Update] GitHub API returned ${res.statusCode} for releases`); resolve(null); res.resume(); return; }
			let body = '';
			res.on('data', (chunk: Buffer) => { body += chunk; });
			res.on('end', () => {
				try {
					const data = JSON.parse(body);
					const tag = data.tag_name ?? '';
					// Find the first .zip asset
					const asset = (data.assets ?? []).find((a: { name: string }) => a.name.endsWith('.zip'));
					// For private repos, use API URL (requires auth + Accept: application/octet-stream)
					// For public repos, browser_download_url works without auth
					const zipUrl = (token ? asset?.url : asset?.browser_download_url) ?? null;
					resolve(tag && zipUrl ? { tag, zipUrl } : null);
				} catch { resolve(null); }
			});
		});
		req.on('error', (e) => { log?.(`[Update] GitHub API error: ${(e as Error).message}`); resolve(null); });
		req.on('timeout', () => { log?.(`[Update] GitHub API timeout`); req.destroy(); resolve(null); });
	});

	// Try unauthenticated first, fall back to authenticated for private repos
	return doFetch().then(result => {
		if (result) return result;
		const token = getGitHubToken();
		if (!token) return null;
		log?.(`[Update] Retrying with auth token...`);
		return doFetch(token);
	});
}

/** Download a file from a URL (follows redirects, uses GitHub auth for private repos) to a local path */
function downloadFile(url: string, dest: string, log?: (msg: string) => void): Promise<void> {
	const token = getGitHubToken();
	return new Promise((resolve, reject) => {
		const doGet = (getUrl: string, redirects = 0) => {
			if (redirects > 5) { reject(new Error('Too many redirects')); return; }
			const headers: Record<string, string> = { 'User-Agent': 'copilot-portal', Accept: 'application/octet-stream' };
			// Only send auth to exact GitHub domains (don't leak token to crafted redirects)
			const TRUSTED_HOSTS = ['github.com', 'api.github.com', 'githubusercontent.com', 'objects.githubusercontent.com'];
			if (token) {
				try {
					const parsedUrl = new URL(getUrl);
					if (TRUSTED_HOSTS.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
						headers['Authorization'] = `Bearer ${token}`;
					}
				} catch { /* malformed URL — don't send auth */ }
			}
			const req = https.get(getUrl, { headers, timeout: 60_000 }, (res) => {
				if (res.statusCode === 302 || res.statusCode === 301) {
					const loc = res.headers.location;
					if (loc) { res.resume(); doGet(loc, redirects + 1); return; }
				}
				if (res.statusCode !== 200) { reject(new Error(`Download failed: HTTP ${res.statusCode}`)); res.resume(); return; }
				const file = fs.createWriteStream(dest);
				res.pipe(file);
				file.on('finish', () => { file.close(); resolve(); });
				file.on('error', (e) => { fs.unlinkSync(dest); reject(e); });
			});
			req.on('error', reject);
			req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
		};
		doGet(url);
	});
}
