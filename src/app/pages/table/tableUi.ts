import { create } from 'zustand';
import {
  GRID_ZOOM_DEFAULT,
  MOBILE_SCALE_DEFAULT,
  clampCardScale,
  clampGridZoom,
  clampMobileScale,
  loadBoardMode,
  loadCardScale,
  loadGridView,
  loadGridZoom,
  saveGridView,
  loadMobileScale,
  loadRailHidden,
  saveBoardMode,
  saveCardScale,
  saveGridZoom,
  saveMobileScale,
  saveRailHidden,
  type BoardMode,
} from './boardModes.ts';

/**
 * Table-local UI state shared across the board's components: layout mode,
 * combat selections, which private library window we asked for, and which
 * public pile is being browsed. Server truth stays in gameStore; this is
 * purely presentational glue.
 */

export type LibIntent = 'peek' | 'search' | null;

/**
 * The table's dock slot - the column a side panel portals into when it is
 * docked rather than floating over the board (THE DOCK CONTRACT, see
 * components/panels.css). TablePage renders the div; every dockable table panel
 * finds it by this id, so the two never have to import each other.
 */
export const TABLE_DOCK_ID = 'pc-dock-table';

/** Floating-mana pool colors (WUBRG + colorless), the pip order in the bar. */
interface TableUiState {
  boardMode: BoardMode;
  /** Load the persisted mode once the seat owner is known. */
  hydrateBoardMode: (userId: string | undefined) => void;
  setBoardMode: (mode: BoardMode, userId: string | undefined) => void;

  /** Battlefield card size multiplier (display only), persisted per user. */
  cardScale: number;
  hydrateCardScale: (userId: string | undefined) => void;
  setCardScale: (scale: number, userId: string | undefined) => void;
  /** Phone-layout ceiling on the effective scale (null = uncapped). Set by the
   * table when the mobile layout is active so a desktop-tuned preference never
   * renders postage-stamp-only boards on a 390px screen. Read via
   * selectCardScale, never directly. */
  scaleCap: number | null;
  setScaleCap: (cap: number | null) => void;
  /** The phone board's own scale, on its own three-step ladder and persisted
   * separately - a desktop-tuned scale means nothing on a 390px screen, and
   * sharing one value made the +/- buttons appear dead on phones. */
  mobileScale: number;
  hydrateMobileScale: (userId: string | undefined) => void;
  setMobileScale: (scale: number, userId: string | undefined) => void;
  /** Desktop overview, and the default view: every seat's playmat at once,
   * opponents across the top and my own board along the bottom. */
  gridView: boolean;
  hydrateGridView: (userId: string | undefined) => void;
  setGridView: (on: boolean, userId?: string | undefined) => void;
  /** How far the grid's miniatures are zoomed out, on top of the fit-to-cell
   * factor the grid derives from its column count. Persisted per user. */
  gridZoom: number;
  hydrateGridZoom: (userId: string | undefined) => void;
  setGridZoom: (zoom: number, userId: string | undefined) => void;
  /** Collapse the right rail to its floating nav pill, giving the width back
   * to the mats. The pill stays - it is where the toggle lives, so there is
   * always a way back. Persisted per user. */
  railHidden: boolean;
  hydrateRailHidden: (userId: string | undefined) => void;
  setRailHidden: (on: boolean, userId: string | undefined) => void;

  /** My selected blocker awaiting an attacker click (or vice versa). */
  blockerIid: string | null;
  setBlocker: (iid: string | null) => void;

  /** Why we last asked for library.cards - decides which viewer opens. */
  libIntent: LibIntent;
  setLibIntent: (intent: LibIntent) => void;

  /** Public pile browser (any player's graveyard/exile). */
  pileView: { userId: string; zone: 'graveyard' | 'exile' | 'command' } | null;
  setPileView: (view: { userId: string; zone: 'graveyard' | 'exile' | 'command' } | null) => void;

  /** Stack entry whose target picker should be forced open. The picker shows
   * itself once per spell; this is how the stack tray reopens one that was
   * dismissed. */
  targetPickerIid: string | null;
  setTargetPickerIid: (iid: string | null) => void;

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
  scaleCap: null,
  setScaleCap: (cap) => set({ scaleCap: cap }),
  mobileScale: MOBILE_SCALE_DEFAULT,
  hydrateMobileScale: (userId) => set({ mobileScale: loadMobileScale(userId) }),
  setMobileScale: (scale, userId) => {
    const clamped = clampMobileScale(scale);
    saveMobileScale(userId, clamped);
    set({ mobileScale: clamped });
  },
  gridView: true,
  hydrateGridView: (userId) => set({ gridView: loadGridView(userId) }),
  setGridView: (on, userId) => {
    saveGridView(userId, on);
    set({ gridView: on });
  },
  gridZoom: GRID_ZOOM_DEFAULT,
  hydrateGridZoom: (userId) => set({ gridZoom: loadGridZoom(userId) }),
  setGridZoom: (zoom, userId) => {
    const clamped = clampGridZoom(zoom);
    saveGridZoom(userId, clamped);
    set({ gridZoom: clamped });
  },
  railHidden: false,
  hydrateRailHidden: (userId) => set({ railHidden: loadRailHidden(userId) }),
  setRailHidden: (on, userId) => {
    saveRailHidden(userId, on);
    set({ railHidden: on });
  },

  blockerIid: null,
  setBlocker: (iid) => set({ blockerIid: iid }),

  libIntent: null,
  setLibIntent: (intent) => set({ libIntent: intent }),

  pileView: null,
  setPileView: (view) => set({ pileView: view }),

  targetPickerIid: null,
  setTargetPickerIid: (iid) => set({ targetPickerIid: iid }),
}));

/** The scale every card-sizing site should use: the phone board's own ladder
 * while the mobile layout is active, otherwise the user's desktop preference. */
export function selectCardScale(state: TableUiState): number {
  return state.scaleCap != null ? state.mobileScale : state.cardScale;
}
