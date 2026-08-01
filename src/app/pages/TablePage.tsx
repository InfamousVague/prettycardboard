import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertDialog, Avatar, Button, Drawer, IconButton, Input, Kbd, Menu, MenuItem, MenuSub, Pill, Text, Size, StatusDot, TextTone, Tooltip, useToast } from '@glacier/react';
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
  GraduationCap,
  Heart,
  LayoutGrid,
  LogOut,
  MessageSquare,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PictureInPicture2,
  Play,
  Plus,
  Repeat,
  RotateCw,
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
  Sparkles,
  Minus,
  Trash2,
  Smile,
} from '@glacier/icons';
import { PlayingCardBlank, PlayingCardHand, PlayingCardStack } from '../icons/cards.ts';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { oracleFacts } from '../data/printedPt.ts';
import { cardImage } from '../data/cards.ts';
import { isFoilInst } from '../data/foil.ts';
import { useFaces } from '../data/faces.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { useEdgeColor } from '../data/edgeColor.ts';
import { tableShareUrl } from '../data/pendingJoin.ts';
import { usePreference } from '../hooks/usePreference.ts';
import { usePanelDock } from '../hooks/usePanelDock.ts';
import { useMobileLayout, usePortrait } from '../hooks/useIsPhone.ts';
import { PortraitCompanion } from './table/PortraitCompanion.tsx';
import { useMenuAnchor } from './table/menuAnchor.tsx';
import { maskLogNames } from './table/logMask.ts';
import { resolveKeybinds, KEYBIND_DEF, type ActionId } from '../data/keybinds.ts';
import { zoneLabel } from '../data/games.ts';
import { getDeck } from '../net/api.ts';
import { computeDeckMeta } from '../data/deckMeta.ts';
import { primeYugiohCatalog } from '../data/yugioh.ts';
import { placeInYugiohField, type YugiohCellKind } from './table/yugiohZones.tsx';
import { isYugiohFieldSpell } from '../data/yugioh.ts';
import type { GameId } from '../data/games.ts';
import { GameCard } from '../components/GameCard.tsx';
import { ManaPoolReadout } from '../components/Mana.tsx';
import type { CardInst, GameAction, GameActionV2, RoomState, TablePlayer, Zone } from '../net/types.ts';
import { TABLE_DOCK_ID, selectCardScale, useTableUi } from './table/tableUi.ts';
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
import { CombatPreviewCard, PhaseRibbon } from './table/PhaseRibbon.tsx';
import { StackTray } from './table/StackTray.tsx';
import { CmdChoiceDialog, DiscardPrompts, LibraryViewer, MulliganOverlay, PileViewer, RevealTray, RollBanner, TargetPicker, TriggerPrompts } from './table/overlays.tsx';
import { EventToasts } from './table/EventToasts.tsx';
import { PriorityPrompt } from './table/PriorityPrompt.tsx';
import { TablePresence } from './table/TablePresence.tsx';
import { AimLayer } from './table/AimLayer.tsx';
import { MARK_KINDS, markIcon } from './table/bits.tsx';
import { MARK_LABEL } from './table/marks.ts';
import { seatColor } from './table/seatColors.ts';
import { LibrarySidebar } from './table/LibrarySidebar.tsx';
import { PostMatch } from './table/PostMatch.tsx';
import { PreMatch } from './table/PreMatch.tsx';
import { LOBBY_NAV_DOCK_ID, PregameLobby } from './table/PregameLobby.tsx';
import { ChatBall } from './table/ChatBall.tsx';
import { LobbyChat } from './table/LobbyChat.tsx';
import { DraftRoom } from './table/DraftRoom.tsx';
import { TimelineCard } from './table/TimelineCard.tsx';
import { TurnCue } from './table/TurnCue.tsx';
import { flightAnchor, flyCard } from './table/juice.ts';
import { onMessage, onStatus, send } from '../net/ws.ts';
import { isTauri } from '../tauri.ts';
import {
  TITLEBAR_DOCK_CENTER_ID,
  TITLEBAR_DOCK_END_ID,
  TITLEBAR_DOCK_START_ID,
  useDockElement,
  useWideChrome,
} from '../titlebarDock.ts';
import { playSound, primeSounds } from '../sounds.ts';
import { DEFAULT_PREFERENCES, loadPreferences } from '../preferences.ts';
import { formatFor } from '../data/formats.ts';
import { applyAccentRamp, clearDeckTint } from '../state/accent.ts';
import { installTableShims } from './table/shims.ts';
import './table/table.css';
import './table/cyberpunk-mat.css';
import './table/yugioh-mat.css';

