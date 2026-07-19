import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import type { RoomState } from '../../net/types.ts';

/**
 * Turn cue for the seated player: an ambient accent glow hugging the screen
 * edges for the whole of your turn, plus a one-shot "Your turn" pill that
 * announces it and can be dismissed (it also self-dismisses after a moment).
 *
 * The glow is the persistent state; the pill is the attention grab. Both are
 * keyed to (turnNumber, activeSeat) so dismissing the pill silences it for the
 * current turn only - it returns the next time the turn comes back around.
 */
export function TurnCue({ room, meSeat }: { room: RoomState; meSeat: number }) {
  const t = useT();
  const myTurn = room.started && room.activeSeat === meSeat && room.matchResult == null;
  const turnKey = `${room.turnNumber ?? 0}:${room.activeSeat ?? -1}`;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const showPill = myTurn && dismissed !== turnKey;

  // The pill bows out on its own so it never nags for the whole turn; the
  // edge glow carries the reminder from there.
  useEffect(() => {
    if (!showPill) return;
    const id = setTimeout(() => setDismissed(turnKey), 5000);
    return () => clearTimeout(id);
  }, [showPill, turnKey]);

  return (
    <>
      {myTurn && <div className="turnEdgeGlow" aria-hidden />}
      <AnimatePresence>
        {showPill && (
          <motion.div
            className="turnPill"
            role="status"
            initial={{ opacity: 0, y: -14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <Sparkles size={14} />
            <span className="turnPillText">{t('tblYourTurn')}</span>
            <button
              type="button"
              className="turnPillClose"
              aria-label={t('cpClose')}
              onClick={() => setDismissed(turnKey)}
            >
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
