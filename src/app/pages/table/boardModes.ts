import { PRECONS } from '../../data/cards.ts';
import type { CardInst } from '../../net/types.ts';

/**
 * Board layout modes. Modes only shape where YOUR drops land (the x/y sent to
 * the server); everyone else's cards always render at their raw coordinates.
 */

export type BoardMode = 'free' | 'assist' | 'rows' | 'grid';

export const BOARD_MODES: BoardMode[] = ['free', 'assist', 'rows', 'grid'];

const modeKey = (userId: string | undefined) => `pc.boardmode.${userId ?? 'anon'}`;

export function loadBoardMode(userId: string | undefined): BoardMode {
  try {
    const raw = localStorage.getItem(modeKey(userId));
    if (raw && (BOARD_MODES as string[]).includes(raw)) return raw as BoardMode;
  } catch {
    /* storage unavailable - default */
  }
  return 'free';
}

export function saveBoardMode(userId: string | undefined, mode: BoardMode): void {
  try {
    localStorage.setItem(modeKey(userId), mode);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------------ */
/* Battlefield card scale: a display preference, persisted per user.         */

export const CARD_SCALE_MIN = 0.6;
export const CARD_SCALE_MAX = 1.6;
export const CARD_SCALE_STEP = 0.1;

export function clampCardScale(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(CARD_SCALE_MAX, Math.max(CARD_SCALE_MIN, stepped));
}

const scaleKey = (userId: string | undefined) => `pc.cardscale.${userId ?? 'anon'}`;

export function loadCardScale(userId: string | undefined): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(scaleKey(userId)) ?? '');
    if (Number.isFinite(raw)) return clampCardScale(raw);
  } catch {
    /* storage unavailable - default */
  }
  return 1;
}

