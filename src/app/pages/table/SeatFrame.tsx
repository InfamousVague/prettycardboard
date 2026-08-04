import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Menu, MenuItem, Pill, Text, Size, TextTone, Tooltip } from '@glacier/react';
import { Bot as BotIcon, Check, Cpu, Crown, Shield, Skull, Zap } from '../../icons/backfilled.tsx';
import { PlayingCardHand, PlayingCardStack } from '../../icons/cards.ts';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { send } from '../../net/ws.ts';
import { cardImage } from '../../data/cards.ts';
import { isFoilInst } from '../../data/foil.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';
import { selectCardScale, useTableUi } from './tableUi.ts';
import { AnchoredMenu } from './menuAnchor.tsx';
import { AttackBadge, BlockCluster, CardMark, CounterBadges, DEFAULT_MAT_LAYOUT, MARK_KINDS, ZonePiles, groupAttachments, markIcon, splitPile } from './bits.tsx';
import { LoyaltyBadge } from './LoyaltyBadge.tsx';
import { MARK_LABEL } from './marks.ts';
import { YUGIOH_PILE_LAYOUT, YugiohZoneGrid } from './yugiohZones.tsx';
import { ambientDelay, restTilt } from './juice.ts';
import { PILE_MAX_EDGES, PILE_STEP_PX, effectivePT, isCreature, ptTotalLabel } from './boardModes.ts';
import { canPairBlock, enforcedRoom, matchesTargetKind, stackTargetKinds } from './enforce.ts';
import { playmatBackground } from '../../data/playmats.ts';
import { cardBackUrl, effectiveCardBack } from '../../data/cardBacks.ts';
import { useEdgeColor } from '../../data/edgeColor.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { primePrintedPT, usePrintedPtVersion } from '../../data/printedPt.ts';
import { faceImage, useFacesVersion } from '../../data/faces.ts';
import { getGame, zoneLabel } from '../../data/games.ts';
import { ManaPoolReadout } from '../../components/Mana.tsx';

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
  mirror,
}: {
  room: RoomState;
  player: TablePlayer;
  me: TablePlayer | undefined;
  canAct: boolean;
  onHover: (card: CardInst | null) => void;
  /** Full-size main-stage rendering (vs the compact strip). */
  stage?: boolean;
  /** Force the across-the-table 180° flip on or off, overriding the viewer's
   *  preference. The grid seats opponents facing you, where the mirror is a
   *  property of the layout rather than a taste. */
  mirror?: boolean;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const aim = useGame((state) => state.aim);
  const marks = useGame((state) => state.room?.marks);
  // Targets ride the stack entries, so the ring stays lit for exactly as long
  // as the spell is on the stack - a target that fades after a few seconds
  // reads as "nothing happened".
  const targetedIids = new Set(
    ((room.stack ?? []) as (CardInst & { targetIid?: string })[])
      .map((e) => e.targetIid)
      .filter((x): x is string => Boolean(x)),
  );
  const topSpell = (room.stack ?? [])[(room.stack ?? []).length - 1] as
    | (CardInst & { ownerSeat?: number })
    | undefined;
  const aimingKinds =
    topSpell && me && topSpell.ownerSeat === me.seat ? stackTargetKinds(topSpell) : [];
  const popup = useCardPopup();
  const blockerIid = useTableUi((state) => state.blockerIid);
  const setBlocker = useTableUi((state) => state.setBlocker);
  // The viewer's battlefield-size preference applies to the staged board too.
  const cardScale = useTableUi(selectCardScale);
  const verticalCards = usePreference('verticalCards');
  const cardTotals = usePreference('cardTotals');
  // A seat's cards resolve their printed P/T lazily like mine do; a flipped
  // card resolves through the faces cache, so watch that too.
  usePrintedPtVersion();
  useFacesVersion();
  // "Is Magic" (not "is not cyberpunk"): Yu-Gi-Oh must not inherit MTG-only
  // chrome, but its ATK/DEF chip rides the same ptTotalLabel path (game-aware).
  const mtg = (room.game ?? 'mtg') === 'mtg';
  const mirrorOpponent = usePreference('mirrorOpponent');
  const ambientCards = usePreference('ambientCards');
  // Yu-Gi-Oh seats draw the printed zone grid, with their piles in its cells.
  const ygoField = room.game === 'yugioh';
  // Their cards render at the staged size or the mini-seat size; the zone
  // outlines match, so an empty cell is exactly one of their cards.
  const oppCardWidth = stage ? Math.round(120 * cardScale) : 56;

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
  const enforced = enforcedRoom(room);
  const iAmDefender =
    canAct &&
    me !== undefined &&
    combat != null &&
    room.activeSeat !== me.seat &&
    combat.attackers.some((a) => attackerHitsMe(a.iid)) &&
    // Enforced machine: blocks only open between lock and ready.
    (!enforced || (Boolean(combat.locked) && !combat.blocksReady));

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
  const [markPick, setMarkPick] = useState<{ iid: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!markPick) return;
    const close = () => setMarkPick(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [markPick]);
  useEffect(() => {
    if (!blockPick) return;
    const close = () => setBlockPick(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [blockPick]);
  const myBlockers = me ? me.battlefield.filter((c) => !c.tapped && !c.attachedTo && isCreature(c)) : [];

  const clickCard = (card: CardInst, event: React.MouseEvent) => {
    // My spell tops the stack: clicking an opponent card points at it.
    const top = (room.stack ?? [])[(room.stack ?? []).length - 1] as
      | (CardInst & { ownerSeat?: number })
      | undefined;
    if (top && me && top.ownerSeat === me.seat) {
      useGame.getState().act({ kind: 'stack.target', iid: top.iid, targetIid: card.iid });
      return;
    }
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

  const renderCard = (
    card: CardInst,
    host?: CardInst,
    attachIndex = 0,
    /** Distance from the base, 1..PILE_MAX_EDGES. 0 = not a pile member. */
    pileDepth = 0,
    /** How many cards are stacked on THIS card. 0 = not a pile base. */
    pileCount = 0,
  ) => {
    const attacker = attackerEntry(card.iid);
    // Always primed for MTG - the lookup also learns type lines, which drive
    // blocker eligibility and attacker classification, not just the P/T chip.
    if (mtg) primePrintedPT(card);
    const ptTotal = cardTotals ? ptTotalLabel(card, mtg) : '';
    const baseX = host ? host.x : card.x;
    const baseY = host ? host.y : card.y;
    const scale = stage ? cardScale : 0.6;
    const piled = pileDepth > 0;
    const offset = !host
      ? 0
      : piled
        ? Math.round(PILE_STEP_PX * scale) * pileDepth
        : Math.round(18 * scale) * (attachIndex + 1);
    // The .fieldCard::after hitbox paints over the GameCard, so elementFromPoint
    // lands on .fieldCard (no data-preview-src) and the hover preview never fires.
    // Mirror the preview attrs onto the wrapper so the opponent's board previews too.
    const cardPreview = card.faceDown ? undefined : faceImage(card);
    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-iid={card.iid}
        data-preview-src={cardPreview}
        data-preview-name={cardPreview ? card.name : undefined}
        data-attacker={attacker ? '' : undefined}
        data-aimed={aim?.toIid === card.iid || targetedIids.has(card.iid) || undefined}
        data-targetable={(aimingKinds.length > 0 && matchesTargetKind(aimingKinds, card)) || undefined}
        data-attachment={host ? (card.piled ? 'pile' : 'aura') : undefined}
        data-pile={pileCount > 0 ? pileCount : undefined}
        data-block-target={canAct && blockerIid && attacker ? '' : undefined}
        data-affordance={
          iAmDefender && attacker && attackerHitsMe(card.iid) ? 'block' : undefined
        }
        data-ambient={ambientCards && stage ? '' : undefined}
        style={{
          left: offset ? `calc(${baseX * 100}% + ${piled ? -offset : offset}px)` : `${baseX * 100}%`,
          top: offset
            ? `calc(min(${baseY * 100}%, 100% - 8.75rem) + ${piled ? -offset : offset * 0.8}px)`
            : `min(${baseY * 100}%, 100% - 8.75rem)`,
          zIndex: host ? 4 : 5,
          ['--rest-tilt' as string]: verticalCards ? '0deg' : `${restTilt(card.iid)}deg`,
          ['--ambient-delay' as string]: `${ambientDelay(card.iid)}s`,
        }}
        onPointerEnter={() => onHover(card)}
        onPointerLeave={() => onHover(null)}
        onClick={(event) => clickCard(card, event)}
        onContextMenu={(event) => {
          event.preventDefault();
          setMarkPick({ iid: card.iid, x: event.clientX, y: event.clientY });
        }}
      >
        {marks?.[card.iid] && <CardMark mark={marks[card.iid]!} />}
        <GameCard
          name={card.name}
          imageUrl={faceImage(card)}
          width={stage ? Math.round(120 * cardScale) : 56}
          tapped={card.tapped}
          faceDown={card.faceDown}
          foil={isFoilInst(card)}
          tilt={0}
        >
          <CounterBadges card={card} />
          {/* An opponent's walker shows its loyalty too - read-only; their
              counters are theirs to move. */}
          <LoyaltyBadge card={card} room={room} canAct={false} onCounter={() => {}} onActivate={() => {}} />
          {ptTotal && (
            <span className="ptTotal" title={t('gpPtTotal')}>
              {ptTotal}
            </span>
          )}
          {/* A span, not a button: only the pile's owner can peel it. */}
          {pileCount > 0 && <span className="pileTally">{pileCount + 1}</span>}
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
      // An arrow aimed at a PLAYER lands here (see AimLayer's anchorOf).
      data-seat-anchor={player.seat}
      data-game={room.game || 'mtg'}
      data-active={isActiveSeat || undefined}
      data-stage={stage || undefined}
      data-mirror={(mirror ?? mirrorOpponent) || undefined}
      style={{
        ['--pc-card-back' as string]: `url("${seatBackSrc}")`,
        ['--pc-card-back-edge' as string]: seatBackEdge,
        ...(player.playmat ? { ['--pc-board-mat' as string]: playmatBackground(player.playmat) } : {}),
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
          {incomingUnblocked > 0 && !enforced && (
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
        {player.isBot && (
          <Tooltip content={t('preBotTagline')}>
            <span className="seatMarker">
              <BotIcon size={12} />
            </span>
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
        <span className="oppLife" title={mtg ? t('tblLife') : lifeLabel}>
          {player.life}
        </span>
        {player.poison > 0 && (
          <span className="oppPoison" title={secLabel}>
            {cyber ? <Cpu size={11} /> : <Skull size={11} />} {player.poison}
          </span>
        )}
        {mtg && <ManaPoolReadout mana={player.mana} />}
        <span className="oppHandCount" title={t('tblHand')}>
          <PlayingCardHand size={11} /> {player.handCount}
        </span>
        <span className="oppHandCount" title={mtg ? t('tblLibrary') : zoneLabel(room.game, 'library')}>
          <PlayingCardStack size={11} /> {player.libraryCount}
        </span>
      </header>
      {/* Their hand renders at the screen level (OpponentHand, mounted by
          TablePage) so it can hang off the very bottom edge exactly like mine,
          rather than being trapped inside this board's border. */}
      <div className="oppField" data-mat-seat={player.seat}>
        {/* Their side of the duel field, drawn the same way mine is — a seat
            reads as a playmat with zones, not a scatter of cards. Their piles
            ride the same printed cells (below). */}
        {ygoField && <YugiohZoneGrid cardWidth={oppCardWidth} labels={stage} />}
        {ygoField && (
          <div className="matZones">
            <ZonePiles room={room} player={player} big={stage} onHover={onHover} layout={YUGIOH_PILE_LAYOUT} />
          </div>
        )}
        {hosts.map((card) => {
          const { piled, auras } = splitPile(attachments.get(card.iid) ?? []);
          return (
            <span key={card.iid} style={{ display: 'contents' }}>
              {piled.map((att, index) =>
                renderCard(att, card, index, Math.min(piled.length - index, PILE_MAX_EDGES)),
              )}
              {auras.map((att, index) => renderCard(att, card, index))}
              {renderCard(card, undefined, 0, 0, piled.length)}
            </span>
          );
        })}
      </div>
      {!ygoField &&
        (() => {
          // The seat's custom mat layout (if any) lifts their piles into the same
          // free-placement overlay used on my board; the staged mirror's 180°
          // rotation maps (x,y)->(1-x,1-y) for free. Mini seats keep the strip.
          const custom =
            stage && mtg && player.matLayout && Object.keys(player.matLayout).length > 0
              ? { ...DEFAULT_MAT_LAYOUT, ...player.matLayout }
              : undefined;
          const piles = <ZonePiles room={room} player={player} big={stage} onHover={onHover} layout={custom} />;
          return custom ? <div className="matZones">{piles}</div> : piles;
        })()}

      {markPick && (
        <AnchoredMenu
          x={markPick.x}
          y={markPick.y}
          className="defenderPick"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Text as="span" size={Size.XSmall} weight="semibold">
            {t('mkTitle')}
          </Text>
          {/* Pointing is a gesture (an arrow the table watches travel); the
              rest are markers that stay put until someone lifts them. */}
          <button
            type="button"
            className="defenderChip"
            onClick={() => {
              send({ type: 'aim', toIid: markPick.iid, kind: 'point' });
              setMarkPick(null);
            }}
          >
            {t('mkPoint')}
          </button>
          <div className="markChipRow">
            {MARK_KINDS.map((kind) => {
              const active = marks?.[markPick.iid]?.kind === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  className="markChip"
                  data-kind={kind}
                  data-active={active || undefined}
                  aria-label={t(MARK_LABEL[kind])}
                  title={t(MARK_LABEL[kind])}
                  onClick={() => {
                    // Picking the marker a card already wears lifts it: one
                    // gesture both ways, no separate "clear" hunt.
                    act({ kind: 'mark.set', iid: markPick.iid, mark: active ? null : kind });
                    setMarkPick(null);
                  }}
                >
                  {markIcon(kind, 15)}
                </button>
              );
            })}
          </div>
          {marks?.[markPick.iid] && (
            <button
              type="button"
              className="defenderChip"
              onClick={() => {
                act({ kind: 'mark.set', iid: markPick.iid, mark: null });
                setMarkPick(null);
              }}
            >
              {t('mkClear')}
            </button>
          )}
        </AnchoredMenu>
      )}
      {blockPick && me && (
        <AnchoredMenu
          x={blockPick.x}
          y={blockPick.y}
          className="defenderPick"
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
            myBlockers
              .filter((creature) => {
                const atk = player.battlefield.find((c) => c.iid === blockPick.attackerIid);
                return !atk || canPairBlock(room, creature, atk);
              })
              .map((creature) => (
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
        </AnchoredMenu>
      )}
    </section>
  );
}
