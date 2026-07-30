import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import { useGame } from '../state/gameStore.ts';
import { useCollection } from '../state/collectionStore.ts';
import type { PackCard } from './boosters.ts';

/**
 * Recording a pack against the account's collection - the ONE place a ripped
 * pack becomes a permanent pull, wherever it was ripped.
 *
 * Packs come from two surfaces (the boosters page and the floating dock), and
 * both must agree on what happens next: POST the cards, let the SERVER decide
 * what is new and what is notable (it owns the collection and the single
 * `is_notable` rule), announce the best few to the table, and nudge the library
 * page if it is holding a copy of the collection.
 */

/**
 * A pack can legally contain several notable cards (a foil rare plus a mythic).
 * Broadcasting all of them turns a lucky pack into a wall of toasts at every
 * seat, so the table hears about the best few and the rest go to the feed.
 */
const NOTIFY_MAX = 2;

/**
 * A pack is unrepeatable - the cards are already on screen, and the player
 * cannot open it again - so a dropped connection or a server hiccup gets a
 * couple of quiet retries before the pull is written off as lost.
 */
const RETRY_DELAYS_MS = [600, 1800];

/**
 * Worth sending again? The POST is NOT idempotent - every entry bumps that
 * printing's pull count - so it may only be repeated when the pulls cannot
 * have been written: a fetch that never got an answer (offline, DNS, TLS), a
 * timeout, a rate limit, or a gateway that never reached the app. A 4xx
 * (signed out, malformed, too many cards) fails identically forever, and a 500
 * came from the handler itself, which may have stored some of the pack.
 */
function retryable(error: unknown): boolean {
  if (error instanceof api.ApiError) {
    return error.status === 408 || error.status === 429 || (error.status >= 502 && error.status <= 504);
  }
  return true;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Record one opened pack. Resolves with the server's verdict (what was new,
 * what was notable, the running totals); rejects only once the request has
 * failed for good, which callers treat as "opened offline, not saved".
 */
export async function recordPack(
  cards: PackCard[],
  setCode: string,
  released: string,
): Promise<api.PullsResult> {
  const pulls = cards.map((card) => ({
    scryfallId: card.id,
    name: card.name,
    setCode,
    rarity: card.rarity,
    foil: card.foil,
    // The set's release date: without it the server cannot judge a 1993-94
    // rare notable, and that window is where the Power Nine came from.
    released,
  }));

  let result: api.PullsResult;
  for (let attempt = 0; ; attempt += 1) {
    try {
      result = await api.recordPulls(pulls);
      break;
    } catch (error) {
      // Out of delays is out of attempts.
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !retryable(error)) throw error;
      await wait(delay);
    }
  }

  // The relay is table-scoped: it rejects a pull from someone who is not in a
  // room, so a pack opened in the lobby simply is not announced.
  if (useGame.getState().room) {
    for (const card of result.notable.slice(0, NOTIFY_MAX)) {
      ws.send({
        type: 'pull.notify',
        scryfallId: card.scryfallId,
        name: card.name,
        setCode: card.setCode,
        rarity: card.rarity,
        foil: card.foil,
      });
    }
  }

  // The library page keeps its own copy of the collection. Only nudge it when
  // it has actually been opened this session.
  const collection = useCollection.getState();
  if (collection.loaded) void collection.refresh();

  return result;
}

/**
 * Non-blocking version: it returns the pack it was handed, so a caller can wrap
 * the pack in place and a failed POST can never break the opening it belongs to.
 *
 * `onFailed` runs once the retries above are exhausted and the pack is lost for
 * good. Pass it - a pull that vanishes without a word is worse than a slow one,
 * and the pack dock already says as much with `pdNotSaved`.
 */
export function recordPackSilently(
  cards: PackCard[],
  setCode: string,
  released: string,
  onFailed?: (error: unknown) => void,
): PackCard[] {
  void recordPack(cards, setCode, released).catch((error: unknown) => {
    // Offline or signed out: the pack still opened, it just did not land.
    onFailed?.(error);
  });
  return cards;
}
