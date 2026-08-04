import { useEffect, useRef, useState } from 'react';
import { Button, IconButton, Menu, MenuItem, SplitButton, Text, Size, TextTone, Tooltip, useHaptics } from '@glacier/react';
import {
  Check,
  ChevronDown,
  Coins,
  Crown,
  Dices,
  Flag,
  Moon,
  Settings,
  Shield,
  Sun,
  Sunrise,
  Swords,
  Tornado,
  Wand2,
  Zap,
} from '../../icons/backfilled.tsx';
import { useT } from '../../i18n.ts';
import { DICE_SIDES, DiceIcon } from '../../components/DiceIcon.tsx';
import { isCreature } from './boardModes.ts';
import { seatColor } from './seatColors.ts';
import { enforcedRoom } from './enforce.ts';
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
  mobile,
  onConcede,
}: {
  room: RoomState;
  me: TablePlayer | undefined;
  canAct: boolean;
  /** Phone dock: combat + end turn become big thumb-corner icon buttons. */
  mobile?: boolean;
  /** Opens the concede confirmation (owned by TablePage). Absent when
      conceding isn't available - spectating, already out, match over. */
  onConcede?: () => void;
}) {
  const t = useT();
  const haptics = useHaptics();
  const act = useGame((state) => state.act);
  const endTurnRef = useRef<HTMLDivElement>(null);

  const activePlayer = room.players.find((player) => player.seat === room.activeSeat);
  const myTurn = me != null && room.activeSeat === me.seat;
  const enforced = enforcedRoom(room);
  // Am I a defender of the declared attack (enforced machine)?
  const iDefend =
    me != null &&
    !myTurn &&
    (room.combat?.attackers ?? []).some(
      (a) => room.players.length === 2 || a.defenderSeat === me.seat || a.defenderSeat == null,
    );
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

  // Guided combat (attack/block declarations) is a per-game capability: MTG
  // has it, Yu-Gi-Oh keeps its phases but settles battles manually.
  const combatGame = getGame(room.game).combat === true;

  // Phones: no ribbon, no labels - two large icon buttons in the thumb corner,
  // with give-turn kept on its own small menu button.
  if (mobile) {
    if (!canAct || !me) return null;
    return (
      <div className="turnActions" data-my-turn={myTurn || undefined}>
        {/* Give-turn floats above the combat button so the two primary actions
            keep the corner to themselves. */}
        <div className="turnActionsAside">
          <Menu
            aria-label={t('gpGiveTurnTo')}
            placement="top-end"
            trigger={
              <IconButton size="sm" variant="soft" aria-label={t('gpGiveTurnTo')}>
                <ChevronDown size={16} />
              </IconButton>
            }
          >
            {room.players.map((player) => (
              <MenuItem
                key={player.userId}
                disabled={player.seat === room.activeSeat}
                onSelect={() => act({ kind: 'turn.set', seat: player.seat })}
              >
                {t('gpGiveTurnTo')} {player.username}
              </MenuItem>
            ))}
          </Menu>
        </div>
        <div className="turnActionsMain">
          {combatGame && room.combat == null && myTurn && (
            <IconButton
              size="sm"
              className="turnAttackBtn"
              aria-label={t('phAttack')}
              variant={me.battlefield.some((card) => !card.tapped && isCreature(card)) ? 'solid' : 'soft'}
              onClick={() => act({ kind: 'combat.begin' })}
            >
              <Swords size={16} />
            </IconButton>
          )}
          {combatGame && room.combat != null && (
            <>
              {enforced && myTurn && !room.combat.locked && room.combat.attackers.length > 0 && (
                <IconButton
                  size="sm"
                  className="turnAttackBtn"
                  variant="solid"
                  aria-label={t('gpConfirmAttackers')}
                  onClick={() => act({ kind: 'combat.lock' })}
                >
                  <Check size={16} />
                </IconButton>
              )}
              {enforced && iDefend && room.combat.locked && !room.combat.blocksReady && (
                <IconButton
                  size="sm"
                  className="turnAttackBtn"
                  variant="solid"
                  aria-label={t('gpConfirmBlocks')}
                  onClick={() => act({ kind: 'combat.ready' })}
                >
                  <Check size={16} />
                </IconButton>
              )}
              {enforced && myTurn && room.combat.preview && (
                <IconButton
                  size="sm"
                  className="turnAttackBtn"
                  variant="solid"
                  aria-label={t('gpResolveCombat')}
                  onClick={() => act({ kind: 'combat.resolve' })}
                >
                  <Zap size={16} />
                </IconButton>
              )}
              <IconButton
                size="sm"
                className="turnAttackBtn"
                variant="soft"
                aria-label={t('gpEndCombat')}
                onClick={() => act({ kind: 'combat.end' })}
              >
                <Shield size={16} />
              </IconButton>
            </>
          )}
          <div ref={endTurnRef} className="endTurnWrap">
            <IconButton
              size="lg"
              variant={myTurn ? 'solid' : 'soft'}
              className="endTurnBtn"
              data-lit={myTurn || undefined}
              aria-label={t('gpEndTurn')}
              onClick={() => {
                // Passing the turn is the one irreversible-feeling tap in the
                // corner; it confirms itself.
                haptics('success');
                act({ kind: 'turn.pass' });
              }}
            >
              <Check size={24} />
            </IconButton>
            {/* Satellites riding the end-turn circle's outer edge. */}
            <span className="turnOrbit" aria-hidden={false}>
              {/* Dice: rolled a few times a game, not every turn, so it tucks in
                  with the other satellites instead of spending a slot in the
                  board-tools row where the thumb reaches for Leave. */}
              <Menu
                aria-label={t('gpDice')}
                placement="top-end"
                trigger={
                  <IconButton
                    size="sm"
                    variant="soft"
                    className="turnOrbitBtn"
                    data-slot="dice"
                    aria-label={t('gpDice')}
                  >
                    <Dices size={15} />
                  </IconButton>
                }
              >
                {DICE_SIDES.map((sides) => (
                  <MenuItem
                    key={sides}
                    icon={<DiceIcon sides={sides} size={16} />}
                    onSelect={() => act({ kind: 'dice.roll', sides })}
                  >
                    d{sides}
                  </MenuItem>
                ))}
                <MenuItem icon={<Coins size={16} />} onSelect={() => act({ kind: 'dice.roll', sides: 2 })}>
                  {t('tblCoin')}
                </MenuItem>
              </Menu>
              <IconButton
                size="sm"
                variant="soft"
                className="turnOrbitBtn"
                data-slot="settings"
                aria-label={t('setTitle')}
                onClick={() => window.dispatchEvent(new CustomEvent('pc:open-settings'))}
              >
                <Settings size={15} />
              </IconButton>
              {onConcede && (
                <IconButton
                  size="sm"
                  variant="soft"
                  className="turnOrbitBtn"
                  data-slot="concede"
                  aria-label={t('tblConcede')}
                  onClick={onConcede}
                >
                  <Flag size={15} />
                </IconButton>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }

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
        {/* The turn readout is the one thing everyone at the table looks at
            constantly, so it reads as a HUD plate rather than a line of mono
            text: the active seat's own colour on the leading edge, the turn
            number at a glance, and whose turn it is in the same tracked caps
            the rest of the app uses for a headline. */}
        <div
          className="turnPlate"
          data-mine={myTurn || undefined}
          style={{ ['--pc-seat-color' as string]: seatColor(room.activeSeat ?? 0) }}
        >
          <span className="turnPlateCount">
            <span className="turnPlateWord">{t('gpTurnOf')}</span>
            <b className="turnPlateNum">{room.turnNumber ?? 1}</b>
          </span>
          {activePlayer && (
            <span className="turnPlateWho">{myTurn ? t('tblYourTurn') : activePlayer.username}</span>
          )}
          <span className="turnPlateClock">{turnClock}</span>
        </div>

        {canAct && me && (
          <>
            {combatGame && room.combat == null && myTurn && (
              <Button
                size="sm"
                variant={me.battlefield.some((card) => !card.tapped && isCreature(card)) ? 'solid' : 'soft'}
                onClick={() => act({ kind: 'combat.begin' })}
              >
                <Swords size={14} /> {t('phAttack')}
              </Button>
            )}
            {combatGame && room.combat != null && (
              <>
                {enforced && myTurn && !room.combat.locked && room.combat.attackers.length > 0 && (
                  <Button size="sm" variant="solid" onClick={() => act({ kind: 'combat.lock' })}>
                    <Check size={14} /> {t('gpConfirmAttackers')}
                  </Button>
                )}
                {enforced && iDefend && room.combat.locked && !room.combat.blocksReady && (
                  <Button size="sm" variant="solid" onClick={() => act({ kind: 'combat.ready' })}>
                    <Check size={14} /> {t('gpConfirmBlocks')}
                  </Button>
                )}
                {enforced && myTurn && room.combat.preview && (
                  <Button size="sm" variant="solid" onClick={() => act({ kind: 'combat.resolve' })}>
                    <Zap size={14} /> {t('gpResolveCombat')}
                  </Button>
                )}
                <Button size="sm" variant="soft" onClick={() => act({ kind: 'combat.end' })}>
                  <Shield size={14} /> {t('gpEndCombat')}
                </Button>
              </>
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

/**
 * The engine's combat outcome (enforced rooms): who dies and what damage goes
 * through, floating under the ribbon until the attacker resolves it. Pure
 * rendering - the numbers were computed server-side at combat.ready.
 */
export function CombatPreviewCard({ room }: { room: RoomState }) {
  const t = useT();
  const preview = room.combat?.preview;
  if (!preview) return null;
  const name = (seat: number) => room.players.find((p) => p.seat === seat)?.username ?? `#${seat + 1}`;
  return (
    <div className="combatPreviewCard" role="status" aria-label={t('cbPreviewTitle')}>
      <span className="combatPreviewTitle">
        <Zap size={13} /> {t('cbPreviewTitle')}
      </span>
      <ul className="combatPreviewRows">
        {preview.rows.map((row) => (
          <li key={row.attackerIid}>
            <b>{row.attackerName}</b>
            {row.playerDamage > 0 && (
              <span className="combatPreviewHit">
                {' '}→ {row.playerDamage} · {name(row.defenderSeat)}
              </span>
            )}
            {row.playerDamage === 0 && row.deadBlockerNames.length === 0 && !row.attackerDies && (
              <span className="combatPreviewHit"> · {t('cbPreviewBlocked')}</span>
            )}
            {row.attackerDies && <span className="combatPreviewDeath"> ☠ {row.attackerName}</span>}
            {row.deadBlockerNames.length > 0 && (
              <span className="combatPreviewDeath"> ☠ {row.deadBlockerNames.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
