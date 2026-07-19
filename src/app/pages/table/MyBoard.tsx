import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Button, IconButton, Input, Menu, MenuItem, MenuSub, Pill, SegmentedControl, Size, Text, TextTone, Tooltip } from '@glacier/react';
import {
  AlignStartVertical,
  Crown,
  Dices,
  Hand as HandIcon,
  Minus,
  Moon,
  Paintbrush,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Skull,
  Sparkles,
  Sun,
  Swords,
  Tornado,
  Undo2,
  Zap,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, RoomState, TablePlayer, Zone } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { AttackBadge, BlockCluster, CounterBadges, ZonePiles, groupAttachments } from './bits.tsx';
import {
  CARD_SCALE_MAX,
  CARD_SCALE_MIN,
  CARD_SCALE_STEP,
  hostUnderPoint,
  isCreature,
  snapDrop,
  tidyPositions,
  type BoardMode,
} from './boardModes.ts';
import { targetedSeats } from './CombatModals.tsx';
import { SETTLE_EASE, dragTilt, juicePulse, prefersReducedMotion, restTilt, setFlightAnchor } from './juice.ts';
import { playmatUrl } from '../../data/playmats.ts';

/**
 * My side of the table: free-placement battlefield with drag v2 (lift, tilt
 * toward velocity, overshoot settle), board layout modes, guided-combat
 * affordances, the fanned hand with a pointer-following ghost, and the
 * vitals + tools cluster. Input is never blocked by animation.
 */

interface DragState {
  iid: string;
  fromHand: boolean;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  tilt: number;
}

/**
 * Cushion (px) around the hand fan. A card released inside this buffer is put
 * back rather than played; a battlefield card released inside it is pulled
 * into the hand. Outside the buffer, a hand card lands on the felt.
 */
const HAND_DROP_BUFFER = 44;

