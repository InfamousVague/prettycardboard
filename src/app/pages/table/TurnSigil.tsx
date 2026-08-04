import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n.ts';
import { seatColor } from './seatColors.ts';
import type { RoomState, TablePlayer } from '../../net/types.ts';

/**
 * Whose turn it is, as a lit HUD sigil: a notched slab with the active seat's
 * colour running through it, lit from the top-left, with a specular that sweeps
 * across on your turn and only on your turn.
 *
 * LEADS THE TOP STRIP. This is the thing everyone at the table looks at
 * constantly - far more often than the room code or the spectating pill it used
 * to sit behind - so it takes the corner and the rest of the meta row follows
 * it. It used to live inside PhaseRibbon's turn cluster, wedged between the
 * phase stops and the End turn button, which is a row you read once a turn
 * rather than continuously.
 *
 * It owns its own clock. The tick is a once-a-second setState, and leaving it
 * in PhaseRibbon meant re-rendering the phase strip, the marker chips and the
 * whole combat cluster every second to move two digits.
 */
export function TurnSigil({ room, me }: { room: RoomState; me: TablePlayer | undefined }) {
  const t = useT();
  const activePlayer = room.players.find((player) => player.seat === room.activeSeat);
  const myTurn = me != null && room.activeSeat === me.seat;

  // Seconds since this turn began. Restarts when the seat or the turn number
  // moves, so a give-turn resets it the same way a normal pass does.
  const turnStartRef = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    turnStartRef.current = Date.now();
  }, [room.activeSeat, room.turnNumber]);
  useEffect(() => {
    if (!room.started) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [room.started]);

  if (!room.started) return null;
  const secs = Math.max(0, Math.floor((Date.now() - turnStartRef.current) / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div
      className="turnPlate"
      data-mine={myTurn || undefined}
      style={{ ['--pc-seat-color' as string]: seatColor(room.activeSeat ?? 0) }}
    >
      {/* The stack, back to front. Siblings rather than pseudo-elements because
          there are more layers than the two ::before/::after one element can
          carry, and because the sweep has to sit ABOVE the halftone and BELOW
          the type, which pseudo-element order cannot express.

          The slab is OUTSIDE the face on purpose. clip-path clips every
          descendant, so a depth plate nested inside the notched face would have
          its whole offset clipped away and the plate would look flat. The face
          carries the notch; the slab carries the thickness. */}
      <span className="turnPlateSlab" aria-hidden />
      <span className="turnPlateFace">
        <span className="turnPlateDots" aria-hidden />
        <span className="turnPlateSweep" aria-hidden />
        <span className="turnPlateBevel" aria-hidden />

        {/* The turn number gets its own notched cell, so the count reads as a
            stamped chit rather than as the first word of a sentence. */}
        <span className="turnPlateChit">
          <span className="turnPlateWord">{t('gpTurnOf')}</span>
          <b className="turnPlateNum">{room.turnNumber ?? 1}</b>
        </span>
        <span className="turnPlateBody">
          {activePlayer && (
            <span className="turnPlateWho">{myTurn ? t('tblYourTurn') : activePlayer.username}</span>
          )}
          <span className="turnPlateClock">{clock}</span>
        </span>
      </span>
    </div>
  );
}
