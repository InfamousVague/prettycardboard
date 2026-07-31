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
  for (const triple of ['aarch64-apple-darwin', 'x86_64-apple-darwin']) {
    console.log(`\n▸ building server for ${triple}`);
    run('cargo', ['build', '--release', '--target', triple], { cwd: join(ROOT, 'server') });
  }
  const out = join(OUT_DIR, 'prettycardboard-server-universal-apple-darwin');
  run('lipo', [
    '-create',
    join(ROOT, 'server', 'target', 'aarch64-apple-darwin', 'release', 'prettycardboard-server'),
    join(ROOT, 'server', 'target', 'x86_64-apple-darwin', 'release', 'prettycardboard-server'),
    '-output',
    out,
  ]);
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
