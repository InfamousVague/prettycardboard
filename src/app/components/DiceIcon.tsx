import {
  mdiDiceD4,
  mdiDiceD6,
  mdiDiceD8,
  mdiDiceD10,
  mdiDiceD12,
  mdiDiceD20,
} from '@mdi/js';

export type PolyhedralSides = 4 | 6 | 8 | 10 | 12 | 20;

/** The dice every roller offers, largest first. Shared so the board toolbar's
 *  menu and the sidebar tray can never drift apart. */
export const DICE_SIDES: readonly PolyhedralSides[] = [20, 12, 10, 8, 6, 4];

const PATHS: Record<PolyhedralSides, string> = {
  4: mdiDiceD4,
  6: mdiDiceD6,
  8: mdiDiceD8,
  10: mdiDiceD10,
  12: mdiDiceD12,
  20: mdiDiceD20,
};

export function DiceIcon({ sides, size = 20 }: { sides: PolyhedralSides; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
    >
      <path d={PATHS[sides]} />
    </svg>
  );
}