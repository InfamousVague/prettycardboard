#!/usr/bin/env node
/**
 * Build the game server and stage it as the desktop app's sidecar binary.
 *
 * Tauri's `bundle.externalBin` looks for
 *   src-tauri/binaries/prettycardboard-server-<target-triple>[.exe]
 * and ships it next to the app executable, signed with the app. The desktop
 * app spawns it for Local play (offline bot matches) - see
 * src-tauri/src/local_server.rs.
 *
 *   node scripts/stage-server-sidecar.mjs               # host triple
 *   node scripts/stage-server-sidecar.mjs --universal   # macOS fat binary
 *
 * Run automatically by release:mac and the desktop CI workflow; run it by
 * hand before `tauri build`/`tauri dev` if you want Local play in a dev build.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'src-tauri', 'binaries');
const universal = process.argv.includes('--universal');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function hostTriple() {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const line = out.split('\n').find((l) => l.startsWith('host:'));
  if (!line) throw new Error('could not read host triple from rustc -vV');
  return line.split(':')[1].trim();
}

mkdirSync(OUT_DIR, { recursive: true });

if (universal) {
  // macOS: both slices, joined with lipo, named for tauri's universal target.
  //
  // ALL THREE NAMES ARE REQUIRED, not just the universal one. `tauri build
  // --target universal-apple-darwin` is not one build: it compiles the app
  // once PER ARCH and only lipos at the end, and each of those per-arch builds
  // resolves `externalBin` as `prettycardboard-server-<that arch's triple>`.
  // Staging only the fat binary fails the x86_64 half with
  //   resource path `binaries/prettycardboard-server-x86_64-apple-darwin` doesn't exist
  // and - worse when it does not fail - a stale per-arch file left over from an
  // earlier release is picked up silently, shipping an old server inside a new
  // app. So each slice is copied under its own triple as it is built.
  const slices = [];
  for (const triple of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    console.log(`\n▸ building server for ${triple}`);
    run('cargo', ['build', '--release', '--target', triple], { cwd: join(ROOT, 'server') });
    const src = join(ROOT, 'server', 'target', triple, 'release', 'prettycardboard-server');
    const slice = join(OUT_DIR, `prettycardboard-server-${triple}`);
    copyFileSync(src, slice);
    chmodSync(slice, 0o755);
    console.log(`✓ staged ${slice}`);
    slices.push(src);
  }
  const out = join(OUT_DIR, 'prettycardboard-server-universal-apple-darwin');
  run('lipo', ['-create', ...slices, '-output', out]);
  chmodSync(out, 0o755);
  console.log(`\n✓ staged ${out}`);
} else {
  const triple = hostTriple();
  console.log(`\n▸ building server for ${triple} (host)`);
  run('cargo', ['build', '--release'], { cwd: join(ROOT, 'server') });
  const ext = process.platform === 'win32' ? '.exe' : '';
  const src = join(ROOT, 'server', 'target', 'release', `prettycardboard-server${ext}`);
  const out = join(OUT_DIR, `prettycardboard-server-${triple}${ext}`);
  copyFileSync(src, out);
  if (!ext) chmodSync(out, 0o755);
  console.log(`\n✓ staged ${out}`);
}
