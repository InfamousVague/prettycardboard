#!/usr/bin/env node
/**
 * One-shot production redeploy for PrettyCardboard.
 *
 *   npm run redeploy            # web + API
 *   npm run redeploy -- web     # web (SPA) only
 *   npm run redeploy -- api     # API (Rust server) only
 *
 * Target credentials come from the gitignored `.env` at the repo root:
 *   PC_DEPLOY_HOST, PC_DEPLOY_USER, PC_DEPLOY_PASS
 *
 * What it does, matching the live layout on the Vultr box:
 *   web → build (same-origin API) then rsync dist/ into /var/www/prettycardboard
 *         (owned by caddy), a clean mirror.
 *   api → cross-compile the Rust server to Linux glibc with cargo-zigbuild
 *         (the box has no cargo), ship the binary to /opt/prettycardboard/bin,
 *         and restart the systemd service. /opt/prettycardboard/data (SQLite)
 *         is never touched, so persisted rooms/accounts survive.
 *
 * Requires on this machine: node, rsync, sshpass, cargo-zigbuild + zig, the
 * rustup target x86_64-unknown-linux-gnu. Missing tools are reported up front.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// --- remote layout (from the live server) ---
const WEB_ROOT = '/var/www/prettycardboard';
const WEB_OWNER = 'caddy:caddy';
const BIN_REMOTE = '/opt/prettycardboard/bin/prettycardboard-server';
const SERVICE = 'prettycardboard';
const RUST_TARGET = 'x86_64-unknown-linux-gnu.2.35'; // glibc pin for broad compatibility
const RUST_TARGET_DIR = 'x86_64-unknown-linux-gnu';
const DOMAIN = 'https://prettycardboard.com';

const c = {
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function fail(message) {
  console.error(`\n${c.red('✗')} ${message}\n`);
  process.exit(1);
}

/** Parse KEY=VALUE lines; value is everything after the first '=' (creds may hold punctuation). */
function loadEnv() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) fail(`No .env at ${path} (needs PC_DEPLOY_HOST/USER/PASS).`);
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  for (const key of ['PC_DEPLOY_HOST', 'PC_DEPLOY_USER', 'PC_DEPLOY_PASS']) {
    if (!env[key]) fail(`.env is missing ${key}.`);
  }
  return env;
}

function has(tool) {
  return spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;
}

function step(label) {
  console.log(`\n${c.cyan('▸')} ${c.bold(label)}`);
}

