import { useT, type MessageKey } from '../../i18n.ts';
import type { MatPos, MatZone } from '../../net/types.ts';

/**
 * The Yu-Gi-Oh playmat: the printed zone grid, and the snapping that locks a
 * dropped card into it.
 *
 * Unlike Magic — where the battlefield is genuinely freeform and a card may sit
 * anywhere — a duel field is a fixed 7x3 lattice of named zones, and a card
 * belongs IN one. So this is the one game where the board snaps: the outlines
 * are drawn on the felt and a drop lands in the nearest cell, which is both how
 * the paper game reads and how players expect to place.
 *
 * Geometry lives here, once, in field-normalized coordinates (0..1 of the
 * player's own field box, the same space CardInst.x/y uses). The overlay, the
 * drop snapping, the zone piles (Deck / GY / Banished / Extra Deck all occupy
 * real cells) and the Summon/Set menu positions are all derived from this table,
 * so the drawn grid and the places cards actually land can never disagree.
 *
 *   row 0 (back, toward the opponent)   .  .  EM  .  EM  .  Banished
 *   row 1 (middle)                   Field  M  M   M  M   M  Graveyard
 *   row 2 (front, nearest the player) Extra  ST ST  ST ST  ST Deck
 */

export type YugiohCellKind = 'monster' | 'extraMonster' | 'spell' | 'field';

export interface YugiohCell {
  id: string;
  kind: YugiohCellKind;
  labelKey: MessageKey;
  /** Second caption for the dual-purpose Pendulum/Spell&Trap zones. */
  subLabelKey?: MessageKey;
  /** Normalized center within the player's field box. */
  x: number;
  y: number;
}

// --- grid math ------------------------------------------------------------
// Seven columns, three rows, in percentages of the field box. The middle
// monster zone lands dead center (0.5, 0.5) by construction.

const COLS = 7;
const ROWS = 3;
const PAD_X = 0.025;
const GAP_X = 0.008;
const PAD_TOP = 0.04;
/**
 * The hand fan floats over the bottom of the mat and claims a drop buffer
 * there, so the grid stops short of it. Without this the Spell & Trap row —
 * the row nearest the player — would sit half under the hand: partly hidden,
 * and impossible to drop into, because a release over the hand returns the
 * card to it.
 */
const PAD_BOTTOM = 0.18;
const GAP_Y = 0.03;

const CELL_W = (1 - 2 * PAD_X - (COLS - 1) * GAP_X) / COLS;
const CELL_H = (1 - PAD_TOP - PAD_BOTTOM - (ROWS - 1) * GAP_Y) / ROWS;

function centerX(col: number): number {
  return PAD_X + col * (CELL_W + GAP_X) + CELL_W / 2;
}

function centerY(row: number): number {
  return PAD_TOP + row * (CELL_H + GAP_Y) + CELL_H / 2;
}

/** A cell's center, for anything that wants to place at a named slot. */
export function yugiohCellPos(col: number, row: number): MatPos {
  return { x: centerX(col), y: centerY(row) };
}

// --- the placeable cells --------------------------------------------------
// Only zones a CARD goes in; the four pile columns are below.

const cell = (
  id: string,
  kind: YugiohCellKind,
  labelKey: MessageKey,
  col: number,
  row: number,
  subLabelKey?: MessageKey,
): YugiohCell => ({ id, kind, labelKey, subLabelKey, ...yugiohCellPos(col, row) });

export const YUGIOH_CELLS: YugiohCell[] = [
  // Back row: the two Extra Monster Zones (shared in paper; each side gets its
  // own here, since every seat owns its own field box).
  cell('em-0', 'extraMonster', 'ygoZoneExtraMonster', 2, 0),
  cell('em-1', 'extraMonster', 'ygoZoneExtraMonster', 4, 0),
  // Middle row: Field Spell, then the five Monster Card Zones.
  cell('field', 'field', 'ygoZoneField', 0, 1),
  ...[1, 2, 3, 4, 5].map((col, index) => cell(`m-${index}`, 'monster', 'ygoZoneMonster', col, 1)),
  // Front row: five Spell & Trap Zones; the outermost two double as the
  // Pendulum Zones, exactly as they are printed on a real mat.
  cell('st-0', 'spell', 'ygoZoneSpellTrap', 1, 2, 'ygoZonePendulum'),
  cell('st-1', 'spell', 'ygoZoneSpellTrap', 2, 2),
  cell('st-2', 'spell', 'ygoZoneSpellTrap', 3, 2),
  cell('st-3', 'spell', 'ygoZoneSpellTrap', 4, 2),
  cell('st-4', 'spell', 'ygoZoneSpellTrap', 5, 2, 'ygoZonePendulum'),
];

/**
 * Where the four zone PILES sit, in the same coordinate space: Banished /
 * Graveyard / Deck stack up the right-hand column, the Extra Deck anchors the
 * front-left corner. Fed to ZonePiles as its free-placement layout, so the
 * piles land in their printed cells rather than a generic strip.
 */
export const YUGIOH_PILE_LAYOUT: Record<MatZone, MatPos> = {
  exile: yugiohCellPos(6, 0), // Banished
  graveyard: yugiohCellPos(6, 1),
  library: yugiohCellPos(6, 2), // Deck
  command: yugiohCellPos(0, 2), // Extra Deck
};

/** Default landing spots for the hand menu's Summon / Set actions: the middle
 *  Monster Zone and the middle Spell & Trap Zone. */
export const YUGIOH_SUMMON_POS = yugiohCellPos(3, 1);
export const YUGIOH_SET_BACKROW_POS = yugiohCellPos(3, 2);

