#!/usr/bin/env node
/**
 * One command to ship a desktop release: bump the version, tag it, build all
 * three platforms, and publish the OTA manifest.
 *
 *   npm run bump-n-distribute -- --dry-run     # print the plan, change nothing
 *   npm run bump-n-distribute                  # patch bump (0.5.3 -> 0.5.4)
 *   npm run bump-n-distribute -- minor         # 0.5.3 -> 0.6.0
 *   npm run bump-n-distribute -- 1.0.0         # explicit version
 *   yarn bump-n-distribute --dry-run           # yarn forwards args directly
 *
 * NOTE ON `npm run`: npm eats flags unless you separate them with `--`, so
 * `npm run bump-n-distribute --dry-run` would silently perform a REAL release.
 * Use `--` (or yarn, which forwards args as written). The script also rejects
 * unknown flags for exactly this reason.
 *
 * HOW THE THREE PLATFORMS GET BUILT (the part worth understanding):
 * pushing the `v*` tag starts `.github/workflows/desktop-build.yml`, which
 * builds **Windows + Linux** on their native runners and uploads signed OTA
 * artifacts to the release. **macOS is built HERE, locally**, because Apple
 * codesign + notarization does not run reliably on GitHub's hosted runners
 * (see scripts/release-mac.mjs). So the fastest correct order is:
 *
 *   push tag ─▶ CI starts Windows + Linux ─┐
 *                                          ├─▶ wait for CI ─▶ latest.json
 *   build/sign/notarize macOS locally ─────┘
 *
 * `build-updater-manifest.mjs` then merges every platform's `.sig` into one
 * `latest.json` so the OTA updater offers the update to all three. That final
 * merge is why this script waits for CI rather than finishing at the push.
 *
 * Options:
 *   --dry-run           plan only; no writes, no commit, no push, no build
 *   --yes, -y           skip the confirmation prompt
 *   --skip-mac          don't build macOS (use on Linux/Windows, or to add it
 *                       later with `npm run release:mac -- <tag>`)
 *   --skip-ci           don't wait for CI (skips the final manifest refresh)
 *   --allow-branch      release from a branch other than main
 *   --allow-dirty       fold uncommitted changes into the release commit
 *   --allow-downgrade   permit a version lower than the current one
 *   --allow-no-changelog  ship without an in-app changelog entry for this version
 *   --skip-checks       skip typecheck + web build (not recommended)
 *   --notes "text"      release notes (set before the manifest is built)
 *   --help, -h          this message
 *
 * Requirements: `gh` authenticated with push access; for the macOS half, a Mac
 * plus `.env.apple` (see scripts/release-mac.mjs for the key list).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = 'InfamousVague/prettycardboard';
const WORKFLOW = 'desktop-build.yml';
const MAIN_BRANCH = 'main';

const C = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};
const info = (s) => console.log(`  ${s}`);

/** Anything that went wrong AFTER the tag was pushed. The release is public by
 *  then, so we finish the remaining steps and report honestly at the end
 *  rather than exiting green on a half-shipped release. */
const problems = [];
function warn(s, recovery) {
  console.log(C.yellow(`  ! ${s}`));
  if (recovery) console.log(C.dim(`    → ${recovery}`));
}
function problem(s, recovery) {
  warn(s, recovery);
  problems.push({ s, recovery });
}
function fail(msg, hint) {
  console.error(`\n${C.red(`✗ ${msg}`)}`);
  if (hint) console.error(C.dim(`  ${hint}`));
  console.error('');
  process.exit(1);
}

/** Where we are, so an interrupt can tell the operator how to recover. */
let phase = 'preflight';
const RECOVERY = {
  preflight: 'Nothing was changed.',
  bumped: 'Version files were edited but not committed — `git checkout -- package.json src-tauri/tauri.conf.json`.',
  committed: 'A release commit exists locally, unpushed — `git reset --hard HEAD~1 && git tag -d <tag>`.',
  pushed: 'The tag is PUBLIC. Finish with `npm run release:mac -- <tag>` and `node scripts/build-updater-manifest.mjs <tag>`.',
};
const step = (s, newPhase) => {
  if (newPhase) phase = newPhase;
  console.log(`\n${C.cyan('▸')} ${C.bold(s)}`);
};
process.on('SIGINT', () => {
  console.error(C.yellow(`\n\n  interrupted during "${phase}".`));
  console.error(C.dim(`  ${RECOVERY[phase]}\n`));
  process.exit(130);
});

