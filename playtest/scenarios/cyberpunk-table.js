// Scenario (self-contained): a Cyberpunk TCG table plays end to end on the
// freeform engine. Spawns a scratch release server, creates a Cyberpunk deck +
// room via the real API, seats two players, starts, and asserts the game-driven
// server behavior: room.game === 'cyberpunk', Net (life slot) starts at 0, the
// Legend is dealt into the command ("Legend") zone, and every card carries the
// bundled Cyberpunk art path so the client renders it without Scryfall.
import { spawn } from 'node:child_process';
import { openSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PlaytestClient, Assert, sleep, deleteRoom, BASE } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(HERE, '..', '..', 'server');
const BINARY = join(SERVER_DIR, 'target', 'release', 'prettycardboard-server');
const LOG = join(HERE, '..', 'cyberpunk-server.log');
const PORT = process.env.PC_PORT || '8802';
const DATA_DIR = process.env.PC_DATA_DIR || '/tmp/pc-cyberpunk';

const CATALOG = JSON.parse(readFileSync(join(HERE, '..', '..', 'src', 'data', 'cyberpunk-cards.json'), 'utf8'));

async function serverUp() {
  try { return (await fetch(`${BASE}/api/me`)).status === 401; } catch { return false; }
}
function launch() {
  const fd = openSync(LOG, 'a');
  const child = spawn(BINARY, [], { cwd: SERVER_DIR, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, PC_PORT: PORT, PC_DATA_DIR: DATA_DIR } });
  child.unref();
}
async function waitUp(ms) { const s = Date.now(); while (Date.now() - s < ms) { if (await serverUp()) return true; await sleep(200); } return false; }

/** A small legal Cyberpunk deck: one Legend + a spread of that color's cards. */
function cyberpunkDeck() {
  const legend = CATALOG.cards.find((c) => c.type === 'Legend');
  const fillers = CATALOG.cards.filter((c) => c.type !== 'Legend').slice(0, 12);
  return [
    { scryfallId: legend.id, name: legend.displayName, quantity: 1, board: 'commander' },
    ...fillers.map((c) => ({ scryfallId: c.id, name: c.displayName, quantity: 3, board: 'main' })),
  ];
}

async function main() {
  const t = new Assert('cyberpunk-table');
  if (await serverUp()) {
    console.log(`SKIP: something already on ${BASE}`);
    console.log(`##RESULT## ${JSON.stringify({ name: 'cyberpunk-table', passed: 0, failed: 0, durationMs: 0, skipped: true })}`);
    process.exit(0);
  }
  try { rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
  launch();
  t.ok(await waitUp(20000), 'scratch server booted');

  const names = ['pt_alice', 'pt_bob'];
  await ensureSeed(names);
  const clients = names.map((n) => new PlaytestClient(n, { password: PASSWORD, assert: t }));
  const [alice, bob] = clients;
  for (const c of clients) { await c.ensureUser(); await c.connect(); }

  // Each player needs a Cyberpunk deck (game: 'cyberpunk').
  const deckIds = {};
  for (const c of clients) {
    const res = await c.api('POST', '/api/decks', { name: `${c.username} punk`, format: 'standard', game: 'cyberpunk', cards: cyberpunkDeck() });
    t.ok(res.status === 201, `${c.username} cyberpunk deck created`, `status ${res.status}`);
    deckIds[c.username] = res.json.id;
  }
  // The deck round-trips as a cyberpunk deck.
  const listed = (await alice.api('GET', '/api/decks')).json;
  const mine = listed.find((d) => d.id === deckIds['pt_alice']);
  t.ok(mine && mine.game === 'cyberpunk', 'deck listed with game=cyberpunk', JSON.stringify(mine));
  t.ok(mine && mine.coverImageUrl == null && mine.coverCardId, 'cyberpunk deck cover is a card id, not a Scryfall url');

  // Cyberpunk room.
  const roomRes = await alice.api('POST', '/api/rooms', { name: 'night city', seats: 2, persistent: false, game: 'cyberpunk' });
  t.ok(roomRes.status === 201, 'cyberpunk room created', `status ${roomRes.status}`);
  const roomId = roomRes.json.roomId;
  for (let i = 0; i < clients.length; i++) {
    const c = clients[i];
    const m = c.mark();
    c.joinRoom(roomId, deckIds[c.username]);
    await c.expectState((s) => s.players.length === i + 1, `${c.username} seated`, 5000, { since: m });
  }
  // room.game is on the wire.
  t.ok(alice.lastState()?.game === 'cyberpunk', 'room.state.game === cyberpunk', String(alice.lastState()?.game));

  let m = alice.mark();
  alice.send({ type: 'room.start' });
  await alice.expectState((s) => s.started, 'game started', 5000, { since: m });
  for (const c of clients) {
    const mm = c.mark();
    c.act({ kind: 'mull.keep', bottomIids: [] });
    await c.expectState((s) => c.me(s).mulligan?.state === 'kept', `${c.username} kept`, 5000, { since: mm });
  }

  const me = alice.me(alice.lastState());
  // Net (the life slot) starts at 0 for Cyberpunk (not 40/20).
  t.ok(me.life === 0, 'Net (life slot) starts at 0', `life=${me.life}`);
  // The Legend was dealt into the command ("Legend") zone.
  t.ok(me.command.length === 1, 'Legend in the command zone', `command=${me.command.length}`);
  // Every dealt card carries the bundled Cyberpunk art path (no Scryfall).
  const dealt = [...me.command, ...me.hand];
  const allLocal = dealt.length > 0 && dealt.every((c) => (c.imageUrl || '').startsWith('/cache/cyberpunk/') && (c.imageUrl || '').endsWith('.webp'));
  t.ok(allLocal, 'all dealt cards carry /cache/cyberpunk/*.webp art', JSON.stringify(dealt.slice(0, 1).map((c) => c.imageUrl)));

  await deleteRoom(alice, roomId);
  for (const c of clients) await c.close();
  try { const { execSync } = await import('node:child_process'); execSync(`pkill -f '${BINARY}'`); } catch {}
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((e) => {
  console.error('cyberpunk-table crashed:', e);
  try { import('node:child_process').then(({ execSync }) => { try { execSync(`pkill -f '${BINARY}'`); } catch {} }); } catch {}
  console.log(`##RESULT## ${JSON.stringify({ name: 'cyberpunk-table', passed: 0, failed: 1, durationMs: 0, crashed: String(e) })}`);
  process.exit(1);
});
