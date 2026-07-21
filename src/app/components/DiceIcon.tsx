import {
  mdiDiceD4,
  mdiDiceD6,
  mdiDiceD8,
  mdiDiceD10,
  mdiDiceD12,
  mdiDiceD20,
} from '@mdi/js';

export type PolyhedralSides = 4 | 6 | 8 | 10 | 12 | 20;

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