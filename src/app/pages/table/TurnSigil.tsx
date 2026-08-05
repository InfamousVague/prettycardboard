import { useEffect, useRef, useState } from 'react';
import { Pill, Size, Surface, Text, TextTone } from '@glacier/react';
import { useT } from '../../i18n.ts';
import { seatColor } from './seatColors.ts';
import type { RoomState, TablePlayer } from '../../net/types.ts';

/**
 * Whose turn it is: a kit Surface carrying a turn-count Pill, the active
 * player's name and the turn clock. The active seat's colour tints the surface
 * and the name, which is the one thing no kit tone can express - a four-player
 * pod needs four legible states, not four shades of the app accent.
 *
 * Built from kit primitives (Surface / Pill / Text) rather than a hand-rolled
 * plate. It used to be a notched slab with a depth layer, an inset bevel, a
 * halftone field and a travelling specular - five stacked layers producing a
 * stamped-metal look that no other surface in the app shared.
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
    <Surface
      level={2}
      className="turnPlate"
      data-mine={myTurn || undefined}
      style={{ ['--pc-seat-color' as string]: seatColor(room.activeSeat ?? 0) }}
    >
      {/* The count as its own unit, so it reads as a label on the turn rather
          than as the first word of the sentence the name finishes. */}
      <Pill size="sm" variant="soft" className="turnPlateChit">
        <span className="turnPlateWord">{t('gpTurnOf')}</span>
        <b className="turnPlateNum">{room.turnNumber ?? 1}</b>
      </Pill>
      <span className="turnPlateBody">
        {activePlayer && (
          <Text as="span" size={Size.Medium} weight="bold" className="turnPlateWho">
            {myTurn ? t('tblYourTurn') : activePlayer.username}
          </Text>
        )}
        {/* Mono, so a ticking clock does not reflow the plate every second. */}
        <Text as="span" size={Size.XSmall} mono tone={TextTone.Muted} className="turnPlateClock">
          {clock}
        </Text>
      </span>
    </Surface>
  );
}
