import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Pill, Text, Size, TextTone, Tooltip } from '@glacier/react';
import { BookCopy, Check, Cpu, Crown, Hand as HandIcon, Shield, Skull, Zap } from '@glacier/icons';
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
import { cardBackUrl, effectiveCardBack } from '../../data/cardBacks.ts';
import { useEdgeColor } from '../../data/edgeColor.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { getGame, zoneLabel } from '../../data/games.ts';

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
  stage,
}: {
  room: RoomState;
  player: TablePlayer;
  me: TablePlayer | undefined;
  canAct: boolean;
  onHover: (card: CardInst | null) => void;
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
  const verticalCards = usePreference('verticalCards');
  const mirrorOpponent = usePreference('mirrorOpponent');

  const combat = room.combat;
  // Opponent vitals are game-driven: Cyberpunk relabels the life/poison slots as
  // Net / RAM (with a chip icon) and the library as the Deck.
  const cyber = room.game === 'cyberpunk';
  const gdef = getGame(room.game);
  // This seat's face-down cards wear THEIR chosen back (falling back to the
  // game-appropriate default), scoped to their board so it overrides the
  // table-wide (viewer's) back. The pile-edge colour is sampled from it too.
  const seatBackSrc = cardBackUrl(effectiveCardBack(player.cardBack ?? undefined, room.game));
  const seatBackEdge = useEdgeColor(seatBackSrc);
  const lifeLabel = gdef.resources.find((r) => r.primary)?.label ?? t('tblLife');
  const secLabel = gdef.resources.find((r) => !r.primary)?.label ?? t('tblPoison');
  const isActiveSeat = room.started && room.activeSeat === player.seat;
  const markers = room.markers ?? {};
  // Commander damage I've taken from THIS opponent's commander (21 = lethal);
  // the chip both shows it and steps it, so display and action agree.
  const anyDeciding = room.players.some((p) => p.mulligan?.state === 'deciding');
  const { hosts, attachments } = useMemo(() => groupAttachments(player.battlefield), [player.battlefield]);

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

  // Unblocked power aimed at me; the one-click "take damage" helper subtracts it
  // from my life. Creature deaths stay manual (drag them to the graveyard).
  const incomingUnblocked = (combat?.attackers ?? [])
    .filter((a) => attackerHitsMe(a.iid) && !(combat?.blocks ?? []).some((b) => b.attackerIid === a.iid))
    .reduce((sum, a) => {
      const p = parseInt((a.power ?? '0').trim(), 10);
      return sum + (Number.isFinite(p) ? Math.max(0, p) : 0);
    }, 0);

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
    // The .fieldCard::after hitbox paints over the GameCard, so elementFromPoint
    // lands on .fieldCard (no data-preview-src) and the hover preview never fires.
    // Mirror the preview attrs onto the wrapper so the opponent's board previews too.
    const cardPreview = card.faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId);
    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-preview-src={cardPreview}
        data-preview-name={cardPreview ? card.name : undefined}
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
          ['--rest-tilt' as string]: verticalCards ? '0deg' : `${restTilt(card.iid)}deg`,
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
      data-mirror={mirrorOpponent || undefined}
      style={{
        ['--pc-card-back' as string]: `url("${seatBackSrc}")`,
        ['--pc-card-back-edge' as string]: seatBackEdge,
        ...(player.playmat ? { ['--pc-board-mat' as string]: `url("${playmatUrl(player.playmat)}")` } : {}),
      }}
    >
      {iAmDefender && stage && (
        <div className="combatBanner" data-mode="block">
          <Shield size={13} />
          <Text as="span" size={Size.Small} weight="semibold">
            {t('gpBlockers')}
          </Text>
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
            {t('gpBlockPrompt')}
          </Text>
          {incomingUnblocked > 0 && (
            <Button size="sm" variant="solid" onClick={() => act({ kind: 'life.add', delta: -incomingUnblocked })}>
              {t('cbTakeDamage')} · {incomingUnblocked}
            </Button>
          )}
        </div>
      )}
      <header className="oppHead">
        <Avatar name={player.username} size="sm" />
        <Text as="span" size={Size.Small} weight="semibold" className="seatName">
          {player.username}
        </Text>
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
        <span className="oppLife" title={cyber ? lifeLabel : t('tblLife')}>
          {player.life}
        </span>
        {player.poison > 0 && (
          <span className="oppPoison" title={secLabel}>
            {cyber ? <Cpu size={11} /> : <Skull size={11} />} {player.poison}
          </span>
        )}
        <span className="oppHandCount" title={t('tblHand')}>
          <HandIcon size={11} /> {player.handCount}
        </span>
        <span className="oppHandCount" title={cyber ? zoneLabel(room.game, 'library') : t('tblLibrary')}>
          <BookCopy size={11} /> {player.libraryCount}
        </span>
      </header>
      {/* Their hand renders at the screen level (OpponentHand, mounted by
          TablePage) so it can hang off the very bottom edge exactly like mine,
          rather than being trapped inside this board's border. */}
      <div className="oppField">
        {hosts.map((card) => (
          <span key={card.iid} style={{ display: 'contents' }}>
            {(attachments.get(card.iid) ?? []).map((att, index) => renderCard(att, card, index))}
            {renderCard(card)}
          </span>
        ))}
      </div>
      <ZonePiles player={player} big={stage} onHover={onHover} />

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
