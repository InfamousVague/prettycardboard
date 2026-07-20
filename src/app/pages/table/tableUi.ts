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
}));
