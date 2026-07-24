import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { AlertDialog, Avatar, Button, IconButton, Input, Kbd, Menu, MenuItem, Pill, Text, Size, StatusDot, TextTone, Tooltip, useToast } from '@glacier/react';
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
  Link2,
  LogOut,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  ScrollText,
  Send,
  Settings,
  Skull,
  Swords,
  Unlink,
  UserPlus,
  X,
  Zap,
} from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { cardImage } from '../data/cards.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { useEdgeColor } from '../data/edgeColor.ts';
import { tableShareUrl } from '../data/pendingJoin.ts';
import { usePreference } from '../hooks/usePreference.ts';
import { resolveKeybinds, KEYBIND_DEF, type ActionId } from '../data/keybinds.ts';
import type { GameId } from '../data/games.ts';
import { GameCard } from '../components/GameCard.tsx';
import { ManaPoolReadout } from '../components/Mana.tsx';
import type { CardInst, GameAction, GameActionV2, RoomState, TablePlayer, Zone } from '../net/types.ts';
import { useTableUi } from './table/tableUi.ts';
import { MyBoard } from './table/MyBoard.tsx';
import { Vitals } from './table/Vitals.tsx';
import { SeatFrame } from './table/SeatFrame.tsx';
import { OpponentHand } from './table/OpponentHand.tsx';
import { CyberpunkDicePanel } from './table/CyberpunkDicePanel.tsx';
import { PhaseRibbon } from './table/PhaseRibbon.tsx';
import { StackTray } from './table/StackTray.tsx';
import { CmdChoiceDialog, LibraryViewer, MulliganOverlay, PileViewer, RollBanner } from './table/overlays.tsx';
import { TablePresence } from './table/TablePresence.tsx';
import { LibrarySidebar } from './table/LibrarySidebar.tsx';
import { PostMatch } from './table/PostMatch.tsx';
import { PreMatch } from './table/PreMatch.tsx';
import { PregameLobby } from './table/PregameLobby.tsx';
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
  const keybinds = usePreference('keybinds');
  const cardBackSrc = cardBackUrl(effectiveCardBack(cardBackPref, room?.game));
  const tableCardBack = `url("${cardBackSrc}")`;
  // The 3D library pile's cut edge wears the top card's own border colour,
  // sampled from that back, so a deck's stack no longer reads as generic brown.
  const cardBackEdge = useEdgeColor(cardBackSrc);
  const friends = useApp((state) => state.friends.friends);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [pinnedSeat, setPinnedSeat] = useState<number | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);
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
  }, [identity?.userId]);

  // Combat selections cannot outlive combat.
  const combatActive = room?.combat != null;
  useEffect(() => {
    if (!combatActive) {
      const ui = useTableUi.getState();
      if (ui.blockerIid) ui.setBlocker(null);
    }
  }, [combatActive]);

  // Mirror my playmat choice and turn-automation settings into the room (the
  // felt wears the active player's mat; the server honors my auto untap/draw at
  // my turn), on join and whenever preferences change.
  const roomId = room?.roomId;
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

  useEffect(() => {
    if (!roomId || spectating) return;
    const share = () => {
      const prefs = loadPreferences();
      send({ type: 'playmat.set', id: prefs.playmat });
      send({ type: 'cardback.set', id: prefs.cardBack });
      send({ type: 'auto.set', untap: prefs.autoUntap, draw: prefs.autoDraw });
    };
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
  }, [roomId, spectating]);

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
      style={{
        ['--pc-card-back' as string]: tableCardBack,
        ['--pc-card-back-edge' as string]: cardBackEdge,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="tableFelt" aria-hidden />

      {/* ---- your-turn cue: edge glow + dismissable pill ---- */}
      {me && !spectating && <TurnCue room={room} meSeat={me.seat} />}

      {/* ---- top strip: room identity + controls ---- */}
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
        {room.started && <PhaseRibbon room={room} me={me} canAct={canAct} />}
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
          {room.started && me && !spectating && !me.conceded && !room.matchResult && (
            <Tooltip content={t('tblConcede')}>
              <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}>
                <Flag size={15} /> <span className="ttActionLabel">{t('tblConcede')}</span>
              </Button>
            </Tooltip>
          )}
        </div>
      </header>

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
        {!room.started && (
          <PregameLobby room={room} me={me} spectating={spectating} isHost={isHost} onShare={shareInvite} />
        )}

        {/* ---- started: the active (or pinned) board owns the stage ---- */}
        {room.started && stagedPlayer && !stagedIsMe && (
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
        {room.started && stagedPlayer && !stagedIsMe && !spectating && (
          <OpponentHand key={`hand-${stagedPlayer.userId}`} player={stagedPlayer} />
        )}

        {/* Watching another player's board (their turn, or you clicked their
            seat): a floating cue to jump back to your own. */}
        {room.started && stagedPlayer && !stagedIsMe && !spectating && me && (
          <div className="spectateCue" role="status" data-mirror={mirrorOpponent || undefined}>
            <Eye size={15} aria-hidden />
            <span className="spectateCueText">
              {t('tblSpectating')} · <b>{stagedPlayer.username}</b>
            </span>
            <Button size="sm" variant="soft" onClick={() => setPinnedSeat(me.seat)}>
              {t('tblViewMyBoard')}
            </Button>
          </div>
        )}

        {/* ---- my board: only while it owns the stage. Looking at someone
             else's playmat hides my hand/deck/piles entirely. ---- */}
        {me && !spectating && room.started && stagedIsMe && (
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
      />

      {/* ---- context menu ---- */}
      {menu && me && !spectating && (
        <CardMenu
          menu={menu}
          me={me}
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
  recipients,
  onAction,
  onClose,
}: {
  menu: Menu;
  me: TablePlayer;
  recipients: { userId: string; username: string }[];
  onAction: (action: AnyAction) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [sub, setSub] = useState<'counter' | 'attach' | 'move' | 'give' | null>(null);
  const [customCounter, setCustomCounter] = useState('');

  const card =
    me.battlefield.find((c) => c.iid === menu.iid) ??
    me.hand?.find((c) => c.iid === menu.iid) ??
    me.graveyard.find((c) => c.iid === menu.iid) ??
    me.exile.find((c) => c.iid === menu.iid) ??
    me.command.find((c) => c.iid === menu.iid);

  const hosts = me.battlefield.filter((c) => c.iid !== menu.iid && !c.attachedTo);
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

  /** Fire the action, arcing a clone from the card toward its destination pile. */
  const moveWithArc = (action: AnyAction, anchorKey: string | null) => {
    if (menu.rect && card) {
      const target =
        (anchorKey ? flightAnchor(anchorKey) : null) ??
        new DOMRect(window.innerWidth / 2 - 46, window.innerHeight * 0.3, 92, 128);
      flyCard(menu.rect, target, {
        imageUrl: card.faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId),
        faceDown: card.faceDown,
      });
    }
    onAction(action);
  };

  const item = (label: string, icon: ReactNode, action: AnyAction, anchorKey?: string | null) => (
    <button
      type="button"
      className="menuItem"
      role="menuitem"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => (anchorKey !== undefined ? moveWithArc(action, anchorKey) : onAction(action))}
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
      onClick={() => (anchorKey !== undefined ? moveWithArc(action, anchorKey) : onAction(action))}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  const expander = (label: string, icon: ReactNode, key: 'counter' | 'attach' | 'move' | 'give') => (
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
                  onClick={() => onAction({ kind: 'card.attach', iid: menu.iid, hostIid: host.iid })}
                >
                  <span className="menuItemIcon" aria-hidden><Paperclip size={14} /></span>
                  <span>{host.name}</span>
                </button>
              ))}
            </div>
          )}
          {card.attachedTo && item('Detach', <Unlink size={15} />, { kind: 'card.attach', iid: menu.iid, hostIid: null })}
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
          {item(`${t('tblCommand')} → Battlefield`, <Play size={15} />, { kind: 'cmd.cast', iid: menu.iid, x: 0.55, y: 0.55 }, 'field:mine')}
          {item(t('tblHand'), <Hand size={15} />, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {(me.commanderTax?.[menu.iid] ?? 0) > 0 &&
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
}) {
  const t = useT();
  const log = useGame((state) => state.log);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the newest entry.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [log.length]);

  return (
    <aside className="tableSide" data-nav-only={!room.started || undefined}>
      {room.started && (
        <div className="tableSideScroll">
          {me && !spectating && <Vitals me={me} room={room} />}
          {me && !spectating && room.game === 'cyberpunk' && (
            <CyberpunkDicePanel me={me} others={room.players.filter((p) => p.userId !== me.userId)} />
          )}
          {me && !spectating && <TimelineCard />}
          <PlayersCard
            room={room}
            meId={meId}
            onFocusSeat={onFocusSeat}
            onPingPlayer={onPingPlayer}
            pingCooling={pingCooling}
          />

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
        </div>
      )}

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
        <Tooltip content={t('tblLeave')}>
          <IconButton size="sm" variant="ghost" aria-label={t('tblLeave')} onClick={onLeave}>
            <LogOut size={16} />
          </IconButton>
        </Tooltip>
      </nav>
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
