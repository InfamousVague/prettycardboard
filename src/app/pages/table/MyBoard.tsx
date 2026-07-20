import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Button, IconButton, Input, Menu, MenuItem, MenuSub, Pill, SegmentedControl, Size, Text, TextTone, Tooltip } from '@glacier/react';
import {
  AlignStartVertical,
  ChevronDown,
  ChevronUp,
  Crown,
  Dices,
  Minus,
  Moon,
  Plus,
  Settings,
  Sun,
  Swords,
  Tornado,
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
  effectivePT,
  hostUnderPoint,
  isCreature,
  snapDrop,
  tidyPositions,
  type BoardMode,
} from './boardModes.ts';
import { SETTLE_EASE, dragTilt, flightAnchor, juicePulse, prefersReducedMotion, restTilt, setFlightAnchor } from './juice.ts';
import { playmatUrl } from '../../data/playmats.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { TokenPicker } from './TokenPicker.tsx';
import { HandCard, HAND_PEEK_ZONE } from './HandCard.tsx';
import { DiceRoll3D } from './DiceRoll3D.tsx';

/**
 * My side of the table: free-placement battlefield with drag v2 (lift, tilt
 * toward velocity, overshoot settle), board layout modes, guided-combat
 * affordances, the fanned hand with a pointer-following ghost, and the
 * vitals + tools cluster. Input is never blocked by animation.
 */

/** Where a drag started. Battlefield cards move on the field; everything else
 * follows the pointer as a ghost and is played/moved on drop. */
type DragFrom = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library';

interface DragState {
  iid: string;
  from: DragFrom;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  tilt: number;
  /** Where within the card it was grabbed, as a field-fraction offset from the
   * card's center, so the card is dragged from the point clicked (not recentred
   * on the pointer). Zero for ghost drags from hand/piles. */
  grabX: number;
  grabY: number;
}

/**
 * Cushion (px) around the hand fan. A card released inside this buffer is put
 * back rather than played; a battlefield card released inside it is pulled
 * into the hand. Outside the buffer, a hand card lands on the felt.
 */
const HAND_DROP_BUFFER = 44;

/**
 * The bottom band of the playmat (where the deck/piles float) is reserved:
 * cards never land there. Small now that the hand auto-peeks away instead of
 * permanently occupying the bottom. Capped at a quarter of the field.
 */
