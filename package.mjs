// package.mjs — Bump BUILD, build, and create a distributable zip.
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(import.meta.url), '..');
process.chdir(root);

// 1. Compute today's date prefix and bump BUILD (resets daily)
const now = new Date();
const yy = now.getUTCFullYear().toString().slice(2);
const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
const dd = String(now.getUTCDate()).padStart(2, '0');
const today = `${yy}${mm}${dd}`;

const buildRaw = readFileSync('BUILD', 'utf8').trim();
// BUILD file format: "YYMMDD-NN" (e.g. "260323-01") or legacy plain number
const match = buildRaw.match(/^(\d{6})-(\d+)$/);
const prevDate = match ? match[1] : '';
const prevNum = match ? parseInt(match[2], 10) : 0;
const buildNum = (prevDate === today) ? prevNum + 1 : 1;
const build = `${today}-${String(buildNum).padStart(2, '0')}`;
writeFileSync('BUILD', `${build}\n`);

// 2. Read version from package.json
const { version: pkgVersion } = JSON.parse(readFileSync('package.json', 'utf8'));
console.log(`\n  Version: ${pkgVersion}  Build: ${build}\n`);

// 3. Build
execSync('npm run build', { stdio: 'inherit' });

// 4. Stage files
const stamp = `copilot-portal-v${pkgVersion}-build-${build}`;
const stage = join(process.env.TEMP || '/tmp', stamp);
if (existsSync(stage)) rmSync(stage, { recursive: true });
mkdirSync(stage, { recursive: true });

const files = [
	'dist', 'bin', 'examples', 'patches', 'package.dist.json', 'patch.mjs', 'README.md', 'CHANGELOG.md', 'BUILD',
	'start-portal.cmd', 'start-portal.sh',
];
for (const f of files) {
	const dest = f === 'package.dist.json' ? join(stage, 'package.json') : join(stage, f);
	cpSync(f, dest, { recursive: true });
}

// 5. Create zip in releases/ directory
const releasesDir = join(root, 'releases');
if (!existsSync(releasesDir)) mkdirSync(releasesDir, { recursive: true });
const zipName = `${stamp}.zip`;
const zipPath = join(releasesDir, zipName);
if (existsSync(zipPath)) rmSync(zipPath);

if (process.platform === 'win32') {
	const ps = `$items = @(); Get-ChildItem -LiteralPath '${stage}' | ForEach-Object { $items += $_.FullName }; Compress-Archive -LiteralPath $items -DestinationPath '${zipPath}'`;
	execSync(`pwsh -NoProfile -Command "${ps}"`, { stdio: 'inherit' });
} else {
	execSync(`cd "${stage}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
}

// 6. Cleanup
rmSync(stage, { recursive: true });

console.log(`\n  ✔ ${zipName} created`);
console.log(`  ✔ BUILD bumped to ${buildNum}`);
console.log(`\n  Don't forget to commit the BUILD file!\n`);
