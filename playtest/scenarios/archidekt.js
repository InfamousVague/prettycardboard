// Scenario: searching and importing decks without leaving the app.
//
// Moxfield import worked by URL and nothing searched at all - you had to go to
// a website, find a deck, copy its link, come back and paste it. Searching
// Moxfield is not an option: its API root answers
//
//   {"name":"Moxfield API","notice":"This API is not intended for public use."}
//
// and its search endpoints return a Cloudflare challenge rather than JSON. So
// the searchable source is Archidekt, which answers a plain request.
//
// What this holds:
//   1. Search returns decks, reshaped to OUR schema (not Archidekt's).
//   2. A junk term returns nothing rather than erroring.
//   3. A deck imports, and its cards carry real Scryfall ids - that is what
//      keeps the printing the deck's author chose.
//   4. The commander lands on the commander board, not the maindeck.
//   5. A bad deck id is refused, not proxied.
import { PlaytestClient, Assert } from '../lib.js';
import { PASSWORD } from '../seed.js';

async function main() {
  const t = new Assert('archidekt');
  const me = new PlaytestClient('pt_alice', { password: PASSWORD, assert: t });
  await me.ensureUser();

  // ---- 1) Search answers, in our shape.
  const search = await me.api('GET', '/api/decks/search/archidekt?q=liliana');
  t.eq(search.status, 200, 'search answers');
  const results = search.json?.results ?? [];
  t.ok(results.length > 0, 'it found decks', `${results.length}`);
  t.ok(
    results.every((r) => typeof r.id === 'string' && typeof r.name === 'string'),
    'every row carries an id and a name',
  );
  t.ok(
    results.every((r) => typeof r.size === 'number'),
    'and a card count, which is what makes a row worth picking',
  );
  // The reshape is the point: the client must never depend on Archidekt's
  // own schema, so no raw field of theirs should survive.
  t.ok(
    results.every((r) => !('deckFormat' in r) && !('cards' in r)),
    'rows are reshaped, not passed through',
    JSON.stringify(Object.keys(results[0] ?? {})),
  );

  // ---- 1b) Paging. Discover browses these results a page at a time, and it
  //          works out how many pages there are from what the response says.
  //          Archidekt ignores any page size asked of it and answers 60 rows,
  //          so the server reports the size it ACTUALLY got - assuming a number
  //          here put the page count out by a factor of two and a half.
  t.ok(
    typeof search.json?.pageSize === 'number' && search.json.pageSize > 0,
    'the response says how big a page was',
    String(search.json?.pageSize),
  );
  t.eq(search.json.pageSize, results.length, '...and that is the row count it returned');
  t.ok(typeof search.json?.total === 'number', 'and how many decks matched in total', String(search.json?.total));

  const two = await me.api('GET', '/api/decks/search/archidekt?q=liliana&page=2');
  t.eq(two.status, 200, 'page 2 answers');
  const secondPage = two.json?.results ?? [];
  t.ok(secondPage.length > 0, 'page 2 has decks', `${secondPage.length}`);
  // The guard that matters: paging must actually move. A site that ignores the
  // page parameter would hand back page 1 forever and the pager would lie.
  const firstIds = new Set(results.map((r) => r.id));
  t.ok(
    secondPage.some((r) => !firstIds.has(r.id)),
    'page 2 is different decks, so paging moves',
  );

  // ---- 2) A term nobody wrote a deck about is empty, not broken.
  const junk = await me.api(
    'GET',
    '/api/decks/search/archidekt?q=zzzqqxwv-not-a-real-deck-name-9182',
  );
  t.eq(junk.status, 200, 'a junk term still answers 200');
  t.eq((junk.json?.results ?? []).length, 0, '...with no results');

  // An empty term short-circuits without troubling Archidekt at all.
  const blank = await me.api('GET', '/api/decks/search/archidekt?q=');
  t.eq(blank.status, 200, 'an empty term answers');
  t.eq((blank.json?.results ?? []).length, 0, '...and searches nothing');

  // ---- 3) Import a deck the search actually returned.
  //         Prefer a Commander-sized one so the commander check below is real.
  const pick = results.find((r) => r.size >= 90) ?? results[0];
  t.ok(pick, 'a deck to import', '');
  const deck = await me.api('GET', `/api/import/archidekt/${pick.id}`);
  t.eq(deck.status, 200, `imported ${pick.name}`);
  const cards = deck.json?.cards ?? [];
  t.ok(cards.length > 0, 'the deck has cards', `${cards.length}`);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uids = cards.map((c) => c?.card?.uid).filter(Boolean);
  t.ok(uids.length > 0, 'cards carry a Scryfall uid', `${uids.length}/${cards.length}`);
  t.ok(
    uids.every((u) => UUID.test(u)),
    'and every one is a real Scryfall id - the exact printing the author chose',
    uids.find((u) => !UUID.test(u)) ?? '',
  );
  t.ok(
    cards.every((c) => c?.card?.oracleCard?.name),
    'every card has a name to import under',
  );

  // ---- 4) The commander is on its own board. This is the mapping the client
  //         does from Archidekt's categories, so assert the data supports it.
  if (pick.size >= 90) {
    const commanders = cards.filter((c) =>
      (c.categories ?? []).some((cat) => String(cat).toLowerCase() === 'commander'),
    );
    t.ok(
      commanders.length >= 1,
      'a Commander deck names its commander in a category',
      `found ${commanders.length}`,
    );
  }

  // ---- 5) A bad id is refused here, not forwarded.
  const bad = await me.api('GET', '/api/import/archidekt/not-a-number');
  t.eq(bad.status, 400, 'a non-numeric deck id is refused');
  t.eq(bad.json?.code, 'bad_ref', '...with a reason');

  const result = t.finish();
  process.exit(result.failed ? 1 : 0);
}

main().catch((err) => {
  console.error('archidekt crashed:', err);
  console.log(`##RESULT## ${JSON.stringify({ name: 'archidekt', passed: 0, failed: 1, durationMs: 0, crashed: String(err) })}`);
  process.exit(1);
});