export function MyBoard({
  me,
  room,
  onMenu,
  onHover,
  hideField,
}: {
  me: TablePlayer;
  room: RoomState;
  onMenu: (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => void;
  onHover: (card: CardInst | null) => void;
  /** Strip-only mode: another board is on the stage; keep hand and piles. */
  hideField?: boolean;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();
  const clickTimer = useRef<number | null>(null);
  useEffect(() => () => { if (clickTimer.current != null) window.clearTimeout(clickTimer.current); }, []);
  const boardMode = useTableUi((state) => state.boardMode);
  const cardScale = useTableUi((state) => state.cardScale);
  // Base 120 = the old 92 plus ~30%; the +/- toolbar scales from there. The
  // hand rides the same scale so the whole playmat resizes together.
  const fieldCardWidth = Math.round(120 * cardScale);
  const handCardWidth = Math.round(132 * cardScale);
  const blockerIid = useTableUi((state) => state.blockerIid);
  const setBlocker = useTableUi((state) => state.setBlocker);
  const setAttackPick = useTableUi((state) => state.setAttackPick);

  const fieldRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const prevFaces = useRef(new Map<string, boolean>());
  const [drag, setDrag] = useState<DragState | null>(null);
  // Pointer x over the hand fan; Infinity = not hovering (all bumps at rest).
  const handX = useMotionValue(Number.POSITIVE_INFINITY);
  const lastSent = useRef(0);
  const velocity = useRef({ x: 0, t: 0, vx: 0 });
  // A drag only becomes real after the pointer travels a few pixels -
  // otherwise a plain click would count as a zero-distance drop and hand
  // cards would get played by accident.
  const dragOrigin = useRef<{ px: number; py: number; armed: boolean }>({ px: 0, py: 0, armed: false });
  // Set when a real drag just ended, so the click that the browser fires right
  // after pointerup does not also tap the card.
  const justDragged = useRef(false);
  // Touch has no right-click, so a press-and-hold on a card opens its menu.
  // The timer rides along with the drag machine: any real drag (>6px) or the
  // pointer lifting cancels it. heldFired suppresses the tap that would
  // otherwise follow the hold.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldFired = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const started = room.started;
  const combat = room.combat;
  const myTurn = room.activeSeat === me.seat;
  const attackMode = started && combat != null && myTurn;
  const attackersTargetMe =
    combat != null &&
    combat.attackers.length > 0 &&
    !myTurn &&
    (room.players.length === 2 ||
      combat.attackers.some((entry) => entry.defenderSeat === me.seat || entry.defenderSeat == null));
  const blockMode = started && attackersTargetMe;

  const { hosts, attachments } = groupAttachments(me.battlefield);

  // Face-down flips: animate the half-turn when a card's face changes.
  useEffect(() => {
    for (const card of me.battlefield) {
      const prev = prevFaces.current.get(card.iid);
      if (prev !== undefined && prev !== card.faceDown && !prefersReducedMotion()) {
        cardEls.current.get(card.iid)?.animate(
          [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }],
          { duration: 240, easing: 'ease-out', composite: 'add' },
        );
      }
      prevFaces.current.set(card.iid, card.faceDown);
    }
  }, [me.battlefield]);

  /* ---------------- drag v2 ---------------- */

  const fieldPos = (clientX: number, clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(0.97, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(0.92, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const beginDrag = (event: ReactPointerEvent, card: CardInst, fromHand: boolean) => {
    if (event.button !== 0 || hideField) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    heldFired.current = false;
    clearHold();
    // Touch and pen only; mouse keeps its native contextmenu path. The event is
    // stale by the time the timer fires, so capture what openMenu needs now.
    if (event.pointerType !== 'mouse') {
      const el = event.currentTarget as Element;
      const cx = event.clientX;
      const cy = event.clientY;
      const zone: Zone = fromHand ? 'hand' : 'battlefield';
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        heldFired.current = true;
        onMenu(
          {
            preventDefault: () => {},
            stopPropagation: () => {},
            currentTarget: el,
            clientX: cx,
            clientY: cy,
          } as unknown as ReactPointerEvent,
          card.iid,
          zone,
        );
      }, 450);
    }
    dragOrigin.current = { px: event.clientX, py: event.clientY, armed: false };
    velocity.current = { x: event.clientX, t: performance.now(), vx: 0 };
    setDrag({
      iid: card.iid,
      fromHand,
      ...fieldPos(event.clientX, event.clientY),
      clientX: event.clientX,
      clientY: event.clientY,
      tilt: 0,
    });
  };

  const moveDrag = (event: ReactPointerEvent) => {
    if (!drag) return;
    const origin = dragOrigin.current;
    if (!origin.armed) {
      if (Math.hypot(event.clientX - origin.px, event.clientY - origin.py) < 6) return;
      origin.armed = true;
      // A real drag has started; it is not a press-and-hold.
      clearHold();
    }
    const now = performance.now();
    const dt = Math.max(1, now - velocity.current.t);
    const vx = (event.clientX - velocity.current.x) / dt;
    velocity.current = { x: event.clientX, t: now, vx: vx * 0.5 + velocity.current.vx * 0.5 };
    const pos = fieldPos(event.clientX, event.clientY);
    setDrag({
      ...drag,
      ...pos,
      clientX: event.clientX,
      clientY: event.clientY,
      tilt: dragTilt(velocity.current.vx),
    });
    // Battlefield cards stream their position (throttled); hand cards only
    // commit on drop.
    if (!drag.fromHand && Date.now() - lastSent.current > 90) {
      lastSent.current = Date.now();
      act({ kind: 'card.pos', iid: drag.iid, ...pos });
    }
  };

  const settle = (iid: string) => {
    if (prefersReducedMotion()) return;
    cardEls.current.get(iid)?.animate(
      [
        { transform: 'scale(1.05) rotate(1.5deg)' },
        { transform: 'scale(0.99) rotate(-0.6deg)', offset: 0.6 },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 340, easing: SETTLE_EASE, composite: 'add' },
    );
  };

  // Is a release point inside the hand's cushion (the fan plus HAND_DROP_BUFFER
  // on the sides and top)? Below the hand is the screen edge, so no lower bound.
  const inHandZone = (clientX: number, clientY: number) => {
    const handRect = handRef.current?.getBoundingClientRect();
    if (!handRect) return false;
    return (
      clientY >= handRect.top - HAND_DROP_BUFFER &&
      clientX >= handRect.left - HAND_DROP_BUFFER &&
      clientX <= handRect.right + HAND_DROP_BUFFER
    );
  };

  const endDrag = (event: ReactPointerEvent) => {
    clearHold();
    if (!drag) return;
    const iid = drag.iid;
    const fromHand = drag.fromHand;

    if (!dragOrigin.current.armed) {
      // Never crossed the drag threshold: this was a click/tap, handled by the
      // card's own onClick (hand preview, or clickFieldCard on the battlefield).
      setDrag(null);
      return;
    }

    const rect = fieldRef.current?.getBoundingClientRect() ?? null;
    const rawPos = fieldPos(event.clientX, event.clientY);
    const overHand = inHandZone(event.clientX, event.clientY);
    const card = fromHand ? me.hand?.find((c) => c.iid === iid) : me.battlefield.find((c) => c.iid === iid);
    const pos = snapDrop(boardMode, rawPos, card, rect);

    if (fromHand) {
      // Play the card only when it clears the hand's buffer; a drop back inside
      // the buffer springs it into the fan.
      if (!overHand && card) {
        const host = boardMode === 'assist' ? hostUnderPoint(me.battlefield, rawPos, rect, iid) : null;
        act({ kind: 'card.move', iid, to: 'battlefield', ...(host ? rawPos : pos) });
        if (host) act({ kind: 'card.attach', iid, hostIid: host.iid });
      }
    } else if (card) {
      // Dropping a battlefield card into the hand buffer returns it to hand.
      if (overHand) {
        act({ kind: 'card.move', iid, to: 'hand' });
      } else {
        const host = boardMode === 'assist' ? hostUnderPoint(me.battlefield, rawPos, rect, iid) : null;
        if (host && host.iid !== card.attachedTo) {
          act({ kind: 'card.attach', iid, hostIid: host.iid });
        } else if (!host && card.attachedTo) {
          // Dragging an attached card away detaches it.
          act({ kind: 'card.attach', iid, hostIid: null });
          act({ kind: 'card.pos', iid, ...pos });
        } else {
          act({ kind: 'card.pos', iid, ...pos });
        }
        settle(iid);
      }
    }
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
    setDrag(null);
  };

  /* ---------------- clicks: tap / attack / block ---------------- */

  // A single click on a hand card opens the fullscreen preview (same as any
  // card elsewhere). Suppress it right after a real drag, and after a
  // press-and-hold that already opened the context menu.
  const clickHandCard = (card: CardInst) => {
    if (justDragged.current) return;
    if (heldFired.current) {
      heldFired.current = false;
      return;
    }
    popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
  };

  const attackerEntry = (iid: string) => combat?.attackers.find((entry) => entry.iid === iid);

  const clickFieldCard = (event: React.MouseEvent, card: CardInst) => {
    if (justDragged.current) return;
    // A press-and-hold that opened the menu must not also tap the card.
    if (heldFired.current) {
      heldFired.current = false;
      return;
    }
    if (attackMode && !combat?.locked) {
      if (attackerEntry(card.iid)) {
        // Re-click un-declares (legacy toggle) while declarations are open.
        act({ kind: 'combat.attack', iid: card.iid });
        juicePulse(cardEls.current.get(card.iid));
        return;
      }
      if (isCreature(card) && !card.tapped) {
        event.stopPropagation();
        setAttackPick(card.iid);
        return;
      }
      // Non-creatures fall through to the normal preview/tap click.
    }
    if (blockMode && !card.tapped) {
      setBlocker(blockerIid === card.iid ? null : card.iid);
      juicePulse(cardEls.current.get(card.iid), 0.8);
      return;
    }
    // Single click flips the card up into the full preview; a second click
    // inside the window means double-click, which taps instead.
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      act({ kind: 'card.tap', iid: card.iid, tapped: !card.tapped });
      juicePulse(cardEls.current.get(card.iid), 0.7);
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
    }, 230);
  };

  /* ---------------- render ---------------- */

  const renderFieldCard = (card: CardInst, host?: CardInst, attachIndex = 0) => {
    const dragging = drag?.iid === card.iid && dragOrigin.current.armed && !drag.fromHand;
    const hostDragging = host && drag?.iid === host.iid && !drag.fromHand;
    const baseX = dragging ? drag.x : host ? (hostDragging ? drag!.x : host.x) : card.x;
    const baseY = dragging ? drag.y : host ? (hostDragging ? drag!.y : host.y) : card.y;
    const offset = host ? Math.round(18 * cardScale) * (attachIndex + 1) : 0;
    const attacker = attackerEntry(card.iid);
    const affordance = attackMode && !card.tapped && isCreature(card) ? 'attack' : blockMode && !card.tapped && isCreature(card) ? 'block' : undefined;

    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-dragging={dragging || undefined}
        data-attacker={attacker ? '' : undefined}
        data-attachment={host ? '' : undefined}
        data-affordance={affordance}
        data-blocking={blockerIid === card.iid || undefined}
        style={{
          left: offset ? `calc(${baseX * 100}% + ${offset}px)` : `${baseX * 100}%`,
          top: offset ? `calc(${baseY * 100}% + ${offset * 0.8}px)` : `${baseY * 100}%`,
          zIndex: dragging ? 30 : host ? 4 : 5,
          ['--rest-tilt' as string]: `${restTilt(card.iid)}deg`,
          ['--drag-tilt' as string]: dragging ? `${drag.tilt}deg` : '0deg',
        }}
        ref={(el) => {
          if (el) cardEls.current.set(card.iid, el);
          else cardEls.current.delete(card.iid);
        }}
        onPointerDown={(event) => beginDrag(event, card, false)}
        onPointerEnter={() => onHover(card)}
        onPointerLeave={() => onHover(null)}
        onContextMenu={(event) => onMenu(event, card.iid, 'battlefield')}
        onClick={(event) => clickFieldCard(event, card)}
      >
        <div className="fieldCardShell">
          <GameCard
            name={card.name}
            imageUrl={card.imageUrl || cardImage(card.scryfallId)}
            width={fieldCardWidth}
            tapped={card.tapped}
            faceDown={card.faceDown}
            tilt={0}
          >
            <CounterBadges card={card} />
            {attacker && (
              <AttackBadge defenderName={room.players.find((p) => p.seat === attacker.defenderSeat)?.username} />
            )}
          </GameCard>
        </div>
        {combat && <BlockCluster attackerIid={card.iid} combat={combat} room={room} canAct={started} />}
      </div>
    );
  };

  const draggedHandCard = drag?.fromHand ? me.hand?.find((c) => c.iid === drag.iid) : undefined;
  // Highlight the hand as a drop target while a battlefield card hovers its buffer.
  const returnToHandHot =
    drag != null && dragOrigin.current.armed && !drag.fromHand && inHandZone(drag.clientX, drag.clientY);

  return (
    <div className="myBoard" data-my-turn={(started && myTurn) || undefined} data-strip-only={hideField || undefined} onPointerMove={moveDrag} onPointerUp={endDrag}>
      {!hideField && (<>
      {/* combat banner */}
      {(attackMode || blockMode) && (
        <div className="combatBanner" data-mode={attackMode ? 'attack' : 'block'}>
          <Swords size={13} />
          <Text as="span" size={Size.Small} weight="semibold">
            {attackMode ? t('gpAttackers') : t('gpBlockers')}
          </Text>
          {attackMode && !combat?.locked && (
            <>
              {(combat?.attackers.length ?? 0) > 0 && (
                <Pill size="sm" tone="accent">
                  {combat?.attackers.length} {t('gpDeclared')}
                </Pill>
              )}
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
                {t('gpAttackHint')}
              </Text>
              {(combat?.attackers.length ?? 0) > 0 && (
                <Button size="sm" variant="solid" onClick={() => act({ kind: 'combat.lock' })}>
                  {t('cbLockIn')}
                </Button>
              )}
              <Button size="sm" onClick={() => act({ kind: 'combat.end' })}>
                {t('gpEndCombat')}
              </Button>
            </>
          )}
          {attackMode && combat?.locked && (
            <>
              <Pill size="sm" tone="accent">
                {(combat.ready ?? []).length}/{targetedSeats(room).length} {t('cbReadyCount')}
              </Pill>
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
                {t('cbLockedWaiting')}
              </Text>
              <Button size="sm" onClick={() => act({ kind: 'combat.end' })}>
                {t('gpEndCombat')}
              </Button>
            </>
          )}
          {blockMode && (
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
              {t('gpBlockHint')}
            </Text>
          )}
        </div>
      )}

      {/* battlefield */}
      <div
        ref={(el) => {
          fieldRef.current = el;
          setFlightAnchor('field:mine', el);
        }}
        className="myField"
        style={me.playmat ? { ['--pc-board-mat' as string]: `url("${playmatUrl(me.playmat)}")` } : undefined}
        data-mode={boardMode}
        data-lanes={(boardMode === 'rows' && drag != null) || undefined}
      >
        {hosts.map((card) => (
          <span key={card.iid} style={{ display: 'contents' }}>
            {(attachments.get(card.iid) ?? []).map((att, index) => renderFieldCard(att, card, index))}
            {renderFieldCard(card)}
          </span>
        ))}

        {/* vitals cluster floats top-end over the playmat */}
        <Vitals me={me} floating />

        {/* board mode toolbar, docked bottom-start of the field */}
        <div className="boardTools boardToolsStart">
          <SegmentedControl
            size="sm"
            aria-label={t('gpBoardMode')}
            value={boardMode}
            onValueChange={(value) => useTableUi.getState().setBoardMode(value as BoardMode, me.userId)}
            options={[
              { value: 'free', label: t('gpModeFree') },
              { value: 'assist', label: t('gpModeAssist') },
              { value: 'rows', label: t('gpModeRows') },
              { value: 'grid', label: t('gpModeGrid') },
            ]}
          />
          {boardMode === 'assist' && (
            <Tooltip content={t('gpTidy')}>
              <IconButton
                size="sm"
                variant="soft"
                aria-label={t('gpTidy')}
                onClick={() => {
                  const rect = fieldRef.current?.getBoundingClientRect() ?? null;
                  for (const move of tidyPositions(me.battlefield, rect)) {
                    act({ kind: 'card.pos', iid: move.iid, x: move.x, y: move.y });
                  }
                  juicePulse(fieldRef.current, 0.4);
                }}
              >
                <AlignStartVertical size={15} />
              </IconButton>
            </Tooltip>
          )}
        </div>

        {/* dice + markers toolbar, docked bottom-end of the field */}
        <div className="boardTools boardToolsEnd">
          <Tooltip content={t('gpCardsSmaller')}>
            <IconButton
              size="sm"
              variant="soft"
              aria-label={t('gpCardsSmaller')}
              disabled={cardScale <= CARD_SCALE_MIN}
              onClick={() => useTableUi.getState().setCardScale(cardScale - CARD_SCALE_STEP, me.userId)}
            >
              <Minus size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('gpCardsLarger')}>
            <IconButton
              size="sm"
              variant="soft"
              aria-label={t('gpCardsLarger')}
              disabled={cardScale >= CARD_SCALE_MAX}
              onClick={() => useTableUi.getState().setCardScale(cardScale + CARD_SCALE_STEP, me.userId)}
            >
              <Plus size={15} />
            </IconButton>
          </Tooltip>
          <Menu
            aria-label={t('gpDice')}
            placement="top-end"
            trigger={
              <IconButton size="sm" variant="soft" aria-label={t('gpDice')}>
                <Dices size={15} />
              </IconButton>
            }
          >
            <MenuItem onSelect={() => act({ kind: 'dice.roll', sides: 6 })}>d6</MenuItem>
            <MenuItem onSelect={() => act({ kind: 'dice.roll', sides: 20 })}>d20</MenuItem>
            <MenuItem onSelect={() => act({ kind: 'dice.roll', sides: 2 })}>Coin flip</MenuItem>
          </Menu>
          <Menu
            aria-label={t('gpMarkers')}
            placement="top-end"
            trigger={
              <IconButton size="sm" variant="soft" aria-label={t('gpMarkers')}>
                <Crown size={15} />
              </IconButton>
            }
          >
            <MenuSub label={t('gpMonarch')} icon={<Crown size={14} />}>
              {room.players.map((player) => (
                <MenuItem key={player.userId} onSelect={() => act({ kind: 'marker.set', marker: 'monarch', seat: player.seat })}>
                  {player.username}
                </MenuItem>
              ))}
            </MenuSub>
            <MenuSub label={t('gpInitiative')} icon={<Zap size={14} />}>
              {room.players.map((player) => (
                <MenuItem key={player.userId} onSelect={() => act({ kind: 'marker.set', marker: 'initiative', seat: player.seat })}>
                  {player.username}
                </MenuItem>
              ))}
            </MenuSub>
            <MenuItem
              icon={room.markers?.dayNight === 'night' ? <Moon size={14} /> : <Sun size={14} />}
              onSelect={() => {
                const current = room.markers?.dayNight ?? null;
                const next = current === null ? 'day' : current === 'day' ? 'night' : null;
                act({ kind: 'marker.day', value: next });
              }}
            >
              {t('gpDayNight')}
            </MenuItem>
            <MenuItem icon={<Tornado size={14} />} onSelect={() => act({ kind: 'marker.storm', delta: 1 })}>
              {`${t('gpStorm')} +1${room.markers?.storm ? ` (${room.markers.storm})` : ''}`}
            </MenuItem>
            {(room.markers?.storm ?? 0) > 0 && (
              <MenuItem icon={<Tornado size={14} />} onSelect={() => act({ kind: 'marker.storm', delta: -1 })}>
                {`${t('gpStorm')} -1 (${room.markers?.storm})`}
              </MenuItem>
            )}
          </Menu>
        </div>
      </div>

      </>)}

      {/* bottom strip: zones | hand | vitals */}
      <div className="myStrip">
        <ZonePiles player={me} mine canAct onMenu={onMenu} onHover={onHover} />

        <div
          className="myHand"
          data-count={me.hand?.length ?? 0}
          data-drop={returnToHandHot || undefined}
          // Drives the per-card overlap so the fan keeps its shape at any scale.
          style={{ ['--card-scale' as string]: cardScale }}
          ref={(el) => {
            handRef.current = el;
            setFlightAnchor('hand:mine', el);
          }}
          onPointerMove={(event) => {
            // Dock-style magnification is a mouse luxury; touch pointers are
            // busy dragging, and mid-drag the fan should hold still.
            if (event.pointerType !== 'mouse' || drag) return;
            handX.set(event.clientX);
          }}
          onPointerLeave={() => handX.set(Number.POSITIVE_INFINITY)}
        >
          {(me.hand ?? []).map((card, index, hand) => (
            <HandCard
              key={card.iid}
              card={card}
              width={handCardWidth}
              spread={index - (hand.length - 1) / 2}
              dimmed={drag?.iid === card.iid && dragOrigin.current.armed}
              handX={handX}
              onPointerDown={(event) => beginDrag(event, card, true)}
              onPointerEnter={() => onHover(card)}
              onPointerLeave={() => onHover(null)}
              onClick={() => clickHandCard(card)}
              onContextMenu={(event) => onMenu(event, card.iid, 'hand')}
            />
          ))}
        </div>

        {hideField && <Vitals me={me} />}
      </div>

      {/* pointer-following ghost for hand drags */}
      {draggedHandCard && drag && dragOrigin.current.armed && (
        <div
          className="dragGhost"
          style={{
            left: drag.clientX,
            top: drag.clientY,
            ['--drag-tilt' as string]: `${drag.tilt}deg`,
          }}
          aria-hidden
        >
          <GameCard
            name={draggedHandCard.name}
            imageUrl={draggedHandCard.imageUrl || cardImage(draggedHandCard.scryfallId)}
            width={handCardWidth}
            tilt={0}
          />
        </div>
      )}

    </div>
  );
}

