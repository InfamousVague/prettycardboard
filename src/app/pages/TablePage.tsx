import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { AlertDialog, Avatar, Button, Drawer, IconButton, Input, Kbd, Menu, MenuItem, Pill, Text, Size, StatusDot, TextTone, Tooltip, useToast } from '@glacier/react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpToLine,
  Ban,
  BellRing,
  ChevronRight,
  CircleMinus,
  CirclePlus,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Hand,
  Heart,
  Layers,
  LayoutGrid,
  Link2,
  LogOut,
  PackageOpen,
  Paperclip,
  Play,
  Plus,
  Repeat,
  RotateCw,
  Rows3,
  ScrollText,
  Send,
  Settings,
  Skull,
  Swords,
  Unlink,
  UserPlus,
  Users,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { cardImage } from '../data/cards.ts';
import { useFaces } from '../data/faces.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { useEdgeColor } from '../data/edgeColor.ts';
import { tableShareUrl } from '../data/pendingJoin.ts';
import { usePreference } from '../hooks/usePreference.ts';
import { useMobileLayout, usePortrait } from '../hooks/useIsPhone.ts';
import { RotateOverlay } from './table/RotateOverlay.tsx';
import { resolveKeybinds, KEYBIND_DEF, type ActionId } from '../data/keybinds.ts';
import { getDeck } from '../net/api.ts';
import { computeDeckMeta } from '../data/deckMeta.ts';
import type { GameId } from '../data/games.ts';
import { GameCard } from '../components/GameCard.tsx';
import { ManaPoolReadout } from '../components/Mana.tsx';
import type { CardInst, GameAction, GameActionV2, RoomState, TablePlayer, Zone } from '../net/types.ts';
import { selectCardScale, useTableUi } from './table/tableUi.ts';
import {
  CARD_SCALE_MAX,
  CARD_SCALE_MIN,
  CARD_SCALE_STEP,
  GRID_ZOOM_MAX,
  GRID_ZOOM_MIN,
  GRID_ZOOM_STEP,
  MOBILE_SCALE_DEFAULT,
  MOBILE_SCALE_MAX,
  MOBILE_SCALE_MIN,
  MOBILE_SCALE_STEP,
} from './table/boardModes.ts';
import { MyBoard } from './table/MyBoard.tsx';
import { Vitals } from './table/Vitals.tsx';
import { SeatFrame } from './table/SeatFrame.tsx';
import { OpponentHand } from './table/OpponentHand.tsx';
import { CyberpunkDicePanel } from './table/CyberpunkDicePanel.tsx';
import { PhaseRibbon } from './table/PhaseRibbon.tsx';
import { StackTray } from './table/StackTray.tsx';
import { CmdChoiceDialog, LibraryViewer, MulliganOverlay, PileViewer, RevealTray, RollBanner } from './table/overlays.tsx';
import { TablePresence } from './table/TablePresence.tsx';
import { LibrarySidebar } from './table/LibrarySidebar.tsx';
import { PostMatch } from './table/PostMatch.tsx';
import { PreMatch } from './table/PreMatch.tsx';
import { PregameLobby } from './table/PregameLobby.tsx';
import { DraftRoom } from './table/DraftRoom.tsx';
import { TimelineCard } from './table/TimelineCard.tsx';
import { TurnCue } from './table/TurnCue.tsx';
import { flightAnchor, flyCard } from './table/juice.ts';
import { onMessage, onStatus, send } from '../net/ws.ts';
import { playSound, primeSounds } from '../sounds.ts';
import { DEFAULT_PREFERENCES, loadPreferences } from '../preferences.ts';
import { formatFor } from '../data/formats.ts';
import { applyAccentRamp, clearDeckTint } from '../state/accent.ts';
import { installTableShims } from './table/shims.ts';
import './table/table.css';
import './table/cyberpunk-mat.css';

/**
 * The live table. Freeform, server-authoritative, 2-6 seats: your board runs
 * along the bottom (hand fanned, battlefield free-placement, zone piles),
 * opponents frame the top (one row for up to three, two rows beyond), the
 * phase ribbon and turn chrome float top-center, and the chat+log dock rides
 * the inline-end edge. Manual play with conveniences - tap by click, drag
 * anywhere, right-click for everything else.
 */

type AnyAction = GameAction | GameActionV2;

interface Menu {
  iid: string;
  zone: Zone;
  x: number;
  y: number;
  /** The source card's screen rect at open time, for zone-flight garnish. */
  rect: DOMRect | null;
}

