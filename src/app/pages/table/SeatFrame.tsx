import { useEffect, useState } from 'react';
import { Avatar, Pill, Text, Size, TextTone, Tooltip } from '@glacier/react';
import { BookCopy, Bot, Check, Crown, Hand as HandIcon, Shield, Skull, X, Zap } from '@glacier/icons';
import { send } from '../../net/ws.ts';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { AttackBadge, BlockCluster, CounterBadges, ZonePiles, groupAttachments } from './bits.tsx';
import { restTilt } from './juice.ts';
import { effectivePT, isCreature } from './boardModes.ts';
import { playmatUrl } from '../../data/playmats.ts';

/**
 * An opponent's seat: identity + vitals in the frame header, their battlefield
 * at raw coordinates, and their public piles. The active seat's frame glows.
 * During combat their attackers carry badges and pairing clusters; if you are
 * picking a blocker pairing, their attackers become the click targets.
 */

export function SeatFrame({
  room,
  player,
  me,
  canAct,
  onHover,
  onDamageMe,
  stage,
}: {
  room: RoomState;
  player: TablePlayer;
  me: TablePlayer | undefined;
  canAct: boolean;
  onHover: (card: CardInst | null) => void;
  onDamageMe: (delta: number) => void;
  /** Full-size main-stage rendering (vs the compact strip). */
  stage?: boolean;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();
  const blockerIid = useTableUi((state) => state.blockerIid);
  const setBlocker = useTableUi((state) => state.setBlocker);
  // The viewer's battlefield-size preference applies to the staged board too.
  const cardScale = useTableUi((state) => state.cardScale);

  const combat = room.combat;
  const isActiveSeat = room.started && room.activeSeat === player.seat;
  const markers = room.markers ?? {};
  const cmdIn = me !== undefined ? (player.cmdDamage[String(me.seat)] ?? 0) : 0;
  const anyDeciding = room.players.some((p) => p.mulligan?.state === 'deciding');
  const { hosts, attachments } = groupAttachments(player.battlefield);

  const attackerEntry = (iid: string) => combat?.attackers.find((entry) => entry.iid === iid);

  // I'm defending this seat's attack when it isn't my turn, an attacker exists,
  // and it aims at me (2-player, or explicitly my seat / an open swing).
  const attackerHitsMe = (iid: string) => {
    const entry = attackerEntry(iid);
    if (!entry || me === undefined) return false;
    return room.players.length === 2 || entry.defenderSeat === me.seat || entry.defenderSeat == null;
  };
  const iAmDefender =
    canAct &&
    me !== undefined &&
    combat != null &&
    room.activeSeat !== me.seat &&
    combat.attackers.some((a) => attackerHitsMe(a.iid));

  // Attacker → blocker picker (assign a block from the staged attacker board).
  const [blockPick, setBlockPick] = useState<{ attackerIid: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!blockPick) return;
    const close = () => setBlockPick(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [blockPick]);
  const myBlockers = me ? me.battlefield.filter((c) => !c.tapped && !c.attachedTo && isCreature(c)) : [];

  const clickCard = (card: CardInst, event: React.MouseEvent) => {
    // Legacy pairing: a blocker pre-selected on my own board + their attacker.
    if (canAct && blockerIid && combat && attackerEntry(card.iid)) {
      const blocker = me?.battlefield.find((c) => c.iid === blockerIid);
      act({ kind: 'combat.block', blockerIid, attackerIid: card.iid, ...(blocker ? effectivePT(blocker) : {}) });
      setBlocker(null);
      return;
    }
    // Defender flow: click an attacker aimed at me to choose its blocker.
    if (iAmDefender && attackerEntry(card.iid) && attackerHitsMe(card.iid)) {
      event.stopPropagation();
      setBlockPick({ attackerIid: card.iid, x: event.clientX, y: event.clientY });
      return;
    }
    if (!card.faceDown) popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
  };

  const renderCard = (card: CardInst, host?: CardInst, attachIndex = 0) => {
    const attacker = attackerEntry(card.iid);
    const baseX = host ? host.x : card.x;
    const baseY = host ? host.y : card.y;
    const offset = host ? Math.round(18 * (stage ? cardScale : 0.6)) * (attachIndex + 1) : 0;
    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-attacker={attacker ? '' : undefined}
        data-attachment={host ? '' : undefined}
        data-block-target={canAct && blockerIid && attacker ? '' : undefined}
        data-affordance={
          iAmDefender && attacker && attackerHitsMe(card.iid) ? 'block' : undefined
        }
        style={{
          left: offset ? `calc(${baseX * 100}% + ${offset}px)` : `${baseX * 100}%`,
          top: offset
            ? `calc(min(${baseY * 100}%, 100% - 8.75rem) + ${offset * 0.8}px)`
            : `min(${baseY * 100}%, 100% - 8.75rem)`,
          zIndex: host ? 4 : 5,
          ['--rest-tilt' as string]: `${restTilt(card.iid)}deg`,
        }}
        onPointerEnter={() => onHover(card)}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => clickCard(card, event)}
      >
        <GameCard
          name={card.name}
          imageUrl={card.imageUrl || cardImage(card.scryfallId)}
          width={stage ? Math.round(120 * cardScale) : 56}
          tapped={card.tapped}
          faceDown={card.faceDown}
          tilt={0}
        >
          <CounterBadges card={card} />
          {attacker && (
            <AttackBadge
              defenderName={room.players.find((p) => p.seat === attacker.defenderSeat)?.username}
            />
          )}
        </GameCard>
        {combat && <BlockCluster attackerIid={card.iid} combat={combat} room={room} canAct={canAct} />}
      </div>
    );
  };

  return (
    <section
      className="oppBoard seatFrame"
      data-active={isActiveSeat || undefined}
      data-stage={stage || undefined}
      style={player.playmat ? { ['--pc-board-mat' as string]: `url("${playmatUrl(player.playmat)}")` } : undefined}
    >
      {iAmDefender && stage && (
        <div className="combatBanner" data-mode="block">
          <Shield size={13} />
          <Text as="span" size={Size.Small} weight="semibold">
            {t('gpBlockers')}
          </Text>
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
            {combat?.locked && me !== undefined && (combat.ready ?? []).includes(me.seat)
              ? t('cbWaitingOthers')
              : t('gpBlockPrompt')}
          </Text>
        </div>
      )}
      <header className="oppHead">
        <Avatar name={player.username} size="sm" />
        <Text as="span" size={Size.Small} weight="semibold" className="seatName">
          {player.username}
        </Text>
        {player.isBot && (
          <Pill size="sm" tone="accent" icon={<Bot size={11} />}>
            {t('gpBotChip')}
          </Pill>
        )}
        {player.isBot && me?.userId === room.hostUserId && !room.started && (
          <Tooltip content={t('gpRemoveBot')}>
            <button
              type="button"
              className="seatMarker seatBotRemove"
              aria-label={t('gpRemoveBot')}
              onClick={() => send({ type: 'bot.remove', seat: player.seat })}
            >
              <X size={12} />
            </button>
          </Tooltip>
        )}
        {markers.monarch === player.seat && (
          <Tooltip content={t('gpMonarch')}>
            <span className="seatMarker">
              <Crown size={12} />
            </span>
          </Tooltip>
        )}
        {markers.initiative === player.seat && (
          <Tooltip content={t('gpInitiative')}>
            <span className="seatMarker">
              <Zap size={12} />
            </span>
          </Tooltip>
        )}
        {anyDeciding && player.mulligan && (
          <Pill
            size="sm"
            tone={player.mulligan.state === 'kept' ? 'success' : 'neutral'}
            icon={player.mulligan.state === 'kept' ? <Check size={11} /> : undefined}
          >
            {player.mulligan.state === 'kept' ? t('gpMullKeep') : `${t('tblMulligan')}…`}
          </Pill>
        )}
        <span className="oppLife" title={t('tblLife')}>
          {player.life}
        </span>
        {player.poison > 0 && (
          <span className="oppPoison" title={t('tblPoison')}>
            <Skull size={11} /> {player.poison}
          </span>
        )}
        <span className="oppHandCount" title={t('tblHand')}>
          <HandIcon size={11} /> {player.handCount}
        </span>
        <span className="oppHandCount" title={t('tblLibrary')}>
          <BookCopy size={11} /> {player.libraryCount}
        </span>
        {me !== undefined && canAct && (
          <Tooltip content={`${t('tblCommand')}: ${cmdIn}`}>
            <button
              type="button"
              className="cmdChip"
              onClick={() => onDamageMe(1)}
              onContextMenu={(event) => {
                event.preventDefault();
                onDamageMe(-1);
              }}
            >
              ⚔ {cmdIn}
            </button>
          </Tooltip>
        )}
      </header>
      {/* Their hand as a fan of face-down cards, so the count is visible at a
          glance across the table. */}
      {player.handCount > 0 && (
        <div className="oppHand" title={`${t('tblHand')}: ${player.handCount}`} aria-label={`${t('tblHand')}: ${player.handCount}`}>
          {Array.from({ length: Math.min(player.handCount, 14) }).map((_, index) => (
            <span key={index} className="oppHandCard" aria-hidden />
          ))}
          <span className="oppHandTally">{player.handCount}</span>
        </div>
      )}
      <div className="oppField">
        {hosts.map((card) => (
          <span key={card.iid} style={{ display: 'contents' }}>
            {(attachments.get(card.iid) ?? []).map((att, index) => renderCard(att, card, index))}
            {renderCard(card)}
          </span>
        ))}
      </div>
      <ZonePiles player={player} onHover={onHover} />

      {blockPick && me && (
        <div
          className="defenderPick"
          style={{ left: Math.min(blockPick.x, window.innerWidth - 200), top: Math.max(60, blockPick.y - 10) }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Text as="span" size={Size.XSmall} weight="semibold">
            {t('gpChooseBlocker')}
          </Text>
          {myBlockers.length === 0 ? (
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {t('gpNoCreatures')}
            </Text>
          ) : (
            myBlockers.map((creature) => (
              <button
                key={creature.iid}
                type="button"
                className="defenderChip"
                onClick={() => {
                  act({ kind: 'combat.block', blockerIid: creature.iid, attackerIid: blockPick.attackerIid, ...effectivePT(creature) });
                  setBlockPick(null);
                }}
              >
                {creature.name}
              </button>
            ))
          )}
        </div>
      )}
    </section>
  );
}
