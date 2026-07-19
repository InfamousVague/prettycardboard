// Runs seed + scenarios 1-3 sequentially against the local server and prints
// a summary table. Never wipes the database: every scenario creates its own
// room and reuses the idempotent pt_* users. Exit code reflects failures.
// (restart-resume is intentionally not part of `all` — run `npm run restart`
// explicitly, since it kills and relaunches the local dev server.)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const STEPS = [
  ['seed', join(HERE, 'seed.js')],
  ['commander-pod', join(HERE, 'scenarios', 'commander-pod.js')],
  ['standard-duel', join(HERE, 'scenarios', 'standard-duel.js')],
  ['chaos-monkey', join(HERE, 'scenarios', 'chaos-monkey.js')],
  ['vs-bot', join(HERE, 'scenarios', 'vs-bot.js')],
  ['locked-combat', join(HERE, 'scenarios', 'locked-combat.js')],
];

function runStep(name, script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      process.stdout.write(d);
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
      process.stderr.write(d);
    });
    child.on('close', (code) => {
      const durationMs = Date.now() - started;
      const m = out.match(/##RESULT## (\{.*\})/);
      let result = m ? JSON.parse(m[1]) : null;
      if (!result) result = { name, passed: 0, failed: code === 0 ? 0 : 1, durationMs, crashed: code !== 0 ? `exit ${code}` : undefined };
      result.exitCode = code;
      resolve(result);
    });
  });
}

const results = [];
for (const [name, script] of STEPS) {
  console.log(`\n=== ${name} ===`);
  results.push(await runStep(name, script));
}

console.log('\n================= SUMMARY =================');
console.log('scenario         passed  failed  duration');
console.log('-------------------------------------------');
for (const r of results) {
  const status = r.failed || r.exitCode ? ' <-- FAIL' : '';
  console.log(
    `${r.name.padEnd(17)}${String(r.passed).padStart(6)}${String(r.failed).padStart(8)}  ${((r.durationMs || 0) / 1000).toFixed(1)}s${status}`,
  );
}
const bad = results.some((r) => r.failed > 0 || r.exitCode !== 0);
console.log('-------------------------------------------');
console.log(bad ? 'RESULT: FAILURES PRESENT' : 'RESULT: ALL GREEN');
process.exit(bad ? 1 : 0);