const RESERVED_BOTTOM_PX = 96;


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
  // Perfectly-upright cards vs the natural slight per-card tilt (Settings ->
  // Table -> Card placement).
  const verticalCards = usePreference('verticalCards');

  const fieldRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const prevFaces = useRef(new Map<string, boolean>());
  const [drag, setDrag] = useState<DragState | null>(null);
  // Where a just-dropped card is held locally until the server echoes its new
  // position - stops the card snapping back to its old spot for one network
  // round-trip (the release "jitter").
  const [droppedPos, setDroppedPos] = useState<Record<string, { x: number; y: number }>>({});
  // Per-card stacking order: the most recently placed card floats over the rest.
  // Local to this viewer (a felt is freeform); `.myField` is its own stacking
  // context so these never climb over the hand/pile strip.
  const [zOrder, setZOrder] = useState<Record<string, number>>({});
  const zCounter = useRef(0);
  const bumpZ = (iid: string) => setZOrder((m) => ({ ...m, [iid]: (zCounter.current += 1) }));
  // The fan rests half off-screen and peeks up on hover (or while dragging).
  const [handPeek, setHandPeek] = useState(false);
  // Manually tucked ~95% off-screen via the Hide-hand tab, to clear the board.
  const [handHidden, setHandHidden] = useState(false);
  // Tokens/counters are an MTG concept; Cyberpunk keeps the plain custom form.
  const mtg = room.game !== 'cyberpunk';
  // Right-click on the empty felt: a small board menu (create token / counter),
  // and the token picker it opens. `bx`/`by` are 0-1 board coords for placement.
  const [boardMenu, setBoardMenu] = useState<{ x: number; y: number; bx: number; by: number } | null>(null);
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(null);

  // Dismiss the board menu on any outside press (menu items stopPropagation so
  // a click inside survives to run its action).
  useEffect(() => {
    if (!boardMenu) return;
    const close = () => setBoardMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
    };
  }, [boardMenu]);

  // The vitals toolbar's token button lives in a sibling component; it asks us
  // to open the picker (centred) via a window event so both entry points share
  // one modal.
  useEffect(() => {
    if (!mtg) return;
    const open = () => setPickerAt({ x: 0.5, y: 0.55 });
    window.addEventListener('pc:create-token', open);
    return () => window.removeEventListener('pc:create-token', open);
  }, [mtg]);
  // Pointer x over the hand fan; Infinity = not hovering (all bumps at rest).
  const handX = useMotionValue(Number.POSITIVE_INFINITY);
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
  // Unblocked power aimed at me: the one-click "take damage" helper subtracts
  // this from my life. Creature deaths stay manual (drag to the graveyard).
  const incomingUnblocked = (combat?.attackers ?? [])
    .filter(
      (a) =>
        (a.defenderSeat === me.seat || a.defenderSeat == null) &&
        !(combat?.blocks ?? []).some((b) => b.attackerIid === a.iid),
    )
    .reduce((sum, a) => {
      const p = parseInt((a.power ?? '0').trim(), 10);
      return sum + (Number.isFinite(p) ? Math.max(0, p) : 0);
    }, 0);

  // Rebuilt only when the battlefield changes - not on every drag frame /
  // ws event, which re-render this component.
  const { hosts, attachments } = useMemo(() => groupAttachments(me.battlefield), [me.battlefield]);

  // Peek the hand up whenever the pointer is in the bottom band of the screen.
  // Driving this off a STABLE viewport threshold (not the hand's own moving
  // box) avoids a raise/lower oscillation when the pointer sits near the edge.
  useEffect(() => {
    if (hideField) return;
    const onMove = (event: PointerEvent) => {
      setHandPeek(event.clientY > window.innerHeight - HAND_PEEK_ZONE);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [hideField]);

  // Release a held drop position once the server's echo has caught up (or the
  // card left the battlefield), so the local override never lingers.
  useEffect(() => {
    setDroppedPos((held) => {
      const iids = Object.keys(held);
      if (iids.length === 0) return held;
      let changed = false;
      const next = { ...held };
      for (const iid of iids) {
        const p = held[iid];
        const card = me.battlefield.find((c) => c.iid === iid);
        if (!p || !card || (Math.abs(card.x - p.x) < 0.001 && Math.abs(card.y - p.y) < 0.001)) {
          delete next[iid];
          changed = true;
        }
      }
      return changed ? next : held;
    });
    // Drop stacking entries for cards that left the battlefield.
    setZOrder((order) => {
      const iids = Object.keys(order);
      if (iids.length === 0) return order;
      let changed = false;
      const next = { ...order };
      for (const iid of iids) {
        if (!me.battlefield.some((c) => c.iid === iid)) {
          delete next[iid];
          changed = true;
        }
      }
      return changed ? next : order;
    });
  }, [me.battlefield]);

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

  // Largest droppable y (normalized) - everything below is the reserved
  // hand/deck band. Kept above 0.55 so tiny boards keep a play area.
  const maxDropY = (rect: DOMRect) => {
    if (rect.height <= 0) return 0.92;
    const reserved = Math.min(rect.height / 4, RESERVED_BOTTOM_PX);
    return Math.max(0.55, (rect.height - reserved) / rect.height);
  };

  // The card's center position (field fraction) for a pointer, minus the grab
  // offset so the point originally clicked stays under the pointer.
  const fieldPos = (clientX: number, clientY: number, grabX = 0, grabY = 0) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(0.97, Math.max(0, (clientX - rect.left) / rect.width - grabX)),
      y: Math.min(maxDropY(rect), Math.max(0, (clientY - rect.top) / rect.height - grabY)),
    };
  };

  // Is a release point over the reserved bottom band of my field?
  const inReservedBand = (clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return false;
    return clientY > rect.top + rect.height * maxDropY(rect);
  };

  const beginDrag = (event: ReactPointerEvent, card: CardInst, from: DragFrom, opts?: { menu?: boolean }) => {
    if (event.button !== 0 || hideField) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    heldFired.current = false;
    clearHold();
    // Touch and pen only; mouse keeps its native contextmenu path. The event is
    // stale by the time the timer fires, so capture what openMenu needs now.
    // Pile cards opt out (menu:false) - they carry their own long-press menu.
    if (event.pointerType !== 'mouse' && opts?.menu !== false) {
      const el = event.currentTarget as Element;
      const cx = event.clientX;
      const cy = event.clientY;
      const zone: Zone = from;
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
    // For an in-place battlefield drag, remember where within the card the grab
    // landed so it moves from that point (not recentred on the pointer). Ghost
    // drags from the hand/piles keep zero offset (the ghost tracks the pointer).
    let grabX = 0;
    let grabY = 0;
    // Attachments render at their HOST's position, not their own x/y, so a grab
    // offset computed from card.x/y would be wrong; detaching them just
    // recentres on the pointer (grab 0). Standalone cards keep the real offset.
    if (from === 'battlefield' && !card.attachedTo) {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (rect) {
        const held = droppedPos[card.iid];
        grabX = (event.clientX - rect.left) / rect.width - (held?.x ?? card.x);
        grabY = (event.clientY - rect.top) / rect.height - (held?.y ?? card.y);
      }
    }
    setDrag({
      iid: card.iid,
      from,
      ...fieldPos(event.clientX, event.clientY, grabX, grabY),
      clientX: event.clientX,
      clientY: event.clientY,
      tilt: 0,
      grabX,
      grabY,
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
    const pos = fieldPos(event.clientX, event.clientY, drag.grabX, drag.grabY);
    setDrag({
      ...drag,
      ...pos,
      clientX: event.clientX,
      clientY: event.clientY,
      tilt: dragTilt(velocity.current.vx),
    });
    // The drag stays entirely local until release: the card follows the
    // pointer here, and the final position is committed once in endDrag. We
    // used to stream card.pos every ~90ms, which spammed the log and round-
    // tripped every frame - other players now see the card land on drop.
  };

  const settle = (iid: string) => {
    if (prefersReducedMotion()) return;
    // A gentle scale pop on landing - no counter-rotation, which read as a
    // wobble/jitter when composited over the card's rest tilt.
    cardEls.current.get(iid)?.animate(
      [{ transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 240, easing: SETTLE_EASE, composite: 'add' },
    );
  };

  const cardOf = (from: DragFrom, iid: string): CardInst | undefined => {
    if (from === 'hand') return me.hand?.find((c) => c.iid === iid);
    if (from === 'battlefield') return me.battlefield.find((c) => c.iid === iid);
    if (from === 'graveyard') return me.graveyard.find((c) => c.iid === iid);
    if (from === 'exile') return me.exile.find((c) => c.iid === iid);
    // The library is a hidden zone: the client never has its cards, so a
    // drag-from-deck rides a face-down placeholder (the server plays the real
    // top card on drop).
    if (from === 'library') {
      return { iid, name: '', imageUrl: '', tapped: false, faceDown: true, counters: {}, x: 0, y: 0, isToken: false };
    }
    return undefined;
  };

  // Which of MY zone piles (deck/graveyard/exile/command) is under the release
  // point, if any - so a card can be dropped straight onto a pile instead of
  // going through the context menu. Anchors are the piles' live DOM rects.
  const pileUnderPoint = (clientX: number, clientY: number): Zone | null => {
    const pad = 10;
    const over = (key: string) => {
      const r = flightAnchor(key);
      return r != null && clientX >= r.left - pad && clientX <= r.right + pad && clientY >= r.top - pad && clientY <= r.bottom + pad;
    };
    if (over(`cmd:${me.userId}`)) return 'command';
    if (over(`grave:${me.userId}`)) return 'graveyard';
    if (over(`exile:${me.userId}`)) return 'exile';
    if (over(`lib:${me.userId}`)) return 'library';
    return null;
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

    if (!dragOrigin.current.armed) {
      // Never crossed the drag threshold: this was a click/tap, handled by the
      // card's own onClick (hand preview, or clickFieldCard on the battlefield).
      setDrag(null);
      return;
    }

    const from = drag.from;
    const rect = fieldRef.current?.getBoundingClientRect() ?? null;
    const rawPos = fieldPos(event.clientX, event.clientY, drag.grabX, drag.grabY);
    const overHand = inHandZone(event.clientX, event.clientY);
    const card = cardOf(from, iid);
    const pos = snapDrop(boardMode, rawPos, card, rect);
    const pile = pileUnderPoint(event.clientX, event.clientY);

    if (card && pile && pile !== from && from !== 'library') {
      // Dropped straight onto a zone pile (deck/graveyard/exile/command): move
      // it there - no context menu needed. Library takes it on top.
      act({ kind: 'card.move', iid, to: pile, ...(pile === 'library' ? { index: 0 } : {}) });
    } else if (from === 'library') {
      // Drag from the TOP OF THE DECK onto the felt: the server pops the (hidden)
      // top card and plays it face up where it landed. Releasing back over a pile,
      // the hand, or the reserved bottom strip just cancels (no-op).
      if (!pile && !overHand && !inReservedBand(event.clientY)) {
        act({ kind: 'library.play', ...pos });
      }
    } else if (from === 'hand') {
      // Play the card only when it clears the hand's buffer AND the reserved
      // bottom band (hand/deck strip); otherwise it springs into the fan.
      if (!overHand && !inReservedBand(event.clientY) && card) {
        const host = boardMode === 'assist' ? hostUnderPoint(me.battlefield, rawPos, rect, iid) : null;
        act({ kind: 'card.move', iid, to: 'battlefield', ...(host ? rawPos : pos) });
        if (host) act({ kind: 'card.attach', iid, hostIid: host.iid });
        bumpZ(iid);
      }
    } else if (from === 'battlefield' && card) {
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
          setDroppedPos((m) => ({ ...m, [iid]: pos }));
          bumpZ(iid);
        } else {
          act({ kind: 'card.pos', iid, ...pos });
          setDroppedPos((m) => ({ ...m, [iid]: pos }));
          bumpZ(iid);
        }
        settle(iid);
      }
    } else if ((from === 'graveyard' || from === 'exile') && card) {
      // Dragged a card back OUT of a pile: onto the hand, or onto the field.
      // A release still inside the strip just springs back (no-op).
      if (overHand) {
        act({ kind: 'card.move', iid, to: 'hand' });
      } else if (!inReservedBand(event.clientY)) {
        act({ kind: 'card.move', iid, to: 'battlefield', ...pos });
        bumpZ(iid);
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
    if (attackMode) {
      if (attackerEntry(card.iid)) {
        // Re-click un-declares.
        act({ kind: 'combat.attack', iid: card.iid });
        juicePulse(cardEls.current.get(card.iid));
        return;
      }
      if (isCreature(card) && !card.tapped) {
        // Declare it attacking right on the board - no modal. With one
        // opponent it aims at them; multiplayer is an open swing everyone sees.
        event.stopPropagation();
        const opponents = room.players.filter((p) => p.seat !== me.seat && !p.conceded);
        const { power, toughness } = effectivePT(card);
        act({
          kind: 'combat.attack',
          iid: card.iid,
          defenderSeat: opponents.length === 1 ? opponents[0]!.seat : undefined,
          power,
          toughness,
        });
        juicePulse(cardEls.current.get(card.iid));
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
    const dragging = drag?.iid === card.iid && dragOrigin.current.armed && drag.from === 'battlefield';
    const hostDragging = host && drag?.iid === host.iid && drag.from === 'battlefield';
    // Held drop position (until the server echo lands) beats the stale card.x/y.
    const held = droppedPos[card.iid];
    const restX = held?.x ?? card.x;
    const restY = held?.y ?? card.y;
    const hostHeld = host ? droppedPos[host.iid] : undefined;
    const hostX = hostHeld?.x ?? host?.x ?? 0;
    const hostY = hostHeld?.y ?? host?.y ?? 0;
    const baseX = dragging ? drag.x : host ? (hostDragging ? drag!.x : hostX) : restX;
    const baseY = dragging ? drag.y : host ? (hostDragging ? drag!.y : hostY) : restY;
    const offset = host ? Math.round(18 * cardScale) * (attachIndex + 1) : 0;
    const z = zOrder[card.iid];
    const cardZ = z != null ? 10 + z : 5;
    const attacker = attackerEntry(card.iid);
    const affordance = attackMode && !card.tapped && isCreature(card) ? 'attack' : blockMode && !card.tapped && isCreature(card) ? 'block' : undefined;
    // The .fieldCard::after hitbox (inset -8px, for a generous grab target) paints
    // over the GameCard inside, so elementFromPoint lands on .fieldCard - which
    // lacks GameCard's data-preview-src, breaking the hover preview. Mirror the
    // preview attrs onto the wrapper so any hit on the card resolves an anchor.
    const fieldPreview = card.faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId);

    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-preview-src={fieldPreview}
        data-preview-name={fieldPreview ? card.name : undefined}
        data-dragging={dragging || undefined}
        data-attacker={attacker ? '' : undefined}
        data-attachment={host ? '' : undefined}
        data-affordance={affordance}
        data-blocking={blockerIid === card.iid || undefined}
        style={{
          left: offset ? `calc(${baseX * 100}% + ${offset}px)` : `${baseX * 100}%`,
          top: offset ? `calc(${baseY * 100}% + ${offset * 0.8}px)` : `${baseY * 100}%`,
          // Newest-placed card floats over the rest (contained by .myField's
          // stacking context so it never covers the hand/pile strip). The card
          // being dragged is highest; attachments tuck under their host.
          zIndex: dragging ? 100000 : host ? 4 : cardZ,
          ['--rest-tilt' as string]: verticalCards ? '0deg' : `${restTilt(card.iid)}deg`,
          ['--drag-tilt' as string]: dragging ? `${drag.tilt}deg` : '0deg',
        }}
        ref={(el) => {
          if (el) cardEls.current.set(card.iid, el);
          else cardEls.current.delete(card.iid);
        }}
        onPointerDown={(event) => beginDrag(event, card, 'battlefield')}
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

  // Cards dragged from anywhere but the battlefield follow the pointer as a
  // ghost (the battlefield card moves in place instead).
  const draggedGhostCard = drag && drag.from !== 'battlefield' ? cardOf(drag.from, drag.iid) : undefined;
  // Highlight the hand as a drop target while a battlefield card hovers its buffer.
  const returnToHandHot =
    drag != null && dragOrigin.current.armed && drag.from === 'battlefield' && inHandZone(drag.clientX, drag.clientY);
  // Which pile the dragged card is currently over (drop-target highlight).
  const dropPile = drag != null && dragOrigin.current.armed ? pileUnderPoint(drag.clientX, drag.clientY) : null;

  // The zone piles. In Cyberpunk they leave the bottom strip for the mat
  // quadrants (Deck/Trash right rail, Legends/Eddies bottom tray) via `mat`.
  const zonePilesEl = (
    <ZonePiles
      player={me}
      mine
      mat={!mtg}
      canAct
      onMenu={onMenu}
      onHover={onHover}
      onDragOut={(event, card, zone) => beginDrag(event, card, zone, { menu: false })}
      dragSuppressed={() => justDragged.current || heldFired.current}
      dropHint={dropPile}
    />
  );

  return (
    <div
      className="myBoard"
      data-my-turn={(started && myTurn) || undefined}
      data-game={room.game || 'mtg'}
      data-strip-only={hideField || undefined}
      // Card scale drives the hand overlap and lifts the board-mode toolbar
      // clear of the (scalable) pile stacks.
      style={{ ['--card-scale' as string]: cardScale }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
    >
      {!hideField && (<>
      {/* combat banner */}
      {(attackMode || blockMode) && (
        <div className="combatBanner" data-mode={attackMode ? 'attack' : 'block'}>
          <Swords size={13} />
          <Text as="span" size={Size.Small} weight="semibold">
            {attackMode ? t('gpAttackers') : t('gpBlockers')}
          </Text>
          {attackMode && (
            <>
              {(combat?.attackers.length ?? 0) > 0 && (
                <Pill size="sm" tone="accent">
                  {combat?.attackers.length} {t('gpDeclared')}
                </Pill>
              )}
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
                {t('gpAttackHint')}
              </Text>
              <Button size="sm" onClick={() => act({ kind: 'combat.end' })}>
                {t('gpEndCombat')}
              </Button>
            </>
          )}
          {blockMode && (
            <>
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="combatHint">
                {t('gpBlockHint')}
              </Text>
              {incomingUnblocked > 0 && (
                <Button size="sm" variant="solid" onClick={() => act({ kind: 'life.add', delta: -incomingUnblocked })}>
                  {t('cbTakeDamage')} · {incomingUnblocked}
                </Button>
              )}
            </>
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
        data-game={room.game || 'mtg'}
        data-lanes={(boardMode === 'rows' && drag != null) || undefined}
        onContextMenu={(event) => {
          // Cards carry their own right-click menu; the bare felt opens the
          // token/counter menu. MTG only (tokens are a Magic concept).
          if (!mtg || hideField) return;
          if ((event.target as HTMLElement).closest('.fieldCard, .boardTools')) return;
          event.preventDefault();
          const pos = fieldPos(event.clientX, event.clientY);
          setBoardMenu({ x: event.clientX, y: event.clientY, bx: pos.x, by: pos.y });
        }}
      >
        {hosts.map((card) => (
          <span key={card.iid} style={{ display: 'contents' }}>
            {(attachments.get(card.iid) ?? []).map((att, index) => renderFieldCard(att, card, index))}
            {renderFieldCard(card)}
          </span>
        ))}

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

      {/* Cyberpunk: the zones live in the mat quadrants (a board overlay), not
          the bottom strip. Magic keeps them floating over the strip. */}
      {!mtg && !hideField && <div className="matZones">{zonePilesEl}</div>}

      {/* Real polyhedral WebGL dice roll over the mat — Cyberpunk's Fixer dice and
          Magic's sidebar dice both land here on the server-chosen value. Falls
          back to a CSS cube if WebGL is unavailable. */}
      {!hideField && <DiceRoll3D dice={me.gigDice} lastRoll={me.lastRoll} playerId={me.userId} />}

      {/* bottom strip: zones | hand | vitals */}
      <div className="myStrip">
        {mtg && zonePilesEl}

        {/* .myHand is a non-transforming frame; only the inner .myFan slides
            (rest/peek/hidden), so the tab below can centre on the hand and stay
            vertically sticky. */}
        <div className="myHand">
          <div
            className="myFan"
            data-count={me.hand?.length ?? 0}
            data-drop={returnToHandHot || undefined}
            data-peek={(handPeek && !handHidden) || undefined}
            data-hidden={handHidden || undefined}
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
                onPointerDown={(event) => beginDrag(event, card, 'hand')}
                onPointerEnter={() => onHover(card)}
                onPointerLeave={() => onHover(null)}
                onClick={() => clickHandCard(card)}
                onContextMenu={(event) => onMenu(event, card.iid, 'hand')}
              />
            ))}
          </div>

          {/* Sticky hide/show tab: centred on the hand, pinned to the bottom so
              it never moves as the fan rests, peeks or tucks. */}
          <button
            type="button"
            className="handTab"
            onClick={() => setHandHidden((hidden) => !hidden)}
            title={handHidden ? t('gpShowHand') : t('gpHideHand')}
          >
            {handHidden ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {handHidden ? t('gpShowHand') : t('gpHideHand')}
          </button>
        </div>
      </div>

      {/* pointer-following ghost for hand / pile drags */}
      {draggedGhostCard && drag && dragOrigin.current.armed && (
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
            name={draggedGhostCard.name}
            imageUrl={draggedGhostCard.faceDown ? undefined : draggedGhostCard.imageUrl || cardImage(draggedGhostCard.scryfallId)}
            faceDown={draggedGhostCard.faceDown}
            width={handCardWidth}
            tilt={0}
          />
        </div>
      )}

      {/* right-click board menu: create a searched token, or a bare counter marker */}
      {boardMenu && (
        <div
          className="cardMenu"
          style={{
            left: Math.min(boardMenu.x, window.innerWidth - 220),
            top: Math.min(boardMenu.y, window.innerHeight - 140),
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className="menuItem"
            onClick={() => {
              setPickerAt({ x: boardMenu.bx, y: boardMenu.by });
              setBoardMenu(null);
            }}
          >
            {t('tkCreateToken')}
          </button>
          <button
            type="button"
            className="menuItem"
            onClick={() => {
              act({ kind: 'token.create', name: t('tkCounter'), x: boardMenu.bx, y: boardMenu.by });
              setBoardMenu(null);
            }}
          >
            {t('tkNewCounter')}
          </button>
        </div>
      )}

      {pickerAt && (
        <TokenPicker
          deckId={me.deckId}
          onPlace={(token) => {
            act({
              kind: 'token.create',
              name: token.name,
              imageUrl: token.image,
              power: token.power,
              toughness: token.toughness,
              x: pickerAt.x,
              y: pickerAt.y,
            });
            setPickerAt(null);
          }}
          onPlaceCustom={(name, power, toughness) => {
            act({ kind: 'token.create', name, power, toughness, x: pickerAt.x, y: pickerAt.y });
            setPickerAt(null);
          }}
          onClose={() => setPickerAt(null)}
        />
      )}

    </div>
  );
}

