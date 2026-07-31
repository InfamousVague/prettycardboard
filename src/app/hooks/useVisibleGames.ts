import { GAME_LIST, type GameDef } from '../data/games.ts';
import { usePreference } from './usePreference.ts';

/**
 * The games the current user may choose. Work-in-progress games (GameDef.wip,
 * currently Cyberpunk TCG) are hidden from every picker unless the "Enable WIP
 * features" developer toggle (Settings → General) is on — so a default install
 * is Magic + Yu-Gi-Oh.
 */
export function useVisibleGames(): GameDef[] {
  const enableWip = usePreference('enableWip');
  return enableWip ? GAME_LIST : GAME_LIST.filter((g) => !g.wip);
}

/** The game ids hidden from this user (for deck-list filtering outside React
 * render paths that already have the preference in hand). */
export function hiddenGameIds(enableWip: boolean): Set<string> {
  return new Set(enableWip ? [] : GAME_LIST.filter((g) => g.wip).map((g) => g.id));
}