// --- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const KNOWN_FLAGS = new Set([
  '--dry-run', '--yes', '-y', '--skip-mac', '--skip-ci', '--allow-branch',
  '--allow-dirty', '--allow-downgrade', '--allow-no-changelog', '--skip-checks',
  '--notes', '--help', '-h',
]);
// Reject anything unrecognized rather than ignoring it: a mistyped `--dryrun`
// silently performing a real release is the worst failure this script has.
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('-')) continue;
  const name = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
  if (!KNOWN_FLAGS.has(name)) {
    fail(`unknown option "${a}"`, `known: ${[...KNOWN_FLAGS].join(' ')}\n  (with npm, separate flags with --: npm run bump-n-distribute -- ${a})`);
  }
  if (name === '--notes' && !a.includes('=')) i += 1; // consume its value
}
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*| \* ?/gm, ''));
  process.exit(0);
}

const DRY = flag('--dry-run');
const YES = flag('--yes') || flag('-y');
const SKIP_MAC = flag('--skip-mac');
const SKIP_CI = flag('--skip-ci');
const ALLOW_BRANCH = flag('--allow-branch');
const ALLOW_DIRTY = flag('--allow-dirty');
const ALLOW_DOWNGRADE = flag('--allow-downgrade');
const ALLOW_NO_CHANGELOG = flag('--allow-no-changelog');
const SKIP_CHECKS = flag('--skip-checks');
const NOTES = opt('--notes');
// The first non-flag argument is the bump kind or an explicit version. The
// value after a bare `--notes` is not positional.
const positional = argv.filter((a, i) => !a.startsWith('-') && argv[i - 1] !== '--notes');
const BUMP = positional[0] ?? 'patch';

// --- process helpers ------------------------------------------------------
// `shell` on Windows: npm/yarn are .cmd shims that execFile cannot resolve.
const WIN = process.platform === 'win32';
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: WIN, ...opts });
}
function capture(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', cwd: ROOT, shell: WIN, ...opts }).trim();
}
/** Run, but never throw — for probes where failure is itself the answer. */
function tryCapture(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: ROOT, shell: WIN });
  return r.status === 0 ? (r.stdout ?? '').trim() : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
/**
 * Rewrite just the top-level "version" string in place. Regex rather than
 * JSON.stringify because these files are hand-maintained and reformatting the
 * whole document would bury a one-line change in a thousand-line diff. The
 * old value is matched exactly and the result is re-parsed, so this cannot
 * quietly hit a nested "version" key.
 */
function writeVersion(file, from, to) {
  const raw = readFileSync(file, 'utf8');
  const pattern = new RegExp(`("version"\\s*:\\s*")${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(")`);
  const next = raw.replace(pattern, `$1${to}$2`);
  if (next === raw) fail(`could not find "version": "${from}" in ${file}`);
  writeFileSync(file, next);
  const check = readJson(file).version;
  if (check !== to) fail(`writing ${file} produced version "${check}", expected "${to}"`);
}

const semver = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmpSemver = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
function nextVersion(current, bump) {
  if (/^\d+\.\d+\.\d+([-+].*)?$/.test(bump)) return bump; // explicit
  const parts = semver(current);
  if (!parts) fail(`current version "${current}" is not semver`);
  let [major, minor, patch] = parts;
  if (bump === 'major') { major += 1; minor = 0; patch = 0; }
  else if (bump === 'minor') { minor += 1; patch = 0; }
  else if (bump === 'patch') { patch += 1; }
  else fail(`unknown bump "${bump}"`, 'use patch | minor | major | an explicit x.y.z');
  return `${major}.${minor}.${patch}`;
}