export function TablePage() {
  const t = useT();
  const { toast } = useToast();
  const identity = useApp((state) => state.identity);
  const liveRoom = useGame((state) => state.room);
  const replay = useGame((state) => state.replay);
  // While scrubbing a replay, the whole table renders a past frame (read-only);
  // otherwise it is the live authoritative room.
  const room = replay.active && replay.frame ? replay.frame : liveRoom;
  const spectating = useGame((state) => state.spectating);
  const act = useGame((state) => state.act);
  const leave = useGame((state) => state.leave);
  // Face-down cards on this table wear the game-appropriate default back when the
  // player left the default on (Cyberpunk shows its crest, not Magic's back). A
  // scoped --pc-card-back override cascades to every face-down surface inside the
  // table without touching the global card-back preference.
  const cardBackPref = usePreference('cardBack');
  // A staged opponent's board is flipped 180° when this is on; the spectate cue
  // then floats at the bottom (their hand takes the top) instead of the top.
  const mirrorOpponent = usePreference('mirrorOpponent');
  // Card size for the staged board - adjustable from the spectate cue, since
  // spectators (and seated players watching another mat) have no board tools.
  const cardScale = useTableUi(selectCardScale);
  // Steppers act on whichever ladder is live - the phone's own three sizes or
  // the desktop preference - so a phone can never overwrite a desktop scale.
  const storedScale = useTableUi((state) => (state.scaleCap != null ? state.mobileScale : state.cardScale));
  const stepScale = (direction: number) => {
    const state = useTableUi.getState();
    if (state.scaleCap != null) state.setMobileScale(state.mobileScale + direction * MOBILE_SCALE_STEP, identity?.userId);
    else state.setCardScale(state.cardScale + direction * CARD_SCALE_STEP, identity?.userId);
  };
  const keybinds = usePreference('keybinds');
  // The phone layout: full-bleed board, seat chips as the camera, the side
  // rail folded into a bottom sheet, End turn in the thumb corner.
  const mobile = useMobileLayout();
  const portrait = usePortrait();
  useEffect(() => {
    // Marks the phone board so card sizing switches to its own scale ladder
    // (see selectCardScale); a desktop-tuned 1.6x means nothing on 390px.
    useTableUi.getState().setScaleCap(mobile ? MOBILE_SCALE_DEFAULT : null);
    return () => useTableUi.getState().setScaleCap(null);
  }, [mobile]);
  const cardBackSrc = cardBackUrl(effectiveCardBack(cardBackPref, room?.game));
  const tableCardBack = `url("${cardBackSrc}")`;
  // The 3D library pile's cut edge wears the top card's own border colour,
  // sampled from that back, so a deck's stack no longer reads as generic brown.
  const cardBackEdge = useEdgeColor(cardBackSrc);
  // Portalled surfaces (the kit's Drawer/Modal render into <body>) sit outside
  // the .table element, so the table's card-back variables never reach them.
  // Mirroring them on the root keeps face-down art correct everywhere.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--pc-card-back', tableCardBack);
    root.style.setProperty('--pc-card-back-edge', cardBackEdge);
    return () => {
      root.style.removeProperty('--pc-card-back');
      root.style.removeProperty('--pc-card-back-edge');
    };
  }, [tableCardBack, cardBackEdge]);
  const friends = useApp((state) => state.friends.friends);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [pinnedSeat, setPinnedSeat] = useState<number | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);
  // Phones hide the roster behind a top-left players icon rather than a chip row
  // across the board's top edge.
  const [playersOpen, setPlayersOpen] = useState(false);
  // Desktop overview: every seat's playmat at once instead of one staged board.
  const gridView = useTableUi((state) => state.gridView);
  const setGridView = useTableUi((state) => state.setGridView);
  const gridZoom = useTableUi((state) => state.gridZoom);
  const setGridZoom = useTableUi((state) => state.setGridZoom);
  // The grid needs the room's width; phones stage one board at a time.
  const gridActive = gridView && !mobile && room != null && room.started;
  // The matchup splash: only for the false->true start transition witnessed
  // live (a reload into a running game skips straight to the table).
  const [preMatch, setPreMatch] = useState(false);
  const [pingCooling, setPingCooling] = useState(false);
  const pingTimer = useRef<number | undefined>(undefined);
  const prevStarted = useRef<boolean | null>(null);
  const previousTurn = useRef<{ roomId: string; started: boolean; turnKey: string } | null>(null);
  // Tracks the last hovered card for the tap/flip/clone hotkeys.
  const hoverRef = useRef<CardInst | null>(null);
  const handleHover = (card: CardInst | null) => {
    hoverRef.current = card;
  };
  // The active game's keybinds resolved to a code->action lookup. Kept in a ref
  // so the keydown handler (mounted once) reads the current map without
  // re-subscribing on every rebind or game switch.
  const bindingsRef = useRef<Map<string, ActionId>>(new Map());
  // An unbound 1-9 key can prefix the next all-counter shortcut (e.g. 5 then
  // ] adds five to every counter on the hovered card). It expires quickly so a
  // stray digit never changes a later action.
  const counterRepeatRef = useRef({ value: 1, expiresAt: 0 });

  useEffect(() => {
    installTableShims();
    const close = () => setMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  // The persisted board layout mode + card scale belong to the signed-in user.
  useEffect(() => {
    useTableUi.getState().hydrateBoardMode(identity?.userId);
    useTableUi.getState().hydrateCardScale(identity?.userId);
    useTableUi.getState().hydrateMobileScale(identity?.userId);
    useTableUi.getState().hydrateGridZoom(identity?.userId);
  }, [identity?.userId]);

  // Combat selections cannot outlive combat.
  const combatActive = room?.combat != null;
  useEffect(() => {
    if (!combatActive) {
      const ui = useTableUi.getState();
      if (ui.blockerIid) ui.setBlocker(null);
    }
  }, [combatActive]);

  // Mirror my playmat choice and turn-automation settings into the room (each
  // seat's felt wears its own mat; the server honors my auto untap/draw at my
  // turn), on join and whenever preferences change.
  const roomId = room?.roomId;
  // The mat my seated deck brings, if any - the server already applied it, so
  // this is only here to stop the global preference overwriting it.
  // Read off the LIVE room, never the replay frame: scrubbing back through a
  // match must not rewrite what mat the seat is wearing.
  const myDeck = useApp((state) =>
    state.decks.find(
      (deck) => deck.id === liveRoom?.players.find((p) => p.userId === state.identity?.userId)?.deckId,
    ),
  );
  const deckMat = myDeck?.playmat ?? null;
  const deckBack = myDeck?.cardBack ?? null;
  useEffect(() => {
    const prime = () => primeSounds();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    return onMessage((message) => {
      if (!('roomId' in message) || message.roomId !== roomId) return;
      if (message.type === 'room.ping') {
        if (message.to.userId === identity?.userId) {
          playSound('ping');
          toast({ tone: 'info', message: t('tblPingedYou').replace('{name}', message.from.username) });
        } else if (message.from.userId === identity?.userId) {
          toast({ tone: 'neutral', message: t('tblPingSent').replace('{name}', message.to.username) });
        }
      } else if (
        message.type === 'room.event' &&
        message.actor === identity?.userId &&
        message.action.kind === 'draw'
      ) {
        playSound('cardDraw');
      }
    });
  }, [roomId, identity?.userId, toast, t]);

  const liveMe = liveRoom?.players.find((player) => player.userId === identity?.userId);
  const liveTurnKey = `${liveRoom?.turnNumber ?? 0}:${liveRoom?.activeSeat ?? -1}`;
  useEffect(() => {
    const current = liveRoom && liveMe
      ? { roomId: liveRoom.roomId, started: liveRoom.started, turnKey: liveTurnKey }
      : null;
    const previous = previousTurn.current;
    if (
      current &&
      previous?.roomId === current.roomId &&
      current.started &&
      liveRoom?.matchResult == null &&
      liveRoom?.activeSeat === liveMe?.seat &&
      (!previous.started || previous.turnKey !== current.turnKey) &&
      !spectating
    ) {
      playSound('turn');
    }
    previousTurn.current = current;
  }, [liveRoom, liveMe, liveTurnKey, spectating]);

  useEffect(
    () => () => {
      window.clearTimeout(pingTimer.current);
    },
    [],
  );

  // The mat this seat last pushed. A deck's own mat is a DEFAULT applied when
  // you sit down with it - not a lock: picking a mat in Settings afterwards has
  // to win, or a deck with a mat leaves you unable to change the felt at all.
  const sentMat = useRef<string | null>(null);
  const sentBack = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || spectating) return;
    const share = () => {
      const prefs = loadPreferences();
      // The seat is the source of truth: the server already put the deck's own
      // mat on it at join, so the first share must not talk over that. It only
      // dresses a seat that arrived bare. After that, only a genuine change of
      // the mat PREFERENCE pushes - the dozen unrelated `pc:preferences` events
      // (volume, locale, card size) leave the felt alone.
      const seat = useGame.getState().room?.players.find((player) => player.userId === identity?.userId);
      const seatMat = seat?.playmat;
      const first = sentMat.current === null;
      const prefChanged = !first && sentMat.current !== prefs.playmat;
      const mat = first ? (seatMat ? null : (deckMat ?? prefs.playmat)) : prefChanged ? prefs.playmat : null;
      if (mat != null) send({ type: 'playmat.set', id: mat });
      // Remember the preference either way: the next share only pushes when
      // the player has actually chosen a different mat since this one.
      sentMat.current = prefs.playmat;
      // The deck's sleeves work exactly like its mat: the server dresses the
      // seat when the deck is chosen, the first share only covers a seat that
      // arrived bare, and afterwards only a real change of the card-back
      // preference pushes - so everyone at the table sees the change the
      // moment it happens, and each seat keeps its own back.
      const firstBack = sentBack.current === null;
      const backChanged = !firstBack && sentBack.current !== prefs.cardBack;
      const back = firstBack
        ? (seat?.cardBack ? null : (deckBack ?? prefs.cardBack))
        : backChanged
          ? prefs.cardBack
          : null;
      if (back != null) send({ type: 'cardback.set', id: back });
      sentBack.current = prefs.cardBack;
      send({ type: 'auto.set', untap: prefs.autoUntap, draw: prefs.autoDraw });
    };
    sentMat.current = null;
    sentBack.current = null;
    share();
    window.addEventListener('pc:preferences', share);
    // Reconnects rejoin the room server-side; re-share the mat afterward.
    const offStatus = onStatus((connected) => {
      if (connected) setTimeout(share, 400);
    });
    return () => {
      window.removeEventListener('pc:preferences', share);
      offStatus();
    };
    // Re-runs on a deck change too: switching to a deck with no mat of its own
    // must hand the seat back to the global preference.
  }, [roomId, spectating, deckMat, deckBack]);

  // Share my deck's public metrics (colors/curve/counts) for the matchup
  // splash whenever my seat has a deck but no metrics yet - the server clears
  // deckMeta on every deck switch (including re-picking the same deck), so
  // "meta missing" is the resync signal. Computed client-side because the
  // server has no card data (see data/deckMeta.ts). `me` is declared further
  // down, so read the seat straight off the room snapshot here.
  const mySeat = room?.players.find((p) => p.userId === identity?.userId);
  const myDeckId = mySeat?.deckId ?? null;
  const myMetaMissing = mySeat != null && mySeat.deckMeta == null;
  useEffect(() => {
    if (!roomId || spectating || !myDeckId || !myMetaMissing) return;
    let alive = true;
    void (async () => {
      try {
        const deck = await getDeck(myDeckId);
        const meta = await computeDeckMeta(deck, room?.game ?? 'mtg');
        if (alive) send({ type: 'deckmeta.set', meta });
      } catch {
        // Metrics are cosmetic; a failed fetch just leaves the splash plain.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, spectating, myDeckId, myMetaMissing]);

  // In a Cyberpunk match, repaint the whole app's primary from Glacier blue to
  // the Cyberpunk yellow; restore the user's configured accent on leave.
  const roomGame = room?.game;
  useEffect(() => {
    if (roomGame !== 'cyberpunk') return;
    applyAccentRamp('cyberpunk');
    return () => clearDeckTint(loadPreferences().accent, DEFAULT_PREFERENCES.accent);
  }, [roomGame]);

  // A manual board pin lasts until the turn moves on.
  const activeSeatNow = room?.activeSeat;
  useEffect(() => {
    setPinnedSeat(null);
  }, [activeSeatNow]);

  // The result screen owns the table; a lingering context menu under it
  // would misread taps.
  const matchOver = room?.matchResult != null;
  useEffect(() => {
    if (matchOver) {
      setMenu(null);
      setPreMatch(false);
    }
  }, [matchOver]);

  // Deal-hands moment: the matchup splash appears first; the mulligan
  // overlay (the deal animation) waits until it is dismissed.
  const startedNow = room?.started ?? null;
  useEffect(() => {
    if (prevStarted.current === false && startedNow === true) {
      setPreMatch(true);
    }
    prevStarted.current = startedNow;
  }, [startedNow]);

  // Combat always stages the ACTIVE seat (the attacker): my own board when I
  // attack (declare attackers there), the opponent's when I defend (click an
  // attacker to assign a blocker). Clearing any manual pin makes it follow.
  const combatOn = room?.combat != null;
  useEffect(() => {
    if (combatOn) setPinnedSeat(null);
  }, [combatOn]);

  // Rebuild the code->action lookup whenever the game or the user's bindings
  // change. The keydown handler below reads bindingsRef, so it never needs these
  // in its own deps (it stays mounted once for the life of the table).
  useEffect(() => {
    bindingsRef.current = resolveKeybinds(keybinds ?? {}, (roomGame as GameId) ?? 'mtg');
  }, [keybinds, roomGame]);

  // Keyboard: every table shortcut routes through the user's configurable
  // bindings (Settings > Keybinds). A binding fires only when its action's guard
  // passes; typing surfaces, open menus/dialogs, and Space-on-a-button are always
  // skipped so the shortcuts never fight the UI.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const action = bindingsRef.current.get(event.code);
      const counterPrefix = action ? null : event.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (!action && !counterPrefix) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return;
      // Space would also click a focused button; let the button win.
      if (event.code === 'Space' && target?.closest('button')) return;

      const state = useGame.getState();
      const current = state.room;
      if (!current) return;
      const seatMe = current.players.find((player) => player.userId === useApp.getState().identity?.userId);
      // The base capability: seated at a live, non-finished match, not spectating
      // or scrubbing a replay. Every guard builds on this.
      const canAct = current.started && !current.matchResult && !state.spectating && !state.replay.active && seatMe != null;
      if (!canAct) return;
      const hovered = hoverRef.current;
      const mine = hovered ? seatMe!.battlefield.find((card) => card.iid === hovered.iid) : undefined;

      if (!action) {
        if (counterPrefix && mine && Object.values(mine.counters).some((count) => count > 0)) {
          event.preventDefault();
          counterRepeatRef.current = { value: Number(counterPrefix[1]), expiresAt: Date.now() + 2_000 };
        }
        return;
      }

      const guard = KEYBIND_DEF[action].guard;
      if (guard === 'myTurn' && current.activeSeat !== seatMe!.seat) return;
      if (guard === 'hoveredMine' && mine == null) return;
      if (guard === 'hoveredToken' && (mine == null || !mine.isToken)) return;
      if (guard === 'combat' && current.combat == null) return;

      event.preventDefault();
      if (action !== 'incrementCounters' && action !== 'decrementCounters') {
        counterRepeatRef.current = { value: 1, expiresAt: 0 };
      }
      switch (action) {
        case 'passTurn':
          state.act({ kind: 'turn.pass' });
          break;
        case 'tapHovered':
          state.act({ kind: 'card.tap', iid: mine!.iid, tapped: !mine!.tapped });
          break;
        case 'flipHovered':
          state.act({ kind: 'card.face', iid: mine!.iid, faceDown: !mine!.faceDown });
          break;
        case 'peelPile': {
          // Works whether the hovered card is the pile's base or one of its
          // members - either way it lifts the top card off that pile.
          const base = mine!.piled && mine!.attachedTo
            ? seatMe!.battlefield.find((card) => card.iid === mine!.attachedTo)
            : mine!;
          const top = base
            ? seatMe!.battlefield.filter((card) => card.attachedTo === base.iid && card.piled).at(-1)
            : undefined;
          if (top) state.act({ kind: 'card.attach', iid: top.iid, hostIid: null });
          break;
        }
        case 'cloneHovered':
          state.act({ kind: 'token.clone', iid: mine!.iid, x: Math.min(0.95, mine!.x + 0.06), y: mine!.y });
          break;
        case 'incrementCounters':
        case 'decrementCounters': {
          const pending = counterRepeatRef.current;
          const repeat = pending.expiresAt >= Date.now() ? pending.value : 1;
          const delta = action === 'incrementCounters' ? repeat : -repeat;
          counterRepeatRef.current = { value: 1, expiresAt: 0 };
          for (const [counter, count] of Object.entries(mine!.counters)) {
            if (count > 0) state.act({ kind: 'card.counter', iid: mine!.iid, counter, delta });
          }
          break;
        }
        case 'draw':
          state.act({ kind: 'draw', count: 1 });
          break;
        case 'shuffle':
          state.act({ kind: 'shuffle' });
          break;
        case 'untapAll':
          state.act({ kind: 'untap.all' });
          break;
        case 'createToken':
          window.dispatchEvent(new Event('pc:create-token'));
          break;
        case 'rollD20':
          state.act({ kind: 'dice.roll', sides: 20 });
          break;
        case 'lifeUp':
          state.act({ kind: 'life.add', delta: 1 });
          break;
        case 'lifeDown':
          state.act({ kind: 'life.add', delta: -1 });
          break;
        case 'secondaryUp':
          state.act({ kind: 'poison.add', delta: 1 });
          break;
        case 'secondaryDown':
          state.act({ kind: 'poison.add', delta: -1 });
          break;
        case 'endCombat':
          state.act({ kind: 'combat.end' });
          break;
        case 'stormUp':
          state.act({ kind: 'marker.storm', delta: 1 });
          break;
        case 'cycleDayNight': {
          const cur = current.markers?.dayNight ?? null;
          const next = cur === null ? 'day' : cur === 'day' ? 'night' : null;
          state.act({ kind: 'marker.day', value: next });
          break;
        }
        case 'concede':
          setConfirmConcede(true);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Copy the invite link (falls back to the bare code where clipboard is
  // blocked, e.g. non-secure origins).
  const shareInvite = () => {
    if (!room) return;
    const url = tableShareUrl(room.code);
    navigator.clipboard?.writeText(url).then(
      () => toast({ tone: 'success', message: t('tblLinkCopied') }),
      () => toast({ tone: 'neutral', message: `${t('tblCode')}: ${room.code}` }),
    );
  };

  const pingPlayer = (player: TablePlayer) => {
    if (pingCooling) return;
    send({ type: 'room.ping', targetUserId: player.userId });
    setPingCooling(true);
    window.clearTimeout(pingTimer.current);
    pingTimer.current = window.setTimeout(() => setPingCooling(false), 3_000);
  };

  if (!room) return null;

  const me = room.players.find((player) => player.userId === identity?.userId);
  const pingTargets = me
    ? room.players.filter(
        (player) => player.userId !== me.userId && player.online !== false && !player.conceded,
      )
    : [];
  const isHost = room.hostUserId === identity?.userId;
  // The table is drafting until the last deck is built: either a draft is
  // actually running, or this is a draft room that has not started one yet.
  const drafting = room.draft
    ? room.draft.phase !== 'done'
    : (room.format ?? '').toLowerCase() === 'draft';
  // Online friends not already seated here: invite them straight into this table.
  const onlineFriends = friends.filter(
    (friend) => friend.online && !room.players.some((player) => player.userId === friend.userId),
  );
  const canAct = !spectating && me != null && room.started && !replay.active;

  // Once the game starts, ONE board owns the stage: the active player's, or
  // whichever seat was pinned from a side-rail mini. Everyone else shrinks to
  // a mini board on the right rail.
  const stagedSeat = room.started ? (pinnedSeat ?? room.activeSeat) : null;
  const stagedPlayer = stagedSeat != null ? room.players.find((player) => player.seat === stagedSeat) : undefined;
  const stagedIsMe = me != null && stagedPlayer?.userId === me.userId;



  const openMenu = (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as Element | null)?.getBoundingClientRect() ?? null;
    setMenu({ iid, zone, x: event.clientX, y: event.clientY, rect });
  };

  return (
    <div
      className="table"
      data-replay={replay.active || undefined}
      data-mobile={mobile || undefined}
      style={{
        ['--pc-card-back' as string]: tableCardBack,
        ['--pc-card-back-edge' as string]: cardBackEdge,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="tableFelt" aria-hidden />

      {/* The live board is landscape-shaped: a phone held portrait gets the
          animated rotate ask instead of a cramped board. The lobby and the
          post-match screen stay portrait-friendly. */}
      {mobile && portrait && room.started && !room.matchResult && <RotateOverlay />}

      {/* ---- your-turn cue: edge glow + dismissable pill ---- */}
      {me && !spectating && <TurnCue room={room} meSeat={me.seat} />}

      {/* ---- top strip: room identity + controls ----
          Phones drop it once the match starts: the board owns every pixel, and
          its actions live in the dock sheet (Concede included). The lobby keeps
          it - that's where the room code gets shared around. */}
      {!(mobile && room.started) && (
      <header className="tableTop">
        <div className="tableMeta">
          <Text as="span" weight="semibold">
            {room.name}
          </Text>
          <Tooltip content={`${t('tblCode')}: ${room.code}`}>
            <button
              type="button"
              className="tableCode"
              onClick={() => navigator.clipboard?.writeText(room.code)}
            >
              <Kbd>{room.code}</Kbd>
              <Copy size={13} />
            </button>
          </Tooltip>
          {spectating && (
            <Pill size="sm" tone="accent" icon={<Eye size={12} />}>
              {t('tblSpectating')}
            </Pill>
          )}
        </div>
        {room.started && !mobile && <PhaseRibbon room={room} me={me} canAct={canAct} />}
        <div className="tableTopActions">
          {!spectating && onlineFriends.length > 0 && (
            <Menu
              aria-label={t('tblInviteFriends')}
              trigger={
                <Button size="sm" variant="soft">
                  <UserPlus size={15} /> <span className="ttActionLabel">{t('tblInviteFriends')}</span>
                </Button>
              }
            >
              {onlineFriends.map((friend) => (
                <MenuItem
                  key={friend.userId}
                  onSelect={() => {
                    send({ type: 'invite.send', toUserId: friend.userId, roomId: room.roomId });
                    toast({ tone: 'success', message: `${t('frInvite')} → ${friend.username}` });
                  }}
                >
                  <StatusDot tone="success" size="sm" /> {friend.username}
                </MenuItem>
              ))}
            </Menu>
          )}
          {room.started && !mobile && (
            <Tooltip content={gridView ? t('tblGridOff') : t('tblGridOn')}>
              <Button
                size="sm"
                variant={gridView ? 'solid' : 'soft'}
                aria-pressed={gridView}
                onClick={() => setGridView(!gridView)}
              >
                <LayoutGrid size={15} /> <span className="ttActionLabel">{t('tblGrid')}</span>
              </Button>
            </Tooltip>
          )}
          {/* Fit-to-cell is only a starting point: how much board a quadrant
              should show is taste, so the grid carries its own zoom. */}
          {gridActive && (
            <div className="gridZoomer">
              <Tooltip content={t('tblGridOut')}>
                <IconButton
                  size="sm"
                  variant="soft"
                  aria-label={t('tblGridOut')}
                  disabled={gridZoom <= GRID_ZOOM_MIN}
                  onClick={() => setGridZoom(gridZoom - GRID_ZOOM_STEP, identity?.userId)}
                >
                  <ZoomOut size={15} />
                </IconButton>
              </Tooltip>
              <Tooltip content={t('tblGridIn')}>
                <IconButton
                  size="sm"
                  variant="soft"
                  aria-label={t('tblGridIn')}
                  disabled={gridZoom >= GRID_ZOOM_MAX}
                  onClick={() => setGridZoom(gridZoom + GRID_ZOOM_STEP, identity?.userId)}
                >
                  <ZoomIn size={15} />
                </IconButton>
              </Tooltip>
            </div>
          )}
          {room.started && me && !spectating && !me.conceded && !room.matchResult && (
            <Tooltip content={t('tblConcede')}>
              <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}>
                <Flag size={15} /> <span className="ttActionLabel">{t('tblConcede')}</span>
              </Button>
            </Tooltip>
          )}
        </div>
      </header>
      )}

      {/* ---- concede confirm ---- */}
      {confirmConcede && (
        <AlertDialog
          open
          onClose={() => setConfirmConcede(false)}
          title={t('tblConcedeTitle')}
          description={t('tblConcedeDesc')}
          actionLabel={t('tblConcede')}
          cancelLabel={t('dbCancel')}
          dismissible
          onAction={() => {
            act({ kind: 'concede' });
            setConfirmConcede(false);
          }}
        />
      )}

      <div className="tableMain" data-lobby={!room.started || undefined}>
        {/* A draft table spends its whole pre-game in the draft: set-up, packs,
            deckbuilding. Only once every seat has SAVED its deck does the
            ordinary lobby take over - and by then everyone is already seated
            with the deck they just built, so nothing below here changes. */}
        {!room.started &&
          (drafting ? (
            <DraftRoom room={room} me={me} isHost={isHost} spectating={spectating} onShare={shareInvite} />
          ) : (
            <PregameLobby room={room} me={me} spectating={spectating} isHost={isHost} onShare={shareInvite} />
          ))}

        {/* ---- grid overview: every seat's playmat at once (desktop only).
             Clicking one stages that board and leaves the grid. ---- */}
        {gridActive && (
          <div
            className="playerGrid"
            data-seats={room.players.length}
            style={{ '--pc-grid-user-zoom': gridZoom } as CSSProperties}
          >
            {[...room.players]
              .sort((a, b) => a.seat - b.seat)
              .map((player) => (
                <div
                  key={player.userId}
                  className="playerGridCell"
                  data-mine={player.userId === identity?.userId || undefined}
                  data-turn={room.activeSeat === player.seat || undefined}
                >
                  {/* My own cell is the live board, not a picture of one: it
                      renders MyBoard so cards can be dragged and played right
                      here. SeatFrame is a read-only mat renderer with no move
                      actions at all, so a "just make the preview clickable"
                      version of this could never move a card.

                      It is also the only cell with no staging hit area. Clicking
                      my own board used to stage it and drop out of the grid,
                      which is exactly what makes the board "go back to full
                      screen" the moment you touch it. */}
                  {player.userId === identity?.userId && me && !spectating && room.started ? (
                    <div className="playerGridPreview" data-live="">
                      <MyBoard me={me} room={room} onMenu={openMenu} onHover={handleHover} />
                    </div>
                  ) : (
                    /* Live, not inert, and with no staging overlay: the grid is
                       for READING other boards, so hovering a card previews it
                       and clicking blows it up in the lightbox. Clicking a mat
                       no longer throws you into that seat's fullscreen view.
                       SeatFrame is read-only (no move actions), so nothing here
                       can mutate another player's board. */
                    <div className="playerGridPreview">
                      <SeatFrame room={room} player={player} me={me} canAct={false} onHover={handleHover} stage />
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* ---- started: the active (or pinned) board owns the stage ---- */}
        {!gridActive && room.started && stagedPlayer && !stagedIsMe && (
          <div className="stageArea">
            <SeatFrame
              key={stagedPlayer.userId}
              room={room}
              player={stagedPlayer}
              me={me}
              canAct={canAct}
              onHover={handleHover}
              stage
            />
          </div>
        )}
        {/* The staged opponent's hand renders at the screen bottom (like mine). */}
        {!gridActive && room.started && stagedPlayer && !stagedIsMe && !spectating && (
          <OpponentHand key={`hand-${stagedPlayer.userId}`} player={stagedPlayer} />
        )}

        {/* Watching another player's board (their turn, your click, or as a pure
            spectator): a floating cue with a card-size control - spectators have
            no board tools of their own - and, for seated players, a jump home. */}
        {!gridActive && room.started && stagedPlayer && !stagedIsMe && (
          <div className="spectateCue" role="status" data-mirror={mirrorOpponent || undefined}>
            <Eye size={15} aria-hidden />
            <span className="spectateCueText">
              {t('tblSpectating')} · <b>{stagedPlayer.username}</b>
            </span>
            <Tooltip content={t('gpCardsSmaller')}>
              <IconButton
                size="sm"
                variant="soft"
                aria-label={t('gpCardsSmaller')}
                disabled={storedScale <= (mobile ? MOBILE_SCALE_MIN : CARD_SCALE_MIN)}
                onClick={() => stepScale(-1)}
              >
                <CircleMinus size={15} />
              </IconButton>
            </Tooltip>
            <Tooltip content={t('gpCardsLarger')}>
              <IconButton
                size="sm"
                variant="soft"
                aria-label={t('gpCardsLarger')}
                disabled={storedScale >= (mobile ? MOBILE_SCALE_MAX : CARD_SCALE_MAX)}
                onClick={() => stepScale(1)}
              >
                <CirclePlus size={15} />
              </IconButton>
            </Tooltip>
            {me && !spectating && (
              <Button size="sm" variant="soft" onClick={() => setPinnedSeat(me.seat)}>
                {t('tblViewMyBoard')}
              </Button>
            )}
          </div>
        )}

        {/* ---- my board: only while it owns the stage. Looking at someone
             else's playmat hides my hand/deck/piles entirely. ---- */}
        {!gridActive && me && !spectating && room.started && stagedIsMe && (
          <MyBoard me={me} room={room} onMenu={openMenu} onHover={handleHover} />
        )}
        {spectating && me == null && !stagedPlayer && <div className="tableSpectatorSpace" />}

        {/* ---- the shared stack, floating center ---- */}
        {room.started && <StackTray room={room} canAct={canAct} />}
      </div>

      {/* ---- right dock: scrollable table cards over persistent navigation ---- */}
      <SidePanel
        room={room}
        me={me}
        spectating={spectating}
        meId={identity?.userId}
        onFocusSeat={setPinnedSeat}
        pingTargets={pingTargets}
        onPingPlayer={pingPlayer}
        pingCooling={pingCooling}
        onShare={shareInvite}
        onLeave={leave}
        onConcede={
          room.started && me && !spectating && !me.conceded && !room.matchResult
            ? () => setConfirmConcede(true)
            : undefined
        }
        inviteTargets={spectating ? [] : onlineFriends}
        onInviteFriend={(friend) => {
          send({ type: 'invite.send', toUserId: friend.userId, roomId: room.roomId });
          toast({ tone: 'success', message: `${t('frInvite')} → ${friend.username}` });
        }}
        mobile={mobile}
      />

      {/* ---- phone chrome: the players drawer is the camera; End turn rides the
           thumb corner (the header ribbon is hidden on mobile) ---- */}
      {mobile && room.started && (
        <button
          type="button"
          className="seatChipsTrigger"
          aria-label={t('tblPlayers')}
          aria-expanded={playersOpen}
          onClick={() => setPlayersOpen(true)}
        >
          <Users size={18} />
          <span className="seatChipsCount">{room.players.length}</span>
        </button>
      )}
      {mobile && room.started && (
        <Drawer
          open={playersOpen}
          onClose={() => setPlayersOpen(false)}
          side="left"
          size="sm"
          floating={false}
          title={t('tblPlayers')}
          className="seatChipsDrawer"
          dismissible
        >
        <div className="seatChips" role="tablist" aria-label={t('tblPlayers')}>
          {[...room.players]
            .sort((a, b) => a.seat - b.seat)
            .map((player) => (
              <button
                key={player.userId}
                type="button"
                role="tab"
                className="seatChip"
                aria-selected={stagedPlayer?.userId === player.userId}
                data-staged={stagedPlayer?.userId === player.userId || undefined}
                data-turn={room.activeSeat === player.seat || undefined}
                data-conceded={player.conceded || undefined}
                onClick={() => {
                  setPinnedSeat(player.seat);
                  setPlayersOpen(false);
                }}
              >
                <span className="seatChipAvatar">
                  <Avatar name={player.username} size="sm" />
                  {room.activeSeat === player.seat && <span className="seatChipDot" aria-hidden />}
                </span>
                <span className="seatChipName">{player.username}</span>
                <span className="seatChipLife">
                  <Heart size={10} /> {player.life}
                </span>
              </button>
            ))}
        </div>
        </Drawer>
      )}
      {/* History controls ride the top centre of the mat: undo, timeline, redo. */}
      {mobile && room.started && !spectating && (
        <div className="mobileHistory">
          <TimelineCard floating />
        </div>
      )}
      {mobile && room.started && (
        <div className="mobileTurnDock">
          <PhaseRibbon
            room={room}
            me={me}
            canAct={canAct}
            mobile
            onConcede={
              me && !spectating && !me.conceded && !room.matchResult ? () => setConfirmConcede(true) : undefined
            }
          />
        </div>
      )}

      {/* ---- context menu ---- */}
      {menu && me && !spectating && (
        <CardMenu
          menu={menu}
          me={me}
          hasCommander={formatFor(room.format).hasCommander}
          recipients={room.players
            .filter((player) => player.userId !== me.userId)
            .map((player) => ({ userId: player.userId, username: player.username }))}
          onAction={(action) => {
            act(action);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}

      {/* ---- overlays ---- */}
      {/* Frame-driven interactive overlays are suppressed while scrubbing a
          replay: `room` is a historical frame then, so a past mulligan/combat
          state must not resurface as a live modal over the read-only shield. */}
      <LibraryViewer />
      {/* Unconditional: spectators see reveals too. */}
      <RevealTray room={room} canAct={canAct} meId={me?.userId} />
      {me && !spectating && !replay.active && <LibrarySidebar />}
      <PileViewer room={room} me={me} canAct={!spectating && me != null} />
      {me && !spectating && !preMatch && !replay.active && <MulliganOverlay room={room} me={me} />}
      {me && !spectating && !replay.active && <CmdChoiceDialog me={me} />}
      {preMatch && <PreMatch room={room} onClose={() => setPreMatch(false)} />}
      {/* Combat v3: target picker, defender response, resolved breakdown. */}
      {/* Spectators see the result too; controls inside are gated to players. */}
      <PostMatch room={room} meId={identity?.userId} spectating={spectating} onLeave={leave} />
      <RollBanner />
      <TablePresence meId={identity?.userId} active={room.started && !spectating} />
    </div>
  );
}

/* ================= context menu ================= */

const COUNTER_PALETTE: { label: string; counter: string; delta: number }[] = [
  { label: '+1/+1', counter: '+1/+1', delta: 1 },
  { label: '-1/-1', counter: '-1/-1', delta: 1 },
  { label: 'Loyalty', counter: 'loyalty', delta: 1 },
  { label: 'Charge', counter: 'charge', delta: 1 },
];

function CardMenu({
  menu,
  me,
  hasCommander,
  recipients,
  onAction,
  onClose,
}: {
  menu: Menu;
  me: TablePlayer;
  /** Commander machinery active (commander/brawl) - gates the tax items. */
  hasCommander: boolean;
  recipients: { userId: string; username: string }[];
  onAction: (action: AnyAction) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [sub, setSub] = useState<'counter' | 'attach' | 'move' | 'give' | 'pile' | 'pileOnto' | null>(null);
  const [customCounter, setCustomCounter] = useState('');

  const card =
    me.battlefield.find((c) => c.iid === menu.iid) ??
    me.hand?.find((c) => c.iid === menu.iid) ??
    me.graveyard.find((c) => c.iid === menu.iid) ??
    me.exile.find((c) => c.iid === menu.iid) ??
    me.command.find((c) => c.iid === menu.iid);

  const hosts = me.battlefield.filter((c) => c.iid !== menu.iid && !c.attachedTo);
  // Cards physically stacked on the card this menu belongs to. Board order is
  // pile order, so the last one is the top of the pile.
  const pile = me.battlefield.filter((c) => c.attachedTo === menu.iid && c.piled);
  const pileTop = pile.at(-1);
  // Learn a card's faces so double-faced cards (Clive, etc.) offer Transform.
  const faces = useFaces(card?.scryfallId);
  const cardArt = card && !card.faceDown ? card.imageUrl || cardImage(card.scryfallId) : undefined;
  const zoneName =
    menu.zone === 'hand'
      ? t('tblHand')
      : menu.zone === 'graveyard'
        ? t('tblGraveyard')
        : menu.zone === 'exile'
          ? t('tblExile')
          : menu.zone === 'command'
            ? t('tblCommand')
            : 'Battlefield';

  /** Zones a card disappears into: worth confirming, because the card is gone
   *  from view the moment it lands. Battlefield and hand stay visible, so they
   *  would only be noise. */
  const HIDDEN_ZONES = new Set(['graveyard', 'exile', 'library', 'command']);

  /** Fire the action, arcing a clone from the card toward its destination pile.
   *  `label` is the menu item's own text, so the confirmation echoes exactly
   *  what was clicked rather than re-deriving a name that could disagree. */
  const moveWithArc = (action: AnyAction, anchorKey: string | null, label?: string) => {
    if (menu.rect && card) {
      const target =
        (anchorKey ? flightAnchor(anchorKey) : null) ??
        new DOMRect(window.innerWidth / 2 - 46, window.innerHeight * 0.3, 92, 128);
      flyCard(menu.rect, target, {
        imageUrl: card.faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId),
        faceDown: card.faceDown,
      });
    }
    const dest = 'to' in action ? String(action.to) : '';
    if (card && label && HIDDEN_ZONES.has(dest)) {
      toast({ tone: 'neutral', message: `${card.name} → ${label}` });
    }
    onAction(action);
  };

  const item = (label: string, icon: ReactNode, action: AnyAction, anchorKey?: string | null) => (
    <button
      type="button"
      className="menuItem"
      role="menuitem"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => (anchorKey !== undefined ? moveWithArc(action, anchorKey, label) : onAction(action))}
    >
      <span className="menuItemIcon" aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );

  const quick = (label: string, icon: ReactNode, action: AnyAction, anchorKey?: string | null) => (
    <button
      type="button"
      className="menuQuickAction"
      role="menuitem"
      title={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => (anchorKey !== undefined ? moveWithArc(action, anchorKey, label) : onAction(action))}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const expander = (
    label: string,
    icon: ReactNode,
    key: 'counter' | 'attach' | 'move' | 'give' | 'pile' | 'pileOnto',
  ) => (
    <button
      type="button"
      className="menuItem menuExpander"
      data-open={sub === key || undefined}
      role="menuitem"
      aria-expanded={sub === key}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setSub(sub === key ? null : key)}
    >
      <span className="menuItemIcon" aria-hidden>{icon}</span>
      <span>{label}</span>
      <ChevronRight className="menuItemChevron" size={14} aria-hidden />
    </button>
  );

  return (
    <div
      className="cardMenu"
      style={{
        left: Math.max(8, Math.min(menu.x, window.innerWidth - 256)),
        top: Math.max(8, Math.min(menu.y, window.innerHeight - 440)),
      }}
      role="menu"
      aria-label={card?.name || 'Card'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="menuCardHeader">
        {cardArt ? (
          <img className="menuCardThumb" src={cardArt} alt="" draggable={false} />
        ) : (
          <span className="menuCardThumb menuCardThumbFallback" aria-hidden><Layers size={16} /></span>
        )}
        <span className="menuCardIdentity">
          <span className="menuCardName">{card?.name || 'Card'}</span>
          <span className="menuCardZone">{zoneName}</span>
        </span>
        <IconButton size="sm" variant="ghost" aria-label={t('cpClose')} onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      {menu.zone === 'battlefield' && card && (
        <>
          <div className="menuQuickActions">
            {quick(
              card.tapped ? 'Untap' : 'Tap',
              <RotateCw size={16} />,
              { kind: 'card.tap', iid: menu.iid, tapped: !card.tapped },
            )}
            {quick(
              card.faceDown ? 'Face up' : 'Face down',
              card.faceDown ? <Eye size={16} /> : <EyeOff size={16} />,
              { kind: 'card.face', iid: menu.iid, faceDown: !card.faceDown },
            )}
            {quick(
              'Clone',
              <Copy size={16} />,
              { kind: 'token.clone', iid: menu.iid, x: Math.min(0.95, card.x + 0.06), y: card.y },
            )}
            {faces?.dfc &&
              quick(
                card.transformed ? 'Front face' : 'Transform',
                <Repeat size={16} />,
                { kind: 'card.transform', iid: menu.iid, transformed: !card.transformed },
              )}
          </div>
          {expander('Counters', <CirclePlus size={15} />, 'counter')}
          {sub === 'counter' && (
            <div className="menuInset">
              {COUNTER_PALETTE.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="menuItem"
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onAction({ kind: 'card.counter', iid: menu.iid, counter: entry.counter, delta: entry.delta })}
                >
                  <span className="menuItemIcon" aria-hidden>
                    {entry.delta < 0 ? <CircleMinus size={14} /> : <CirclePlus size={14} />}
                  </span>
                  <span>{entry.label}</span>
                </button>
              ))}
              <form
                className="menuCustom"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = customCounter.trim();
                  if (name) onAction({ kind: 'card.counter', iid: menu.iid, counter: name, delta: 1 });
                }}
              >
                <Input
                  size="sm"
                  value={customCounter}
                  onChange={(event) => setCustomCounter(event.target.value)}
                  placeholder="Custom…"
                />
                <IconButton size="sm" type="submit" variant="soft" aria-label={t('gpSetCounter')}>
                  <Plus size={14} />
                </IconButton>
              </form>
            </div>
          )}
          {hosts.length > 0 && expander('Attach to', <Paperclip size={15} />, 'attach')}
          {sub === 'attach' && (
            <div className="menuInset menuScroll">
              {hosts.map((host) => (
                <button
                  key={host.iid}
                  type="button"
                  className="menuItem"
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    // Matches the drag-and-dwell route: attaching hides the
                    // card under its host, so every way of doing it says so.
                    if (card) toast({ tone: 'neutral', message: `${card.name} → ${host.name}` });
                    onAction({ kind: 'card.attach', iid: menu.iid, hostIid: host.iid });
                  }}
                >
                  <span className="menuItemIcon" aria-hidden><Paperclip size={14} /></span>
                  <span>{host.name}</span>
                </button>
              ))}
            </div>
          )}
          {card.attachedTo && !card.piled &&
            item('Detach', <Unlink size={15} />, { kind: 'card.attach', iid: menu.iid, hostIid: null })}
          {hosts.length > 0 && expander(t('gpPileOnto'), <Rows3 size={15} />, 'pileOnto')}
          {sub === 'pileOnto' && (
            <div className="menuInset menuScroll">
              {hosts.map((host) => (
                <button
                  key={host.iid}
                  type="button"
                  className="menuItem"
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    // Piling hides the card under its base, so say where it went.
                    const depth = me.battlefield.filter((c) => c.attachedTo === host.iid && c.piled).length;
                    toast({ tone: 'neutral', message: `${host.name} ×${depth + 2}` });
                    onAction({ kind: 'card.attach', iid: menu.iid, hostIid: host.iid, piled: true });
                  }}
                >
                  <span className="menuItemIcon" aria-hidden><Rows3 size={14} /></span>
                  <span>{host.name}</span>
                </button>
              ))}
            </div>
          )}
          {pileTop &&
            item(t('gpPileTake'), <Rows3 size={15} />, {
              kind: 'card.attach',
              iid: pileTop.iid,
              hostIid: null,
            })}
          {pile.length > 0 && expander(`${t('gpPile')} (${pile.length + 1})`, <Rows3 size={15} />, 'pile')}
          {sub === 'pile' && (
            <div className="menuInset menuScroll">
              {/* Top of the pile first - that is the order you would lift them. */}
              {[...pile].reverse().map((member) => (
                <button
                  key={member.iid}
                  type="button"
                  className="menuItem"
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onAction({ kind: 'card.attach', iid: member.iid, hostIid: null })}
                >
                  <span className="menuItemIcon" aria-hidden><Rows3 size={14} /></span>
                  <span>{member.name}</span>
                </button>
              ))}
            </div>
          )}
          {card.piled &&
            item(t('gpPileLeave'), <Unlink size={15} />, { kind: 'card.attach', iid: menu.iid, hostIid: null })}
          {item(t('gpStack'), <Layers size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
          {expander('Move to', <ArrowRight size={15} />, 'move')}
          {sub === 'move' && (
            <div className="menuInset">
              {item(t('tblHand'), <Hand size={14} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
              {item(t('tblGraveyard'), <Skull size={14} />, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
              {item(t('tblExile'), <Ban size={14} />, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
              {item(t('tblCommand'), <Crown size={14} />, { kind: 'card.move', iid: menu.iid, to: 'command' }, `cmd:${me.userId}`)}
              {item('Top of library', <ArrowUpToLine size={14} />, { kind: 'card.move', iid: menu.iid, to: 'library', index: 0 }, `lib:${me.userId}`)}
              {item('Bottom of library', <ArrowDownToLine size={14} />, { kind: 'card.move', iid: menu.iid, to: 'library', index: -1 }, `lib:${me.userId}`)}
            </div>
          )}
        </>
      )}
      {menu.zone === 'hand' && (
        <>
          {item('Play', <Play size={15} />, { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item('Play face down', <EyeOff size={15} />, { kind: 'card.face', iid: menu.iid, faceDown: true })}
          {item(t('gpStack'), <Layers size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
          {expander('Move to', <ArrowRight size={15} />, 'move')}
          {sub === 'move' && (
            <div className="menuInset">
              {item(t('tblGraveyard'), <Skull size={14} />, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
              {item('Top of library', <ArrowUpToLine size={14} />, { kind: 'card.move', iid: menu.iid, to: 'library', index: 0 }, `lib:${me.userId}`)}
            </div>
          )}
          {item(t('gpRevealCard'), <Eye size={15} />, { kind: 'reveal.card', iid: menu.iid })}
          {item(t('gpRevealHand'), <Eye size={15} />, { kind: 'reveal.hand' })}
        </>
      )}
      {menu.zone === 'graveyard' && (
        <>
          {item(t('tblHand'), <Hand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item('Battlefield', <Play size={15} />, { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item(t('tblExile'), <Ban size={15} />, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
          {item(t('gpStack'), <Layers size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
        </>
      )}
      {menu.zone === 'exile' && (
        <>
          {item(t('tblHand'), <Hand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item('Battlefield', <Play size={15} />, { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item(t('tblGraveyard'), <Skull size={15} />, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
        </>
      )}
      {menu.zone === 'command' && card && (
        <>
          {/* A transforming commander sits here as its front face. The zone had
              no flip at all, so the only way to see the other side was to cast
              it - offer it here too, and the popup carries a preview toggle. */}
          {faces?.dfc &&
            item(
              card.transformed ? 'Front face' : 'Transform',
              <Repeat size={15} />,
              { kind: 'card.transform', iid: menu.iid, transformed: !card.transformed },
            )}
          {item(`${t('tblCommand')} → Battlefield`, <Play size={15} />, { kind: 'cmd.cast', iid: menu.iid, x: 0.55, y: 0.55 }, 'field:mine')}
          {item(t('tblHand'), <Hand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {/* Manual tax control: +2 always (the server creates the entry), -2
              once any tax exists. Commander formats only - Cyberpunk Legends
              share this zone but have no tax. */}
          {hasCommander &&
            item(t('gpCmdTaxAdd'), <Crown size={15} />, { kind: 'cmd.tax', iid: menu.iid, delta: 2 })}
          {hasCommander &&
            (me.commanderTax?.[menu.iid] ?? 0) > 0 &&
            item(t('gpCmdTaxReduce'), <Crown size={15} />, { kind: 'cmd.tax', iid: menu.iid, delta: -2 })}
        </>
      )}
      {card && recipients.length > 0 && (
        <>
          {expander(t('gpGiveTo'), <Send size={15} />, 'give')}
          {sub === 'give' && (
            <div className="menuInset menuScroll">
              {recipients.map((player) => (
                <button
                  key={player.userId}
                  type="button"
                  className="menuItem"
                  role="menuitem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onAction({ kind: 'card.give', iid: menu.iid, toUser: player.userId })}
                >
                  <span className="menuItemIcon" aria-hidden><Send size={14} /></span>
                  <span>{player.username}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================= side dock ================= */

function SidePanel({
  room,
  me,
  spectating,
  meId,
  onFocusSeat,
  pingTargets,
  onPingPlayer,
  pingCooling,
  onShare,
  onLeave,
  onConcede,
  inviteTargets,
  onInviteFriend,
  mobile,
}: {
  room: RoomState;
  me?: TablePlayer;
  spectating?: boolean;
  meId?: string;
  onFocusSeat?: (seat: number) => void;
  pingTargets: TablePlayer[];
  onPingPlayer?: (player: TablePlayer) => void;
  pingCooling?: boolean;
  onShare: () => void;
  onLeave: () => void;
  /** Present while conceding is possible; the phone sheet nav surfaces it
      because the header (and its Concede button) is hidden mid-match there. */
  onConcede?: () => void;
  /** Online friends who can be invited - the header's invite menu has no phone
      twin once the header hides mid-match, so the sheet nav carries it. */
  inviteTargets?: TablePlayer[] | { userId: string; username: string }[];
  onInviteFriend?: (friend: { userId: string; username: string }) => void;
  /** Phone layout: the rail's content folds into a bottom sheet instead. */
  mobile?: boolean;
}) {
  const t = useT();
  const log = useGame((state) => state.log);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The phone sheet: which tab is open (null = collapsed to the handle chip).
  const [sheet, setSheet] = useState<'vitals' | 'players' | 'log' | null>(null);
  const seated = me != null && !spectating;

  // Keep the log pinned to the newest entry.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [log.length, sheet]);

  // The rail's building blocks - shared verbatim between the desktop rail and
  // the phone bottom sheet, so the two layouts can never drift.
  const vitalsEl = seated && (
    <>
      <Vitals me={me} room={room} />
      {room.game === 'cyberpunk' && (
        <CyberpunkDicePanel me={me} others={room.players.filter((p) => p.userId !== me.userId)} />
      )}
      {/* Phones fly undo / timeline / redo on the mat instead (see the board's
          .mobileHistory); a second card here would own a rival timeline bar. */}
      {!mobile && <TimelineCard />}
    </>
  );
  const playersEl = (
    <PlayersCard
      room={room}
      meId={meId}
      onFocusSeat={onFocusSeat}
      onPingPlayer={onPingPlayer}
      pingCooling={pingCooling}
    />
  );
  const logEl = (
    <div className="sideLogCard">
      <div className="sideHead">
        <span className="sideHeadTitle">
          <ScrollText size={13} />
          {t('tblLog')}
        </span>
      </div>
      <div ref={scrollRef} className="sideScroll">
        {log.length === 0 ? (
          <p className="sideEmpty">{t('tblLogEmpty')}</p>
        ) : (
          log.map((line, index) => (
            <p key={`${line.seq}-${index}`} className="sideLine">
              {line.text}
            </p>
          ))
        )}
      </div>
      {room.spectators.length > 0 && (
        <div className="sideSpectators">
          <span className="sideHeadTitle">
            <Eye size={13} />
            {t('tblSpectators')}
          </span>
          {room.spectators.map((spectator) => (
            <span key={spectator.userId} className="spectatorName">
              {spectator.username}
            </span>
          ))}
        </div>
      )}
    </div>
  );
  const navEl = (
    <nav className="tableSideNav" aria-label={t('tblTableNav')}>
      <Tooltip content={t('tblPingHint')}>
        <Menu
          aria-label={t('tblPing')}
          placement="top-end"
          trigger={
            <IconButton
              size="sm"
              variant="ghost"
              disabled={pingCooling || pingTargets.length === 0}
              aria-label={t('tblPing')}
            >
              <BellRing size={16} />
            </IconButton>
          }
        >
          {pingTargets.map((player) => (
            <MenuItem key={player.userId} onSelect={() => onPingPlayer?.(player)}>
              <BellRing size={14} /> {player.username}
            </MenuItem>
          ))}
        </Menu>
      </Tooltip>
      <Tooltip content={t('tblShareHint')}>
        <IconButton size="sm" variant="ghost" aria-label={t('tblShare')} onClick={onShare}>
          <Link2 size={16} />
        </IconButton>
      </Tooltip>
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
      {/* The way back to packs. The dock's own pill can be dismissed from
          anywhere, and at a table there is no rail and no tab bar to relaunch
          it from - so it lives here, in the one row every viewer of a table
          has, seated or spectating, lobby or match. Latched on `window` as
          well as dispatched because the dock is code-split: a request made
          while its chunk is still streaming would land on no listener. */}
      <Tooltip content={t('navBoosters')}>
        <IconButton
          size="sm"
          variant="ghost"
          aria-label={t('navBoosters')}
          onClick={() => {
            (window as { __pcPackDock?: 'open' | 'show' }).__pcPackDock = 'open';
            window.dispatchEvent(new CustomEvent('pc:open-packdock', { detail: { open: true } }));
          }}
        >
          <PackageOpen size={16} />
        </IconButton>
      </Tooltip>
      {mobile && onInviteFriend && (inviteTargets?.length ?? 0) > 0 && (
        <Tooltip content={t('tblInviteFriends')}>
          <Menu
            aria-label={t('tblInviteFriends')}
            placement="top-end"
            trigger={
              <IconButton size="sm" variant="ghost" aria-label={t('tblInviteFriends')}>
                <UserPlus size={16} />
              </IconButton>
            }
          >
            {(inviteTargets ?? []).map((friend) => (
              <MenuItem key={friend.userId} onSelect={() => onInviteFriend(friend)}>
                <StatusDot tone="success" size="sm" /> {friend.username}
              </MenuItem>
            ))}
          </Menu>
        </Tooltip>
      )}
      {mobile && onConcede && (
        <Tooltip content={t('tblConcede')}>
          <IconButton size="sm" variant="ghost" aria-label={t('tblConcede')} onClick={onConcede}>
            <Flag size={16} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip content={t('tblLeave')}>
        <IconButton size="sm" variant="ghost" aria-label={t('tblLeave')} onClick={onLeave}>
          <LogOut size={16} />
        </IconButton>
      </Tooltip>
    </nav>
  );

  if (mobile) {
    // Pregame mirrors the desktop rail: nav only. Vitals/players/log describe a
    // match in progress, and the lobby already lists the seats itself.
    if (!room.started) {
      return (
        <div className="mobileDock" data-nav-only>
          {navEl}
        </div>
      );
    }
    const openDefault = seated ? 'vitals' : 'players';
    const tabs = [
      ...(seated ? [{ value: 'vitals', label: t('tblLife') }] : []),
      { value: 'players', label: t('tblPlayers') },
      { value: 'log', label: t('tblLog') },
    ];
    return (
      <div className="mobileDock" data-open={sheet != null || undefined}>
        <button
          type="button"
          className="mobileDockHandle"
          aria-expanded={sheet != null}
          onClick={() => setSheet((current) => (current ? null : openDefault))}
        >
          {seated ? (
            <>
              <Heart size={13} /> {me.life}
            </>
          ) : (
            <Eye size={13} />
          )}
          <ChevronRight size={13} className="mobileDockChevron" />
        </button>
        {sheet != null && (
          <div className="mobileSheet" role="dialog" aria-label={t('tblTableNav')}>
            <div className="mobileSheetHead">
              <div className="mobileSheetTabs" role="tablist">
                {tabs.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    role="tab"
                    aria-selected={sheet === tab.value}
                    data-active={sheet === tab.value || undefined}
                    className="mobileSheetTab"
                    onClick={() => setSheet(tab.value as 'vitals' | 'players' | 'log')}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {navEl}
              <IconButton size="sm" variant="ghost" aria-label={t('cpClose')} onClick={() => setSheet(null)}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="mobileSheetBody">
              {sheet === 'vitals' && vitalsEl}
              {sheet === 'players' && playersEl}
              {sheet === 'log' && logEl}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside className="tableSide" data-nav-only={!room.started || undefined}>
      {room.started && (
        <div className="tableSideScroll">
          {vitalsEl}
          {playersEl}
          {logEl}
        </div>
      )}
      {navEl}
    </aside>
  );
}

/**
 * The player roster as a card in the bottom-right HUD, stacked under the life
 * card. Each row is clickable to bring that seat's board to the stage; no
 * board thumbnails (the stage itself is the preview).
 */
/**
 * Commander damage a player has TAKEN, summarized: the single highest total
 * from any one commander (that's the 21-to-die number) plus a per-source
 * breakdown for the tooltip. Read-only — damage is recorded from your own
 * vitals tracker, not from here.
 */
function cmdDamageSummary(player: TablePlayer, room: RoomState) {
  const rows = Object.entries(player.cmdDamage ?? {})
    .map(([seat, amount]) => ({
      amount,
      from: room.players.find((p) => p.seat === Number(seat))?.username ?? `Seat ${seat}`,
    }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { max: rows[0]?.amount ?? 0, rows };
}

function PlayersCard({
  room,
  meId,
  onFocusSeat,
  onPingPlayer,
  pingCooling,
}: {
  room: RoomState;
  meId?: string;
  onFocusSeat?: (seat: number) => void;
  onPingPlayer?: (player: TablePlayer) => void;
  pingCooling?: boolean;
}) {
  const t = useT();
  const markers = room.markers ?? {};
  const players = [...room.players].sort((a, b) => a.seat - b.seat);
  return (
    <div className="playersCard">
      {players.map((player) => {
        const active = room.started && room.activeSeat === player.seat;
        const isMe = player.userId === meId;
        const isHost = room.hostUserId === player.userId;
        // Any row stages that seat; clicking mine brings my own board back.
        const focusable = room.started;
        return (
          <div
            key={player.userId}
            className="playerRow"
            data-active={active || undefined}
            data-me={isMe || undefined}
            data-dead={player.conceded || undefined}
            data-focusable={focusable || undefined}
            onClick={focusable && onFocusSeat ? () => onFocusSeat(player.seat) : undefined}
          >
            <Avatar name={player.username} size="sm" />
            <div className="playerBody">
              <span className="playerNameRow">
                <span className="playerName">{player.username}</span>
                {player.conceded && (
                  <Tooltip content={t('tblConceded')}>
                    <span className="playerBadge playerBadgeDead">
                      <Skull size={11} />
                    </span>
                  </Tooltip>
                )}
                {isMe && <span className="playerYou">{t('tblYou')}</span>}
                {isHost && (
                  <Tooltip content={t('tblHost')}>
                    <span className="playerBadge">
                      <Crown size={11} />
                    </span>
                  </Tooltip>
                )}
                {markers.monarch === player.seat && (
                  <Tooltip content={t('gpMonarch')}>
                    <span className="playerBadge playerBadgeMonarch">
                      <Crown size={11} />
                    </span>
                  </Tooltip>
                )}
                {markers.initiative === player.seat && (
                  <Tooltip content={t('gpInitiative')}>
                    <span className="playerBadge playerBadgeInit">
                      <Zap size={11} />
                    </span>
                  </Tooltip>
                )}
              </span>
              <span className="playerMeta">
                <span className="playerStat" title={t('tblLife')}>
                  <Heart size={12} /> {player.life}
                </span>
                {formatFor(room.format).hasCommander && (() => {
                  const cmd = cmdDamageSummary(player, room);
                  return cmd.max > 0 ? (
                    <span
                      className="playerStat"
                      data-lethal={cmd.max >= 21 || undefined}
                      title={`${t('tblCmdDamage')} — ${cmd.rows.map((row) => `${row.from} ${row.amount}`).join(' · ')}`}
                    >
                      <Swords size={12} /> {cmd.max}
                    </span>
                  ) : null;
                })()}
                {player.poison > 0 && (
                  <span className="playerStat" title={t('tblPoison')}>
                    <Skull size={12} /> {player.poison}
                  </span>
                )}
                {room.game !== 'cyberpunk' && <ManaPoolReadout mana={player.mana} />}
                <span className="playerStat" title={t('tblHand')}>
                  {player.handCount}
                </span>
              </span>
            </div>
            {!isMe && player.online !== false && !player.conceded && onPingPlayer && (
              <Tooltip content={t('tblPingPlayer').replace('{name}', player.username)}>
                <IconButton
                  className="playerPing"
                  size="sm"
                  variant="ghost"
                  disabled={pingCooling}
                  aria-label={t('tblPingPlayer').replace('{name}', player.username)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPingPlayer(player);
                  }}
                >
                  <BellRing size={13} />
                </IconButton>
              </Tooltip>
            )}
            {active && <span className="playerTurnDot" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
