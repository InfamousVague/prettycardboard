import { useCallback, useState } from 'react';
import { AlertDialog } from '@glacier/react';
import { getGame, isPrerelease } from '../data/games.ts';
import { useT } from '../i18n.ts';
import { GameStageTag } from './GameTag.tsx';

/**
 * The gate in front of a pre-release game.
 *
 * Every game in the registry except Magic is graded `prerelease` (see
 * GameStage): playable enough to sit down at, nowhere near finished. A stage
 * chip on the picker says so before you choose, but a chip is easy to skim
 * past, and the moment that actually costs someone their evening is the one
 * where a table opens. So opening or joining one asks first, in a sentence,
 * once per launch.
 *
 * It wraps the ACTION rather than the button so the check cannot be forgotten
 * by a new surface: hand it the game and what you were about to do, and an
 * alpha game runs straight through while a pre-release one is held for an
 * answer. Every caller renders `dialog` somewhere in its tree.
 *
 *     const { gate, dialog } = usePrereleaseGate();
 *     <Button onClick={() => gate(game, () => void create())} />
 *     {dialog}
 */
export function usePrereleaseGate() {
  const t = useT();
  const [pending, setPending] = useState<{ game: string; run: () => void } | null>(null);

  const gate = useCallback((game: string | undefined | null, run: () => void) => {
    if (!isPrerelease(game)) {
      run();
      return;
    }
    setPending({ game: getGame(game).id, run });
  }, []);

  const def = pending ? getGame(pending.game) : null;
  const dialog = def ? (
    <AlertDialog
      open
      dismissible
      onClose={() => setPending(null)}
      title={t('gsWarnTitle')}
      description={
        <>
          <strong>{def.name}</strong> {t('gsWarnBody')}
        </>
      }
      actionLabel={t('gsWarnGo')}
      cancelLabel={t('dbCancel')}
      onAction={() => {
        const run = pending?.run;
        setPending(null);
        run?.();
      }}
    >
      <GameStageTag game={def.id} />
    </AlertDialog>
  ) : null;

  // `gating` is for callers with their own Escape/backdrop handling: the join
  // splash, for instance, treats Escape as "not now" and would otherwise both
  // dismiss the warning and throw away the invite behind it on one keypress.
  return { gate, dialog, gating: pending !== null };
}
