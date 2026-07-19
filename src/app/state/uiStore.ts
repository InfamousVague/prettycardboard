import { create } from 'zustand';
import { peekPendingJoin } from '../data/pendingJoin.ts';

/** Small cross-page UI state (selection that outlives a page remount). */
interface UiState {
  selectedDeckId: string | null;
  selectDeck: (id: string | null) => void;
  /** A table code from a share link, waiting to be joined once authenticated. */
  pendingJoin: string | null;
  setPendingJoin: (code: string | null) => void;
}

export const useUi = create<UiState>((set) => ({
  selectedDeckId: null,
  selectDeck: (id) => set({ selectedDeckId: id }),
  // Seed from the stash so a link opened cold (auth reload) resumes correctly.
  pendingJoin: peekPendingJoin(),
  setPendingJoin: (code) => set({ pendingJoin: code }),
}));