/**
 * The live table. Freeform, server-authoritative, 2-6 seats: your board runs
 * along the bottom (hand fanned, battlefield free-placement, zone piles),
 * opponents frame the top (one row for up to three, two rows beyond), the
 * phase ribbon and turn chrome float top-center, and the chat+log dock rides
 * the inline-end edge. Manual play with conveniences - tap by click, drag
 * anywhere, right-click for everything else.
 */

type AnyAction = GameAction | GameActionV2;

// The Tauri shell owns a title bar; the top strip's clusters dock into it
// there instead of spending a second row of chrome (see titlebarDock.ts).
const DESKTOP = isTauri();

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

  // Enforced-room rejections (and any action error) surface as toasts; the
  // store relays them via a window event because it has no toast context.
  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<{ code: string; message: string }>).detail;
      if (!detail?.message) return;
      toast({ tone: 'warning', message: detail.message });
    };
    window.addEventListener('pc:action-error', onError);
    return () => window.removeEventListener('pc:action-error', onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
  // Tauri desktop: the top strip's clusters ride the window title bar instead
  // of a row of their own. The slots exist whenever the title bar does; the
  // portals below only fill them while this page is mounted. Only while the
  // window is wide enough - the bar is one fixed row, and a narrow window
  // needs the strip's own wrapping row back (see useWideChrome).
  const chromeDocked = DESKTOP && !mobile && useWideChrome();
  const dockStart = useDockElement(TITLEBAR_DOCK_START_ID, chromeDocked);
  const dockCenter = useDockElement(TITLEBAR_DOCK_CENTER_ID, chromeDocked);
  const dockEnd = useDockElement(TITLEBAR_DOCK_END_ID, chromeDocked);
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
  // The right rail, collapsed to its nav pill so the mats get its width. Phones
  // have no rail to collapse (it is already a bottom sheet there).
  const railHidden = useTableUi((state) => state.railHidden);
  const railCollapsed = railHidden && !mobile;
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
    useTableUi.getState().hydrateGridView(identity?.userId);
    useTableUi.getState().hydrateRailHidden(identity?.userId);
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
      send({ type: 'coach.set', on: prefs.rulesCoach });
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

  // In a Cyberpunk or Yu-Gi-Oh match, repaint the whole app's primary from
  // Glacier blue to that game's accent; restore the user's accent on leave.
  const roomGame = room?.game;
  useEffect(() => {
    if (roomGame !== 'cyberpunk' && roomGame !== 'yugioh') return;
    applyAccentRamp(roomGame);
    return () => clearDeckTint(loadPreferences().accent, DEFAULT_PREFERENCES.accent);
  }, [roomGame]);

  // Warm the Yu-Gi-Oh catalog at the table: ATK/DEF chips, card details and
  // pile viewers all read it synchronously once loaded.
  useEffect(() => {
    if (roomGame === 'yugioh') primeYugiohCatalog();
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
          // Yu-Gi-Oh life moves in hundreds (the vitals steppers agree).
          state.act({ kind: 'life.add', delta: current.game === 'yugioh' ? 100 : 1 });
          break;
        case 'lifeDown':
          state.act({ kind: 'life.add', delta: current.game === 'yugioh' ? -100 : -1 });
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
  // A portrait phone at a running table gets the companion instead of the mat
  // (decision 2). The board below it is INERT while it is up rather than
  // display:none: `inert` takes it out of the tab order and stops it eating
  // pointer events without disturbing a single measurement (MyBoard sizes the
  // hand from live geometry, and a hidden board would report zeroes and have to
  // re-measure on every rotation).
  const companion = mobile && portrait && room.started && !room.matchResult;
  // The companion mounts only while portrait, so its tab has to be owned by
  // something that outlives a rotation - otherwise glancing at the board and
  // turning back drops you on the log in the middle of a conversation.
  const [companionPane, setCompanionPane] = useState<'log' | 'chat'>('log');
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
      /* Top strip docked into the desktop title bar: everything anchored below
         the strip (rail, dock, cues) rises to the top edge - see
         --pc-strip-clear in table.css. */
      data-chrome-docked={chromeDocked || undefined}
      /* Zeroes the rail's width and the gutter every board clears for it, in
         one place - see --pc-rail-w / --pc-rail-clear. */
      data-rail={railCollapsed ? 'hidden' : undefined}
      style={{
        ['--pc-card-back' as string]: tableCardBack,
        ['--pc-card-back-edge' as string]: cardBackEdge,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="tableFelt" aria-hidden />

      {/* The live board is landscape-shaped, so a phone held portrait gets the
          companion instead of a cramped mat: life for every seat, the turn, the
          roster, the log, chat and the way out, with the rotate ask as the
          headline (docs/mobile-orientation.md, decision 2). It is a SECOND
          SCREEN, not a portrait board - the old bare cover left every control
          on the mat sitting underneath it. The lobby and the post-match screen
          were always portrait-friendly and are untouched. */}
      {companion && (
        <PortraitCompanion
          room={room}
          me={me}
          spectating={spectating}
          onLeave={leave}
          onConcede={
            me && !spectating && !me.conceded && !room.matchResult ? () => setConfirmConcede(true) : undefined
          }
          pane={companionPane}
          onPaneChange={setCompanionPane}
        />
      )}

      {/* ---- your-turn cue: edge glow + dismissable pill ---- */}
      {me && !spectating && <TurnCue room={room} meSeat={me.seat} />}

      {/* ---- top strip: room identity + controls ----
          Phones drop it once the match starts: the board owns every pixel, and
          its actions live in the dock sheet (Concede included). The lobby keeps
          it - that's where the room code gets shared around. On the Tauri
          desktop the strip never gets a row of its own: the three clusters
          portal into the title bar's slots (see titlebarDock.ts) and the board
          keeps the height a second bar would have spent. */}
      {!(mobile && room.started) &&
        (() => {
          const metaEl = (
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
          );
          const ribbonEl =
            room.started && !mobile ? <PhaseRibbon room={room} me={me} canAct={canAct} /> : null;
          const actionsEl = (
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
                    onClick={() => setGridView(!gridView, identity?.userId)}
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
          );
          // The combat card positions itself fixed at the viewport's top
          // center, so it renders at the table root either way.
          const combatEl = room.started ? <CombatPreviewCard room={room} /> : null;
          if (chromeDocked) {
            // The slots resolve one effect-tick after mount; rendering the row
            // for that frame would flash a second bar, so wait it out instead.
            if (!dockStart) return combatEl;
            return (
              <>
                {createPortal(metaEl, dockStart)}
                {ribbonEl && dockCenter ? createPortal(ribbonEl, dockCenter) : null}
                {dockEnd ? createPortal(actionsEl, dockEnd) : null}
                {combatEl}
              </>
            );
          }
          return (
            <header className="tableTop">
              {metaEl}
              {ribbonEl}
              {combatEl}
              {actionsEl}
            </header>
          );
        })()}

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

      <div className="tableMain" data-lobby={!room.started || undefined} inert={companion || undefined}>
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
            /* Magic's duel is the one seat count whose best arrangement is a
               face-off rather than a stack; the other games keep the stack. */
            data-game={room.game || 'mtg'}
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
                       SeatFrame can never move another player's cards; canAct
                       is live so COMBAT responses (choosing blockers, taking
                       damage) still work while playing from the grid. */
                    <div className="playerGridPreview">
                      {/* Grid cells draw every board upright, Arena style:
                          the 180° table-mirror is a staged-view illusion and
                          reads upside-down in a grid of small boards. */}
                      <SeatFrame room={room} player={player} me={me} canAct={canAct} onHover={handleHover} stage mirror={false} />
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

      {/* ---- the dock slot: the column a side panel portals into when it is
           docked instead of floating over the board (THE DOCK CONTRACT, see
           components/panels.css). Always rendered and deliberately bare - the
           stylesheet lays it out only once it has a child, so a table with
           nothing docked is identical to one with no slot at all. ---- */}
      <div id={TABLE_DOCK_ID} className="tableDock" />

      {/* ---- right dock: scrollable table cards over persistent navigation ---- */}
      <SidePanel
        room={room}
        me={me}
        spectating={spectating}
        meId={identity?.userId}
        onFocusSeat={setPinnedSeat}
        onPingPlayer={pingPlayer}
        pingCooling={pingCooling}
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
          inert={companion || undefined}
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
        <div className="mobileHistory" inert={companion || undefined}>
          <TimelineCard floating />
        </div>
      )}
      {mobile && room.started && (
        <div className="mobileTurnDock" inert={companion || undefined}>
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
      {me && !spectating && !replay.active && <TriggerPrompts room={room} me={me} />}
      {me && !spectating && !replay.active && <DiscardPrompts room={room} me={me} />}
      {me && !spectating && !replay.active && <PriorityPrompt room={room} me={me} />}
      {me && !spectating && !replay.active && <TargetPicker room={room} me={me} />}
      {preMatch && <PreMatch room={room} onClose={() => setPreMatch(false)} />}
      {/* Combat v3: target picker, defender response, resolved breakdown. */}
      {/* Spectators see the result too; controls inside are gated to players. */}
      <PostMatch room={room} meId={identity?.userId} spectating={spectating} onLeave={leave} />
      <RollBanner />
      {/* Match events + engine resolutions as toasts, spectators included -
          replay scrubbing excepted (its log is history, not news). */}
      {!replay.active && <EventToasts />}
      <TablePresence meId={identity?.userId} active={room.started && !spectating} />
      {/* Drawn pointing arrows. Spectators watch them too - a spectator who
          cannot see who is pointing where is missing half the table talk. */}
      {room.started && !replay.active && <AimLayer meId={identity?.userId} />}
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
  // Opens at the finger and measures itself to stay on screen - see
  // menuAnchor.ts for what the hand-rolled clamp got wrong.
  const anchor = useMenuAnchor<HTMLDivElement>(menu.x, menu.y);
  const [sub, setSub] = useState<'counter' | 'attach' | 'move' | 'give' | 'pile' | 'pileOnto' | null>(null);
  const [customCounter, setCustomCounter] = useState('');
  // Yu-Gi-Oh renames the shared gestures in its own vocabulary: tapping is
  // battle position, playing face-down is Setting.
  const menuGame = useGame((state) => state.room?.game) ?? 'mtg';
  const marks = useGame((state) => state.room?.marks);
  const yugioh = menuGame === 'yugioh';
  // The command slot is the Extra Deck in Yu-Gi-Oh (and the Legend tray in
  // Cyberpunk): name it whatever this game calls it.
  const cmdLabel = menuGame === 'mtg' ? t('tblCommand') : zoneLabel(menuGame, 'command');
  // Yu-Gi-Oh placements take the next EMPTY zone of the right kind, so a second
  // trap lands beside the first instead of on top of it. Field Spells have
  // their own zone; monsters overflow into the Extra Monster Zones.
  const ygoSpot = (kinds: YugiohCellKind[]) =>
    placeInYugiohField({ kinds, cards: me.battlefield, excludeIid: menu.iid });
  const monsterSpot = () => ygoSpot(['monster', 'extraMonster']);
  const backrowSpot = () => ygoSpot(isYugiohFieldSpell(card?.scryfallId) ? ['field'] : ['spell']);

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
            ? cmdLabel
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
      ref={anchor.ref}
      className="cardMenu"
      /* Decision 7: press-and-hold gives a card PREVIEW plus an action column,
         both at the touch point. The attribute is the whole switch - one DOM,
         one component, and table.css decides whether the preview is a pane
         beside the actions (the phone composition, either orientation) or the
         thumbnail in the header it has always been. A rotation therefore
         changes a layout, never a tree (decision 6). */
      data-preview={card ? '' : undefined}
      style={anchor.style}
      role="menu"
      aria-label={card?.name || 'Card'}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {card && (
        /* aria-hidden: the menu is already labelled with the card's name and
           the header repeats it in text, so this is decoration to a reader.
           `fluid` hands the size to CSS, which is what lets one pane be a
           readable card on a phone and nothing at all on a desktop. */
        <div className="menuCardPreview" aria-hidden>
          <GameCard
            name={card.name}
            imageUrl={cardArt}
            faceDown={card.faceDown}
            foil={isFoilInst(card)}
            tilt={0}
            fluid
          />
        </div>
      )}
      {/* role="none": the actions keep their `menuitem` relationship to the
          menu across this wrapper, which exists so the column can scroll on its
          own while the preview stays put beside it. */}
      <div className="menuActions" role="none">
      <div className="menuCardHeader">
        {cardArt ? (
          <img className="menuCardThumb" src={cardArt} alt="" draggable={false} />
        ) : (
          <span className="menuCardThumb menuCardThumbFallback" aria-hidden><PlayingCardBlank size={16} /></span>
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
              card.tapped ? (yugioh ? 'Attack Position' : 'Untap') : yugioh ? 'Defense Position' : 'Tap',
              <RotateCw size={16} />,
              { kind: 'card.tap', iid: menu.iid, tapped: !card.tapped },
            )}
            {quick(
              card.faceDown ? (yugioh ? 'Flip face up' : 'Face up') : yugioh ? 'Set face down' : 'Face down',
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
              {(yugioh ? COUNTER_PALETTE.slice(0, 2) : COUNTER_PALETTE).map((entry) => (
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
          {hosts.length > 0 && expander(t('gpPileOnto'), <PlayingCardStack size={15} />, 'pileOnto')}
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
                  <span className="menuItemIcon" aria-hidden><PlayingCardStack size={14} /></span>
                  <span>{host.name}</span>
                </button>
              ))}
            </div>
          )}
          {pileTop &&
            item(t('gpPileTake'), <PlayingCardStack size={15} />, {
              kind: 'card.attach',
              iid: pileTop.iid,
              hostIid: null,
            })}
          {pile.length > 0 && expander(`${t('gpPile')} (${pile.length + 1})`, <PlayingCardStack size={15} />, 'pile')}
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
                  <span className="menuItemIcon" aria-hidden><PlayingCardStack size={14} /></span>
                  <span>{member.name}</span>
                </button>
              ))}
            </div>
          )}
          {card.piled &&
            item(t('gpPileLeave'), <Unlink size={15} />, { kind: 'card.attach', iid: menu.iid, hostIid: null })}
          {item(t('gpStack'), <PlayingCardStack size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
          {(() => {
            // Activated abilities read off the card's oracle text. Effects stay
            // manual (the freeform contract), so activating pays what the
            // engine can see - tap, loyalty - and announces the rest so the
            // table knows what was just used.
            const abilities = oracleFacts(card.scryfallId)?.abilities ?? [];
            if (abilities.length === 0) return null;
            return (
              <MenuSub label={t('abTitle')} icon={<Zap size={15} />}>
                {abilities.map((ability, i) => (
                  <MenuItem
                    key={i}
                    icon={ability.loyalty !== undefined ? <Crown size={14} /> : ability.tap ? <RotateCw size={14} /> : <Sparkles size={14} />}
                    onSelect={() => {
                      const act = useGame.getState().act;
                      if (ability.tap && !card.tapped) act({ kind: 'card.tap', iid: menu.iid, tapped: true });
                      if (ability.loyalty !== undefined) {
                        act({ kind: 'card.counter', iid: menu.iid, counter: 'loyalty', delta: ability.loyalty });
                      }
                      useGame.getState().sendChat(`${card.name} — ${ability.cost}: ${ability.effect}`);
                    }}
                  >
                    {ability.cost}: {ability.effect.length > 46 ? `${ability.effect.slice(0, 46)}…` : ability.effect}
                  </MenuItem>
                ))}
              </MenuSub>
            );
          })()}
          <MenuSub label={t('ctQuick')} icon={<Plus size={15} />}>
            {([
              ['+1/+1', 1, t('ctPlus'), <Plus size={14} />],
              ['+1/+1', -1, t('ctMinusP'), <Minus size={14} />],
              ['-1/-1', 1, t('ctMinus'), <Minus size={14} />],
              ['loyalty', 1, t('ctLoyaltyUp'), <Crown size={14} />],
              ['loyalty', -1, t('ctLoyaltyDown'), <Crown size={14} />],
              ['charge', 1, t('ctCharge'), <Zap size={14} />],
            ] as const).map(([counter, delta, label, icon], i) => (
              <MenuItem key={i} icon={icon} onSelect={() => useGame.getState().act({ kind: 'card.counter', iid: menu.iid, counter, delta })}>
                {label}
              </MenuItem>
            ))}
          </MenuSub>
          <MenuSub label={t('mkTitle')} icon={<Flag size={15} />}>
            {/* Pointing is the ephemeral gesture (an arrow the table watches);
                every other entry parks a marker that stays until lifted. */}
            <MenuItem icon={<ArrowRight size={14} />} onSelect={() => send({ type: 'aim', toIid: menu.iid, kind: 'point' })}>
              {t('mkPoint')}
            </MenuItem>
            {MARK_KINDS.map((kind) => {
              const active = marks?.[menu.iid]?.kind === kind;
              return (
                <MenuItem
                  key={kind}
                  icon={markIcon(kind, 14)}
                  onSelect={() =>
                    useGame.getState().act({ kind: 'mark.set', iid: menu.iid, mark: active ? null : kind })
                  }
                >
                  {t(MARK_LABEL[kind])}
                  {active ? ' ✓' : ''}
                </MenuItem>
              );
            })}
            {marks?.[menu.iid] && (
              <MenuItem icon={<X size={14} />} onSelect={() => useGame.getState().act({ kind: 'mark.set', iid: menu.iid, mark: null })}>
                {t('mkClear')}
              </MenuItem>
            )}
            {Object.keys(marks ?? {}).length > 1 && (
              <MenuItem icon={<Trash2 size={14} />} onSelect={() => useGame.getState().act({ kind: 'mark.clear' })}>
                {t('mkClearAll')}
              </MenuItem>
            )}
          </MenuSub>

          {expander('Move to', <ArrowRight size={15} />, 'move')}
          {sub === 'move' && (
            <div className="menuInset">
              {item(t('tblHand'), <PlayingCardHand size={14} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
              {item(t('tblGraveyard'), <Skull size={14} />, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
              {item(t('tblExile'), <Ban size={14} />, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
              {item(cmdLabel, <Crown size={14} />, { kind: 'card.move', iid: menu.iid, to: 'command' }, `cmd:${me.userId}`)}
              {item('Top of library', <ArrowUpToLine size={14} />, { kind: 'card.move', iid: menu.iid, to: 'library', index: 0 }, `lib:${me.userId}`)}
              {item('Bottom of library', <ArrowDownToLine size={14} />, { kind: 'card.move', iid: menu.iid, to: 'library', index: -1 }, `lib:${me.userId}`)}
            </div>
          )}
        </>
      )}
      {menu.zone === 'hand' && (
        <>
          {yugioh
            ? item(
                t('ygoSummon'),
                <Play size={15} />,
                { kind: 'card.move', iid: menu.iid, to: 'battlefield', ...monsterSpot() },
                'field:mine',
              )
            : item('Play', <Play size={15} />, { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {yugioh ? (
            <>
              {/* A Set lands face-down in ONE act (card.move carries faceDown):
                  moving face-up and flipping afterwards would broadcast the
                  card's identity to the whole table first. The defense turn is
                  a second act, but a card's rotation was never secret. */}
              <button
                type="button"
                className="menuItem"
                role="menuitem"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  moveWithArc(
                    { kind: 'card.move', iid: menu.iid, to: 'battlefield', ...monsterSpot(), faceDown: true },
                    'field:mine',
                    t('ygoSetMonster'),
                  );
                  onAction({ kind: 'card.tap', iid: menu.iid, tapped: true });
                }}
              >
                <span className="menuItemIcon" aria-hidden><EyeOff size={15} /></span>
                <span>{t('ygoSetMonster')}</span>
              </button>
              <button
                type="button"
                className="menuItem"
                role="menuitem"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() =>
                  moveWithArc(
                    { kind: 'card.move', iid: menu.iid, to: 'battlefield', ...backrowSpot(), faceDown: true },
                    'field:mine',
                    t('ygoSetBackrow'),
                  )
                }
              >
                <span className="menuItemIcon" aria-hidden><EyeOff size={15} /></span>
                <span>{t('ygoSetBackrow')}</span>
              </button>
            </>
          ) : (
            item('Play face down', <EyeOff size={15} />, { kind: 'card.face', iid: menu.iid, faceDown: true })
          )}
          {item(t('gpStack'), <PlayingCardStack size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
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
          {item(t('tblHand'), <PlayingCardHand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item('Battlefield', <Play size={15} />, { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item(t('tblExile'), <Ban size={15} />, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
          {item(t('gpStack'), <PlayingCardStack size={15} />, { kind: 'stack.push', iid: menu.iid }, 'stack')}
        </>
      )}
      {menu.zone === 'exile' && (
        <>
          {item(t('tblHand'), <PlayingCardHand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
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
          {item(`${cmdLabel} → Battlefield`, <Play size={15} />, { kind: 'cmd.cast', iid: menu.iid, x: 0.55, y: 0.55 }, 'field:mine')}
          {item(t('tblHand'), <PlayingCardHand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
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
  onPingPlayer,
  pingCooling,
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
  onPingPlayer?: (player: TablePlayer) => void;
  pingCooling?: boolean;
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
  const chat = useGame((state) => state.chat);
  const railHidden = useTableUi((state) => state.railHidden);
  const setRailHidden = useTableUi((state) => state.setRailHidden);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The phone sheet: which tab is open (null = collapsed to the handle chip).
  const [sheet, setSheet] = useState<'vitals' | 'players' | 'log' | 'chat' | null>(null);
  // The lobby's nav slot (see PregameLobby). Resolved in an effect because the
  // slot is rendered by a sibling: effects run after the whole tree commits, so
  // the node is there on the first pass.
  const [lobbyDock, setLobbyDock] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setLobbyDock(room.started ? null : document.getElementById(LOBBY_NAV_DOCK_ID));
  }, [room.started]);
  // Desktop: the chat aside slides over the board edge when opened from the
  // nav row. Messages that arrive while it is closed light an unread dot.
  const [chatOpen, setChatOpen] = useState(false);
  // ...or it docks into the board's own column instead, and the board narrows
  // to make room. Phone-safe by construction: usePanelDock never reports docked
  // under the phone composition, so this component must not re-check `mobile`.
  const chatDock = usePanelDock('chat', TABLE_DOCK_ID);
  const chatSlot = chatDock.docked ? chatDock.slot : null;
  // The log is collapsed by default and card names are starred out: a glance
  // at it must never spoil what a tutor fetched or what is about to resolve.
  const [logOpen, setLogOpen] = useState(() => {
    try { return localStorage.getItem('pc.log.open') === 'on'; } catch { return false; }
  });
  const [logSpoilers, setLogSpoilers] = useState(false);
  const toggleLog = () => {
    setLogOpen((open) => {
      try { localStorage.setItem('pc.log.open', open ? 'off' : 'on'); } catch { /* ignore */ }
      return !open;
    });
  };
  // The command palette (and anything else) can pop the chat aside open.
  useEffect(() => {
    const openChat = () => setChatOpen(true);
    window.addEventListener('pc:open-chat', openChat);
    return () => window.removeEventListener('pc:open-chat', openChat);
  }, []);
  const [chatSeen, setChatSeen] = useState(0);
  const chatVisible = chatOpen || sheet === 'chat';
  useEffect(() => {
    if (chatVisible) setChatSeen(chat.length);
  }, [chatVisible, chat.length]);
  const chatUnread = Math.max(0, chat.length - chatSeen);
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
  // Star out capitalized name runs (card names) while protecting player names
  // and structural words. The rule itself lives in logMask.ts, shared verbatim
  // with the portrait companion's log - two copies of a spoiler heuristic is
  // one copy too many.
  const maskSpoilers = (text: string): string =>
    logSpoilers ? text : maskLogNames(text, room.players.map((player) => player.username));

  const logTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const logEl = (
    <div className="sideLogCard" data-collapsed={!logOpen || undefined}>
      <div className="sideHead">
        <span className="sideHeadTitle">
          <ScrollText size={13} />
          {t('tblLog')}
        </span>
        {logOpen && (
          <Tooltip content={logSpoilers ? t('logHideNames') : t('logShowNames')}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={logSpoilers ? t('logHideNames') : t('logShowNames')}
              onClick={() => setLogSpoilers((v) => !v)}
            >
              {logSpoilers ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip content={logOpen ? t('logCollapse') : t('logExpand')}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={logOpen ? t('logCollapse') : t('logExpand')}
            onClick={toggleLog}
          >
            <ChevronRight size={14} className="logChevron" data-open={logOpen || undefined} />
          </IconButton>
        </Tooltip>
      </div>
      {logOpen && (
        <div ref={scrollRef} className="sideScroll">
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
                {maskSpoilers(line.text)}
              </p>
            ))
          )}
        </div>
      )}
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
      {/* Collapse the rail's card stack, handing its width to the mats. Only
          while there IS a stack: the lobby's rail is already nav-only, and a
          phone's rail is a bottom sheet. The pill itself never hides - it is
          what this button lives in, so there is always a way back. */}
      {!mobile && room.started && (
        <Tooltip content={railHidden ? t('tblRailShow') : t('tblRailHide')}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-pressed={railHidden}
            aria-label={railHidden ? t('tblRailShow') : t('tblRailHide')}
            onClick={() => setRailHidden(!railHidden, meId)}
          >
            {railHidden ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
          </IconButton>
        </Tooltip>
      )}
      {/* The chat's door is the floating ball in the bottom corner (ChatBall),
          not a button in this row - so there is nothing to render here. */}
      {/* The chat's own dock toggle. It lives here rather than in LobbyChat's
          header because LobbyChat is shared with the phone sheet and the lobby,
          where there is nothing to dock into - the nav is the chat's chrome at
          the table. Only while the chat is actually up, and gated on the hook's
          own answer, never on `mobile`: usePanelDock is what knows that a short
          desktop window counts as a phone. */}
      {chatOpen && !mobile && (
        <Tooltip content={chatDock.docked ? t('floatPanel') : t('dockPanel')}>
          <IconButton
            size="sm"
            variant="ghost"
            aria-pressed={chatDock.docked}
            aria-label={chatDock.docked ? t('floatPanel') : t('dockPanel')}
            onClick={() => chatDock.setMode(chatDock.docked ? 'float' : 'dock')}
          >
            {chatDock.docked ? <PictureInPicture2 size={16} /> : <PanelRight size={16} />}
          </IconButton>
        </Tooltip>
      )}
      {/* Pings live on the player rows (each name carries its own bell), and
          sharing lives in the pregame lobby - neither earns nav chrome. */}
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

  // The panel the nav's chat button opens, at the table and in the lobby alike.
  // Only its title and density differ between the two. ONE wrapper for both
  // forms: floating it is a slide-over dialog, docked it is a column of the
  // page - so the role changes with it, because a screen reader announcing a
  // permanently-open column as a dialog is a lie about what it is.
  const chatAsideEl = chatOpen ? (
    <div
      className="chatAside pcPanel"
      data-dock={chatSlot ? 'dock' : 'float'}
      role={chatSlot ? 'complementary' : 'dialog'}
      aria-label={room.started ? t('tblChat') : t('chatTitle')}
    >
      <LobbyChat variant={room.started ? 'table' : 'lobby'} onClose={() => setChatOpen(false)} />
    </div>
  ) : null;
  // Docked, it renders into the table's reserved column instead of over the
  // board - the same portal the lobby's nav has always used, one slot along.
  const chatEl = chatAsideEl && chatSlot ? createPortal(chatAsideEl, chatSlot) : chatAsideEl;

  // The chat's door: a ball in the bottom corner, with incoming lines floating
  // above it. Hidden mid-match on a phone, where the chat is a sheet tab and
  // the bottom corner belongs to the zone piles - the same condition the nav
  // button used, kept because the collision it avoids is still real.
  const chatBallEl =
    !mobile || !room.started ? (
      <ChatBall
        chat={chat}
        open={chatVisible}
        unread={chatUnread}
        onToggle={() => setChatOpen((open) => !open)}
      />
    ) : null;

  if (mobile) {
    // Pregame mirrors the desktop rail: nav only. Vitals/players/log describe a
    // match in progress, and the lobby already lists the seats itself.
    if (!room.started) {
      return (
        <>
          {/* Docked into the launch bar's corner, exactly as the desktop lobby
              does below - the slot exists so table chrome never lands on a
              lobby control, and a phone needs that more than a desktop does.
              Floating it here put the pill over the bar's trailing end: at
              812x375 it covered "Watch as spectator" from x 668 to the edge.
              The floating pill remains the fallback for the one frame before
              the slot resolves (and for a lobby that renders without one). */}
          {lobbyDock ? (
            createPortal(navEl, lobbyDock)
          ) : (
            <div className="mobileDock" data-nav-only>
              {navEl}
            </div>
          )}
          {chatEl}
          {chatBallEl}
        </>
      );
    }
    const openDefault = seated ? 'vitals' : 'players';
    const tabs = [
      ...(seated ? [{ value: 'vitals', label: t('tblLife') }] : []),
      { value: 'players', label: t('tblPlayers') },
      { value: 'log', label: t('tblLog') },
      { value: 'chat', label: t('tblChat') },
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
                    onClick={() => setSheet(tab.value as 'vitals' | 'players' | 'log' | 'chat')}
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
              {sheet === 'chat' && <LobbyChat variant="table" />}
            </div>
          </div>
        )}
      </div>
    );
  }

  // In the lobby the nav is not a floating rail: it belongs to the page, docked
  // into the launch bar's corner where the layout has reserved room for it.
  // PregameLobby renders the slot; both mount in the same commit, so the node
  // exists by the time this effect runs.
  if (!room.started) {
    return (
      <>
        {lobbyDock ? createPortal(navEl, lobbyDock) : null}
        {chatEl}
        {chatBallEl}
      </>
    );
  }

  return (
    <>
      <aside className="tableSide" data-nav-only={railHidden || undefined}>
        {!railHidden && (
          <div className="tableSideScroll">
            {vitalsEl}
            {playersEl}
            {logEl}
          </div>
        )}
        {navEl}
      </aside>
      {chatEl}
      {chatBallEl}
    </>
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
  // Squelch state is module-level; a local tick re-renders the toggles.
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
            // The key to the colour code: this seat's hue is the same one its
            // cursor, its pointing arrows and its table markers all wear.
            style={{ ['--pc-seat-color' as string]: seatColor(player.seat) }}
          >
            <span className="playerSeatDot" aria-hidden />
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
                {(room.game ?? 'mtg') === 'mtg' && <ManaPoolReadout mana={player.mana} />}
                <span className="playerStat" title={t('tblHand')}>
                  {player.handCount}
                </span>
              </span>
            </div>
            {isMe && (
              <Menu
                aria-label={t('emWheel')}
                placement="bottom-end"
                trigger={
                  <IconButton
                    className="playerPing"
                    size="sm"
                    variant="ghost"
                    aria-label={t('emWheel')}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Smile size={13} />
                  </IconButton>
                }
              >
                {(['emGreetings', 'emWellPlayed', 'emWow', 'emThinking', 'emOops', 'emThreaten'] as const).map(
                  (key) => (
                    <MenuItem key={key} onSelect={() => useGame.getState().sendChat(t(key))}>
                      {t(key)}
                    </MenuItem>
                  ),
                )}
              </Menu>
            )}
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
