import { GAME_LIST, type GameDef } from '../data/games.ts';
import { usePreference } from './usePreference.ts';

/**
 * The games the current user may choose. Cyberpunk TCG is a work-in-progress
 * game, hidden from every picker unless the "Enable WIP features" developer
 * toggle (Settings → General) is on — so a default install is Magic-only.
 */
export function useVisibleGames(): GameDef[] {
  const enableWip = usePreference('enableWip');
  return enableWip ? GAME_LIST : GAME_LIST.filter((g) => g.id !== 'cyberpunk');
}
