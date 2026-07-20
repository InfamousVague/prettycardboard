import cyberpunkData from '../../data/cyberpunk-cards.json' with { type: 'json' };
import type { DeckCard } from '../net/types.ts';

/**
 * The bundled official Cyberpunk TCG card set (data + art), the cyberpunk-game
 * analogue of cards.ts. Synced by scripts/sync-cyberpunk.mjs from Netdeck.gg's
 * public API; every card face ships under public/cache/cyberpunk/ so play is
 * instant and offline-capable. Card identity is the Netdeck UUID (stored in the
 * same slot MTG uses for its Scryfall id).
 */

export interface CyberpunkCard {
  id: string;
  externalId: string | null;
  name: string;
  subname: string | null;
  displayName: string;
  slug: string | null;
  /** Legend | Unit | Gear | Program */
  type: string | null;
  /** Red | Yellow | Green | Blue */
  color: string | null;
  cost: number | null;
  power: number | null;
  ram: number | null;
  /** Can be played face-down as an Eddie (the currency mechanic). */
  isEddiable: boolean;
  classifications: string[];
  keywords: string[];
  rulesText: string | null;
  flavorText: string | null;
  rarity: string | null;
  set: { code: string; name: string } | null;
  printNumber: string | null;
  artist: string | null;
  legality: string | null;
  /** Web path to the bundled rendered card face (under public/). */
  image: string;
  /** Web path to bundled raw art, when available (usually null - CDN-gated). */
  art: string | null;
}

interface CyberpunkCatalog {
  game: string;
  source: string;
  fetchedAt: string;
  count: number;
  sets: { code: string; name: string }[];
  colors: string[];
  types: string[];
  classifications: string[];
  cards: CyberpunkCard[];
}

const CATALOG = cyberpunkData as CyberpunkCatalog;

export const CYBERPUNK_CARDS: CyberpunkCard[] = CATALOG.cards;
export const CYBERPUNK_SETS = CATALOG.sets;
export const CYBERPUNK_TYPES = CATALOG.types; // Legend, Unit, Gear, Program
export const CYBERPUNK_COLORS = CATALOG.colors; // Red, Yellow, Green, Blue
export const CYBERPUNK_CLASSIFICATIONS = CATALOG.classifications;

const BY_ID = new Map(CYBERPUNK_CARDS.map((card) => [card.id, card]));
const BASE = import.meta.env.BASE_URL;

export function cyberpunkCard(id: string | undefined): CyberpunkCard | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The bundled rendered card face for a Cyberpunk card id (empty if unknown). */
export function cyberpunkImage(id: string | undefined): string {
  return id && BY_ID.has(id) ? `${BASE}cache/cyberpunk/${id}.webp` : '';
}

/** Faction accent colors, mirroring the printed frames. */
export const CYBERPUNK_COLOR_HEX: Record<string, string> = {
  Red: '#e2465b',
  Yellow: '#f4d03f',
  Green: '#3fca7a',
  Blue: '#3f9ce2',
};

/** The Legends (hero cards) - one anchors each deck like a commander. */
export function cyberpunkLegends(): CyberpunkCard[] {
  return CYBERPUNK_CARDS.filter((card) => card.type === 'Legend');
}

/** A Cyberpunk card as the protocol's deck-card list entry (Legend -> the
 * "commander" board slot the server already understands). */
export function cyberpunkDeckCard(card: CyberpunkCard, quantity = 1): DeckCard {
  return {
    scryfallId: card.id,
    name: card.displayName,
    quantity,
    board: card.type === 'Legend' ? 'commander' : 'main',
  };
}

export interface CyberpunkStarter {
  id: string;
  name: string;
  color: string;
  /** Cover/anchor Legend (the first of the three), for art + browse tiles. */
  legend: CyberpunkCard;
  /** All three Legends (unique names) that set the deck's RAM budget. */
  legends: CyberpunkCard[];
  cards: DeckCard[];
}

/**
 * The OFFICIAL Cyberpunk TCG starter decks (cyberpunktcg.com print-and-play):
 * two dual-color identities — Embracing Power (Arasaka, Red/Green) and The Heist
 * (Mercs, Blue/Yellow) — transcribed from the official demo PDFs and mapped to
 * the bundled set's ids. These are the real learn-to-play decklists (3 Legends +
 * 27 cards), so they sit intentionally below the 40-50 constructed minimum. See
 * the deck-building rules in the gameplay guide: exactly 3 unique-name Legends,
 * <=3 copies of a card, and each card's RAM <= the sum of the Legends' RAM of
 * that card's color (all satisfied here).
 */
interface OfficialPrecon {
  id: string;
  name: string;
  color: string;
  /** Cover Legend id (for the deck-stack art / browse tile). */
  coverId: string;
  legendIds: string[];
  cards: { id: string; qty: number }[];
}

