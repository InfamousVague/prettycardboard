import { useEffect, useRef, useState } from 'react';
import { Button, MenuItem, SplitButton, Text, Size, TextTone, Tooltip } from '@glacier/react';
import {
  ChevronDown,
  Crown,
  Moon,
  Shield,
  Sun,
  Sunrise,
  Swords,
  Tornado,
  Wand2,
  Zap,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { isCreature } from './boardModes.ts';
import { useGame } from '../../state/gameStore.ts';
import { getGame } from '../../data/games.ts';
import type { Phase, RoomState, TablePlayer } from '../../net/types.ts';
import { juicePulse } from './juice.ts';

/**
 * The turn chrome: a compact 7-stop phase ribbon (click any stop - freeform),
 * table markers as small chips, the turn counter, and the End Turn cluster
 * with guided-combat entry. The End Turn button lights up and pulses on your
 * turn - it should invite when idle.
 */

const PHASES: { phase: Phase; key: 'phUpkeep' | 'phMain1' | 'phAttack' | 'phBlock' | 'phDamage' | 'phMain2' | 'phEnd'; icon: React.ReactNode }[] = [
  { phase: 'upkeep', key: 'phUpkeep', icon: <Sunrise size={12} /> },
  { phase: 'main1', key: 'phMain1', icon: <Wand2 size={12} /> },
  { phase: 'attack', key: 'phAttack', icon: <Swords size={12} /> },
  { phase: 'block', key: 'phBlock', icon: <Shield size={12} /> },
  { phase: 'damage', key: 'phDamage', icon: <Zap size={12} /> },
  { phase: 'main2', key: 'phMain2', icon: <Wand2 size={12} /> },
  { phase: 'end', key: 'phEnd', icon: <Moon size={12} /> },
];

export function PhaseRibbon({
  room,
  me,
  canAct,
}: {
  room: RoomState;
  me: TablePlayer | undefined;
  canAct: boolean;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const endTurnRef = useRef<HTMLDivElement>(null);

  const activePlayer = room.players.find((player) => player.seat === room.activeSeat);
  const myTurn = me != null && room.activeSeat === me.seat;
  const markers = room.markers ?? {};
  const seatName = (seat: number | undefined) =>
    room.players.find((player) => player.seat === seat)?.username ?? '';

  // A little pop when the turn arrives at me.
  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) juicePulse(endTurnRef.current, 1.2);
    wasMyTurn.current = myTurn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  // Turn timer: seconds since this turn (seat) began; ticks once a second.
  const turnStartRef = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    turnStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.activeSeat, room.turnNumber]);
  useEffect(() => {
    if (!room.started) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [room.started]);
  const turnSecs = Math.max(0, Math.floor((Date.now() - turnStartRef.current) / 1000));
  const turnClock = `${Math.floor(turnSecs / 60)}:${String(turnSecs % 60).padStart(2, '0')}`;

  // Hide the phase strip for games with no turn phases (e.g. Cyberpunk plays
  // freeform - the turn still passes, but there is no upkeep/main/combat ribbon).
  if (room.phase == null || getGame(room.game).phases.length === 0) return null;

  return (
    <div className="ribbonRow" data-my-turn={myTurn || undefined}>
      {/* markers chips */}
      <div className="markerChips">
        {markers.monarch != null && (
          <Tooltip content={`${t('gpMonarch')}: ${seatName(markers.monarch)}`}>
            <span className="markerChip" data-kind="monarch">
              <Crown size={12} /> {seatName(markers.monarch)}
            </span>
          </Tooltip>
        )}
        {markers.initiative != null && (
          <Tooltip content={`${t('gpInitiative')}: ${seatName(markers.initiative)}`}>
            <span className="markerChip" data-kind="initiative">
              <Zap size={12} /> {seatName(markers.initiative)}
            </span>
          </Tooltip>
        )}
        {markers.dayNight && (
          <Tooltip content={t('gpDayNight')}>
            <span className="markerChip" data-kind="daynight">
              {markers.dayNight === 'day' ? <Sun size={12} /> : <Moon size={12} />}
            </span>
          </Tooltip>
        )}
        {(markers.storm ?? 0) > 0 && (
          <Tooltip content={t('gpStorm')}>
            <span className="markerChip" data-kind="storm">
              <Tornado size={12} /> {markers.storm}
            </span>
          </Tooltip>
        )}
      </div>

      {/* Parked for now: the per-phase strip read as too much chrome. Flip
          the guard to bring it back. */}
      {false && (
        <div className="phaseRibbon" role="tablist" aria-label={t('gpTurnOf')}>
          {PHASES.map(({ phase, key, icon }) => (
            <button
              key={phase}
              type="button"
              className="phaseStop"
              data-current={room.phase === phase || undefined}
              disabled={!canAct}
              onClick={() => act({ kind: 'phase.set', phase })}
              title={t(key)}
            >
              <span className="phaseIcon" aria-hidden>
                {icon}
              </span>
              <span className="phaseLabel">{t(key)}</span>
            </button>
          ))}
        </div>
      )}

      {/* turn counter + end turn cluster */}
      <div className="turnCluster">
        <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="turnLabel">
          <span className="turnWord">{t('gpTurnOf')}</span> {room.turnNumber ?? 1}
          {activePlayer ? ` · ${activePlayer.username}` : ''}
          <span className="turnTimer">{turnClock}</span>
        </Text>

        {canAct && me && (
          <>
            {room.combat == null && myTurn && (
              <Button
                size="sm"
                variant={me.battlefield.some((card) => !card.tapped && isCreature(card)) ? 'solid' : 'soft'}
                onClick={() => act({ kind: 'combat.begin' })}
              >
                <Swords size={14} /> {t('phAttack')}
              </Button>
            )}
            {room.combat != null && (
              <Button size="sm" variant="soft" onClick={() => act({ kind: 'combat.end' })}>
                <Shield size={14} /> {t('gpEndCombat')}
              </Button>
            )}
            <div ref={endTurnRef} className="endTurnWrap">
              <SplitButton
                size="sm"
                variant={myTurn ? 'solid' : 'soft'}
                className="endTurnBtn"
                data-lit={myTurn || undefined}
                onAction={() => act({ kind: 'turn.pass' })}
                menuLabel={t('gpGiveTurnTo')}
                placement="bottom-end"
                menu={room.players.map((player) => (
                  <MenuItem
                    key={player.userId}
                    disabled={player.seat === room.activeSeat}
                    onSelect={() => act({ kind: 'turn.set', seat: player.seat })}
                  >
                    {t('gpGiveTurnTo')} {player.username}
                  </MenuItem>
                ))}
              >
                {t('gpEndTurn')}
              </SplitButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