/* ================= vitals + conveniences ================= */

function Vitals({ me, floating }: { me: TablePlayer; floating?: boolean }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenPT, setTokenPT] = useState('1/1');
  const lifeRef = useRef<HTMLSpanElement>(null);

  return (
    <div className={floating ? 'myVitals myVitalsFloat' : 'myVitals'}>
      <div className="lifeBlock">
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="-1"
          onClick={() => {
            act({ kind: 'life.add', delta: -1 });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <Minus size={14} />
        </IconButton>
        <span className="lifeBig" ref={lifeRef}>
          {me.life}
        </span>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="+1"
          onClick={() => {
            act({ kind: 'life.add', delta: 1 });
            juicePulse(lifeRef.current, 0.8);
          }}
        >
          <Plus size={14} />
        </IconButton>
      </div>
      <button
        type="button"
        className="poisonChip"
        onClick={() => act({ kind: 'poison.add', delta: 1 })}
        onContextMenu={(event) => {
          event.preventDefault();
          act({ kind: 'poison.add', delta: -1 });
        }}
        title={t('tblPoison')}
      >
        <Skull size={13} /> {me.poison}
      </button>

      <div className="convenience">
        <Tooltip content={`${t('tblDraw')} 1`}>
          <IconButton size="sm" variant="soft" aria-label={t('tblDraw')} onClick={() => act({ kind: 'draw', count: 1 })}>
            <HandIcon size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblUntapAll')}>
          <IconButton size="sm" variant="soft" aria-label={t('tblUntapAll')} onClick={() => act({ kind: 'untap.all' })}>
            <RefreshCw size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblShuffle')}>
          <IconButton size="sm" variant="soft" aria-label={t('tblShuffle')} onClick={() => act({ kind: 'shuffle' })}>
            <Shuffle size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('tblToken')}>
          <IconButton
            size="sm"
            variant={tokenOpen ? 'solid' : 'soft'}
            aria-label={t('tblToken')}
            onClick={() => setTokenOpen(!tokenOpen)}
          >
            <Sparkles size={15} />
          </IconButton>
        </Tooltip>
        <Tooltip content={t('gpUndo')}>
          <IconButton size="sm" variant="soft" aria-label={t('gpUndo')} onClick={() => act({ kind: 'undo' })}>
            <Undo2 size={15} />
          </IconButton>
        </Tooltip>
        <Menu
          aria-label={t('gpTableSettings')}
          placement="top-end"
          trigger={
            <IconButton size="sm" variant="soft" aria-label={t('gpTableSettings')}>
              <Settings size={15} />
            </IconButton>
          }
        >
          <MenuItem onSelect={() => window.dispatchEvent(new Event('pc:open-customize'))}>
            <Paintbrush size={14} /> {t('navCustomize')}
          </MenuItem>
          <MenuItem onSelect={() => window.dispatchEvent(new Event('pc:open-settings'))}>
            <Settings size={14} /> {t('navSettings')}
          </MenuItem>
        </Menu>
      </div>

      {tokenOpen && (
        <form
          className="tokenForm"
          onSubmit={(event) => {
            event.preventDefault();
            const [power, toughness] = tokenPT.split('/');
            act({
              kind: 'token.create',
              name: tokenName || 'Token',
              power: power?.trim(),
              toughness: toughness?.trim(),
              x: 0.5,
              y: 0.55,
            });
            setTokenOpen(false);
            setTokenName('');
          }}
        >
          <Input size="sm" value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="Treasure" />
          <Input size="sm" value={tokenPT} onChange={(event) => setTokenPT(event.target.value)} placeholder="1/1" style={{ width: '4.5rem' }} />
          <Button size="sm" type="submit">
            +
          </Button>
        </form>
      )}
    </div>
  );
}