export function saveCardScale(userId: string | undefined, scale: number): void {
  try {
    localStorage.setItem(scaleKey(userId), String(scale));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------------ */
/* Card classification (best effort - bundled precon type lines plus name    */
/* heuristics; the server never cares, this only steers assisted drops).     */
/* ------------------------------------------------------------------------ */

const TYPE_LINES = new Map<string, string>();
for (const precon of PRECONS) {
  for (const card of precon.cards) TYPE_LINES.set(card.id, card.typeLine);
}

const BASIC_LANDS = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i;
const LANDISH_NAME = /\b(land|temple|tower|grove|cavern|citadel|sanctum|wilds|expanse|estuary|frontier|command tower)\b/i;

export function typeLineOf(card: CardInst): string | undefined {
  return card.scryfallId ? TYPE_LINES.get(card.scryfallId) : undefined;
}

export function isLand(card: CardInst): boolean {
  const line = typeLineOf(card);
  if (line) return /\bLand\b/.test(line) && !/\bCreature\b/.test(line);
  if (BASIC_LANDS.test(card.name.trim())) return true;
  return !card.power && !card.isToken && LANDISH_NAME.test(card.name);
}

export function isCreature(card: CardInst): boolean {
  const line = typeLineOf(card);
  if (line) return /\bCreature\b/.test(line);
  return card.power != null && card.toughness != null;
}

/**
 * Effective power/toughness for combat declarations: printed base plus +1/+1
 * and -1/-1 counters. Non-numeric bases (`*`) fall back to 0 - the player can
 * fix the outcome by hand, combat math just needs a number.
 */
export function effectivePT(card: CardInst): { power: string; toughness: string } {
  const base = (value: string | undefined) => {
    const parsed = parseInt((value ?? '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const plus = card.counters['+1/+1'] ?? 0;
  const minus = card.counters['-1/-1'] ?? 0;
  return {
    power: String(base(card.power) + plus - minus),
    toughness: String(base(card.toughness) + plus - minus),
  };
}

/** "3/3" chip text for combat UI; empty string when the card has no P/T at all. */
export function ptLabel(card: CardInst): string {
  if (card.power == null && card.toughness == null) return '';
  const { power, toughness } = effectivePT(card);
  return `${power}/${toughness}`;
}

/* ------------------------------------------------------------------------ */
/* Drop snapping                                                             */
/* ------------------------------------------------------------------------ */

/** Rows-mode lanes (normalized y centers): other spells top, creatures middle, lands bottom. */
export const LANE_OTHER = 0.2;
export const LANE_CREATURE = 0.52;
export const LANE_LAND = 0.84;

/** Assist-mode bottom strip for lands. */
export const ASSIST_LAND_Y = 0.86;

/** Grid pitch in px, converted per drop against the live field rect. */
export const GRID_PX = 56;

const clamp01 = (v: number, max = 0.97) => Math.min(max, Math.max(0.03, v));

export function snapDrop(
  mode: BoardMode,
  pos: { x: number; y: number },
  card: CardInst | undefined,
  fieldRect: DOMRect | null,
): { x: number; y: number } {
  if (mode === 'rows') {
    const lane = card && isLand(card) ? LANE_LAND : card && isCreature(card) ? LANE_CREATURE : LANE_OTHER;
    return { x: clamp01(pos.x), y: lane };
  }
  if (mode === 'grid' && fieldRect && fieldRect.width > 0 && fieldRect.height > 0) {
    const stepX = GRID_PX / fieldRect.width;
    const stepY = GRID_PX / fieldRect.height;
    return {
      x: clamp01(Math.round(pos.x / stepX) * stepX),
      y: clamp01(Math.round(pos.y / stepY) * stepY, 0.92),
    };
  }
  if (mode === 'assist' && card && isLand(card)) {
    return { x: clamp01(pos.x), y: ASSIST_LAND_Y };
  }
  return pos;
}

/**
 * Which battlefield card sits under a drop point (assist-mode attach). Works
 * in normalized field space; the hit box is one card footprint around each
 * candidate's center.
 */
export function hostUnderPoint(
  cards: CardInst[],
  pos: { x: number; y: number },
  fieldRect: DOMRect | null,
  excludeIid: string,
): CardInst | null {
  if (!fieldRect || fieldRect.width === 0) return null;
  const halfW = 52 / fieldRect.width; // slightly beyond the 92px card half-width
  const halfH = 70 / fieldRect.height;
  let best: CardInst | null = null;
  let bestDist = Infinity;
  for (const card of cards) {
    if (card.iid === excludeIid || card.attachedTo === excludeIid) continue;
    const dx = Math.abs(card.x - pos.x);
    const dy = Math.abs(card.y - pos.y);
    if (dx <= halfW && dy <= halfH) {
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = card;
      }
    }
  }
  return best;
}

/**
 * Tidy: grid-align the battlefield WITHOUT reordering - cards keep their
 * visual reading order (row band, then x) and flow into neat rows. Lands get
 * their own bottom strip; attachments follow their hosts and are skipped.
 */
export function tidyPositions(
  cards: CardInst[],
  fieldRect: DOMRect | null,
): { iid: string; x: number; y: number }[] {
  if (!fieldRect || fieldRect.width === 0 || fieldRect.height === 0) return [];
  const free = cards.filter((card) => !card.attachedTo);
  const lands = free.filter((card) => isLand(card));
  const spells = free.filter((card) => !isLand(card));

  const stepX = 104 / fieldRect.width; // 92px card + gutter
  const stepY = 148 / fieldRect.height;
  const startX = Math.min(0.08, stepX / 2 + 0.02);
  const perRow = Math.max(1, Math.floor((0.94 - startX) / stepX) + 1);

  const readingOrder = (list: CardInst[]) =>
    [...list].sort((a, b) => {
      const bandA = Math.round(a.y * 4);
      const bandB = Math.round(b.y * 4);
      return bandA === bandB ? a.x - b.x : bandA - bandB;
    });

  const out: { iid: string; x: number; y: number }[] = [];
  readingOrder(spells).forEach((card, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    out.push({
      iid: card.iid,
      x: clamp01(startX + col * stepX),
      y: clamp01(0.18 + row * stepY, 0.7),
    });
  });
  readingOrder(lands).forEach((card, index) => {
    const row = Math.floor(index / perRow);
    const col = index % perRow;
    out.push({
      iid: card.iid,
      x: clamp01(startX + col * stepX),
      y: clamp01(ASSIST_LAND_Y - row * 0.09, 0.92),
    });
  });
  return out;
}
