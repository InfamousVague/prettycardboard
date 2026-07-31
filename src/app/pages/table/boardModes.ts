import { PRECONS } from '../../data/precons.ts';
import { printedPT, printedTypeLine } from '../../data/printedPt.ts';
import { isYugiohId, yugiohCard } from '../../data/yugioh.ts';
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

/* The phone board runs its own, much narrower scale ladder. A desktop-tuned
   scale is meaningless on a 390px screen, and clamping the desktop value into
   range left the +/- buttons looking broken (several presses with nothing on
   screen changing). Three sizes is what actually fits: one step either side of
   the default. */
export const MOBILE_SCALE_MIN = 0.55;
export const MOBILE_SCALE_MAX = 0.85;
export const MOBILE_SCALE_STEP = 0.15;
export const MOBILE_SCALE_DEFAULT = 0.7;

export function clampMobileScale(value: number): number {
  const stepped = Math.round(value * 100) / 100;
  return Math.min(MOBILE_SCALE_MAX, Math.max(MOBILE_SCALE_MIN, stepped));
}

const mobileScaleKey = (userId: string | undefined) => `pc.cardscale.mobile.${userId ?? 'anon'}`;

export function loadMobileScale(userId: string | undefined): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(mobileScaleKey(userId)) ?? '');
    if (Number.isFinite(raw)) return clampMobileScale(raw);
  } catch {
    /* storage unavailable - default */
  }
  return MOBILE_SCALE_DEFAULT;
}

export function saveMobileScale(userId: string | undefined, scale: number): void {
  try {
    localStorage.setItem(mobileScaleKey(userId), String(scale));
  } catch {
    /* ignore */
  }
}

export function saveCardScale(userId: string | undefined, scale: number): void {
  try {
    localStorage.setItem(scaleKey(userId), String(scale));
  } catch {
    /* ignore */
  }
}

/* The grid overview's own zoom, on top of the fit-to-cell factor the grid picks
   from its column count. 1 means a quadrant is drawn exactly as the staged view
   would be; below 1 the board lays out against a wider viewport, so everything
   in it is painted smaller and the mat breathes. Default sits a notch out -
   fit-to-cell alone reads as too tight once four boards are on screen. */
export const GRID_ZOOM_MIN = 0.5;
/** Well past 1: stacked duel cells lay out against their own width, so pushing
 *  the zoom up genuinely enlarges the cards rather than just cropping. */
export const GRID_ZOOM_MAX = 2;
export const GRID_ZOOM_STEP = 0.1;
export const GRID_ZOOM_DEFAULT = 0.8;

export function clampGridZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(GRID_ZOOM_MAX, Math.max(GRID_ZOOM_MIN, stepped));
}

const gridZoomKey = (userId: string | undefined) => `pc.gridzoom.${userId ?? 'anon'}`;

export function loadGridZoom(userId: string | undefined): number {
  try {
    const raw = Number.parseFloat(localStorage.getItem(gridZoomKey(userId)) ?? '');
    if (Number.isFinite(raw)) return clampGridZoom(raw);
  } catch {
    /* storage unavailable - default */
  }
  return GRID_ZOOM_DEFAULT;
}

export function saveGridZoom(userId: string | undefined, zoom: number): void {
  try {
    localStorage.setItem(gridZoomKey(userId), String(zoom));
  } catch {
    /* ignore */
  }
}

/* The grid is the DEFAULT way to watch a table: every seat laid out at once,
   opponents across from you and your own board along the bottom. Staging a
   single board is the opt-out, and the choice is remembered per user. */

const gridViewKey = (userId: string | undefined) => `pc.gridview.${userId ?? 'anon'}`;

export function loadGridView(userId: string | undefined): boolean {
  try {
    const raw = localStorage.getItem(gridViewKey(userId));
    if (raw === 'off') return false;
    if (raw === 'on') return true;
  } catch {
    /* storage unavailable - default */
  }
  return true;
}

