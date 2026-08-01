import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, IconButton, Size, Text, TextTone, Tooltip } from '@glacier/react';
import {
  Bot,
  Crown,
  Eye,
  EyeOff,
  Flag,
  GraduationCap,
  Heart,
  LogOut,
  MessageSquare,
  Minus,
  Plus,
  ScrollText,
  Settings,
  Skull,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { LobbyChat } from './LobbyChat.tsx';
import { maskLogNames } from './logMask.ts';
import { seatColor } from './seatColors.ts';
import type { RoomState, TablePlayer } from '../../net/types.ts';

/**
 * The portrait companion - the second screen for a phone held upright at a
 * running table.
 *
 * The playmat is landscape-only (docs/mobile-orientation.md, the governing
 * rule), but "landscape-only mat" is not "landscape-only app": a phone turned
 * portrait used to get a 94%-opaque cover with every control on the board
 * sitting UNDER it, which is a trap rather than a prompt. This is decision 2 -
 * the rotate ask survives as the headline, and everything a player needs while
 * not looking at the mat comes with it: life for every seat, whose turn it is,
 * the roster, the log, chat, and the two doors out (Concede, Leave).
 *
 * Deliberately NOT a portrait board. Nothing here moves a card.
 *
 * Layering (see the table's bands): this sits at z-50 - above the board and its
 * floating chrome (8-44), which is landscape furniture and inert while it is
 * up, and BELOW every panel surface (chat aside 58, library 60, timeline 63,
 * the dock sheet and modals 70+). So a sheet opened in landscape stays open,
 * on top, and usable after the rotation (decision 6), and nothing this covers
 * is a control the player still needs.
 */
export function PortraitCompanion({
  room,
  me,
  spectating,
  onLeave,
  onConcede,
}: {
  room: RoomState;
  me?: TablePlayer;
  spectating: boolean;
  onLeave: () => void;
  /** Absent when there is nothing to concede (spectator, already out, over). */
  onConcede?: () => void;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const log = useGame((state) => state.log);
  const [pane, setPane] = useState<'log' | 'chat'>('log');
  // Same contract as the rail's log: names are starred out until asked for, so
  // a companion left face-up on the table cannot spoil a tutor.
  const [spoilers, setSpoilers] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the newest line, the way the rail's does.
  useEffect(() => {
    if (pane !== 'log') return;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log.length, pane]);

  const players = [...room.players].sort((a, b) => a.seat - b.seat);
  const active = players.find((player) => player.seat === room.activeSeat);
  const myTurn = me != null && room.activeSeat === me.seat;
  // Yu-Gi-Oh life moves in hundreds; a +/-1 stepper would be 30 taps an attack.
  const step = room.game === 'yugioh' ? 100 : 1;
  const seated = me != null && !spectating;
  const names = players.map((player) => player.username);

  /** My own seat adjusts its own total; another seat is dealt to - the only
   *  action the protocol has for a third party, and the one the log narrates
   *  as "X deals N to Y". */
  const bumpLife = (player: TablePlayer, delta: number) => {
    if (!seated) return;
    if (me && player.userId === me.userId) act({ kind: 'life.add', delta });
    else act({ kind: 'life.deal', seat: player.seat, delta });
  };

  const logTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    // i18n: tblCompanion - literal English until the string pass lands the key.
    <section className="portraitCompanion" aria-label="Table companion">
      <header className="companionHead">
        <span className="companionGlyph" aria-hidden>
          <span className="companionPhone" />
        </span>
        <span className="companionHeadText">
          <Text as="p" weight="bold">
            {t('tblRotateTitle')}
          </Text>
          <Text as="p" size={Size.Small} tone={TextTone.Muted}>
            {t('tblRotateHint')}
          </Text>
        </span>
        <span className="companionHeadActions">
          {/* Settings was the third thing the old cover buried (the audit's
              "no leave, no concede, no settings, no life"). The modal portals
              at 100+, so it opens over this. */}
          <Tooltip content={t('setTitle')}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={t('setTitle')}
              onClick={() => window.dispatchEvent(new CustomEvent('pc:open-settings'))}
            >
              <Settings size={16} />
            </IconButton>
          </Tooltip>
          {onConcede && (
            <Button size="sm" variant="ghost" onClick={onConcede}>
              <Flag size={15} /> {t('tblConcede')}
            </Button>
          )}
          <Button size="sm" variant="soft" onClick={onLeave}>
            <LogOut size={15} /> {t('tblLeave')}
          </Button>
        </span>
      </header>

      <p className="companionTurn" role="status">
        <span className="companionTurnWord">
          {t('gpTurnOf')} {room.turnNumber ?? 1}
        </span>
        <b>{myTurn ? t('tblYourTurn') : (active?.username ?? t('tblWaiting'))}</b>
      </p>

      <ul className="companionSeats" aria-label={t('tblPlayers')}>
        {players.map((player) => {
          const isMe = me != null && player.userId === me.userId;
          const label = `${t('tblLife')} · ${player.username}`;
          return (
            <li
              key={player.userId}
              className="companionSeat"
              data-turn={room.activeSeat === player.seat || undefined}
              data-me={isMe || undefined}
              data-dead={player.conceded || undefined}
              // The seat's own hue - the same one its cursor, arrows and table
              // markers wear on the mat.
              style={{ ['--pc-seat-color' as string]: seatColor(player.seat) }}
            >
              <span className="companionSeatDot" aria-hidden />
              <Avatar name={player.username} size="sm" />
              <span className="companionSeatWho">
                <span className="companionSeatName">
                  {player.username}
                  {isMe && <span className="playerYou">{t('tblYou')}</span>}
                  {player.userId === room.hostUserId && (
                    <Tooltip content={t('tblHost')}>
                      <span className="companionBadge">
                        <Crown size={11} />
                      </span>
                    </Tooltip>
                  )}
                  {player.isBot && (
                    <span className="companionBadge">
                      <Bot size={11} />
                    </span>
                  )}
                  {player.conceded && (
                    <Tooltip content={t('tblConceded')}>
                      <span className="companionBadge">
                        <Skull size={11} />
                      </span>
                    </Tooltip>
                  )}
                </span>
                <span className="companionSeatMeta">
                  <span title={t('tblHand')}>
                    {player.handCount} {t('tblHand').toLowerCase()}
                  </span>
                  {player.poison > 0 && (
                    <span title={t('tblPoison')}>
                      <Skull size={11} /> {player.poison}
                    </span>
                  )}
                  {player.deckName && <span className="companionSeatDeck">{player.deckName}</span>}
                </span>
              </span>
              <span className="companionLife" role="group" aria-label={label}>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={`-${step} ${label}`}
                  disabled={!seated}
                  onClick={() => bumpLife(player, -step)}
                >
                  <Minus size={15} />
                </IconButton>
                <span className="companionLifeVal">
                  <Heart size={11} aria-hidden /> {player.life}
                </span>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={`+${step} ${label}`}
                  disabled={!seated}
                  onClick={() => bumpLife(player, step)}
                >
                  <Plus size={15} />
                </IconButton>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="companionTabs" role="tablist" aria-label={t('tblTableNav')}>
        <button
          type="button"
          role="tab"
          className="companionTab"
          aria-selected={pane === 'log'}
          data-active={pane === 'log' || undefined}
          onClick={() => setPane('log')}
        >
          <ScrollText size={14} /> {t('tblLog')}
        </button>
        <button
          type="button"
          role="tab"
          className="companionTab"
          aria-selected={pane === 'chat'}
          data-active={pane === 'chat' || undefined}
          onClick={() => setPane('chat')}
        >
          <MessageSquare size={14} /> {t('tblChat')}
        </button>
        {pane === 'log' && (
          <Tooltip content={spoilers ? t('logHideNames') : t('logShowNames')}>
            <IconButton
              size="sm"
              variant="ghost"
              className="companionTabsEnd"
              aria-label={spoilers ? t('logHideNames') : t('logShowNames')}
              onClick={() => setSpoilers((on) => !on)}
            >
              {spoilers ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div className="companionPane" role="tabpanel">
        {pane === 'log' ? (
          <div ref={logRef} className="companionLog">
            {log.length === 0 ? (
              <p className="sideEmpty">{t('tblLogEmpty')}</p>
            ) : (
              log.map((line, index) => (
                <p
                  key={`${line.seq}-${index}`}
                  className={line.coach ? 'sideLine sideLineCoach' : 'sideLine'}
                  data-rule={line.coach}
                  title={logTime(line.ts)}
                >
                  {line.coach && <GraduationCap size={13} className="sideLineCoachIcon" />}
                  <span className="sideLineTime">{logTime(line.ts)}</span>
                  {spoilers ? line.text : maskLogNames(line.text, names)}
                </p>
              ))
            )}
          </div>
        ) : (
          <LobbyChat variant="table" />
        )}
      </div>

      {spectating && (
        <p className="companionFoot">
          <Eye size={13} /> {t('tblSpectating')}
        </p>
      )}
    </section>
  );
}