const OFFICIAL_PRECONS: OfficialPrecon[] = [
  {
    id: 'cp-arasaka',
    name: 'Embracing Power',
    color: 'Red / Green',
    coverId: '31fa5825-946a-4ca2-afa8-8f07b9898d6a', // Yorinobu Arasaka
    legendIds: [
      '72358c7d-9f29-4ef6-a682-f5bfc72c7714', // Goro Takemura — Hands Unclean
      '31fa5825-946a-4ca2-afa8-8f07b9898d6a', // Yorinobu Arasaka — Embracing Destruction
      'cf50fa24-bf94-4c35-bcc1-c6d56a6f68d8', // Saburo Arasaka — Stubborn Patriarch
    ],
    cards: [
      { id: '066641c5-acc2-45f4-ba67-16a8d20cce73', qty: 1 }, // Minotaur
      { id: '3c4e7fcb-933d-4712-9ce7-6052a14f8e94', qty: 2 }, // Swordwise Huscle
      { id: '28198e04-60e2-4f81-9786-903a9a947d7a', qty: 3 }, // Mantis Blades
      { id: '4670d02b-b97a-4771-bb7e-65bdc012530e', qty: 3 }, // Satori — Sword of Saburo
      { id: 'a708461f-1f91-4789-bb0d-96e3de5fcf44', qty: 3 }, // Industrial Assembly
      { id: '144c3559-3518-4c01-b9e6-af42b7166661', qty: 2 }, // Over the Edge
      { id: '71652e73-984a-4630-be47-af947f87d5c1', qty: 3 }, // Corpo Security
      { id: '917e6515-ed23-4a1d-baaa-474d879bdabc', qty: 3 }, // Emergency Atlus
      { id: '4a8dfe3f-980d-4370-ac10-6bd989042cdf', qty: 3 }, // Field Operator
      { id: '08e6a687-56b7-4ac1-982f-8a8d6d0c0bc5', qty: 1 }, // Goro Takemura — Losing His Way
      { id: '71fb410b-b56e-42b2-a793-4c49e935b9f1', qty: 3 }, // Corporate Surveillance
    ],
  },
  {
    id: 'cp-mercs',
    name: 'The Heist',
    color: 'Blue / Yellow',
    coverId: '627186b3-cffb-4228-aed4-b3ee35235fb6', // V — Corporate Exile
    legendIds: [
      '627186b3-cffb-4228-aed4-b3ee35235fb6', // V — Corporate Exile
      'f090dc44-d7f0-4aec-a19e-9213155a6611', // Viktor Vektor — Sit Down and Relax
      '40502c1f-78a2-426a-a706-c60ebd4b31e3', // Jackie Welles — Pour One Out For Me
    ],
    cards: [
      { id: '654f2289-5d75-4f8b-bd35-702031fbb214', qty: 3 }, // Kiroshi Optics
      { id: 'a1e60653-5e28-49ee-9798-d16520b553c3', qty: 3 }, // Delamain Cab
      { id: 'a3cc3d15-8e6a-4684-b2ca-c843b4a854e2', qty: 3 }, // Evelyn Parker
      { id: '14d87f2a-8bd7-424f-b65b-3659156cef81', qty: 3 }, // Psycho Squad
      { id: '0cd37c43-e722-48eb-91ef-4c1bd1645215', qty: 3 }, // Floor It
      { id: 'df06b6e2-1675-48a3-bfe2-d0bc4c5f35eb', qty: 2 }, // Dying Night
      { id: 'b05cb065-309e-45a3-bbe0-20f4b6ea71aa', qty: 2 }, // Secondhand Bombus
      { id: '6720e7fd-d1e8-4c8a-9ff2-f51f62241902', qty: 2 }, // Mandibular Upgrade
      { id: 'd039e4b3-9b83-40da-8d8f-b1dfb1f172f1', qty: 2 }, // Afterparty at Lizzie's
      { id: 'ad13a7bc-c49d-4166-8a9c-965e7bfa9b8f', qty: 2 }, // Reboot Optics
      { id: 'f61b944a-32e3-4085-894b-7bd498325156', qty: 1 }, // Dexter Deshawn
      { id: '619429c9-132f-496e-8aa0-414e850c87ec', qty: 1 }, // MTOD12 Flathead
    ],
  },
];

/** Build a Cyberpunk starter from an official precon list; drops any id not in
 * the bundled set (keeps the deck playable even if the catalog drifts). */
function buildOfficialDeck(precon: OfficialPrecon): CyberpunkStarter | null {
  const legends = precon.legendIds
    .map((id) => BY_ID.get(id))
    .filter((c): c is CyberpunkCard => c !== undefined);
  const cover = BY_ID.get(precon.coverId) ?? legends[0];
  if (legends.length === 0 || !cover) return null;
  const cards: DeckCard[] = [
    ...legends.map((legend) => cyberpunkDeckCard(legend, 1)),
    ...precon.cards
      .map(({ id, qty }) => {
        const card = BY_ID.get(id);
        return card ? cyberpunkDeckCard(card, qty) : null;
      })
      .filter((c): c is DeckCard => c !== null),
  ];
  return { id: precon.id, name: precon.name, color: precon.color, legend: cover, legends, cards };
}

/**
 * The Cyberpunk deck catalog: the two official starter decks — the discover/
 * browse content and the set seeded on first sign-in.
 */
export function cyberpunkCatalog(): CyberpunkStarter[] {
  return OFFICIAL_PRECONS.map(buildOfficialDeck).filter((deck): deck is CyberpunkStarter => deck !== null);
}

/** The starter set seeded on first sign-in (identical to the catalog). */
export function cyberpunkStarters(): CyberpunkStarter[] {
  return cyberpunkCatalog();
}
