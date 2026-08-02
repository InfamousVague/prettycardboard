// Scenario: bots bring a deck the TABLE can play, and not the same one twice.
//
// Before this, the bot pool was four Commander precons and deck choice
// ignored the room's format - so a bot seated at a Standard table brought a
// 100-card Commander deck, and "another bot" meant "the same handful of
// decks". This proves the pool and the format rule:
//   1. Standard tables draw from the generated Standard pool.
//   2. Every Standard deck is legal: exactly 60+ cards, nothing over 4 copies.
//   3. Commander tables still get the precons.
//   4. Seating several bots gives several DIFFERENT decks.
//   5. An explicit deck code still wins over the format default.
import { PlaytestClient, Assert, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const BASICS = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);

async function tableWithBots(client, format, bots, name) {
  client.send({ type: 'room.leave' });
  await sleep(200);
  const mk = await client.api('POST', '/api/rooms', {
    name, seats: Math.max(2, bots + 1), persistent: false, format,
  });
  client.joinRoom(mk.json.roomId);
  await client.expectState((s) => s.players.length === 1, `${name} seated`, 5000);
  for (let i = 0; i < bots; i += 1) client.send({ type: 'bot.add' });
  const st = await client.expectState(
    (s) => s.players.length === bots + 1,
    `${name}: ${bots} bots seated`,
    8000,
  );
  return { roomId: mk.json.roomId, state: st };
}

async function main() {
  const t = new Assert('bot-decks');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();
  await me.connect();

  // ---- 1 + 4) A Standard table: Standard decks, and a variety of them.
  const std = await tableWithBots(me, 'standard', 3, 'Standard pool');
  const stdBots = std.state.players.filter((p) => p.isBot);
  t.eq(stdBots.length, 3, 'three bots sat down at the Standard table');
  const stdNames = stdBots.map((p) => p.deckName);
  t.ok(
    stdNames.every((n) => n && !/FINAL FANTASY/.test(n)),
    'no Commander precon showed up at a Standard table',
    JSON.stringify(stdNames),
  );
  // Deck SIZE is the legality tell the seat exposes: a precon is 98-100.
  for (const bot of stdBots) {
    const size = (bot.libraryCount ?? 0) + (bot.handCount ?? 0) + (bot.battlefield?.length ?? 0);
    t.ok(size === 60, `${bot.deckName} is a 60-card deck`, `got ${size}`);
  }
  await me.api('DELETE', `/api/rooms/${std.roomId}`).catch(() => null);

  // Variety across several tables: one table can repeat by chance, but three
  // tables of three bots drawing one deck every time would mean no pool.
  const seen = new Set(stdNames);
  for (let round = 0; round < 2; round += 1) {
    const more = await tableWithBots(me, 'standard', 3, `Standard variety ${round}`);
    for (const bot of more.state.players.filter((p) => p.isBot)) seen.add(bot.deckName);
    await me.api('DELETE', `/api/rooms/${more.roomId}`).catch(() => null);
  }
  t.ok(seen.size >= 4, 'bots draw from a real pool, not one deck', `distinct: ${seen.size}`);

  // ---- 3) A Commander table keeps the precons.
  const cmd = await tableWithBots(me, 'commander', 2, 'Commander pool');
  const cmdBots = cmd.state.players.filter((p) => p.isBot);
  t.ok(
    cmdBots.every((p) => /FINAL FANTASY/.test(p.deckName ?? '')),
    'Commander tables still get the precons',
    JSON.stringify(cmdBots.map((p) => p.deckName)),
  );
  await me.api('DELETE', `/api/rooms/${cmd.roomId}`).catch(() => null);

  // ---- 5) An explicit code beats the format default (the Bots settings tab
  //         and these playtests both name decks).
  me.send({ type: 'room.leave' });
  await sleep(200);
  const mk = await me.api('POST', '/api/rooms', {
    // Three seats: the bad-code check below needs a free seat, or the
    // server refuses on room_full before it ever reads the deck code.
    name: 'Explicit deck', seats: 3, persistent: false, format: 'standard',
  });
  me.joinRoom(mk.json.roomId);
  await me.expectState((s) => s.players.length === 1, 'seated for the explicit pick', 5000);
  me.send({ type: 'bot.add', deckCode: 'FIC-1' });
  const named = await me.expectState((s) => s.players.length === 2, 'named-deck bot seated', 6000);
  t.ok(
    /FINAL FANTASY X/.test(named.players.find((p) => p.isBot)?.deckName ?? ''),
    'an explicit deck code overrides the format pool',
    JSON.stringify(named.players.find((p) => p.isBot)?.deckName),
  );
  const badMark = me.mark();
  me.send({ type: 'bot.add', deckCode: 'NOPE-1' });
  const err = await me.waitFor((m) => m.type === 'error', { since: badMark, timeoutMs: 4000 });
  t.eq(err?.code, 'bad_deck', 'an unknown deck code is still refused');
  await me.api('DELETE', `/api/rooms/${mk.json.roomId}`).catch(() => null);

  // ---- 2) Every deck in the shipped pool is Standard-legal by construction.
  const { readFileSync } = await import('node:fs');
  const pool = JSON.parse(
    readFileSync(new URL('../../server/src/data/bot_decks_standard.json', import.meta.url), 'utf8'),
  );
  t.ok(pool.decks.length >= 50, 'the pool ships at least 50 decks', `got ${pool.decks.length}`);
  const illegal = pool.decks.filter((d) => {
    const size = d.cards.reduce((s, c) => s + c.qty, 0);
    const over = d.cards.some((c) => c.qty > 4 && !BASICS.has(c.name));
    return size < 60 || over || d.format !== 'standard';
  });
  t.eq(illegal.length, 0, 'every pooled deck is 60+ cards, max 4 copies, tagged standard');
  if (illegal.length) console.log('  offenders:', illegal.slice(0, 3).map((d) => d.code));
  const missingAttrs = pool.decks.flatMap((d) => d.cards.filter((c) => !pool.attrs[c.sid]));
  t.eq(missingAttrs.length, 0, 'every pooled card carries bot attributes');

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('bot-decks crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'bot-decks', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
