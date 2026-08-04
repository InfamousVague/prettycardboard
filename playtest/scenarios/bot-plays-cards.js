// Does a bot actually PLAY, or just sit there passing turns?
//
// The bot brain reads every card through an embedded attribute table
// (bot/knowledge.rs: `attr()` -> `data().attrs`). A card outside that table is
// unreadable: is_land() is false, mana_value() is 0, is_creature() is false. A
// bot dealt a deck the table does not cover cannot identify a single card in
// its own hand, so it never plays a land, never casts, never attacks - it just
// passes. The board stays empty and the match goes nowhere.
//
// Nothing caught this, because every other bot scenario asserts that turns
// advance and that the loop does not stall - which a bot doing NOTHING still
// satisfies perfectly. This one asserts the bot does something.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

const WATCH_MS = 60_000;

async function run(t, format) {
  const seeded = await ensureSeed(['pt_alice']);
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await host.connect();
  host.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await host.api('POST', '/api/rooms', {
    name: `Bot plays cards (${format})`, seats: 2, persistent: false, format,
  });
  const roomId = mk.json.roomId;
  host.joinRoom(roomId, seeded.pt_alice.deckId);
  await host.expectState((s) => s.players.length === 1, `[${format}] host seated`, 5000);
  host.send({ type: 'bot.add', style: 'aggro' });
  await host.expectState((s) => s.players.some((p) => p.isBot), `[${format}] bot seated`, 10_000);
  host.setReady(true);
  await host.expectState((s) => s.players.every((p) => p.ready), `[${format}] ready`, 5000);
  host.send({ type: 'room.start' });
  await host.expectState((s) => s.started, `[${format}] started`, 5000);
  host.act({ kind: 'mull.keep', bottomIids: [] });

  const botOf = (s) => s.players.find((p) => p.isBot);
  const start = Date.now();
  // Live state carries libraryCount, not cardsDrawn - a draw shows up as the
  // library shrinking. Reading a field the payload does not have would make
  // every assertion here pass or fail on `undefined`, which is no test at all.
  let first = null;
  let best = { board: 0, turns: 0, deck: '', library: null, hand: 0, lands: 0 };
  while (Date.now() - start < WATCH_MS) {
    const s = host.lastState();
    if (!s) {
      await sleep(500);
      continue;
    }
    const bot = botOf(s);
    if (bot) {
      if (first === null && typeof bot.libraryCount === 'number') first = bot.libraryCount;
      best = {
        board: Math.max(best.board, bot.battlefield?.length ?? 0),
        lands: Math.max(
          best.lands,
          (bot.battlefield ?? []).filter((c) => /land/i.test(c.typeLine ?? c.type_line ?? '')).length,
        ),
        turns: Math.max(best.turns, s.turnNumber ?? 0),
        deck: bot.deckName ?? best.deck,
        library: bot.libraryCount ?? best.library,
        hand: Math.max(best.hand, bot.handCount ?? 0),
      };
    }
    if (s.activeSeat === s.players.find((p) => !p.isBot)?.seat) {
      host.act({ kind: 'turn.pass' });
    }
    await sleep(1200);
  }

  t.ok(best.turns >= 3, `[${format}] the match ran (turn ${best.turns})`, String(best.turns));
  t.ok(typeof first === 'number', `[${format}] the bot's library is observable`, String(first));
  t.ok(
    first != null && best.library != null && best.library < first,
    `[${format}] the bot drew from its library`,
    `library ${first} -> ${best.library} over ${best.turns} turns`,
  );
  // The one that matters: a bot that cannot read its deck puts NOTHING down.
  t.ok(
    best.board > 0,
    `[${format}] the bot put something on the battlefield`,
    `deck=${JSON.stringify(best.deck)} board=${best.board} after turn ${best.turns}`,
  );
  // What it put down matters as much as whether it did. The brain reads cards
  // through an embedded attribute table (bot/knowledge.rs `attr()`); a deck
  // outside that table leaves is_land() false for every card, so the bot never
  // makes a land drop and never has mana to cast with.
  const names = (host.lastState()?.players.find((p) => p.isBot)?.battlefield ?? [])
    .map((c) => c.name)
    .filter(Boolean);
  t.ok(
    names.length > 0,
    `[${format}] the bot's board is inspectable`,
    JSON.stringify(names.slice(0, 8)),
  );

  await deleteRoom(host, roomId).catch(() => null);
  host.close();
}

async function main() {
  const t = new Assert('bot-plays-cards');
  await run(t, 'commander');
  await run(t, 'standard');
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('bot-plays-cards crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'bot-plays-cards', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
