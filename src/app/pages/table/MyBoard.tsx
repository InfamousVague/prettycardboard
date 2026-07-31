import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { Button, IconButton, Input, Menu, MenuItem, MenuSub, Pill, SegmentedControl, Size, Text, TextTone, Tooltip, useHaptics, useToast } from '@glacier/react';
import {
  AlignStartVertical,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Crown,
  Coins,
  Dices,
  LayoutGrid,
  LogOut,
  Minus,
  Moon,
  Plus,
  Settings,
  Shapes,
  Sun,
  Swords,
  Tornado,
  Zap,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { isFoilInst } from '../../data/foil.ts';
import { faceImage, getFaces, useFacesVersion } from '../../data/faces.ts';
import { primePrintedPT, usePrintedPtVersion } from '../../data/printedPt.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import { handSlinky, paintSlinky, restFocus, slinkyOffsets } from '../../components/slinky.ts';
import type { CardInst, MatPos, MatZone, RoomState, TablePlayer, Zone } from '../../net/types.ts';
import { selectCardScale, useTableUi } from './tableUi.ts';
import { AttackBadge, BlockCluster, CounterBadges, DEFAULT_MAT_LAYOUT, MAT_ZONES, ZonePiles, groupAttachments, splitPile, CardMark } from './bits.tsx';
import {
  CARD_SCALE_MAX,
  CARD_SCALE_MIN,
  CARD_SCALE_STEP,
  MOBILE_SCALE_MAX,
  MOBILE_SCALE_MIN,
  MOBILE_SCALE_STEP,
  PILE_MAX_EDGES,
  PILE_STEP_PX,
  effectivePT,
  ptTotalLabel,
  hostUnderPoint,
  isCreature,
  resolveDropTarget,
  snapDrop,
  tidyPositions,
  type BoardMode,
  typeLineOf,
} from './boardModes.ts';
import { canDeclareAttacker, enforcedRoom, handPlayability, matchesTargetKind, stackTargetKinds } from './enforce.ts';
import { oracleFacts } from '../../data/printedPt.ts';
import { SETTLE_EASE, dragTilt, flightAnchor, juicePulse, prefersReducedMotion, restTilt, setFlightAnchor, ambientDelay } from './juice.ts';
import { zoneLabel } from '../../data/games.ts';
import { playmatBackground } from '../../data/playmats.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { useMobileLayout } from '../../hooks/useIsPhone.ts';
import { MobileZones } from './MobileZones.tsx';
import { YUGIOH_PILE_LAYOUT, YugiohZoneGrid, nearestYugiohCell, snapToYugiohCell } from './yugiohZones.tsx';
import { isYugiohTrap } from '../../data/yugioh.ts';
import { TokenPicker } from './TokenPicker.tsx';
import { HandCard, HAND_PEEK_ZONE } from './HandCard.tsx';
import { DiceRoll3D } from './DiceRoll3D.tsx';
import { DICE_SIDES, DiceIcon } from '../../components/DiceIcon.tsx';
import { send } from '../../net/ws.ts';
import { formatFor } from '../../data/formats.ts';
import { playSound } from '../../sounds.ts';

/**
 * My side of the table: free-placement battlefield with drag v2 (lift, tilt
 * toward velocity, overshoot settle), board layout modes, guided-combat
 * affordances, the fanned hand with a pointer-following ghost, and the
 * vitals + tools cluster. Input is never blocked by animation.
 */

/** Where a drag started. Battlefield cards move on the field; everything else
 * follows the pointer as a ghost and is played/moved on drop. */
type DragFrom = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library' | 'command';

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
  /** Shift held on the last sample. It inverts what the dwell latch commits to
   * (attach <-> pile), so the ring can answer the key live; the COMMIT reads
   * `event.shiftKey` off the release event, which is authoritative. */
  shift: boolean;
}

/**
 * Cushion (px) around the hand fan. A card released inside this buffer is put
 * back rather than played; a battlefield card released inside it is pulled
 * into the hand. Outside the buffer, a hand card lands on the felt.
 */
const HAND_DROP_BUFFER = 44;

/** How long a dragged card must rest on another before it latches onto it.
 *  Long enough that crossing the board never attaches by accident, short
 *  enough that deliberately hovering feels answered rather than laggy. */
const ATTACH_DWELL_MS = 500;

/** Keep resting on the same card past the attach latch and the relation flips
 *  to the other one. The only touch route to a pile of mixed cards, since a
 *  phone has no Shift. 600ms past the latch: unmistakably deliberate, still one
 *  motion, and well clear of the 450ms card-menu hold (which arming the drag
 *  already cancelled). */
const PILE_DWELL_MS = 1100;

/** Drag origins that live in the phone's zone row, where a leftward stroke
 *  gathers the row instead of lifting the card under the finger. */
const PILE_ZONES = new Set<DragFrom>(['library', 'graveyard', 'exile', 'command']);

/**
 * The bottom band of the playmat (where the deck/piles float) is reserved:
 * cards never land there. Small now that the hand auto-peeks away instead of
 * permanently occupying the bottom. Capped at a quarter of the field.
 */