async function confirm(question) {
  if (YES) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} ${C.dim('[y/N]')} `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

// Only these two files carry the app version. src-tauri/Cargo.toml and
// server/Cargo.toml are internal crate versions (0.1.0) that have never
// tracked the product, and the OTA updater compares tauri.conf.json.
const PKG = join(ROOT, 'package.json');
const TAURI_CONF = join(ROOT, 'src-tauri', 'tauri.conf.json');

console.log(C.bold('\nPrettyCardboard — bump & distribute\n'));

// --- preflight ------------------------------------------------------------
step('Preflight');

// Fail on a non-TTY here, before ten minutes of building, not at the prompt.
if (!YES && !DRY && !process.stdin.isTTY) {
  fail('not a TTY and --yes was not passed', 'rerun with --yes to proceed non-interactively');
}

const pkg = readJson(PKG);
const conf = readJson(TAURI_CONF);
if (pkg.version !== conf.version) {
  warn(`package.json (${pkg.version}) and tauri.conf.json (${conf.version}) disagree; using package.json`);
}
const current = pkg.version;
const version = nextVersion(current, BUMP);
const tag = `v${version}`;
if (cmpSemver(version, current) <= 0 && !ALLOW_DOWNGRADE) {
  fail(
    `${version} is not newer than the current ${current}`,
    'the OTA updater compares versions — shipping backwards strands every client. Pass --allow-downgrade if you really mean it.',
  );
}
info(`version   ${current} → ${C.bold(version)}  (tag ${tag})`);

// The in-app changelog must already name the version being shipped. The
// what's-new modal only opens for releases NEWER than the version cached on the
// device, and closing it is the only thing that advances that cache - so a
// release with no entry here is not merely undocumented, it never opens the
// modal at all, and every player stays pinned at the last version that did.
// 0.5.1 through 0.5.3 shipped that way; this refusal is why it cannot recur.
// A regex rather than an import: the table is TypeScript with JSX icon
// references, and this script must not need a compiler to read one string.
const CHANGELOG_TS = join(ROOT, 'src', 'app', 'data', 'changelog.ts');
const newestEntry = readFileSync(CHANGELOG_TS, 'utf8').match(/version:\s*'([^']+)'/)?.[1];
if (newestEntry !== version && !ALLOW_NO_CHANGELOG) {
  fail(
    `CHANGELOG's newest entry is ${newestEntry ?? 'unreadable'}, not ${version}`,
    'add the release to src/app/data/changelog.ts first — without it the what\'s-new modal never opens, so this release ships invisible. Pass --allow-no-changelog to ship anyway.',
  );
}

// git: branch, cleanliness, remote identity, remote sync
const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
info(`branch    ${branch}`);
if (branch !== MAIN_BRANCH && !ALLOW_BRANCH) {
  fail(
    `on branch "${branch}", not ${MAIN_BRANCH}`,
    `releases normally ship from ${MAIN_BRANCH}. Pass --allow-branch to release from here anyway.`,
  );
}
const originUrl = tryCapture('git', ['remote', 'get-url', 'origin']) ?? '';
if (!originUrl.toLowerCase().includes(REPO.toLowerCase())) {
  fail(`origin (${originUrl || 'none'}) does not point at ${REPO}`, 'this script publishes to a hardcoded repo');
}
const dirty = capture('git', ['status', '--porcelain']);
if (dirty && !ALLOW_DIRTY) {
  console.error(C.dim(dirty.split('\n').slice(0, 12).map((l) => `    ${l}`).join('\n')));
  const extra = dirty.split('\n').length - 12;
  if (extra > 0) console.error(C.dim(`    … and ${extra} more`));
  fail('working tree has uncommitted changes', 'commit or stash them. --allow-dirty folds them into the release commit (they are NOT included by default).');
}

// Remote sync: releasing from a stale branch tags the wrong tree.
if (tryCapture('git', ['fetch', 'origin', branch, '--quiet']) !== null) {
  const behind = tryCapture('git', ['rev-list', '--count', `HEAD..origin/${branch}`]);
  if (behind && Number(behind) > 0) {
    fail(`local ${branch} is ${behind} commit(s) behind origin`, `git pull --ff-only origin ${branch}`);
  }
}

// A duplicate tag pushes nothing and CI never fires.
if (tryCapture('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`])) {
  fail(`tag ${tag} already exists locally`, `delete it (git tag -d ${tag}) or pick another version`);
}
if (tryCapture('git', ['ls-remote', '--exit-code', '--tags', 'origin', tag])) {
  fail(`tag ${tag} already exists on origin`, 'pick another version — republishing a tag confuses the OTA updater');
}

// gh publishes every asset; prove it works AND that we can push, before work.
if (!tryCapture('gh', ['--version'])) fail('`gh` (GitHub CLI) not found', 'https://cli.github.com');
if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore', shell: WIN }).status !== 0) {
  fail('`gh` is not authenticated', 'run: gh auth login');
}
const canPush = tryCapture('gh', ['api', `repos/${REPO}`, '--jq', '.permissions.push']);
if (canPush !== 'true') {
  fail(`your GitHub account cannot push to ${REPO}`, 'a release needs write access');
}
info('gh        authenticated with push access');