/* ================= hand card (dock magnification) ================= */

/**
 * One card of the fan with macOS-Dock magnification: the pointer's distance
 * to the card's center drives a gaussian bump - biggest under the cursor,
 * tapering through the neighbors, gone by roughly two cards away. Motion
 * values keep the whole effect off the React render path.
 */
function HandCard({
  card,
  width,
  spread,
  dimmed,
  handX,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onClick,
  onContextMenu,
}: {
  card: CardInst;
  width: number;
  spread: number;
  dimmed: boolean;
  handX: MotionValue<number>;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 0..1 pointer proximity to this card's center (live rect read: the fan
  // reflows as cards are played and the measurement must follow). The falloff
  // width tracks the card size so the taper stays even at any scale.
  const bump = useTransform(handX, (x) => {
    const el = ref.current;
    if (!el || !Number.isFinite(x) || prefersReducedMotion()) return 0;
    const rect = el.getBoundingClientRect();
    const d = (x - (rect.left + rect.width / 2)) / Math.max(1, width);
    return Math.exp(-d * d);
  });
  const scale = useSpring(useTransform(bump, (v) => 1 + 0.3 * v), { stiffness: 430, damping: 30 });
  // Lift proportionally to the card size so bigger cards clear the fan.
  const liftMax = -34 * (width / 132);
  const lift = useSpring(useTransform(bump, (v) => liftMax * v), { stiffness: 430, damping: 30 });
  const z = useTransform(bump, (v) => Math.round(v * 20));

  return (
    <motion.div
      ref={ref}
      className="handCard"
      style={{ zIndex: z }}
      initial={{ y: 60, opacity: 0 }}
      animate={{
        y: Math.abs(spread) * 6,
        opacity: dimmed ? 0.28 : 1,
        rotate: spread * 3.5,
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <motion.div className="handCardZoom" style={{ scale, y: lift }}>
        <GameCard name={card.name} imageUrl={card.imageUrl || cardImage(card.scryfallId)} width={width} tilt={0} />
      </motion.div>
    </motion.div>
  );
}
