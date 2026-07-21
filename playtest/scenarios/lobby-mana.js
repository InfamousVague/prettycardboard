// Pregame lobby + public mana permissions over the real WebSocket protocol.
// Proves readiness/deck state is authoritative and public, deck ids remain
// private, disconnect/deck changes reset readiness, only the host can start,
// and floating mana is visible to everyone but mutable only by its owner.
import { PlaytestClient, Assert, deleteRoom, readyAll } from '../lib.js';
import { ensureSeed, PASSWORD } from '../seed.js';

async function expectError(client, code, since, label, t) {
  const message = await client.waitFor(
    (candidate) => candidate.type === 'error' && candidate.code === code,
    { since, timeoutMs: 3000 },
  );
  t.ok(message, `[${client.username}] ${label}`, message ? '' : `missing ${code} error`);
  return message;
}

async function main() {
  const t = new Assert('lobby-mana');
  const names = ['pt_alice', 'pt_bob', 'pt_carol'];
  const seeded = await ensureSeed(names);
  const [alice, bob, carol] = names.map(
    (name) => new PlaytestClient(name, { password: PASSWORD, assert: t }),
  );
  for (const client of [alice, bob, carol]) {
    await client.ensureUser();
    await client.connect();
  }

  const roomResponse = await alice.api('POST', '/api/rooms', {
    name: 'pt lobby and mana',
    seats: 2,
    persistent: true,
    format: 'commander',
  });
  t.ok(roomResponse.status === 201, 'room created', `status ${roomResponse.status}`);
  const roomId = roomResponse.json.roomId;

  alice.joinRoom(roomId, seeded.pt_alice.deckId);
  await alice.expectState((state) => state.players.length === 1, 'host seated with a deck');
  bob.joinRoom(roomId, seeded.pt_bob.deckId);
  await bob.expectState((state) => state.players.length === 2, 'second player seated with a deck');
  carol.spectateRoom(roomId);
  const spectatorState = await carol.expectState(
    (state) => state.players.length === 2 && state.spectators.some((viewer) => viewer.userId === carol.userId),
    'spectator joined the lobby',
  );

  const aliceState = alice.lastState();
  const bobState = bob.lastState();
  t.ok(aliceState.players.every((player) => player.ready === false), 'players begin not ready');
  t.eq(bob.me(bobState).deckId, seeded.pt_bob.deckId, 'own deck id is present');
  t.ok(
    !('deckId' in aliceState.players.find((player) => player.userId === bob.userId)),
    'another player cannot see a private deck id',
  );
  t.ok(
    spectatorState.players.every((player) => !('deckId' in player)),
    'spectator cannot see private deck ids',
  );

  const bobPingMark = bob.mark();
  const spectatorPingMark = carol.mark();
  alice.send({ type: 'room.ping', targetUserId: bob.userId });
  const playerPing = await bob.waitFor(
    (message) =>
      message.type === 'room.ping' &&
      message.from.userId === alice.userId &&
      message.to.userId === bob.userId &&
      message.roomId === roomId,
    { since: bobPingMark, timeoutMs: 3000 },
  );
  t.ok(playerPing, 'targeted ping reaches its player with sender and recipient identity');
  await carol.assertNever('room.ping', 'targeted ping stays private from spectators', 400, { since: spectatorPingMark });

  let mark = alice.mark();
  alice.send({ type: 'room.ping', targetUserId: bob.userId });
  await expectError(alice, 'ping_cooldown', mark, 'targeted ping is rate-limited', t);

  mark = carol.mark();
  carol.send({ type: 'room.ping', targetUserId: bob.userId });
  await expectError(carol, 'forbidden', mark, 'spectator cannot ping a player', t);

  mark = alice.mark();
  alice.send({ type: 'room.start' });
  await expectError(alice, 'not_ready', mark, 'start blocked before readiness', t);
  t.ok(!alice.lastState().started, 'failed start leaves room in the lobby');

  mark = bob.mark();
  bob.send({ type: 'room.start' });
  await expectError(bob, 'forbidden', mark, 'non-host cannot start', t);

  mark = carol.mark();
  carol.setReady(true);
  await expectError(carol, 'forbidden', mark, 'spectator cannot ready a seat', t);

  mark = carol.mark();
  carol.send({ type: 'room.deck.set', deckId: seeded.pt_carol.deckId });
  await expectError(carol, 'forbidden', mark, 'spectator cannot select a deck', t);

  const bobReadyMark = bob.mark();
  const spectatorReadyMark = carol.mark();
  alice.setReady(true);
  await bob.expectState(
    (state) => state.players.find((player) => player.userId === alice.userId)?.ready === true,
    'host readiness is public to players',
    5000,
    { since: bobReadyMark },
  );
  await carol.expectState(
    (state) => state.players.find((player) => player.userId === alice.userId)?.ready === true,
    'host readiness is public to spectators',
    5000,
    { since: spectatorReadyMark },
  );

  bob.setReady(true);
  await alice.expectState((state) => state.players.every((player) => player.ready), 'both players ready');

  const deckChangeMark = alice.mark();
  bob.send({ type: 'room.deck.set', deckId: seeded.pt_bob.deckId });
  await alice.expectState(
    (state) => state.players.find((player) => player.userId === bob.userId)?.ready === false,
    'changing a deck clears that player readiness',
    5000,
    { since: deckChangeMark },
  );

  mark = alice.mark();
  alice.send({ type: 'room.deck.set', deckId: seeded.pt_bob.deckId });
  await expectError(alice, 'forbidden', mark, 'player cannot select another user deck', t);

  bob.setReady(true);
  await alice.expectState((state) => state.players.every((player) => player.ready), 'table ready after deck change');

  const offlineMark = alice.mark();
  await bob.close();
  await alice.expectState(
    (state) => {
      const player = state.players.find((candidate) => candidate.userId === bob.userId);
      return player?.online === false && player.ready === false;
    },
    'disconnect marks the seat offline and not ready',
    5000,
    { since: offlineMark },
  );

  mark = alice.mark();
  alice.send({ type: 'room.start' });
  await expectError(alice, 'players_offline', mark, 'start blocked while a seat is offline', t);

  const onlineMark = alice.mark();
  const reconnectMark = bob.mark();
  await bob.connect();
  await alice.expectState(
    (state) => state.players.find((player) => player.userId === bob.userId)?.online === true,
    'reconnected seat is public as online',
    5000,
    { since: onlineMark },
  );
  await bob.expectState(
    (state) => bob.me(state)?.online === true && bob.me(state)?.ready === false,
    'reconnected player resumes the same unready seat',
    5000,
    { since: reconnectMark },
  );

  await readyAll([alice, bob]);
  mark = carol.mark();
  carol.send({ type: 'room.start' });
  await expectError(carol, 'forbidden', mark, 'spectator cannot start', t);

  const startMark = carol.mark();
  alice.send({ type: 'room.start' });
  await carol.expectState(
    (state) => state.started && state.players.every((player) => player.handCount === 7),
    'host starts once the lobby is ready',
    5000,
    { since: startMark },
  );

  const bobManaMark = bob.mark();
  const spectatorManaMark = carol.mark();
  alice.act({ kind: 'mana.add', color: 'W', delta: 3 });
  await bob.expectEvent(
    (message) =>
      message.actor === alice.userId &&
      message.action.kind === 'mana.add' &&
      message.action.color === 'W' &&
      message.action.value === 3,
    'another player receives the floating mana event',
    { since: bobManaMark },
  );
  await carol.expectEvent(
    (message) =>
      message.actor === alice.userId &&
      message.action.kind === 'mana.add' &&
      message.action.color === 'W' &&
      message.action.value === 3,
    'spectator receives the floating mana event',
    { since: spectatorManaMark },
  );

  const publicManaMark = carol.mark();
  bob.act({ kind: 'mana.add', color: 'W', delta: 2 });
  await carol.expectEvent(
    (message) =>
      message.actor === bob.userId &&
      message.action.kind === 'mana.add' &&
      message.action.color === 'W' &&
      message.action.value === 2,
    'second player broadcasts only their own mana change',
    { since: publicManaMark },
  );

  const persistedManaMark = carol.mark();
  alice.requestResync();
  await carol.expectState(
    (state) => {
      const host = state.players.find((player) => player.userId === alice.userId);
      const guest = state.players.find((player) => player.userId === bob.userId);
      return host?.mana.W === 3 && guest?.mana.W === 2;
    },
    'both public mana pools persist in authoritative state',
    5000,
    { since: persistedManaMark },
  );

  mark = carol.mark();
  carol.act({ kind: 'mana.add', color: 'W', delta: 9 });
  await expectError(carol, 'forbidden', mark, 'spectator cannot mutate mana', t);

  const unchangedMark = carol.mark();
  alice.requestResync();
  await carol.expectState(
    (state) => {
      const host = state.players.find((player) => player.userId === alice.userId);
      const guest = state.players.find((player) => player.userId === bob.userId);
      return host?.mana.W === 3 && guest?.mana.W === 2;
    },
    'rejected spectator action leaves both mana pools unchanged',
    5000,
    { since: unchangedMark },
  );

  await deleteRoom(alice, roomId);
  await alice.close();
  await bob.close();
  await carol.close();

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((error) => {
  console.error('lobby-mana crashed:', error);
  console.log(`##RESULT## ${JSON.stringify({ name: 'lobby-mana', passed: 0, failed: 1, durationMs: 0, crashed: String(error) })}`);
  process.exit(1);
});