const RESERVED_BOTTOM_PX = 96;
const HAND_HOVER_SEND_MS = 50;


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
  // My targeting spell on top of the stack invites a target click.
  const topSpell = (room.stack ?? [])[(room.stack ?? []).length - 1] as
    | (CardInst & { ownerSeat?: number })
    | undefined;
  const aimingKinds =
    topSpell && topSpell.ownerSeat === me.seat ? stackTargetKinds(topSpell) : [];
  const leaveTable = useGame((state) => state.leave);
  const { toast } = useToast();
  const haptics = useHaptics();
  const popup = useCardPopup();
  const clickTimer = useRef<number | null>(null);
  useEffect(() => () => { if (clickTimer.current != null) window.clearTimeout(clickTimer.current); }, []);
  // Re-render when a double-faced card's back art finishes loading, so a flipped
  // Clive (etc.) swaps to its alt form for every viewer.
  useFacesVersion();
  // Printed P/T resolves lazily (bundled precons are instant, anything else is
  // one Scryfall lookup); re-render when one lands so the total fills in.
  usePrintedPtVersion();
  const boardMode = useTableUi((state) => state.boardMode);
  const cardScale = useTableUi(selectCardScale);
  // Phones dock the zone piles into a swipe-out drawer instead of the strip.
  const mobile = useMobileLayout();
  // The +/- buttons step whichever ladder is in play - the phone's own three
  // sizes, or the desktop preference - never the rendered value, so a phone can
  // never overwrite a desktop-tuned scale.
  const storedScale = useTableUi((state) => (state.scaleCap != null ? state.mobileScale : state.cardScale));
  const scaleMin = mobile ? MOBILE_SCALE_MIN : CARD_SCALE_MIN;
  const scaleMax = mobile ? MOBILE_SCALE_MAX : CARD_SCALE_MAX;
  const scaleStep = mobile ? MOBILE_SCALE_STEP : CARD_SCALE_STEP;
  const stepScale = (delta: number) => {
    const state = useTableUi.getState();
    if (state.scaleCap != null) state.setMobileScale(state.mobileScale + delta, me.userId);
    else state.setCardScale(state.cardScale + delta, me.userId);
  };
  // Base 120 = the old 92 plus ~30%; the +/- toolbar scales from there. The
  // hand rides the same scale so the whole playmat resizes together.
  const fieldCardWidth = Math.round(120 * cardScale);
  // Hand cards solve against the viewport on small screens (the mulligan fan's
  // pattern) so a 7-card Commander hand always fits; desktop keeps the fixed
  // scale-driven width.
  const handCount = Math.max(1, me.hand?.length ?? 1);
  const handCardWidth = Math.round(
    mobile
      ? // The hand runs bigger than the board's cards on a phone: it is the one
        // row you actually read, and the viewport solve below still stops a big
        // Commander hand from overflowing.
        Math.min(168 * cardScale, Math.max(64, (window.innerWidth * 0.96 - 24) / handCount + 34))
      : 132 * cardScale,
  );
  // How wide the fan would like to be: the old fixed overlap, one card per
  // step. CSS caps it at the strip, and past that cap the slinky takes over -
  // which is what stops a forty-card hand running off both edges of the screen.
  const handSpan = Math.round(
    handCardWidth + (handCount - 1) * Math.max(18, handCardWidth - 44 * cardScale),
  );
  // The fan's resting shape. Hover repaints the same property in place rather
  // than re-rendering (see paintSlinky), so these are what it returns to.
  const handSize = me.hand?.length ?? 0;
  const handOffsets = slinkyOffsets(handSize, restFocus(handSize), handSlinky(handSize));
  const blockerIid = useTableUi((state) => state.blockerIid);
  const setBlocker = useTableUi((state) => state.setBlocker);
  // Perfectly-upright cards vs the natural slight per-card tilt (Settings ->
  // Table -> Card placement).
  const verticalCards = usePreference('verticalCards');
  // Subtle continuous idle drift on battlefield cards (Settings -> Table ->
  // Ambient card motion). Off by default; suppressed while dragging.
  const ambientCards = usePreference('ambientCards');
  // The running P/T total on each creature, so nobody adds counters by hand.
  const cardTotals = usePreference('cardTotals');

  const fieldRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLElement>());
  const prevFaces = useRef(new Map<string, boolean>());
  const [drag, setDrag] = useState<DragState | null>(null);
  // The phone zone cascade's dealt/gathered state. Owned here, not inside
  // MobileZones, because the board opens it on a dwelling drag and closes it on
  // a leftward swipe that starts on any of the piles.
  const [zonesOpen, setZonesOpen] = useState(false);
  // Mat editor: while editing, the working pile layout lives here (the server's
  // copy is committed on each pile drop).
  const [matEdit, setMatEdit] = useState(false);
  const [matDraft, setMatDraft] = useState<Partial<Record<MatZone, MatPos>> | null>(null);
  const matDraftRef = useRef<Partial<Record<MatZone, MatPos>> | null>(null);
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
  // "Is Magic", not "is not cyberpunk": the token picker, felt menu, markers
  // and mat editor are MTG concepts, and Yu-Gi-Oh (which lays its zones out on
  // a printed grid like Cyberpunk does its quadrants) must not inherit them.
  const mtg = (room.game ?? 'mtg') === 'mtg';
  const cyber = room.game === 'cyberpunk';
  // A Yu-Gi-Oh field is a printed 7x3 lattice, so the board draws its zones and
  // snaps drops into them - the piles ride the same grid (see yugiohZones.tsx).
  const ygoField = room.game === 'yugioh' && !hideField;
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
  const handHoverTimer = useRef<number | null>(null);
  const pendingHandHover = useRef<number | null>(null);
  const lastHandHoverSent = useRef(0);
  const handHoverActive = useRef(false);
  const shareHandHover = (position: number | null) => {
    if (position == null) {
      pendingHandHover.current = null;
      if (handHoverTimer.current != null) window.clearTimeout(handHoverTimer.current);
      handHoverTimer.current = null;
      if (handHoverActive.current) {
        handHoverActive.current = false;
        send({ type: 'room.hand.hover', position: null });
      }
      return;
    }
    pendingHandHover.current = position;
    if (handHoverTimer.current != null) return;
    const wait = Math.max(0, HAND_HOVER_SEND_MS - (performance.now() - lastHandHoverSent.current));
    handHoverTimer.current = window.setTimeout(() => {
      handHoverTimer.current = null;
      const next = pendingHandHover.current;
      pendingHandHover.current = null;
      if (next == null) return;
      handHoverActive.current = true;
      lastHandHoverSent.current = performance.now();
      send({ type: 'room.hand.hover', position: next });
    }, wait);
  };
  useEffect(
    () => {
      const clearSharedHandHover = () => {
        pendingHandHover.current = null;
        if (handHoverTimer.current != null) window.clearTimeout(handHoverTimer.current);
        handHoverTimer.current = null;
        if (handHoverActive.current) {
          handHoverActive.current = false;
          send({ type: 'room.hand.hover', position: null });
        }
      };
      window.addEventListener('blur', clearSharedHandHover);
      return () => {
        window.removeEventListener('blur', clearSharedHandHover);
        clearSharedHandHover();
      };
    },
    [],
  );
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
  /** The bare-felt hold's own fired flag. Kept separate from heldFired, which is
   *  owned by the beginDrag / card-click cycle that resets it - the felt has no
   *  such cycle, so sharing it would leave dragSuppressed() latched on. */
  const feltHeld = useRef(false);
  /** Where a press on the bare felt started, so travel can cancel its hold. */
  const fieldHoldFrom = useRef<{ x: number; y: number } | null>(null);
  /**
   * Touch hand-scrub: sliding sideways along the fan previews each card it
   * passes instead of dragging one out. The gesture commits to an axis on the
   * first real movement - sideways scrubs, upward lifts the card to play it -
   * so neither intent can steal the other.
   */
  const [scrub, setScrub] = useState<{ iid: string; x: number } | null>(null);
  const scrubbing = useRef(false);
  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const started = room.started;
  const combat = room.combat;
  const myTurn = room.activeSeat === me.seat;
  const enforced = enforcedRoom(room);
  // Enforced machine: attacker picks stop at the lock; blocks only open after
  // it and close at ready. Freeform keeps the loose overlay behavior.
  const attackMode = started && combat != null && myTurn && (!enforced || !combat.locked);
  const attackersTargetMe =
    combat != null &&
    combat.attackers.length > 0 &&
    !myTurn &&
    (room.players.length === 2 ||
      combat.attackers.some((entry) => entry.defenderSeat === me.seat || entry.defenderSeat == null));
  const blockMode =
    started && attackersTargetMe && (!enforced || (Boolean(combat?.locked) && !combat?.blocksReady));
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

  // Resting past the latch flips the relation the drop will commit to. It is
  // the only touch route to a pile of unlike cards - a phone has no Shift.
  const [dwellInvert, setDwellInvert] = useState(false);

  /** Cards physically stacked on `base`. Board order is pile order. */
  const pileOf = (base: CardInst) => (attachments.get(base.iid) ?? []).filter((c) => c.piled);

  /**
   * Does a drop on `base` mean PILE or ATTACH?
   *
   * Default: duplicates pile (that is what stacking is for at a real table -
   * you square up your Forests, you do not staple them together), and a base
   * that is already a pile keeps taking members, so a twelve-land pile needs
   * no modifier at all. Anything else is the aura attach this gesture has
   * always been.
   *
   * Inverter: Shift (desktop) or the escalated dwell (touch), XORed - so an
   * unlike card can join a pile, and a duplicate can still be attached.
   */
  const wantsPile = (base: CardInst, moving: CardInst | undefined, shift: boolean) => {
    const natural = pileOf(base).length > 0 || (moving != null && moving.name === base.name);
    return natural !== (shift !== dwellInvert);
  };


  // Peek the hand up whenever the pointer is in the bottom band of the screen.
  // Driving this off a STABLE viewport threshold (not the hand's own moving
  // box) avoids a raise/lower oscillation when the pointer sits near the edge.
  // The half-tucked rest is a HOVER affordance: the fan lifts as the pointer
  // nears the bottom. The mobile layout has no hover and tucks deliberately via
  // the Hide-hand pill instead, so there the fan rests fully up - otherwise it
  // sits permanently off the bottom edge looking like a layout bug. Keyed on the
  // layout, not just the pointer, so forcing mobile on a desktop behaves too.
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  useEffect(() => {
    if (hideField) return;
    if (coarse || mobile) {
      setHandPeek(true);
      return;
    }
    const onMove = (event: PointerEvent) => {
      // Read live so the band survives a window resize; phones cap it against
      // the viewport (a short landscape phone would otherwise peek constantly),
      // desktop keeps the fixed band it always had.
      const zone = mobile ? Math.min(HAND_PEEK_ZONE, window.innerHeight * 0.28) : HAND_PEEK_ZONE;
      setHandPeek(event.clientY > window.innerHeight - zone);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [hideField, coarse, mobile]);

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
    // Yu-Gi-Oh's Spell & Trap row IS the bottom of the mat, so the band the
    // hand normally reserves would make the entire backrow undroppable. The
    // hand's own rect (inHandZone) still catches releases meant for it, which
    // is the guard that actually matters.
    if (ygoField) return 0.92;
    // The band is reserved *for the hand*. Tucked away, it is just playmat, so
    // the whole mat opens up - which is the point of hiding the hand.
    if (handHidden) return 0.97;
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
      shift: event.shiftKey,
    });
  };

  /** Point the scrub preview at whichever hand card sits under the finger. */
  const updateScrub = (clientX: number, clientY: number) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-hand-iid]');
    const iid = el?.getAttribute('data-hand-iid');
    if (!iid) return;
    setScrub((prev) => (prev?.iid === iid && Math.abs(prev.x - clientX) < 2 ? prev : { iid, x: clientX }));
  };

  const endScrub = () => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    setScrub(null);
    // The tap that ends the stroke must not also play the card underneath.
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);
  };

  const moveDrag = (event: ReactPointerEvent) => {
    // Already scrubbing: track whichever hand card is under the finger. This
    // MUST sit above the !drag guard (as endDrag does) - committing the scrub
    // axis calls setDrag(null), so once that re-render lands every later move
    // would bail below and the peek would freeze on the card it started on.
    if (scrubbing.current) {
      updateScrub(event.clientX, event.clientY);
      return;
    }
    if (!drag) return;
    const origin = dragOrigin.current;
    if (!origin.armed) {
      // Mouse arms fast (6px); fingers jitter, so touch needs a wider slop or
      // intended taps misfire as micro-drags (Android's own slop is 8dp).
      const slop = event.pointerType === 'mouse' ? 6 : 12;
      const dx = event.clientX - origin.px;
      const dy = event.clientY - origin.py;
      if (Math.hypot(dx, dy) < slop) return;
      // A sideways finger stroke that began on a hand card is a scrub, not a
      // lift: preview the cards it sweeps past and never touch the board.
      if (event.pointerType !== 'mouse' && drag.from === 'hand' && Math.abs(dx) > Math.abs(dy)) {
        scrubbing.current = true;
        clearHold();
        setDrag(null);
        updateScrub(event.clientX, event.clientY);
        return;
      }
      // The same idea for the open zone row: a stroke that starts on ANY pile
      // and runs left is gathering the row, not pulling a card out of it. The
      // axis decides - cards come out upward, onto the board - so the two
      // gestures never have to be aimed, only pointed.
      if (
        event.pointerType !== 'mouse' &&
        mobile &&
        zonesOpen &&
        PILE_ZONES.has(drag.from) &&
        dx < 0 &&
        Math.abs(dx) > Math.abs(dy)
      ) {
        clearHold();
        setDrag(null);
        setZonesOpen(false);
        haptics('selection');
        return;
      }
      origin.armed = true;
      // A real drag has started; it is not a press-and-hold.
      clearHold();
      playSound('cardPickup');
      // The card is now stuck to the finger - the one moment worth confirming
      // by touch, since the finger is covering the card it just picked up.
      haptics('selection');
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
      shift: event.shiftKey,
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
    if (from === 'command') return me.command.find((c) => c.iid === iid);
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
    // A hidden hand claims no drop zone: its cushion would otherwise swallow
    // every release along the bottom of the mat and put the card back.
    if (handHidden) return false;
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
    if (scrubbing.current) {
      endScrub();
      return;
    }
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
    // A Yu-Gi-Oh card belongs IN a zone, so the printed grid wins over the
    // board-mode snapping every other game uses — and it takes a FREE zone, so
    // a second trap does not land on top of the first.
    const pos = ygoField
      ? snapToYugiohCell(rawPos, rect, me.battlefield, iid)
      : snapDrop(boardMode, rawPos, card, rect);
    const pile = pileUnderPoint(event.clientX, event.clientY);
    let moved = false;

    if (card && pile && pile !== from && from !== 'library') {
      // Dropped straight onto a zone pile (deck/graveyard/exile/command): move
      // it there - no context menu needed. Library takes it on top.
      act({ kind: 'card.move', iid, to: pile, ...(pile === 'library' ? { index: 0 } : {}) });
      // A card dropped on a pile vanishes under its top card, so confirm where
      // it went - otherwise the only feedback is the card disappearing.
      toast({ tone: 'neutral', message: `${card.name} → ${zoneLabel(room.game, pile)}` });
      haptics('medium');
      moved = true;
    } else if (card && pile && pile === from) {
      // Released back over its own pile: a "never mind" - spring back. (With
      // free-placed piles this can happen anywhere on the mat, so it must not
      // fall through to the play/cast branches below.)
    } else if (from === 'library') {
      // Drag from the TOP OF THE DECK onto the felt: the server pops the (hidden)
      // top card and plays it face up where it landed. Releasing back over a pile,
      // the hand, or the reserved bottom strip just cancels (no-op).
      if (!pile && !overHand && !inReservedBand(event.clientY)) {
        act({ kind: 'library.play', ...pos });
        moved = true;
      }
    } else if (from === 'hand') {
      // Play the card only when it clears the hand's buffer AND the reserved
      // bottom band (hand/deck strip); otherwise it springs into the fan.
      if (!overHand && !inReservedBand(event.clientY) && card) {
        // A latch armed by dwelling wins; assist mode still attaches on a plain
        // drop, so both routes end in the same place.
        const host = attachHost
          ? (me.battlefield.find((c) => c.iid === attachHost) ?? null)
          : boardMode === 'assist'
            ? resolveDropTarget(me.battlefield, hostUnderPoint(me.battlefield, rawPos, rect, iid), iid)
            : null;
        const wantPile = !!host && wantsPile(host, card, event.shiftKey);
        const facts = enforced ? oracleFacts(card.scryfallId) : undefined;
        if (facts && facts.typeLine.includes('Land') && (me.landsThisTurn ?? 0) >= 1) {
          // One land per turn: refuse locally, no round trip needed.
          toast({ tone: 'neutral', message: t('efOneLand') });
          playSound('cardReturn');
          justDragged.current = true;
          setTimeout(() => {
            justDragged.current = false;
          }, 0);
          setDrag(null);
          return;
        }
        if (facts && !facts.typeLine.includes('Land')) {
          // Enforced: the drop is a CAST - the server pays the real cost (or
          // rejects with the reason). Attach gestures come after it resolves.
          act({ kind: 'cast', iid, ...(host ? rawPos : pos) });
          bumpZ(iid);
          moved = true;
          playSound(moved ? 'cardPlace' : 'cardReturn');
          justDragged.current = true;
          setTimeout(() => {
            justDragged.current = false;
          }, 0);
          setDrag(null);
          return;
        }
        // A Trap cannot be played from the hand face-up, so dragging one onto
        // the field IS setting it — done in the move itself, which keeps the
        // card's identity off the wire (see the faceDown contract on card.move).
        act({
          kind: 'card.move',
          iid,
          to: 'battlefield',
          ...(host ? rawPos : pos),
          ...(ygoField && isYugiohTrap(card.scryfallId) ? { faceDown: true } : {}),
        });
        if (host) {
          act({ kind: 'card.attach', iid, hostIid: host.iid, ...(wantPile ? { piled: true } : {}) });
          // Same announcement as attaching a card already on the board: an
          // attachment tucks under its host and a pile member disappears into
          // it, so either needs saying.
          if (attachHost) {
            toast({
              tone: 'neutral',
              message: wantPile ? `${host.name} ×${pileOf(host).length + 2}` : `${card.name} → ${host.name}`,
            });
          }
        }
        bumpZ(iid);
        moved = true;
      }
    } else if (from === 'battlefield' && card) {
      // Dropping a battlefield card into the hand buffer returns it to hand.
      if (overHand) {
        act({ kind: 'card.move', iid, to: 'hand' });
        moved = true;
      } else {
        const host = attachHost
          ? (me.battlefield.find((c) => c.iid === attachHost) ?? null)
          : boardMode === 'assist'
            ? resolveDropTarget(me.battlefield, hostUnderPoint(me.battlefield, rawPos, rect, iid), iid)
            : null;
        const wantPile = !!host && wantsPile(host, card, event.shiftKey);
        // The relation changing counts as a change: dropping an aura back onto
        // the same host to pile it must not be swallowed as a no-op.
        if (host && (host.iid !== card.attachedTo || wantPile !== !!card.piled)) {
          act({ kind: 'card.attach', iid, hostIid: host.iid, ...(wantPile ? { piled: true } : {}) });
          if (attachHost) {
            toast({
              tone: 'neutral',
              message: wantPile ? `${host.name} ×${pileOf(host).length + 2}` : `${card.name} → ${host.name}`,
            });
          }
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
        moved = true;
      }
    } else if ((from === 'graveyard' || from === 'exile') && card) {
      // Dragged a card back OUT of a pile: onto the hand, or onto the field.
      // A release still inside the strip just springs back (no-op).
      if (overHand) {
        act({ kind: 'card.move', iid, to: 'hand' });
        moved = true;
      } else if (!inReservedBand(event.clientY)) {
        // Recurring an aura straight onto a creature is a normal play, so the
        // latch is honoured here exactly as it is from hand or the board.
        const host = attachHost ? (me.battlefield.find((c) => c.iid === attachHost) ?? null) : null;
        const wantPile = !!host && wantsPile(host, card, event.shiftKey);
        act({ kind: 'card.move', iid, to: 'battlefield', ...(host ? rawPos : pos) });
        if (host) {
          act({ kind: 'card.attach', iid, hostIid: host.iid, ...(wantPile ? { piled: true } : {}) });
          toast({
            tone: 'neutral',
            message: wantPile ? `${host.name} ×${pileOf(host).length + 2}` : `${card.name} → ${host.name}`,
          });
        }
        bumpZ(iid);
        moved = true;
      }
    } else if (from === 'command' && card) {
      // Commander dragged out of the command zone: onto the hand, or cast where
      // it lands. cmd.cast keeps the tax accruing; non-commander formats (no tax
      // machinery) fall back to a plain move.
      if (overHand) {
        act({ kind: 'card.move', iid, to: 'hand' });
        moved = true;
      } else if (!inReservedBand(event.clientY)) {
        // hasCommander (not the literal 'commander') so Brawl accrues tax too,
        // mirroring the server's format_has_commander gate.
        const host = attachHost ? (me.battlefield.find((c) => c.iid === attachHost) ?? null) : null;
        const wantPile = !!host && wantsPile(host, card, event.shiftKey);
        const landing = host ? rawPos : pos;
        if (formatFor(room.format).hasCommander) act({ kind: 'cmd.cast', iid, ...landing });
        else act({ kind: 'card.move', iid, to: 'battlefield', ...landing });
        if (host) {
          act({ kind: 'card.attach', iid, hostIid: host.iid, ...(wantPile ? { piled: true } : {}) });
          toast({
            tone: 'neutral',
            message: wantPile ? `${host.name} ×${pileOf(host).length + 2}` : `${card.name} → ${host.name}`,
          });
        }
        bumpZ(iid);
        moved = true;
      }
    }
    playSound(moved ? 'cardPlace' : 'cardReturn');
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
    // Enforced rooms: a glowing card plays on click, Arena style. The server
    // re-validates; anything else still opens the preview.
    const play = handPlayability(room, me, card);
    if (play === 'cast') {
      const k = me.battlefield.filter((c) => !c.tapped || c.tapped).length;
      act({ kind: 'cast', iid: card.iid, x: Math.min(0.15 + 0.11 * (k % 7), 0.9), y: 0.5 });
      juicePulse(cardEls.current.get(card.iid));
      playSound('cardPlace');
      return;
    }
    if (play === 'land') {
      const lands = me.battlefield.filter((c) => typeLineOf(c)?.includes('Land')).length;
      act({
        kind: 'card.move',
        iid: card.iid,
        to: 'battlefield',
        x: Math.min(0.05 + 0.085 * (lands % 11), 0.95),
        y: 0.78,
      });
      playSound('cardPlace');
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
    // My spell is on top of the stack: this click POINTS at its target, and
    // the whole table sees the ring (works in freeform and enforced alike).
    const top = (room.stack ?? [])[(room.stack ?? []).length - 1] as
      | (CardInst & { ownerSeat?: number })
      | undefined;
    if (top && top.ownerSeat === me.seat && top.iid !== card.iid) {
      useGame.getState().act({ kind: 'stack.target', iid: top.iid, targetIid: card.iid });
      juicePulse(cardEls.current.get(card.iid));
      return;
    }
    if (attackMode) {
      if (attackerEntry(card.iid)) {
        // Re-click un-declares.
        act({ kind: 'combat.attack', iid: card.iid });
        juicePulse(cardEls.current.get(card.iid));
        return;
      }
      if (isCreature(card) && !card.tapped && canDeclareAttacker(room, me, card)) {
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

  /** Take the top card off `base`'s pile. The server lands it beside the base,
   *  so this is ONE action with no follow-up card.pos. */
  const peelTop = (base: CardInst) => {
    const pile = pileOf(base);
    const top = pile[pile.length - 1];
    if (!top) return;
    act({ kind: 'card.attach', iid: top.iid, hostIid: null });
    haptics('selection');
    playSound('cardPickup');
  };

  const setCounterCount = (card: CardInst, counter: string, requested: number) => {
    const target = Math.trunc(Math.min(999, Math.max(0, requested)));
    const current = card.counters[counter] ?? 0;
    if (target !== current) act({ kind: 'card.counter', iid: card.iid, counter, delta: target - current });
  };

  /* ---------------- render ---------------- */

  const renderFieldCard = (
    card: CardInst,
    host?: CardInst,
    attachIndex = 0,
    /** Distance from the base, 1..PILE_MAX_EDGES. 0 = not a pile member. */
    pileDepth = 0,
    /** How many cards are stacked on THIS card. 0 = not a pile base. */
    pileCount = 0,
  ) => {
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
    const piled = pileDepth > 0;
    const offset = !host
      ? 0
      : piled
        ? Math.round(PILE_STEP_PX * cardScale) * pileDepth
        : Math.round(18 * cardScale) * (attachIndex + 1);
    const z = zOrder[card.iid];
    const cardZ = z != null ? 10 + z : 5;
    const attacker = attackerEntry(card.iid);
    const affordance =
      attackMode && !card.tapped && isCreature(card) && canDeclareAttacker(room, me, card)
        ? 'attack'
        : blockMode && !card.tapped && isCreature(card)
          ? 'block'
          : undefined;
    // The .fieldCard::after hitbox (inset -8px, for a generous grab target) paints
    // over the GameCard inside, so elementFromPoint lands on .fieldCard - which
    // lacks GameCard's data-preview-src, breaking the hover preview. Mirror the
    // preview attrs onto the wrapper so any hit on the card resolves an anchor.
    // Double-faced: show the back art + name when this card is flipped to its
    // alt form. Faces are fetched lazily (any viewer of a transformed card).
    // The running total: printed base plus every P/T counter. Ask for the
    // printed half if we have not seen this card yet - the lookup is deduped
    // and throttled, and the badge simply stays empty until it lands.
    // Always primed for MTG (not just when the P/T chip preference is on):
    // the lookup also learns the card's type line, which is what makes this
    // card a click target for attacks/blocks and steers assisted drops.
    if (mtg) primePrintedPT(card);
    const ptTotal = cardTotals ? ptTotalLabel(card, mtg) : '';
    // Which face shows is decided by `transformed`, not by whichever of a
    // two-faced card's arts the deck happens to store (see faceImage).
    const faces = getFaces(card.scryfallId);
    const displayImg = faceImage(card);
    const displayName =
        (faces?.dfc && (card.transformed ? faces.backName : faces.frontName)) || card.name;
    const fieldPreview = card.faceDown ? undefined : displayImg;

    return (
      <div
        key={card.iid}
        className="fieldCard"
        data-iid={card.iid}
        data-preview-src={fieldPreview}
        data-preview-name={fieldPreview ? displayName : undefined}
        data-dragging={dragging || undefined}
        data-attacker={attacker ? '' : undefined}
        data-attachment={host ? (card.piled ? 'pile' : 'aura') : undefined}
        data-pile={pileCount > 0 ? pileCount : undefined}
        data-attach-target={
          hoverHostIid === card.iid
            ? attachHost === card.iid
              ? hoverPiles
                ? 'pile'
                : 'armed'
              : 'aiming'
            : undefined
        }
        data-affordance={affordance}
        data-aimed={aim?.toIid === card.iid || targetedIids.has(card.iid) || undefined}
        data-targetable={(aimingKinds.length > 0 && matchesTargetKind(aimingKinds, card)) || undefined}
        data-blocking={blockerIid === card.iid || undefined}
        data-ambient={ambientCards && !dragging ? '' : undefined}
        style={{
          // Auras drift down-right so each stays legible; pile members shingle
          // up-left, showing a few px of edge so the group reads as thickness.
          left: offset ? `calc(${baseX * 100}% + ${piled ? -offset : offset}px)` : `${baseX * 100}%`,
          top: offset ? `calc(${baseY * 100}% + ${piled ? -offset : offset * 0.8}px)` : `${baseY * 100}%`,
          // Newest-placed card floats over the rest (contained by .myField's
          // stacking context so it never covers the hand/pile strip). The card
          // being dragged is highest; attachments tuck under their host.
          zIndex: dragging ? 100000 : host ? 4 : cardZ,
          ['--rest-tilt' as string]: verticalCards ? '0deg' : `${restTilt(card.iid)}deg`,
          ['--drag-tilt' as string]: dragging ? `${drag.tilt}deg` : '0deg',
          ['--ambient-delay' as string]: `${ambientDelay(card.iid)}s`,
        }}
        ref={(el) => {
          if (el) cardEls.current.set(card.iid, el);
          else cardEls.current.delete(card.iid);
        }}
        onPointerDown={(event) => beginDrag(event, card, 'battlefield')}
        onPointerEnter={() => onHover(card)}
        onPointerLeave={() => onHover(null)}
        onContextMenu={(event) => {
          // Android fires native contextmenu (~500ms) right after our own
          // 450ms long-press already opened the menu - don't open it twice.
          if (heldFired.current) {
            event.preventDefault();
            return;
          }
          onMenu(event, card.iid, 'battlefield');
        }}
        onClick={(event) => clickFieldCard(event, card)}
      >
        {marks?.[card.iid] && <CardMark mark={marks[card.iid]!} />}
        <div className="fieldCardShell">
          <GameCard
            name={displayName}
            imageUrl={displayImg}
            width={fieldCardWidth}
            tapped={card.tapped}
            faceDown={card.faceDown}
            foil={isFoilInst(card)}
            tilt={0}
          >
            <CounterBadges card={card} onSet={(counter, value) => setCounterCount(card, counter, value)} />
            {ptTotal && (
              <span className="ptTotal" title={t('gpPtTotal')}>
                {ptTotal}
              </span>
            )}
            {pileCount > 0 && (
              <button
                type="button"
                className="pileTally"
                title={`${t('gpPileTake')} (${pileCount + 1})`}
                aria-label={`${t('gpPileTake')} (${pileCount + 1})`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  peelTop(card);
                }}
              >
                {pileCount + 1}
              </button>
            )}
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
  // Yu-Gi-Oh: light the zone the card would land in, so the snap is visible
  // BEFORE the release rather than a surprise afterwards.
  const dropCell =
    ygoField && drag != null && dragOrigin.current.armed && dropPile == null
      ? nearestYugiohCell(drag, fieldRef.current?.getBoundingClientRect() ?? null).id
      : null;

  // Resting a dragged card on the gathered deck deals the rest of the zones out,
  // so graveyard/exile/command become reachable without breaking the drag to go
  // swipe them open first. Keyed on the boolean, not the pointer position, so
  // the dwell timer survives the jitter of a finger holding still.
  // Attach-by-dwell: hold a dragged card over another card and it latches on,
  // the way an aura or an equipment reads at a real table. Independent of board
  // mode - assist still attaches on a plain drop, this adds the deliberate,
  // announced version that works in every mode.
  const hoverHost =
    drag != null &&
    dragOrigin.current.armed &&
    // The deck's top card is popped server-side, so its new iid is unknown here
    // and it could never be attached - so it never offers to be.
    drag.from !== 'library' &&
    dropPile == null &&
    !inHandZone(drag.clientX, drag.clientY)
      ? resolveDropTarget(
          me.battlefield,
          hostUnderPoint(
            me.battlefield,
            { x: drag.x, y: drag.y },
            fieldRef.current?.getBoundingClientRect() ?? null,
            drag.iid,
          ),
          drag.iid,
        )
      : null;
  const hoverHostIid = hoverHost?.iid ?? null;
  const [attachHost, setAttachHost] = useState<string | null>(null);
  useEffect(() => {
    // Keyed on the host's identity, so the timer survives a finger holding
    // still (which fires no pointermove) but restarts on a different card.
    // Reset on EVERY change of target, not just on leaving the board: moving
    // straight from a card you latched onto to a different one must start that
    // card's clock over. Resetting only on null left the latch pointing at the
    // card you just left, so the ring aimed at one card while a release
    // committed to another.
    setAttachHost(null);
    setDwellInvert(false);
    if (hoverHostIid == null) return;
    const latch = setTimeout(() => {
      setAttachHost(hoverHostIid);
      haptics('medium');
    }, ATTACH_DWELL_MS);
    const flip = setTimeout(() => {
      setDwellInvert(true);
      haptics('heavy');
    }, PILE_DWELL_MS);
    return () => {
      clearTimeout(latch);
      clearTimeout(flip);
    };
  }, [hoverHostIid, haptics]);
  // The latch belongs to the drag that armed it.
  useEffect(() => {
    if (drag == null) {
      setAttachHost(null);
      setDwellInvert(false);
    }
  }, [drag]);
  // A parked drag fires no pointermove, so Shift has to be watched directly or
  // the ring cannot answer the key until the pointer twitches.
  const dragging = drag != null;
  useEffect(() => {
    if (!dragging) return;
    const sync = (event: KeyboardEvent) => {
      if (event.key !== 'Shift') return;
      setDrag((d) => (d && d.shift !== event.shiftKey ? { ...d, shift: event.shiftKey } : d));
    };
    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
    };
  }, [dragging]);

  // The ring reads the tracked Shift; each commit re-reads the release event's.
  const hoverPiles =
    hoverHost != null && wantsPile(hoverHost, drag ? cardOf(drag.from, drag.iid) : undefined, drag?.shift ?? false);

  const dwellOverDeck = mobile && dropPile === 'library';
  useEffect(() => {
    if (!dwellOverDeck) return;
    const timer = setTimeout(() => {
      setZonesOpen(true);
      haptics('selection');
    }, 500);
    return () => clearTimeout(timer);
  }, [dwellOverDeck, haptics]);

  // The zone piles. In Cyberpunk they leave the bottom strip for the mat
  // quadrants (Deck/Trash right rail, Legends/Eddies bottom tray) via `mat`.
  // ---- mat editor: free-place the zone piles, synced to every viewer ----
  const matLayoutServer = me.matLayout ?? {};
  const matActive = mtg && (matEdit || Object.keys(matLayoutServer).length > 0);
  const matLayout = matDraft ?? matLayoutServer;

  const updateMatDraft = (next: Partial<Record<MatZone, MatPos>> | null) => {
    matDraftRef.current = next;
    setMatDraft(next);
  };

  // Enter edit mode seamlessly: seed the draft from the piles' CURRENT on-screen
  // spots (measured against the board), so nothing jumps when they lift into the
  // free-placement overlay.
  const startMatEdit = () => {
    const board = boardRef.current;
    const next: Record<MatZone, MatPos> = { ...DEFAULT_MAT_LAYOUT, ...matLayoutServer };
    if (board) {
      const b = board.getBoundingClientRect();
      for (const zone of MAT_ZONES) {
        const r = board.querySelector(`[data-mat-zone="${zone}"]`)?.getBoundingClientRect();
        if (r && b.width > 0 && r.width > 0) {
          next[zone] = {
            x: (r.left + r.width / 2 - b.left) / b.width,
            y: (r.top + r.height / 2 - b.top) / b.height,
          };
        }
      }
    }
    updateMatDraft(next);
    setMatEdit(true);
  };
  const stopMatEdit = () => {
    setMatEdit(false);
    updateMatDraft(null);
  };
  const resetMatLayout = () => {
    send({ type: 'matlayout.set', layout: {} });
    setMatEdit(false);
    updateMatDraft(null);
  };
  const grabPile = (event: ReactPointerEvent, zone: MatZone) => {
    event.preventDefault();
    event.stopPropagation();
    if (!boardRef.current) return;
    const pointerId = event.pointerId;
    // Live rect per event (the board can resize mid-drag); clamp keeps piles
    // inside the mat.
    const clampPos = (cx: number, cy: number): MatPos => {
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return DEFAULT_MAT_LAYOUT[zone];
      return {
        x: Math.min(0.97, Math.max(0.03, (cx - rect.left) / Math.max(1, rect.width))),
        y: Math.min(0.95, Math.max(0.04, (cy - rect.top) / Math.max(1, rect.height))),
      };
    };
    const teardown = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      updateMatDraft({ ...(matDraftRef.current ?? {}), [zone]: clampPos(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      teardown();
      const next = { ...DEFAULT_MAT_LAYOUT, ...(matDraftRef.current ?? {}), [zone]: clampPos(ev.clientX, ev.clientY) };
      updateMatDraft(next);
      send({ type: 'matlayout.set', layout: next });
    };
    // A cancelled pointer (system gesture, window blur) drops the drag without
    // committing - otherwise the listeners leak and the next tap teleports the
    // pile and broadcasts the accident.
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      teardown();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const zonePilesEl = (
    <ZonePiles
      player={me}
      mine
      // Cyberpunk lays its piles out with a CSS grid; Yu-Gi-Oh free-places them
      // into its printed cells, which is the same mechanism a custom MTG mat
      // layout uses.
      mat={cyber}
      canAct
      onMenu={onMenu}
      onHover={onHover}
      onDragOut={(event, card, zone) => beginDrag(event, card, zone, { menu: false })}
      dragSuppressed={() => justDragged.current || heldFired.current}
      dropHint={dropPile}
      layout={ygoField ? YUGIOH_PILE_LAYOUT : matActive ? matLayout : undefined}
      editing={matEdit}
      onPileGrab={grabPile}
    />
  );

  return (
    <div
      ref={boardRef}
      className="myBoard"
      // An arrow aimed at ME lands here (see AimLayer's anchorOf).
      data-seat-anchor={me.seat}
      data-my-turn={(started && myTurn) || undefined}
      data-game={room.game || 'mtg'}
      data-strip-only={hideField || undefined}
      // Card scale drives the hand overlap and lifts the board-mode toolbar
      // clear of the (scalable) pile stacks. The hand's real height rides along
      // so chrome that must clear the fan (the scrub preview) tracks the actual
      // cards rather than a fixed guess that only holds at one card size.
      // --pc-hand-span is the width the fan WANTS; the strip caps it, and the
      // slinky redistributes the cards inside whatever it actually gets.
      style={{
        ['--card-scale' as string]: cardScale,
        ['--pc-hand-h' as string]: `${Math.round(handCardWidth * (680 / 488))}px`,
        ['--pc-hand-w' as string]: `${handCardWidth}px`,
        ['--pc-hand-span' as string]: `${handSpan}px`,
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      // Touch pointers cancel routinely (system edge swipes, notification
      // shade): drop the drag cleanly instead of leaving a card glued to a
      // dead pointer.
      onPointerCancel={() => {
        clearHold();
        endScrub();
        setDrag(null);
      }}
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
              {incomingUnblocked > 0 && !enforced && (
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
        /* Marks this element as seat N's playmat: live cursors normalize against
           the mat they are over, so a viewer places them on the SAME mat in
           their own layout rather than somewhere in their table. */
        data-mat-seat={me.seat}
        style={me.playmat ? { ['--pc-board-mat' as string]: playmatBackground(me.playmat) } : undefined}
        data-mode={boardMode}
        data-game={room.game || 'mtg'}
        data-lanes={(boardMode === 'rows' && drag != null) || undefined}
        onContextMenu={(event) => {
          // Cards carry their own right-click menu; the bare felt opens the
          // token/counter menu. MTG only (tokens are a Magic concept).
          if (!mtg || hideField) return;
          if ((event.target as HTMLElement).closest('.fieldCard, .boardTools')) return;
          // Android fires contextmenu on top of our own long-press timer.
          if (feltHeld.current) return;
          event.preventDefault();
          const pos = fieldPos(event.clientX, event.clientY);
          setBoardMenu({ x: event.clientX, y: event.clientY, bx: pos.x, by: pos.y });
        }}
        onPointerDown={(event) => {
          // Touch has no right-click: press and hold the bare felt to reach the
          // same token/counter menu. Cards run their own hold in beginDrag.
          if (!mtg || hideField || event.pointerType === 'mouse') return;
          if ((event.target as HTMLElement).closest('.fieldCard, .boardTools')) return;
          feltHeld.current = false;
          clearHold();
          const cx = event.clientX;
          const cy = event.clientY;
          fieldHoldFrom.current = { x: cx, y: cy };
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null;
            feltHeld.current = true;
            const pos = fieldPos(cx, cy);
            setBoardMenu({ x: cx, y: cy, bx: pos.x, by: pos.y });
          }, 450);
        }}
        onPointerMove={(event) => {
          // Any real travel means a pan/drag, not a press.
          const from = fieldHoldFrom.current;
          if (!from || !holdTimer.current) return;
          if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 10) clearHold();
        }}
        onPointerUp={() => {
          fieldHoldFrom.current = null;
          clearHold();
        }}
        onPointerCancel={() => {
          fieldHoldFrom.current = null;
          clearHold();
        }}
      >
        {/* The printed zone grid, under the cards. Inside the field, so its
            0..1 box IS the space card positions are stored in. */}
        {ygoField && <YugiohZoneGrid cardWidth={fieldCardWidth} activeId={dropCell} />}
        {/* …and the four zone piles, in their own printed cells. */}
        {ygoField && <div className="matZones">{zonePilesEl}</div>}

        {hosts.map((card) => {
          // The base is the TOP of its pile: members shingle underneath, so the
          // first-stacked (deepest) takes the largest offset and paints first.
          const { piled, auras } = splitPile(attachments.get(card.iid) ?? []);
          return (
            <span key={card.iid} style={{ display: 'contents' }}>
              {piled.map((att, index) =>
                renderFieldCard(att, card, index, Math.min(piled.length - index, PILE_MAX_EDGES)),
              )}
              {auras.map((att, index) => renderFieldCard(att, card, index))}
              {renderFieldCard(card, undefined, 0, 0, piled.length)}
            </span>
          );
        })}

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
          {/* Phones have no header, so Leave joins the board tools rather than
              floating alone - it leads the row and inherits its button size. */}
          {mobile && (
            <Tooltip content={t('tblLeave')}>
              <IconButton size="sm" variant="soft" aria-label={t('tblLeave')} onClick={leaveTable}>
                <LogOut size={15} />
              </IconButton>
            </Tooltip>
          )}
          {mtg && !matEdit && (
            <Tooltip content={t('gpMatEdit')}>
              <IconButton size="sm" variant="soft" aria-label={t('gpMatEdit')} onClick={startMatEdit}>
                <LayoutGrid size={15} />
              </IconButton>
            </Tooltip>
          )}
          {mtg && matEdit && (
            <>
              <Button size="sm" variant="soft" onClick={resetMatLayout}>
                {t('gpMatReset')}
              </Button>
              <Button size="sm" onClick={stopMatEdit}>
                {t('gpMatDone')}
              </Button>
            </>
          )}
          <Tooltip content={t('gpCardsSmaller')}>
            <IconButton
              size="sm"
              variant="soft"
              aria-label={t('gpCardsSmaller')}
              disabled={storedScale <= scaleMin}
              onClick={() => stepScale(-scaleStep)}
            >
              <Minus size={15} />
            </IconButton>
          </Tooltip>
          <Tooltip content={t('gpCardsLarger')}>
            <IconButton
              size="sm"
              variant="soft"
              aria-label={t('gpCardsLarger')}
              disabled={storedScale >= scaleMax}
              onClick={() => stepScale(scaleStep)}
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
            {/* The same set, order and glyphs as the sidebar's dice tray - the
                two must never offer different dice. */}
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
          {mtg && (
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
          )}
        </div>
      </div>

      </>)}

      {/* Cyberpunk: the zones live in the mat quadrants (a board overlay), not
          the bottom strip. Magic keeps them floating over the strip - unless a
          custom mat layout (or the mat editor) lifts them into free placement.
          Yu-Gi-Oh renders its piles INSIDE the field instead (above), since they
          sit in printed cells of the same grid the cards snap to. */}
      {(cyber || matActive) && !hideField && <div className="matZones">{zonePilesEl}</div>}

      {/* Real polyhedral WebGL dice roll over the mat — Cyberpunk's Fixer dice and
          Magic's sidebar dice both land here on the server-chosen value. Falls
          back to a CSS cube if WebGL is unavailable. */}
      {!hideField && <DiceRoll3D dice={me.gigDice} lastRoll={me.lastRoll} playerId={me.userId} />}

      {/* Phones: the piles ride a left-edge drawer over the board - the deck
          always peeks, and tapping (or swiping from the edge) slides the rest
          out. Desktop keeps them inline in the bottom strip. */}
      {mtg && !matActive && !hideField && mobile && (
        <MobileZones piles={zonePilesEl} peek={fieldCardWidth} open={zonesOpen} onOpenChange={setZonesOpen} />
      )}

      {/* bottom strip: zones | hand | vitals */}
      <div className="myStrip">
        {/* Yu-Gi-Oh joins Magic here only when its field is hidden (strip-only
            mode), where there is no printed grid to sit in. */}
        {(mtg || (room.game === 'yugioh' && !ygoField)) && !matActive && (!mobile || hideField) && zonePilesEl}

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
              const rect = event.currentTarget.getBoundingClientRect();
              const along = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
              // Open the fan where the pointer is, and let the rest of it
              // bunch up on the far side.
              paintSlinky(handRef.current, along * Math.max(0, (me.hand?.length ?? 1) - 1));
              shareHandHover(along);
            }}
            onPointerLeave={() => {
              handX.set(Number.POSITIVE_INFINITY);
              paintSlinky(handRef.current, null);
              shareHandHover(null);
            }}
          >
            {(me.hand ?? []).map((card, index, hand) => (
              <HandCard
                key={card.iid}
                card={card}
                dataIid={card.iid}
                width={handCardWidth}
                offset={handOffsets[index] ?? 0.5}
                count={hand.length}
                dimmed={drag?.iid === card.iid && dragOrigin.current.armed}
                playable={handPlayability(room, me, card) != null}
                handX={handX}
                onPointerDown={(event) => {
                  shareHandHover(null);
                  beginDrag(event, card, 'hand');
                }}
                onPointerEnter={() => onHover(card)}
                onPointerLeave={() => onHover(null)}
                onClick={() => clickHandCard(card)}
                onContextMenu={(event) => onMenu(event, card.iid, 'hand')}
              />
            ))}
          </div>

          {/* Sticky hide/show tab: centred on the hand, pinned to the bottom so
              it never moves as the fan rests, peeks or tucks. */}
          <Button
            size="sm"
            variant="soft"
            className="handTab"
            onClick={() => {
              shareHandHover(null);
              setHandHidden((hidden) => !hidden);
            }}
            title={handHidden ? t('gpShowHand') : t('gpHideHand')}
          >
            {handHidden ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {handHidden ? t('gpShowHand') : t('gpHideHand')}
          </Button>
        </div>
      </div>

      {/* Hand scrub: the card under the sliding finger, blown up above the fan
          so a phone can read its whole hand without playing anything. */}
      {scrub && (() => {
        const card = (me.hand ?? []).find((c) => c.iid === scrub.iid);
        if (!card) return null;
        // Clamp by the room ABOVE the fan, not just viewport width: a landscape
        // phone is short, and a width-only cap made the preview taller than the
        // space between the fan and the top edge, so it ran off screen.
        const viewportH = window.visualViewport?.height ?? window.innerHeight;
        const room = viewportH - Math.round(handCardWidth * (680 / 488)) - 24;
        const width = Math.round(
          Math.max(96, Math.min(190, window.innerWidth * 0.42, room * (488 / 680))),
        );
        return (
          <div
            className="handScrubPeek"
            style={{ left: Math.max(width / 2 + 8, Math.min(window.innerWidth - width / 2 - 8, scrub.x)) }}
            aria-hidden
          >
            <GameCard
              name={card.name}
              imageUrl={faceImage(card)}
              width={width}
              foil={isFoilInst(card)}
              tilt={0}
            />
          </div>
        );
      })()}

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
            imageUrl={draggedGhostCard.faceDown ? undefined : faceImage(draggedGhostCard)}
            faceDown={draggedGhostCard.faceDown}
            width={handCardWidth}
            foil={isFoilInst(draggedGhostCard)}
            tilt={0}
          />
        </div>
      )}

      {/* right-click board menu: create a searched token, or a bare counter marker */}
      {boardMenu && (
        <div
          className="cardMenu cardMenuCompact"
          style={{
            left: Math.min(boardMenu.x, window.innerWidth - 220),
            top: Math.min(boardMenu.y, window.innerHeight - 140),
          }}
          role="menu"
          aria-label={t('tkCreateToken')}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="menuSectionLabel"><Plus size={13} /> Create</div>
          <button
            type="button"
            className="menuItem"
            role="menuitem"
            onClick={() => {
              setPickerAt({ x: boardMenu.bx, y: boardMenu.by });
              setBoardMenu(null);
            }}
          >
            <span className="menuItemIcon" aria-hidden><Shapes size={15} /></span>
            <span>{t('tkCreateToken')}</span>
          </button>
          <button
            type="button"
            className="menuItem"
            role="menuitem"
            onClick={() => {
              act({ kind: 'token.create', name: t('tkCounter'), x: boardMenu.bx, y: boardMenu.by });
              setBoardMenu(null);
            }}
          >
            <span className="menuItemIcon" aria-hidden><CircleDot size={15} /></span>
            <span>{t('tkNewCounter')}</span>
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

