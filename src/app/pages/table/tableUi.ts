import { create } from 'zustand';
import {
  clampCardScale,
  loadBoardMode,
  loadCardScale,
  saveBoardMode,
  saveCardScale,
  type BoardMode,
} from './boardModes.ts';

/**
 * Table-local UI state shared across the board's components: layout mode,
 * combat selections, which private library window we asked for, and which
 * public pile is being browsed. Server truth stays in gameStore; this is
 * purely presentational glue.
 */

export type LibIntent = 'peek' | 'search' | null;

/** Floating-mana pool colors (WUBRG + colorless), the pip order in the bar. */
export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';
export const MANA_ORDER: ManaColor[] = ['W', 'U', 'B', 'R', 'G', 'C'];
export type ManaPool = Record<ManaColor, number>;
const EMPTY_MANA: ManaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

interface TableUiState {
  boardMode: BoardMode;
  /** Load the persisted mode once the seat owner is known. */
  hydrateBoardMode: (userId: string | undefined) => void;
  setBoardMode: (mode: BoardMode, userId: string | undefined) => void;

  /** Battlefield card size multiplier (display only), persisted per user. */
  cardScale: number;
  hydrateCardScale: (userId: string | undefined) => void;
  setCardScale: (scale: number, userId: string | undefined) => void;

  /** My selected blocker awaiting an attacker click (or vice versa). */
  blockerIid: string | null;
  setBlocker: (iid: string | null) => void;

  /** Why we last asked for library.cards - decides which viewer opens. */
  libIntent: LibIntent;
  setLibIntent: (intent: LibIntent) => void;

  /** Public pile browser (any player's graveyard/exile). */
  pileView: { userId: string; zone: 'graveyard' | 'exile' } | null;
  setPileView: (view: { userId: string; zone: 'graveyard' | 'exile' } | null) => void;

  /**
   * Floating-mana pool (MTG only) - a client-only play aid, deliberately NOT
   * persisted and NOT server-synced. It is high-frequency and ephemeral (mana
   * empties between phases), so restoring a stale pool would be actively wrong.
   */
  mana: ManaPool;
  addMana: (c: ManaColor, delta?: number) => void;
  clearMana: () => void;
  clearManaColor: (c: ManaColor) => void;
}

export const useTableUi = create<TableUiState>((set) => ({
  boardMode: 'free',
  hydrateBoardMode: (userId) => set({ boardMode: loadBoardMode(userId) }),
  setBoardMode: (mode, userId) => {
    saveBoardMode(userId, mode);
    set({ boardMode: mode });
  },

  cardScale: 1,
  hydrateCardScale: (userId) => set({ cardScale: loadCardScale(userId) }),
  setCardScale: (scale, userId) => {
    const clamped = clampCardScale(scale);
    saveCardScale(userId, clamped);
    set({ cardScale: clamped });
  },

  blockerIid: null,
  setBlocker: (iid) => set({ blockerIid: iid }),

  libIntent: null,
  setLibIntent: (intent) => set({ libIntent: intent }),

  pileView: null,
  setPileView: (view) => set({ pileView: view }),

  mana: { ...EMPTY_MANA },
  addMana: (c, delta = 1) =>
    set((s) => ({ mana: { ...s.mana, [c]: Math.max(0, s.mana[c] + delta) } })),
  clearMana: () => set({ mana: { ...EMPTY_MANA } }),
  clearManaColor: (c) => set((s) => ({ mana: { ...s.mana, [c]: 0 } })),
}));
