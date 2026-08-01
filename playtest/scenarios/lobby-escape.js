// Scenario: the pregame lobby's escape hatches. A lobby can otherwise become
// permanently unstartable - a seated player who never readies (or goes
// offline, or brings no deck) blocks room.start forever with nobody able to
// do anything about it. This proves the three ways out:
//   1. A stuck lobby genuinely refuses to start (the problem).
//   2. room.kick: the host clears the stuck seat and the table starts.
//      Guards: host-only, pre-start only, never yourself, real seats only.
//   3. The kicked player is routed out (room.closed) and can sit back down.
//   4. Closing the table (host DELETE) sends every remaining seat home.
import { PlaytestClient, Assert, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('lobby-escape');
  const host = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const guest = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await host.ensureUser();
  await guest.ensureUser();
  await host.connect();
  await guest.connect();
  host.send({ type: 'room.leave' });
  guest.send({ type: 'room.leave' });
  await sleep(300);

  const decks = await host.api('GET', '/api/decks');
  const deckId = decks.json?.[0]?.id;
  t.ok(Boolean(deckId), 'host has a deck to sit with', '');
  const guestDecks = await guest.api('GET', '/api/decks');
  const guestDeck = guestDecks.json?.[0]?.id;

  const mk = await host.api('POST', '/api/rooms', {
    name: 'Escape hatch lab', seats: 4, persistent: false, format: 'commander',
  });
  const roomId = mk.json.roomId;
  host.joinRoom(roomId, deckId);
  await host.expectState((s) => s.players.length === 1, 'host seated', 5000);
  guest.joinRoom(roomId, guestDeck);
  await host.expectState((s) => s.players.length === 2, 'guest seated', 5000);

  // ---- 1) The stuck lobby: the host is ready, the guest never is.
  host.setReady(true);
  await host.expectState(
    (s) => s.players.find((p) => p.userId === host.userId)?.ready === true,
    'host ready',
    5000,
  );
  let mark = host.mark();
  host.send({ type: 'room.start' });
  let err = await host.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.ok(err != null, 'an unready seat blocks the start', JSON.stringify(err));
  t.eq(host.lastState().started, false, 'the table really did not start');

  // ---- 2) Kick guards, then the kick itself.
  mark = guest.mark();
  guest.send({ type: 'room.kick', seat: 0 });
  err = await guest.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.eq(err?.code, 'forbidden', 'a non-host cannot kick');

  mark = host.mark();
  const hostSeat = host.me(host.lastState()).seat;
  host.send({ type: 'room.kick', seat: hostSeat });
  err = await host.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.eq(err?.code, 'forbidden', 'the host cannot kick themselves');

  mark = host.mark();
  host.send({ type: 'room.kick', seat: 3 });
  err = await host.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.eq(err?.code, 'no_such_seat', 'an empty seat cannot be kicked');

  const guestSeat = guest.me(guest.lastState()).seat;
  mark = host.mark();
  const guestMark = guest.mark();
  host.send({ type: 'room.kick', seat: guestSeat });
  await host.expectState((s) => s.players.length === 1, 'the stuck seat is gone', 5000, { since: mark });
  await host.expectLog(/pt_alice removes pt_bob from the table/, 'the removal is narrated', {
    since: mark, timeoutMs: 5000,
  });

  // ---- 3) The kicked player is routed out, and can sit back down.
  const closed = await guest.waitFor((m) => m.type === 'room.closed', { since: guestMark, timeoutMs: 5000 });
  t.ok(closed != null, 'the removed player is told the table is gone for them', '');
  const rejoinMark = host.mark();
  guest.joinRoom(roomId, guestDeck);
  const rejoined = await host.expectState(
    (s) => s.players.length === 2,
    'a removed player can rejoin',
    6000,
    { since: rejoinMark },
  );
  mark = host.mark();
  // The host's own snapshot is the authority on where the rejoiner landed.
  const rejoinedSeat = rejoined?.players.find((p) => p.userId === guest.userId)?.seat;
  t.ok(rejoinedSeat != null, 'the rejoined seat is visible to the host', JSON.stringify(rejoined?.players.map((p) => ({ u: p.username, s: p.seat }))));
  host.send({ type: 'room.kick', seat: rejoinedSeat });
  await host.expectState((s) => s.players.length === 1, 'and can be cleared again', 5000, { since: mark });

  // ---- 4) The table starts once the blocker is gone (solo seat is legal).
  mark = host.mark();
  host.send({ type: 'room.start' });
  await host.expectState((s) => s.started === true, 'the freed lobby starts', 6000, { since: mark });

  // ---- 5) Kicking is pre-start only.
  mark = host.mark();
  host.send({ type: 'room.kick', seat: 1 });
  err = await host.waitFor((m) => m.type === 'error', { since: mark, timeoutMs: 4000 });
  t.eq(err?.code, 'already_started', 'kicking is refused once the game starts');

  // ---- 6) Closing the table sends the host home too.
  const closeMark = host.mark();
  const res = await host.api('DELETE', `/api/rooms/${roomId}`);
  t.ok([200, 204].includes(res.status), 'host closed the table', `status ${res.status}`);
  const hostClosed = await host.waitFor((m) => m.type === 'room.closed', {
    since: closeMark, timeoutMs: 5000,
  });
  t.ok(hostClosed != null, 'closing routes the host out', '');
  const gone = await host.api('GET', `/api/rooms/${mk.json.code}`);
  t.eq(gone.status, 404, 'the closed table is really gone');

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('lobby-escape crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'lobby-escape', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
