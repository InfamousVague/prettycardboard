// Seeds the four playtest users and uploads the four Final Fantasy precons
// from src/data/precons.json as each user's deck. Idempotent: re-running
// logs in instead of registering and updates decks in place.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PlaytestClient } from './lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRECONS_PATH = join(HERE, '..', 'src', 'data', 'precons.json');

export const PASSWORD = 'playtest1';

/// username -> precon deck id in precons.json
export const ASSIGNMENTS = {
  pt_alice: 'scions-and-spellcraft',
  pt_bob: 'counter-blitz',
  pt_carol: 'limit-break',
  pt_dana: 'revival-trance',
};

export function loadPrecons() {
  const data = JSON.parse(readFileSync(PRECONS_PATH, 'utf8'));
  const byId = {};
  for (const deck of data.decks) byId[deck.id] = deck;
  return byId;
}

/// Precon -> server deck payload. Card entries carry real scryfall ids.
function deckPayload(precon) {
  return {
    name: precon.name,
    format: 'commander',
    cards: precon.cards.map((c) => ({
      scryfallId: c.id,
      name: c.name,
      quantity: c.quantity,
      board: c.board, // commander | main | side
    })),
  };
}

/// Ensure one user exists and owns their assigned precon (by deck name).
/// Returns { client, deckId, deckName, cardTotal } (client NOT connected).
export async function ensureUserAndDeck(username) {
  const precons = loadPrecons();
  const precon = precons[ASSIGNMENTS[username]];
  if (!precon) throw new Error(`no precon assignment for ${username}`);
  const client = new PlaytestClient(username, { password: PASSWORD });
  await client.ensureUser();
  const payload = deckPayload(precon);
  const list = await client.api('GET', '/api/decks');
  if (list.status !== 200) throw new Error(`GET /api/decks: ${list.status}`);
  const existing = list.json.find((d) => d.name === payload.name);
  let deckId;
  if (existing) {
    const upd = await client.api('PUT', `/api/decks/${existing.id}`, payload);
    if (upd.status !== 200) throw new Error(`PUT deck: ${upd.status}`);
    deckId = existing.id;
  } else {
    const crt = await client.api('POST', '/api/decks', payload);
    if (crt.status !== 201) throw new Error(`POST deck: ${crt.status}`);
    deckId = crt.json.id;
  }
  const cardTotal = precon.cards.filter((c) => c.board !== 'side').reduce((n, c) => n + c.quantity, 0);
  return { client, deckId, deckName: payload.name, cardTotal };
}

/// Ensure all four users + decks. Returns map username -> {deckId, deckName, cardTotal}.
export async function ensureSeed(usernames = Object.keys(ASSIGNMENTS)) {
  const out = {};
  for (const username of usernames) {
    const { deckId, deckName, cardTotal } = await ensureUserAndDeck(username);
    out[username] = { deckId, deckName, cardTotal };
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  ensureSeed()
    .then((seeded) => {
      for (const [user, info] of Object.entries(seeded)) {
        console.log(`${user}: deck "${info.deckName}" (${info.deckId}, ${info.cardTotal} cards)`);
      }
      console.log('seed complete');
    })
    .catch((e) => {
      console.error('seed failed:', e.message);
      process.exit(1);
    });
}
