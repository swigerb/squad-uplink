import { execSync } from 'node:child_process';

/** Get a GitHub token from environment or gh CLI */
export function getGitHubToken(): string | null {
	if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
	if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
	try {
		return execSync('gh auth token', { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }).toString().trim() || null;
	} catch { return null; }
}
