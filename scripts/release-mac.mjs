#!/usr/bin/env node
/**
 * Build + Developer-ID sign + Apple-notarize the macOS desktop app locally,
 * then upload the .dmg and OTA artifacts (.app.tar.gz + .sig) to the GitHub
 * Release for the given tag, and refresh latest.json.
 *
 * macOS signing/notarization can't run reliably on GitHub's hosted runners
 * (the codesign keychain flow hangs), so — like Libre — the Mac build is
 * produced here and CI handles Windows + Linux.
 *
 *   npm run release:mac            # tag from src-tauri version (v<version>)
 *   npm run release:mac v0.1.0     # explicit tag
 *
 * Requires ./.env.apple (gitignored) with:
 *   APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID,
 *   APPLE_SIGNING_IDENTITY ("Developer ID Application: … (TEAMID)"),
 *   TAURI_SIGNING_PRIVATE_KEY_PATH, TAURI_SIGNING_PRIVATE_KEY_PASSWORD
 * and `gh` authenticated with push access to the repo.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = 'InfamousVague/prettycardboard';

function fail(msg) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m\n`);
  process.exit(1);
}
function step(s) {
  console.log(`\n\x1b[36m▸ \x1b[1m${s}\x1b[0m`);
}

// --- load .env.apple ---
const envPath = join(ROOT, '.env.apple');
if (!existsSync(envPath)) fail('.env.apple not found (Apple signing + updater key creds).');
const appleEnv = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq === -1) continue;
  appleEnv[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}
for (const k of ['APPLE_ID', 'APPLE_PASSWORD', 'APPLE_TEAM_ID', 'APPLE_SIGNING_IDENTITY', 'TAURI_SIGNING_PRIVATE_KEY_PATH']) {
  if (!appleEnv[k]) fail(`.env.apple missing ${k}`);
}
const keyPath = appleEnv.TAURI_SIGNING_PRIVATE_KEY_PATH.replace(/^~/, process.env.HOME);
if (!existsSync(keyPath)) fail(`updater key not found at ${keyPath}`);

// --- tag / version ---
const conf = JSON.parse(readFileSync(join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const tag = process.argv[2] || `v${version}`;
if (tag.replace(/^v/, '') !== version) {
  console.warn(`\x1b[33m! tag ${tag} != tauri.conf.json version ${version}\x1b[0m`);
}

const buildEnv = {
  ...process.env,
  APPLE_SIGNING_IDENTITY: appleEnv.APPLE_SIGNING_IDENTITY,
  APPLE_ID: appleEnv.APPLE_ID,
  APPLE_PASSWORD: appleEnv.APPLE_PASSWORD,
  APPLE_TEAM_ID: appleEnv.APPLE_TEAM_ID,
  // Tauri reads the key from the file content in this env var.
  TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, 'utf8'),
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: appleEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
};

function run(cmd, args, opts = {}) {
  const r = execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  return r;
}

console.log(`\x1b[1m\nPrettyCardboard macOS release → ${tag}\x1b[0m`);

step('Ensuring universal Rust targets');
run('rustup', ['target', 'add', 'aarch64-apple-darwin', 'x86_64-apple-darwin']);

step('Building + signing + notarizing (universal .dmg + OTA)');
// tauri auto-notarizes when APPLE_ID/_PASSWORD/_TEAM_ID are set and the
// identity is a Developer ID; --bundles app,dmg gives us the OTA tarball + dmg.
run('npm', ['run', 'tauri', '--', 'build', '--target', 'universal-apple-darwin', '--bundles', 'app,dmg'], {
  env: buildEnv,
});

step('Locating artifacts');
const bundleDir = join(ROOT, 'src-tauri', 'target', 'universal-apple-darwin', 'release', 'bundle');
const find = (pattern) =>
  execSync(`find "${bundleDir}" -name "${pattern}" 2>/dev/null | head -1`, { encoding: 'utf8' }).trim();
const dmg = find('*.dmg');
const tarball = find('*.app.tar.gz');
const sig = find('*.app.tar.gz.sig');
if (!dmg) fail('no .dmg produced');
if (!tarball || !sig) console.warn('\x1b[33m! OTA tarball/sig missing — was TAURI_SIGNING_PRIVATE_KEY valid?\x1b[0m');
console.log(`  dmg: ${dmg}`);
if (tarball) console.log(`  ota: ${tarball} (+ .sig)`);

step('Publishing to the GitHub Release');
// Create the release if it doesn't exist yet (idempotent); CI appends Win/Linux.
try {
  execSync(`gh release view "${tag}" --repo "${REPO}"`, { stdio: 'ignore' });
  console.log('  release exists — appending assets');
} catch {
  console.log('  creating release');
  run('gh', [
    'release', 'create', tag,
    '--repo', REPO,
    '--title', `PrettyCardboard ${tag}`,
    '--notes', 'Desktop installers for macOS, Windows, and Linux. The app auto-updates.',
  ]);
}
const assets = [dmg, tarball, sig].filter(Boolean);
run('gh', ['release', 'upload', tag, ...assets, '--repo', REPO, '--clobber']);

step('Refreshing latest.json (merges with any CI-uploaded platforms)');
run('node', [join(ROOT, 'scripts', 'build-updater-manifest.mjs'), tag]);

console.log(`\n\x1b[32m\x1b[1m✓ macOS release published to ${tag}\x1b[0m`);
console.log(`\x1b[2m  https://github.com/${REPO}/releases/tag/${tag}\x1b[0m\n`);