export function saveGridView(userId: string | undefined, on: boolean): void {
  try {
    localStorage.setItem(gridViewKey(userId), on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/* The right rail collapses to its nav pill on demand, handing ~18.5rem back to
   the mats. Off by default - the life/roster/log cards are the table's HUD, and
   a player who has not asked to hide them should not have to find them. */

const railHiddenKey = (userId: string | undefined) => `pc.railhidden.${userId ?? 'anon'}`;

export function loadRailHidden(userId: string | undefined): boolean {
  try {
    return localStorage.getItem(railHiddenKey(userId)) === 'on';
  } catch {
    /* storage unavailable - default */
  }
  return false;
}

export function saveRailHidden(userId: string | undefined, on: boolean): void {
  try {
    localStorage.setItem(railHiddenKey(userId), on ? 'on' : 'off');
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
  if (!card.scryfallId) return undefined;
  // Bundled precon lines first (free), then whatever the lazy printed-P/T
  // lookups have learned - that is what classifies cards from decks the user
  // built themselves, where the precon map knows nothing.
  return TYPE_LINES.get(card.scryfallId) ?? printedTypeLine(card.scryfallId);
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

const PT_COUNTER = /^([+-]?\d+)\/([+-]?\d+)$/;

export function parsePtCounter(counter: string): { power: number; toughness: number } | null {
  const match = PT_COUNTER.exec(counter.trim());
  if (!match) return null;
  const power = Number.parseInt(match[1]!, 10);
  const toughness = Number.parseInt(match[2]!, 10);
  return Number.isFinite(power) && Number.isFinite(toughness) ? { power, toughness } : null;
}

const signed = (value: number) => (value >= 0 ? `+${value}` : String(value));

export function formatPtCounter(power: number, toughness: number): string {
  return `${signed(Math.trunc(power))}/${signed(Math.trunc(toughness))}`;
}

export function ptCounterModifier(counters: Record<string, number>): { power: number; toughness: number } {
  let power = 0;
  let toughness = 0;
  for (const [kind, count] of Object.entries(counters)) {
    const modifier = parsePtCounter(kind);
    if (!modifier || count <= 0) continue;
    power += modifier.power * count;
    toughness += modifier.toughness * count;
  }
  return { power, toughness };
}

/** A face-down creature is a 2/2 in paper Magic, for both sides of the table. */
export const FACE_DOWN_PT = { power: '2', toughness: '2' };

/**
 * The card's printed P/T, whatever the source: a token carries its own, a
 * face-down card is a 2/2, everything else is looked up (bundled precons
 * synchronously, Scryfall lazily). `undefined` = not resolved yet, `null` =
 * this card has no P/T at all.
 *
 * `mtg` is false in Cyberpunk, which has Power but no toughness and no P/T
 * anywhere in its card frame.
 */
export function basePT(card: CardInst, mtg = true): { power: string; toughness: string } | null | undefined {
  if (!mtg) {
    // Yu-Gi-Oh monsters have a printed stat pair too (ATK/DEF, or ATK/LINK):
    // resolve it from the catalog so the chip reads 2500/2100. A Set card
    // reveals nothing — not even to its owner's chip row.
    if (card.scryfallId && isYugiohId(card.scryfallId) && !card.faceDown) {
      const ygo = yugiohCard(card.scryfallId);
      if (!ygo || ygo.atk == null) return null;
      const def = ygo.frameType.startsWith('link') ? (ygo.linkval ?? 0) : (ygo.def ?? 0);
      return { power: String(ygo.atk), toughness: String(def) };
    }
    return null;
  }
  // Tokens included: a face-down card is a 2/2 to every seat, and reading a
  // token's authored P/T here would show the owner a number nobody else has.
  if (card.faceDown) return FACE_DOWN_PT;
  return printedPT(card);
}

/**
 * Effective power/toughness for combat declarations: printed base plus every
 * P/T-shaped counter (`+1/+1`, `+1/+6`, `-2/+0`, etc.). Non-numeric bases (`*`)
 * fall back to 0 - the player can fix the outcome by hand, combat math just
 * needs a number.
 */
export function effectivePT(card: CardInst): { power: string; toughness: string } {
  const printed = basePT(card) ?? undefined;
  const base = (value: string | undefined) => {
    const parsed = parseInt((value ?? '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const modifier = ptCounterModifier(card.counters);
  return {
    power: String(base(printed?.power) + modifier.power),
    toughness: String(base(printed?.toughness) + modifier.toughness),
  };
}

/* One half of a printed P/T plus its counters. A plain number adds up; a
   printed `*` or `1+*` cannot, and must not be quietly rounded to zero - it
   carries its modifier alongside instead, the way a player would read it. */
function ptPart(base: string, delta: number): string {
  const trimmed = base.trim();
  if (/^[+-]?\d+$/.test(trimmed)) return String(Number.parseInt(trimmed, 10) + delta);
  if (delta === 0) return trimmed;
  return `${trimmed}${delta > 0 ? '+' : ''}${delta}`;
}

/**
 * "4/4" chip text: everything the card is worth right now, printed base and
 * counters together, so nobody has to add it up. Empty when the printed base
 * is unknown - a wrong total is worse than none.
 */
export function ptTotalLabel(card: CardInst, mtg = true): string {
  const printed = basePT(card, mtg);
  if (!printed) return '';
  const modifier = ptCounterModifier(card.counters);
  return `${ptPart(printed.power, modifier.power)}/${ptPart(printed.toughness, modifier.toughness)}`;
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

/** The deck/graveyard/exile/command pile column floats over the bottom-left of
 * the mat; Smart-mode + Tidy keep lands to the RIGHT of it so they never tuck
 * underneath. (A heuristic fraction of field width - the piles' real width
 * depends on card scale, but this clears the common case.) */
export const LAND_STRIP_X = 0.34;

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
    // Keep lands on the bottom strip but clear of the left pile column.
    return { x: clamp01(Math.max(pos.x, LAND_STRIP_X)), y: ASSIST_LAND_Y };
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
 * A pile is card THICKNESS, not a fan: a few px of edge per member, capped so a
 * twelve-land pile has the same footprint as a four-land one. Deliberately the
 * OPPOSITE diagonal from the aura fan so the two never read alike.
 */
export const PILE_STEP_PX = 3;
export const PILE_MAX_EDGES = 4;

/**
 * The card a drop point actually lands on. A pile reads as one object, so a hit
 * on a piled member resolves to its BASE; anything else comes back unchanged,
 * which is why a board with no piles targets exactly as it always has. Null
 * when the resolved target turns out to be the dragged card itself.
 */
export function resolveDropTarget(
  cards: CardInst[],
  hit: CardInst | null,
  dragIid: string,
): CardInst | null {
  if (!hit) return null;
  const base = hit.piled && hit.attachedTo ? (cards.find((c) => c.iid === hit.attachedTo) ?? hit) : hit;
  return base.iid === dragIid ? null : base;
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
  // Lands flow along the bottom starting to the RIGHT of the pile column so they
  // never end up tucked under the deck/graveyard/exile/command stacks.
  const landStartX = Math.max(startX, LAND_STRIP_X);
  const landPerRow = Math.max(1, Math.floor((0.94 - landStartX) / stepX) + 1);
  readingOrder(lands).forEach((card, index) => {
    const row = Math.floor(index / landPerRow);
    const col = index % landPerRow;
    out.push({
      iid: card.iid,
      x: clamp01(landStartX + col * stepX),
      y: clamp01(ASSIST_LAND_Y - row * 0.09, 0.92),
    });
  });
  return out;
}