// macOS half
const onMac = process.platform === 'darwin';
const doMac = !SKIP_MAC && onMac;
if (!SKIP_MAC && !onMac) {
  warn(`not running on macOS (${process.platform}) — the mac build will be skipped`,
    `run \`npm run release:mac -- ${tag}\` from a Mac afterwards`);
}
if (doMac && !existsSync(join(ROOT, '.env.apple'))) {
  fail('.env.apple not found', 'macOS signing needs it — see scripts/release-mac.mjs, or pass --skip-mac');
}
info(`platforms ${['windows (CI)', 'linux (CI)', doMac ? 'macos (local)' : C.dim('macos (skipped)')].join(', ')}`);

// Build BEFORE tagging: a typecheck failure discovered after the tag is public
// means a bad release in the wild.
if (!SKIP_CHECKS && !DRY) {
  step('Checks (typecheck + web build)');
  try {
    run('npm', ['run', 'build']);
  } catch {
    fail('build failed — not releasing', 'fix it, or pass --skip-checks to override');
  }
} else if (SKIP_CHECKS) {
  warn('skipping typecheck + build (--skip-checks)');
}

// --- plan + confirm -------------------------------------------------------
step('Plan');
[
  `bump package.json + src-tauri/tauri.conf.json to ${version}`,
  ALLOW_DIRTY ? `commit those + all local changes as "Release ${version}"` : `commit ONLY those two files as "Release ${version}"`,
  `tag ${tag} and push ${branch} + ${tag}  ${C.dim('(starts CI: Windows + Linux)')}`,
  doMac ? 'build + sign + notarize macOS locally, upload to the release' : C.dim('skip macOS'),
  NOTES ? 'set release notes' : C.dim('no release notes'),
  SKIP_CI ? C.dim('skip waiting for CI') : 'wait for CI to finish',
  SKIP_CI ? C.dim('skip final manifest') : `refresh latest.json so OTA offers ${tag} everywhere`,
].forEach((p, i) => info(`${i + 1}. ${p}`));

if (DRY) {
  console.log(C.yellow('\n  --dry-run: nothing was changed.\n'));
  process.exit(0);
}
if (!(await confirm(`\nShip ${C.bold(tag)}?`))) {
  console.log(C.dim('\n  aborted.\n'));
  process.exit(1); // non-zero so `&& announce` chains don't fire on an abort
}

// --- bump -----------------------------------------------------------------
step(`Bumping to ${version}`, 'bumped');
writeVersion(PKG, current, version);
writeVersion(TAURI_CONF, current, version);
info('package.json, src-tauri/tauri.conf.json');

const revertVersions = () => {
  writeVersion(PKG, version, current);
  writeVersion(TAURI_CONF, version, current);
  warn(`reverted versions to ${current}`);
};

// --- commit + tag + push --------------------------------------------------
// Staged flags, not one boolean: the rollback for "commit failed" is very
// different from "the branch pushed but the tag did not".
let committed = false;
let tagged = false;
let branchPushed = false;
let tagPushed = false;
try {
  step('Committing and tagging', 'committed');
  if (ALLOW_DIRTY) {
    run('git', ['add', '-A']);
    run('git', ['commit', '-m', `Release ${version}`]);
  } else {
    // --only: commit exactly these paths regardless of what else is staged,
    // so an unrelated `git add` can never ride along in a release commit.
    run('git', ['commit', '--only', PKG, TAURI_CONF, '-m', `Release ${version}`]);
  }
  committed = true;
  run('git', ['tag', '-a', tag, '-m', `PrettyCardboard ${version}`]);
  tagged = true;

  step(`Pushing ${branch} + ${tag}`, 'committed');
  run('git', ['push', 'origin', branch]);
  branchPushed = true;
  run('git', ['push', 'origin', tag]);
  tagPushed = true;
  phase = 'pushed';
  info(C.green('pushed — CI is now building Windows + Linux'));
} catch (err) {
  console.error(C.red(`\n  ${String(err?.message ?? err).split('\n')[0]}`));
  if (!branchPushed) {
    // Nothing is public yet: unwind completely.
    if (tagged) { try { run('git', ['tag', '-d', tag]); } catch { /* best effort */ } }
    if (committed) { try { run('git', ['reset', '--hard', 'HEAD~1']); } catch { /* best effort */ } }
    else revertVersions();
    fail('failed before anything was published; local state restored',
      committed ? 'the release commit and tag were removed' : 'version files were restored');
  }
  // The branch is public but the tag is not: CI never fires, so no release
  // exists. Leave the commit (it is legitimately on main) and explain.
  fail(
    `${branch} was pushed but the tag was not — no release was created`,
    `retry just the tag: git push origin ${tag}`,
  );
}

