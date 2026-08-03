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
  ['lobby-mana', join(HERE, 'scenarios', 'lobby-mana.js')],
  ['commander-pod', join(HERE, 'scenarios', 'commander-pod.js')],
  ['standard-duel', join(HERE, 'scenarios', 'standard-duel.js')],
  ['chaos-monkey', join(HERE, 'scenarios', 'chaos-monkey.js')],
  ['locked-combat', join(HERE, 'scenarios', 'locked-combat.js')],
  ['tapland-audit', join(HERE, 'scenarios', 'tapland-audit.js')],
  ['marks-arrows', join(HERE, 'scenarios', 'marks-arrows.js')],
  ['booster-draft', join(HERE, 'scenarios', 'booster-draft.js')],
  ['sealed', join(HERE, 'scenarios', 'sealed.js')],
  ['lobby-escape', join(HERE, 'scenarios', 'lobby-escape.js')],
  ['leaderboard', join(HERE, 'scenarios', 'leaderboard.js')],
  ['enforced-duel', join(HERE, 'scenarios', 'enforced-duel.js')],
  ['enforced-triggers', join(HERE, 'scenarios', 'enforced-triggers.js')],
  ['enforced-statics', join(HERE, 'scenarios', 'enforced-statics.js')],
  ['enforced-cascade', join(HERE, 'scenarios', 'enforced-cascade.js')],
  ['enforced-discard', join(HERE, 'scenarios', 'enforced-discard.js')],
  ['enforced-scry-mill', join(HERE, 'scenarios', 'enforced-scry-mill.js')],
  ['enforced-engine', join(HERE, 'scenarios', 'enforced-engine.js')],
  ['draw-triggers', join(HERE, 'scenarios', 'draw-triggers.js')],
  ['witness-triggers', join(HERE, 'scenarios', 'witness-triggers.js')],
  ['edict-wrath', join(HERE, 'scenarios', 'edict-wrath.js')],
  ['alt-art-oracle', join(HERE, 'scenarios', 'alt-art-oracle.js')],
  ['freeform-reminders', join(HERE, 'scenarios', 'freeform-reminders.js')],
  ['star-pt', join(HERE, 'scenarios', 'star-pt.js')],
  ['attack-aim', join(HERE, 'scenarios', 'attack-aim.js')],
  ['planeswalker-audit', join(HERE, 'scenarios', 'planeswalker-audit.js')],
  ['bot-decks', join(HERE, 'scenarios', 'bot-decks.js')],
  ['yugioh-duel', join(HERE, 'scenarios', 'yugioh-duel.js')],
  ['bot-spells', join(HERE, 'scenarios', 'bot-spells.js')],
  ['ai-match', join(HERE, 'scenarios', 'ai-match.js')],
  ['enforced-brawl', join(HERE, 'scenarios', 'enforced-brawl.js')],
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