/** Run a command with stdout/stderr inherited; secrets ride in env, never argv. */
function run(cmd, args, { pass, cwd, extraEnv } = {}) {
  const env = { ...process.env, ...extraEnv };
  if (pass) env.SSHPASS = pass;
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: cwd ?? ROOT, env });
  if (result.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${result.status ?? result.signal}`);
}

/** SSH a remote command, returning trimmed stdout (throws on failure unless allowFail). */
function ssh(env, remoteCmd, { allowFail = false } = {}) {
  const target = `${env.PC_DEPLOY_USER}@${env.PC_DEPLOY_HOST}`;
  const result = spawnSync(
    'sshpass',
    ['-e', 'ssh', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=20', target, remoteCmd],
    { env: { ...process.env, SSHPASS: env.PC_DEPLOY_PASS }, encoding: 'utf8' },
  );
  if (result.status !== 0 && !allowFail) {
    process.stderr.write(result.stderr ?? '');
    fail(`remote command failed: ${remoteCmd}`);
  }
  return (result.stdout ?? '').trim();
}

function httpStatus(url) {
  try {
    return execFileSync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '20', url], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '000';
  }
}

// --------------------------------------------------------------------------

function deployWeb(env) {
  step('Building the web app (same-origin API)');
  // VITE_PC_SERVER='' (defined-but-empty) makes the client call the same origin;
  // leaving it UNSET would fall back to http://127.0.0.1:8787 and break prod.
  run('npm', ['run', 'build'], { cwd: ROOT, extraEnv: { VITE_PC_SERVER: '' } });

  step(`Uploading dist/ → ${WEB_ROOT}`);
  const target = `${env.PC_DEPLOY_USER}@${env.PC_DEPLOY_HOST}`;
  // sshpass must wrap ssh DIRECTLY (as rsync's transport), not wrap rsync —
  // otherwise the password never reaches the ssh rsync spawns as a grandchild.
  run(
    'rsync',
    [
      '-az', '--delete',
      '-e', 'sshpass -e ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20',
      `${join(ROOT, 'dist')}/`,
      `${target}:${WEB_ROOT}/`,
    ],
    { pass: env.PC_DEPLOY_PASS },
  );

  step('Fixing ownership');
  ssh(env, `chown -R ${WEB_OWNER} ${WEB_ROOT}`);
  console.log(c.green('  web deployed'));
}

function deployApi(env) {
  step(`Cross-compiling the API → Linux (${RUST_TARGET})`);
  run('cargo', ['zigbuild', '--release', '--target', RUST_TARGET], { cwd: join(ROOT, 'server') });
  const bin = join(ROOT, 'server', 'target', RUST_TARGET_DIR, 'release', 'prettycardboard-server');
  if (!existsSync(bin)) fail(`built binary not found at ${bin}`);

  step('Shipping the binary + restarting the service');
  const target = `${env.PC_DEPLOY_USER}@${env.PC_DEPLOY_HOST}`;
  // Upload beside the live binary, then swap under a brief service stop so the
  // running ELF is never "text file busy". data/ (SQLite) is untouched.
  run(
    'sshpass',
    ['-e', 'scp', '-o', 'StrictHostKeyChecking=accept-new', bin, `${target}:${BIN_REMOTE}.new`],
    { pass: env.PC_DEPLOY_PASS },
  );
  ssh(
    env,
    `chmod +x ${BIN_REMOTE}.new && systemctl stop ${SERVICE} && mv ${BIN_REMOTE}.new ${BIN_REMOTE} && systemctl start ${SERVICE}`,
  );
  const active = ssh(env, `systemctl is-active ${SERVICE}`, { allowFail: true });
  if (active !== 'active') fail(`service ${SERVICE} is '${active}' after restart — check: journalctl -u ${SERVICE} -n50`);
  console.log(c.green('  API deployed, service active'));
}

function verify(what) {
  step('Verifying');
  const checks = [];
  if (what.web) {
    checks.push(['site', `${DOMAIN}/`, '200']);
    checks.push(['playmat asset', `${DOMAIN}/mats/forest.webp`, '200']);
    checks.push(['card back asset', `${DOMAIN}/backs/classic.jpg`, '200']);
  }
  if (what.api) checks.push(['API (401 = up, unauth)', `${DOMAIN}/api/me`, '401']);
  let ok = true;
  for (const [label, url, want] of checks) {
    const got = httpStatus(url);
    const good = got === want;
    ok = ok && good;
    console.log(`  ${good ? c.green('✓') : c.red('✗')} ${label} ${c.dim(`→ ${got}`)}`);
  }
  if (!ok) fail('one or more post-deploy checks failed.');
}

// --------------------------------------------------------------------------

const arg = (process.argv[2] || 'all').toLowerCase();
const what = { web: arg === 'all' || arg === 'web', api: arg === 'all' || arg === 'api' };
if (!what.web && !what.api) fail(`unknown target '${arg}' (use: all | web | api)`);

const env = loadEnv();

// Preflight tool checks (only for what we'll actually do).
const need = ['rsync', 'sshpass', 'curl'];
if (what.web) need.push('npm');
if (what.api) need.push('cargo-zigbuild', 'zig');
const missing = need.filter((tool) => !has(tool));
if (missing.length) {
  fail(
    `missing tools: ${missing.join(', ')}\n` +
      `  brew install ${missing.filter((m) => ['sshpass', 'cargo-zigbuild', 'zig'].includes(m)).join(' ') || '…'}` +
      (what.api ? `\n  rustup target add x86_64-unknown-linux-gnu` : ''),
  );
}

console.log(c.bold(`\nPrettyCardboard redeploy → ${env.PC_DEPLOY_HOST}  (${arg})`));

// Auth preflight: prove the credentials work before spending time on a build.
step('Checking SSH access');
const whoami = ssh(env, 'whoami', { allowFail: true });
if (whoami !== env.PC_DEPLOY_USER) {
  fail(
    `could not authenticate to ${env.PC_DEPLOY_USER}@${env.PC_DEPLOY_HOST}.\n` +
      `  • Check PC_DEPLOY_PASS in .env is current (creds were going to be rotated).\n` +
      `  • If the server is now key-only, password auth won't work.\n` +
      `  • Quick manual test:  sshpass -e ssh ${env.PC_DEPLOY_USER}@${env.PC_DEPLOY_HOST} whoami   (with SSHPASS exported)`,
  );
}
console.log(c.green(`  authenticated as ${whoami}`));
if (what.api) console.log(c.dim('  note: the API restart briefly drops live games; persisted rooms reload on boot.'));

if (what.web) deployWeb(env);
if (what.api) deployApi(env);
verify(what);

console.log(`\n${c.green(c.bold('✓ redeploy complete'))}  ${c.dim(DOMAIN)}\n`);