// --- snapping -------------------------------------------------------------

/**
 * The cell a drop belongs to: nearest center, measured in the field's own
 * aspect (x and y are both 0..1 over a box that is much wider than it is tall,
 * so raw normalized distance would bias hugely toward horizontal neighbours).
 * `fieldRect` restores real proportions; without one, x is weighted by a
 * typical 16:9 field so the fallback still picks sensibly.
 */
export function nearestYugiohCell(
  pos: { x: number; y: number },
  fieldRect?: { width: number; height: number } | null,
): YugiohCell {
  const aspect = fieldRect && fieldRect.height > 0 ? fieldRect.width / fieldRect.height : 16 / 9;
  let best = YUGIOH_CELLS[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const candidate of YUGIOH_CELLS) {
    const dx = (candidate.x - pos.x) * aspect;
    const dy = candidate.y - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** How close a card has to sit to a cell center to be counted as filling it.
 *  Generous enough to survive a re-snap, tight enough that a card parked
 *  between two zones does not claim either. */
const OCCUPIED_X = 0.045;
const OCCUPIED_Y = 0.07;

interface Placed {
  x: number;
  y: number;
  iid?: string;
  attachedTo?: string;
}

/** The cells currently holding a card. Attachments (an equip riding its host)
 *  do not consume a zone of their own. */
export function occupiedYugiohCells(cards: Placed[], excludeIid?: string): Set<string> {
  const taken = new Set<string>();
  for (const card of cards) {
    if (card.attachedTo || (excludeIid && card.iid === excludeIid)) continue;
    const cell = nearestYugiohCell(card);
    if (Math.abs(cell.x - card.x) <= OCCUPIED_X && Math.abs(cell.y - card.y) <= OCCUPIED_Y) {
      taken.add(cell.id);
    }
  }
  return taken;
}

/**
 * Where a card should actually land: the nearest acceptable zone that is still
 * EMPTY, so a second trap takes the next Spell & Trap slot instead of stacking
 * on the first. Falls back to the nearest acceptable cell when the row is full
 * — the table stays freeform, it just stops choosing a collision by default.
 *
 * `pos` biases toward where the player dropped; without one (a menu action)
 * the cells are taken in printed order, left to right.
 */
export function placeInYugiohField(opts: {
  pos?: { x: number; y: number } | null;
  /** Acceptable zone kinds, best first (e.g. ['monster','extraMonster']). */
  kinds?: YugiohCellKind[];
  /** The battlefield as it stands, for occupancy. */
  cards?: Placed[];
  /** The card being moved — its own current cell is not "taken". */
  excludeIid?: string;
  fieldRect?: { width: number; height: number } | null;
}): MatPos {
  const { pos, kinds, cards = [], excludeIid, fieldRect } = opts;
  const taken = occupiedYugiohCells(cards, excludeIid);
  const allowed = kinds ? YUGIOH_CELLS.filter((c) => kinds.includes(c.kind)) : YUGIOH_CELLS;
  const pool = allowed.length > 0 ? allowed : YUGIOH_CELLS;

  const ranked = pos
    ? [...pool].sort((a, b) => cellDist(a, pos, fieldRect) - cellDist(b, pos, fieldRect))
    : // Menu placement respects the requested kind order, then printed order.
      [...pool].sort((a, b) => kindRank(a, kinds) - kindRank(b, kinds));

  const free = ranked.find((c) => !taken.has(c.id));
  const chosen = free ?? ranked[0]!;
  return { x: chosen.x, y: chosen.y };
}

function cellDist(cell: YugiohCell, pos: { x: number; y: number }, rect?: { width: number; height: number } | null): number {
  const aspect = rect && rect.height > 0 ? rect.width / rect.height : 16 / 9;
  const dx = (cell.x - pos.x) * aspect;
  const dy = cell.y - pos.y;
  return dx * dx + dy * dy;
}

function kindRank(cell: YugiohCell, kinds?: YugiohCellKind[]): number {
  return kinds ? kinds.indexOf(cell.kind) : 0;
}

/** Lock a dropped card to its zone, preferring an empty one. */
export function snapToYugiohCell(
  pos: { x: number; y: number },
  fieldRect?: { width: number; height: number } | null,
  cards?: Placed[],
  excludeIid?: string,
): MatPos {
  return placeInYugiohField({ pos, cards, excludeIid, fieldRect });
}

// --- the overlay ----------------------------------------------------------

/**
 * The printed grid itself: one outline per zone, drawn under the cards at
 * exactly the size a card lands at, so an empty cell reads as the slot it is.
 * `activeId` lights the cell a dragged card would drop into.
 */
export function YugiohZoneGrid({
  cardWidth,
  activeId,
  labels = true,
}: {
  /** The board's card width in px — cells match it exactly. */
  cardWidth: number;
  activeId?: string | null;
  /** Captions are dropped on the small mirrored seats, where they cannot be read. */
  labels?: boolean;
}) {
  const t = useT();
  return (
    <div className="ygoZones" style={{ ['--ygo-cell-w' as string]: `${cardWidth}px` }} aria-hidden>
      {YUGIOH_CELLS.map((zone) => (
        <div
          key={zone.id}
          className="ygoZone"
          data-kind={zone.kind}
          data-active={activeId === zone.id || undefined}
          style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%` }}
        >
          {labels && (
            <span className="ygoZoneCaption">
              {zone.subLabelKey && <span className="ygoZoneSub">{t(zone.subLabelKey)}</span>}
              <span className="ygoZoneName">{t(zone.labelKey)}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
