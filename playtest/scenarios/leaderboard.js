// Scenario: the global ladder, and a friend's standing on the roster.
//
// Neither existed. There was a rating column and an Elo update behind it, but
// no endpoint that ranked anybody - so a player could see their own number and
// nothing else: no board, and no way to check a friend's rank without asking
// them. Two additions:
//
//   GET /api/leaderboard  - the ladder, best first
//   GET /api/friends      - each friend now carries rating, place and record
//
// The invariants worth holding:
//   1. Only players who have FINISHED a ranked match appear. Every account
//      seeds at the same rating, so listing everyone opens the board with a
//      wall of identical numbers in signup order - a ranking that is not one.
//   2. The board and a player's own stats agree about where they sit. They are
//      computed by different queries, and disagreeing is worse than either.
//   3. Equal ratings share a place (1, 2, 2, 4), not row order.
//   4. Friends carry their standing, so the friends page needs no extra call.
import { PlaytestClient, Assert, sleep } from '../lib.js';
import { PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('leaderboard');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  const friend = new PlaytestClient('pt_bob', { password: PASSWORD, assert: t });
  await me.ensureUser();
  await friend.ensureUser();

  // ---- 1) The board exists and is ordered.
  const board = await me.api('GET', '/api/leaderboard?limit=50');
  t.eq(board.status, 200, 'the ladder answers');
  const entries = board.json?.entries ?? [];
  t.ok(Array.isArray(entries), 'it returns entries', typeof entries);
  const ratings = entries.map((e) => e.rating);
  t.ok(
    ratings.every((r, i) => i === 0 || ratings[i - 1] >= r),
    'best first',
    JSON.stringify(ratings.slice(0, 8)),
  );
  t.ok(
    entries.every((e) => (e.played ?? 0) > 0),
    'nobody appears without a finished ranked match',
    JSON.stringify(entries.filter((e) => (e.played ?? 0) === 0).map((e) => e.username)),
  );
  t.ok(
    entries.every((e) => e.wins + e.losses === e.played),
    'the record adds up',
  );

  // ---- 3) Ties share a place, and places never go backwards.
  let ok = true;
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const cur = entries[i];
    if (cur.rating === prev.rating && cur.position !== prev.position) ok = false;
    if (cur.rating < prev.rating && cur.position <= prev.position) ok = false;
  }
  t.ok(ok, 'equal ratings share a place, and places only move forward');

  // ---- 2) The board and my own stats agree.
  const mine = await me.api('GET', '/api/me/stats');
  t.eq(mine.status, 200, 'my stats answer');
  const myRow = entries.find((e) => e.userId === me.userId);
  if (myRow) {
    t.eq(mine.json.position, myRow.position, 'the board and my stats agree on my place');
    t.eq(mine.json.rating, myRow.rating, '...and on my rating');
  } else {
    t.eq(mine.json.position, null, 'off the board means no place, not a made-up one');
  }

  // A player who has never finished a ranked match is not on the ladder.
  const fresh = new PlaytestClient(`pt_fresh_${Date.now().toString(36)}`, {
    password: PASSWORD,
    assert: t,
  });
  await fresh.ensureUser();
  const freshStats = await fresh.api('GET', '/api/me/stats');
  t.eq(freshStats.json.position, null, 'a brand-new account has no ladder place');
  const boardAgain = await me.api('GET', '/api/leaderboard?limit=200');
  t.ok(
    !(boardAgain.json.entries ?? []).some((e) => e.userId === fresh.userId),
    'and does not appear on the board',
  );

  // ---- 4) Friends carry their standing.
  await me.connect();
  const before = await me.api('GET', '/api/friends');
  const known = new Set((before.json?.friends ?? []).map((f) => f.userId));
  if (!known.has(friend.userId)) {
    // Become friends so there is a roster row to inspect.
    await me.api('POST', '/api/friends/requests', { toUserId: friend.userId });
    const incoming = await friend.api('GET', '/api/friends');
    const req = (incoming.json?.incoming ?? []).find((r) => r.from.userId === me.userId);
    if (req) await friend.api('POST', `/api/friends/requests/${req.id}/accept`);
    await sleep(300);
  }
  const roster = await me.api('GET', '/api/friends');
  const row = (roster.json?.friends ?? []).find((f) => f.userId === friend.userId);
  t.ok(row, 'the friend is on my roster', JSON.stringify(roster.json?.friends));
  if (row) {
    t.ok(typeof row.rating === 'number', 'a roster row carries a rating', typeof row.rating);
    t.ok(
      typeof row.wins === 'number' && typeof row.losses === 'number',
      'and a record',
    );
    t.ok('position' in row, 'and a ladder place (null when unranked)');
    // Whatever the board says about them, the roster must say the same.
    const theirRow = (boardAgain.json.entries ?? []).find((e) => e.userId === friend.userId);
    if (theirRow) {
      t.eq(row.rating, theirRow.rating, 'the roster and the board agree on their rating');
      t.eq(row.position, theirRow.position, '...and on their place');
    }
  }

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('leaderboard crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'leaderboard', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