// --- macOS (local; CI is building Windows + Linux concurrently) -----------
let macOk = false;
if (doMac) {
  step('Building macOS locally (sign + notarize — this takes a while)');
  try {
    run('node', [join(ROOT, 'scripts', 'release-mac.mjs'), tag]);
    macOk = true;
  } catch {
    problem('macOS build failed — Windows/Linux continue in CI', `npm run release:mac -- ${tag}`);
  }
}

// --- release notes (BEFORE the manifest: it bakes the body into latest.json)
if (NOTES) {
  step('Setting release notes');
  const exists = spawnSync('gh', ['release', 'view', tag, '--repo', REPO], { stdio: 'ignore', shell: WIN }).status === 0;
  try {
    if (exists) run('gh', ['release', 'edit', tag, '--repo', REPO, '--notes', NOTES]);
    else run('gh', ['release', 'create', tag, '--repo', REPO, '--title', `PrettyCardboard ${tag}`, '--notes', NOTES]);
  } catch {
    problem('could not set release notes', `gh release edit ${tag} --repo ${REPO} --notes "…"`);
  }
}

// --- wait for CI ----------------------------------------------------------
if (!SKIP_CI) {
  step('Waiting for CI (Windows + Linux)');
  // A tag push sets the run's headBranch to the tag name, so --branch <tag>
  // finds it. The run takes a few seconds to register; poll for it.
  let runId = null;
  for (let i = 0; i < 30 && !runId; i++) {
    const out = tryCapture('gh', [
      'run', 'list', '--repo', REPO, '--workflow', WORKFLOW,
      '--branch', tag, '--limit', '1', '--json', 'databaseId',
    ]);
    if (out) {
      try {
        const runs = JSON.parse(out);
        if (runs.length) runId = runs[0].databaseId;
      } catch { /* keep polling */ }
    }
    if (!runId) await sleep(5000);
  }
  if (!runId) {
    problem('could not find the CI run', `https://github.com/${REPO}/actions?query=branch%3A${tag}`);
  } else {
    info(`run ${runId}`);
    const watched = spawnSync('gh', ['run', 'watch', String(runId), '--repo', REPO, '--exit-status'],
      { stdio: 'inherit', cwd: ROOT, shell: WIN });
    if (watched.status !== 0) {
      problem('CI did not finish cleanly — latest.json may be missing a platform',
        `gh run view ${runId} --repo ${REPO} --log-failed`);
    }
  }

  // CI builds the manifest too, but re-running here guarantees it is assembled
  // AFTER the local macOS upload so all three platforms are present.
  step('Refreshing latest.json (all platforms)');
  try {
    run('node', [join(ROOT, 'scripts', 'build-updater-manifest.mjs'), tag]);
  } catch {
    problem('manifest refresh failed — OTA may not offer this version',
      `node scripts/build-updater-manifest.mjs ${tag}`);
  }
} else {
  problem('skipped the CI wait — latest.json carries only what CI assembled on its own',
    `node scripts/build-updater-manifest.mjs ${tag}`);
}

// --- done -----------------------------------------------------------------
const url = `https://github.com/${REPO}/releases/tag/${tag}`;
if (problems.length) {
  console.log(`\n${C.yellow(C.bold(`⚠ ${tag} is public, but ${problems.length} step(s) did not finish`))}`);
  problems.forEach((p) => {
    console.log(C.yellow(`  • ${p.s}`));
    if (p.recovery) console.log(C.dim(`      ${p.recovery}`));
  });
} else {
  console.log(`\n${C.green(C.bold(`✓ ${tag} shipped`))}`);
}
console.log(C.dim(`  ${url}\n`));
console.log('  Verify before announcing:');
console.log(C.dim(`    gh release view ${tag} --repo ${REPO}`));
console.log(C.dim(`    curl -sL https://github.com/${REPO}/releases/latest/download/latest.json | jq .platforms`));
console.log(C.dim('    (darwin-aarch64, linux-x86_64 and windows-x86_64 should all appear)'));
if (!macOk && !SKIP_MAC) console.log(C.yellow(`    npm run release:mac -- ${tag}      # add macOS from a Mac`));
console.log('');
process.exit(problems.length ? 1 : 0);
