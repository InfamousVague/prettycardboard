// Scenario: two bots duel at a Yu-Gi-Oh table, watched from the spectator rail.
//
// Bots were refused outright at a duel table ("bots only play Magic tables"),
// so Yu-Gi-Oh had no practice opponent at all. This proves the duel brain is a
// real one and not a Magic bot wearing a different hat:
//   1. A duel table seats bots, and they bring 40-card Yu-Gi-Oh decks.
//   2. Seats open on 8000 LP and a 5-card hand.
//   3. Monsters land in the printed Monster Zones, backrow face-down.
//   4. Attacks are declared and NAME the monster they battle.
//   5. Life Points actually move - somebody is taking battle damage.
//   6. Nothing rotates by accident: no untap step stands Set monsters up, and
//      declaring an attack never flips the attacker into Defense Position.
//   7. Turns keep advancing; the duel never stalls.
import { PlaytestClient, Assert, deleteRoom, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

const OBSERVE_MS = 75_000;
const STALL_MS = 25_000;

/** The Monster and Spell & Trap rows, in the client's own field coordinates
 *  (src/app/pages/table/yugiohZones.tsx). A card is "in" a zone when it sits
 *  within the same occupancy window the client snaps to. */
const PAD_X = 0.025;
const GAP_X = 0.008;
const PAD_TOP = 0.04;
const PAD_BOTTOM = 0.18;
const GAP_Y = 0.03;
const CELL_W = (1 - 2 * PAD_X - 6 * GAP_X) / 7;
const CELL_H = (1 - PAD_TOP - PAD_BOTTOM - 2 * GAP_Y) / 3;
const rowY = (row) => PAD_TOP + row * (CELL_H + GAP_Y) + CELL_H / 2;
const colX = (col) => PAD_X + col * (CELL_W + GAP_X) + CELL_W / 2;
// Columns 1-5 only: column 0 of the middle row is the Field Zone and column 0
// of the front row is the Extra Deck pile - neither is a Monster or Spell &
// Trap Zone, and a face-down Field Spell sitting in its own slot is not a Set
// monster that forgot to lie down.
const inRow = (card, row) => Math.abs(card.y - rowY(row)) <= 0.07
  && [1, 2, 3, 4, 5].some((col) => Math.abs(card.x - colX(col)) <= 0.045);

async function main() {
  const t = new Assert('yugioh-duel');
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await host.connect();
  host.send({ type: 'room.leave' });
  await sleep(300);

  const mk = await host.api('POST', '/api/rooms', {
    name: 'Duel', seats: 2, persistent: false, game: 'yugioh', format: 'standard',
  });
  const roomId = mk.json.roomId;
  // Spectate: an all-bot duel needs no human seat, and the rail sees the whole
  // table (both fields are public information).
  host.spectateRoom(roomId);
  await host.expectState((s) => s.roomId === roomId, 'watching the duel table', 5000);

  // ---- 1) A duel table seats bots at all.
  host.send({ type: 'bot.add', style: 'aggro' });
  host.send({ type: 'bot.add', style: 'casual' });
  const seated = await host.expectState(
    (s) => s.players.filter((p) => p.isBot).length === 2,
    'two duelists seated',
    10_000,
  );
  const decks = seated.players.map((p) => p.deckName);
  t.ok(
    decks.every((n) => n && !/FINAL FANTASY/.test(n)),
    'no Commander precon showed up at a duel table',
    JSON.stringify(decks),
  );

  host.send({ type: 'room.start' });
  const started = await host.expectState((s) => s.started, 'duel started', 8000);

  // ---- 2) Duel opening: 8000 LP, five cards, a 40-card Deck.
  for (const p of started.players) {
    t.eq(p.life, 8000, `${p.username} starts on 8000 LP`);
    t.eq(p.handCount, 5, `${p.username} opens on a five-card hand`);
    const deck = (p.libraryCount ?? 0) + (p.handCount ?? 0);
    t.eq(deck, 40, `${p.username} brought a 40-card Main Deck`);
    t.ok((p.command?.length ?? 0) <= 15, `${p.username}'s Extra Deck is legal`, `${p.command?.length}`);
  }

  // ---- 7) Watch it play, collecting what happens.
  // The client keeps every frame it received, so attacks are read off the log
  // at the end rather than hooked live.
  const attacksSince = host.mark();
  const attacksSeen = () =>
    host.messages
      .slice(attacksSince)
      .filter((m) => m.type === 'room.event' && m.action?.kind === 'combat.attack')
      .map((m) => m.action);

  const deadline = Date.now() + OBSERVE_MS;
  let lastTurn = started.turnNumber ?? 1;
  let lastAdvance = Date.now();
  let sawSummon = false;
  let sawBackrow = false;
  let lpMoved = false;
  let rotatedAttacker = false;
  // A Set monster is placed and rotated in two acts (exactly as the hand menu
  // does it), so catching one un-rotated in a single poll proves nothing. Only
  // a monster still standing up a full poll later is a real miss.
  //
  // `card.tap` deliberately does not resync the room (lib.js documents this),
  // so a spectator's cached snapshot lags the rotation: the events are the
  // truth here, and the snapshot only corroborates.
  const uprightSets = new Map();
  let stuckUpright = null;
  const rotated = new Set();

  while (Date.now() < deadline) {
    await sleep(1200);
    const s = host.lastState();
    if (!s) continue;
    if (s.matchResult) break;
    if ((s.turnNumber ?? 1) !== lastTurn) {
      lastTurn = s.turnNumber ?? 1;
      lastAdvance = Date.now();
    }
    for (const m of host.messages.slice(attacksSince)) {
      if (m.type === 'room.event' && m.action?.kind === 'card.tap' && m.action.tapped) {
        rotated.add(m.action.iid);
      }
    }
    const seenThisPoll = new Set();
    for (const p of s.players) {
      if (p.life !== 8000) lpMoved = true;
      for (const card of p.battlefield ?? []) {
        // ---- 3) Cards land in the printed grid, not adrift on the felt.
        if (inRow(card, 1) && !card.faceDown) sawSummon = true;
        if (inRow(card, 2) && card.faceDown) sawBackrow = true;
        // ---- 6b) A Set monster must settle into Defense Position and stay
        // there: there is no untap step to stand it back up.
        if (inRow(card, 1) && card.faceDown && !card.tapped && !rotated.has(card.iid)) {
          seenThisPoll.add(card.iid);
          const runs = (uprightSets.get(card.iid) ?? 0) + 1;
          uprightSets.set(card.iid, runs);
          if (runs > 1) stuckUpright = card.iid;
        }
      }
    }
    for (const iid of uprightSets.keys()) if (!seenThisPoll.has(iid)) uprightSets.delete(iid);
    // ---- 6) An attacker must still be in Attack Position: rotation is
    // Defense Position in this game, so a "tapped" attacker cannot exist.
    for (const a of s.combat?.attackers ?? []) {
      const card = s.players.flatMap((p) => p.battlefield ?? []).find((c) => c.iid === a.iid);
      if (card?.tapped) rotatedAttacker = true;
    }
    t.ok(
      Date.now() - lastAdvance < STALL_MS,
      'the duel keeps advancing',
      `no turn change for ${Math.round((Date.now() - lastAdvance) / 1000)}s`,
    );
    if (Date.now() - lastAdvance >= STALL_MS) break;
  }

  const final = host.lastState();
  t.ok((final.turnNumber ?? 1) > 1, 'turns advanced', `turn ${final.turnNumber}`);
  t.ok(sawSummon, 'a monster was summoned into a Monster Zone');
  t.ok(sawBackrow, 'a card was set face-down in the Spell & Trap row');
  // ---- 4) Attacks are declared, and they name what they are battling.
  const attacks = attacksSeen();
  t.ok(attacks.length > 0, 'attacks were declared', `${attacks.length}`);
  t.ok(
    attacks.every((a) => a.targetIid || a.defenderSeat != null),
    'every attack names a target monster or a defending seat',
  );
  // ---- 5) Battle damage lands on somebody.
  t.ok(lpMoved, 'Life Points moved - battle damage is being settled');
  t.ok(!rotatedAttacker, 'declaring an attack never rotates the attacker into defense');

  t.ok(
    stuckUpright == null,
    'a Set monster settles into Defense Position and is never stood back up',
    `still upright: ${stuckUpright}`,
  );

  await deleteRoom(host, roomId).catch(() => null);
  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('yugioh-duel crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'yugioh-duel', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
