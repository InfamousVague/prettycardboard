import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertDialog, Avatar, Button, Input, Kbd, Menu, MenuItem, Pill, Text, Size, StatusDot, TextTone, Tooltip, useToast } from '@glacier/react';
import { Copy, Crown, Eye, Flag, Heart, Link2, LogOut, ScrollText, Settings, Skull, Sparkles, Swords, UserPlus, Zap } from '@glacier/icons';
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
import { GameTag } from '../components/GameTag.tsx';
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
import { LibrarySidebar } from './table/LibrarySidebar.tsx';
import { PostMatch } from './table/PostMatch.tsx';
import { PreMatch } from './table/PreMatch.tsx';
import { TimelineCard } from './table/TimelineCard.tsx';
import { TurnCue } from './table/TurnCue.tsx';
import { flightAnchor, flyCard } from './table/juice.ts';
import { onStatus, send } from '../net/ws.ts';
import { DEFAULT_PREFERENCES, loadPreferences } from '../preferences.ts';
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
  const start = useGame((state) => state.start);
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
  const prevStarted = useRef<boolean | null>(null);
  // Tracks the last hovered card for the tap/flip/clone hotkeys.
  const hoverRef = useRef<CardInst | null>(null);
  const handleHover = (card: CardInst | null) => {
    hoverRef.current = card;
  };
  // The active game's keybinds resolved to a code->action lookup. Kept in a ref
  // so the keydown handler (mounted once) reads the current map without
  // re-subscribing on every rebind or game switch.
  const bindingsRef = useRef<Map<string, ActionId>>(new Map());

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
      // A fresh deal starts with an empty floating-mana pool (it is a local,
      // per-phase aid; carrying a stale pool into a new game would be wrong).
      useTableUi.getState().clearMana();
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
      if (!action) return;
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

      const guard = KEYBIND_DEF[action].guard;
      if (guard === 'myTurn' && current.activeSeat !== seatMe!.seat) return;
      if (guard === 'hoveredMine' && mine == null) return;
      if (guard === 'hoveredToken' && (mine == null || !mine.isToken)) return;
      if (guard === 'combat' && current.combat == null) return;

      event.preventDefault();
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

  if (!room) return null;

  const me = room.players.find((player) => player.userId === identity?.userId);
  const others = room.players.filter((player) => player.userId !== identity?.userId);
  const isHost = room.hostUserId === identity?.userId;
  // Online friends not already seated here: invite them straight into this table.
  const onlineFriends = friends.filter(
    (friend) => friend.online && !room.players.some((player) => player.userId === friend.userId),
  );
  const canAct = !spectating && me != null && room.started && !replay.active;

  // Seats flow clockwise from mine so the table reads like a real one.
  const seatCount = Math.max(1, room.players.length);
  const clockwise = (player: TablePlayer) => {
    const from = me?.seat ?? 0;
    return (((player.seat - from) % seatCount) + seatCount) % seatCount;
  };
  const orderedOthers = [...others].sort((a, b) => clockwise(a) - clockwise(b));

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
          <GameTag game={room.game} />
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
          <CmdDamageBar room={room} meId={me?.userId} />
        </div>
        {room.started && <PhaseRibbon room={room} me={me} canAct={canAct} />}
        <div className="tableTopActions">
          <Tooltip content={t('tblShareHint')}>
            <Button size="sm" variant="soft" onClick={shareInvite}>
              <Link2 size={15} /> <span className="ttActionLabel">{t('tblShare')}</span>
            </Button>
          </Tooltip>
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
          {isHost && !room.started && !spectating && (
            <Button size="sm" onClick={start}>
              <Sparkles size={15} /> <span className="ttActionLabel">{t('tblStart')}</span>
            </Button>
          )}
          {room.started && me && !spectating && !me.conceded && !room.matchResult && (
            <Tooltip content={t('tblConcede')}>
              <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}>
                <Flag size={15} /> <span className="ttActionLabel">{t('tblConcede')}</span>
              </Button>
            </Tooltip>
          )}
          <Tooltip content={t('setTitle')}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('setTitle')}
              onClick={() => window.dispatchEvent(new CustomEvent('pc:open-settings'))}
            >
              <Settings size={15} />
            </Button>
          </Tooltip>
          <Tooltip content={t('tblLeave')}>
            <Button size="sm" variant="ghost" onClick={leave}>
              <LogOut size={15} /> <span className="ttActionLabel">{t('tblLeave')}</span>
            </Button>
          </Tooltip>
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

      <div className="tableMain">
        {/* ---- pre-start: every seat, hosting controls ---- */}
        {!room.started && (
          <div
            className="tableOpponents"
            data-count={orderedOthers.length}
            data-rows={orderedOthers.length > 3 ? 2 : 1}
          >
            {orderedOthers.map((player) => (
              <SeatFrame
                key={player.userId}
                room={room}
                player={player}
                me={me}
                canAct={canAct}
                onHover={handleHover}
              />
            ))}
            {orderedOthers.length === 0 && (
              <div className="tableWaiting">
                <Text tone={TextTone.Muted}>{t('tblWaiting')}</Text>
                <Text size={Size.Small} tone={TextTone.Subtle}>
                  {t('tblShareBlurb')}
                </Text>
                <Button size="sm" onClick={shareInvite}>
                  <Link2 size={15} /> {t('tblShare')}
                </Button>
                <Text size={Size.XSmall} tone={TextTone.Subtle}>
                  {t('tblCode')}: <Kbd>{room.code}</Kbd>
                </Text>
              </div>
            )}
          </div>
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
        {me && !spectating && (!room.started || stagedIsMe) && (
          <MyBoard me={me} room={room} onMenu={openMenu} onHover={handleHover} />
        )}
        {spectating && me == null && !stagedPlayer && <div className="tableSpectatorSpace" />}

        {/* ---- the shared stack, floating center ---- */}
        <StackTray room={room} canAct={canAct} />
      </div>

      {/* ---- right dock: life + players + log, stacked cards ---- */}
      <SidePanel
        room={room}
        me={me}
        spectating={spectating}
        meId={identity?.userId}
        onFocusSeat={setPinnedSeat}
      />

      {/* ---- context menu ---- */}
      {menu && me && !spectating && (
        <CardMenu
          menu={menu}
          me={me}
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
    </div>
  );
}

/* ================= context menu ================= */

const COUNTER_PALETTE: { label: string; counter: string; delta: number }[] = [
  { label: '+1/+1', counter: '+1/+1', delta: 1 },
  { label: '-1/-1', counter: '+1/+1', delta: -1 },
  { label: 'Loyalty', counter: 'loyalty', delta: 1 },
  { label: 'Charge', counter: 'charge', delta: 1 },
];

function CardMenu({
  menu,
  me,
  onAction,
  onClose,
}: {
  menu: Menu;
  me: TablePlayer;
  onAction: (action: AnyAction) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [sub, setSub] = useState<'counter' | 'attach' | null>(null);
  const [customCounter, setCustomCounter] = useState('');

  const card =
    me.battlefield.find((c) => c.iid === menu.iid) ??
    me.hand?.find((c) => c.iid === menu.iid) ??
    me.graveyard.find((c) => c.iid === menu.iid) ??
    me.exile.find((c) => c.iid === menu.iid) ??
    me.command.find((c) => c.iid === menu.iid);

  const hosts = me.battlefield.filter((c) => c.iid !== menu.iid && !c.attachedTo);

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

  const item = (label: string, action: AnyAction, anchorKey?: string | null) => (
    <button
      type="button"
      className="menuItem"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => (anchorKey !== undefined ? moveWithArc(action, anchorKey) : onAction(action))}
    >
      {label}
    </button>
  );

  const expander = (label: string, key: 'counter' | 'attach') => (
    <button
      type="button"
      className="menuItem menuExpander"
      data-open={sub === key || undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setSub(sub === key ? null : key)}
    >
      {label}
    </button>
  );

  return (
    <div
      className="cardMenu"
      style={{ left: Math.min(menu.x, window.innerWidth - 224), top: Math.min(menu.y, window.innerHeight - 420) }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {menu.zone === 'battlefield' && card && (
        <>
          {item(card.tapped ? 'Untap' : 'Tap', { kind: 'card.tap', iid: menu.iid, tapped: !card.tapped })}
          {item(card.faceDown ? 'Turn face up' : 'Turn face down', { kind: 'card.face', iid: menu.iid, faceDown: !card.faceDown })}
          {expander('Add counter…', 'counter')}
          {sub === 'counter' && (
            <div className="menuInset">
              {COUNTER_PALETTE.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="menuItem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onAction({ kind: 'card.counter', iid: menu.iid, counter: entry.counter, delta: entry.delta })}
                >
                  {entry.label}
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
                <Button size="sm" type="submit" variant="soft">
                  +
                </Button>
              </form>
            </div>
          )}
          {hosts.length > 0 && expander('Attach to…', 'attach')}
          {sub === 'attach' && (
            <div className="menuInset menuScroll">
              {hosts.map((host) => (
                <button
                  key={host.iid}
                  type="button"
                  className="menuItem"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onAction({ kind: 'card.attach', iid: menu.iid, hostIid: host.iid })}
                >
                  {host.name}
                </button>
              ))}
            </div>
          )}
          {card.attachedTo && item('Detach', { kind: 'card.attach', iid: menu.iid, hostIid: null })}
          {item(`→ ${t('gpStack')}`, { kind: 'stack.push', iid: menu.iid }, 'stack')}
          {item('Clone token', { kind: 'token.clone', iid: menu.iid, x: Math.min(0.95, card.x + 0.06), y: card.y })}
          <hr className="menuRule" />
          {item(`→ ${t('tblHand')}`, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item(`→ ${t('tblGraveyard')}`, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
          {item(`→ ${t('tblExile')}`, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
          {item(`→ ${t('tblCommand')}`, { kind: 'card.move', iid: menu.iid, to: 'command' }, `cmd:${me.userId}`)}
          {item('→ Top of library', { kind: 'card.move', iid: menu.iid, to: 'library', index: 0 }, `lib:${me.userId}`)}
          {item('→ Bottom of library', { kind: 'card.move', iid: menu.iid, to: 'library', index: -1 }, `lib:${me.userId}`)}
        </>
      )}
      {menu.zone === 'hand' && (
        <>
          {item('Play', { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item('Play face down', { kind: 'card.face', iid: menu.iid, faceDown: true })}
          {item(`→ ${t('gpStack')}`, { kind: 'stack.push', iid: menu.iid }, 'stack')}
          {item(`→ ${t('tblGraveyard')}`, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
          {item('→ Top of library', { kind: 'card.move', iid: menu.iid, to: 'library', index: 0 }, `lib:${me.userId}`)}
          {item(t('gpRevealCard'), { kind: 'reveal.card', iid: menu.iid })}
          {item(t('gpRevealHand'), { kind: 'reveal.hand' })}
        </>
      )}
      {menu.zone === 'graveyard' && (
        <>
          {item(`→ ${t('tblHand')}`, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item('→ Battlefield', { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item(`→ ${t('tblExile')}`, { kind: 'card.move', iid: menu.iid, to: 'exile' }, `exile:${me.userId}`)}
          {item(`→ ${t('gpStack')}`, { kind: 'stack.push', iid: menu.iid }, 'stack')}
        </>
      )}
      {menu.zone === 'exile' && (
        <>
          {item(`→ ${t('tblHand')}`, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
          {item('→ Battlefield', { kind: 'card.move', iid: menu.iid, to: 'battlefield', x: 0.5, y: 0.55 }, 'field:mine')}
          {item(`→ ${t('tblGraveyard')}`, { kind: 'card.move', iid: menu.iid, to: 'graveyard' }, `grave:${me.userId}`)}
        </>
      )}
      {menu.zone === 'command' && card && (
        <>
          {item(`${t('tblCommand')} → Battlefield`, { kind: 'cmd.cast', iid: menu.iid, x: 0.55, y: 0.55 }, 'field:mine')}
          {item(`→ ${t('tblHand')}`, { kind: 'card.move', iid: menu.iid, to: 'hand' }, 'hand:mine')}
        </>
      )}
      <hr className="menuRule" />
      <button
        type="button"
        className="menuItem"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onClose}
      >
        {t('cpClose')}
      </button>
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
}: {
  room: RoomState;
  me?: TablePlayer;
  spectating?: boolean;
  meId?: string;
  onFocusSeat?: (seat: number) => void;
}) {
  const t = useT();
  const log = useGame((state) => state.log);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the newest entry.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [log.length]);

  return (
    <aside className="tableSide">
      {room.started && me && !spectating && <Vitals me={me} room={room} />}
      {room.started && me && !spectating && room.game === 'cyberpunk' && (
        <CyberpunkDicePanel me={me} others={room.players.filter((p) => p.userId !== me.userId)} />
      )}
      {room.started && me && !spectating && <TimelineCard />}
      <PlayersCard room={room} meId={meId} onFocusSeat={onFocusSeat} />

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

/**
 * Topbar read-out of every player currently taking commander damage: one chip
 * per player with a nonzero total, so the whole table's commander-damage state
 * is visible at a glance without a per-seat button on the felt.
 */
function CmdDamageBar({ room, meId }: { room: RoomState; meId?: string }) {
  const t = useT();
  if (room.format !== 'commander' || !room.started) return null;
  const chips = room.players
    .map((player) => ({ player, ...cmdDamageSummary(player, room) }))
    .filter((chip) => chip.max > 0);
  if (chips.length === 0) return null;
  return (
    <div className="cmdBar" aria-label={t('tblCmdDamage')}>
      {chips.map(({ player, max, rows }) => (
        <Tooltip
          key={player.userId}
          content={`${player.username} — ${rows.map((row) => `${row.from} ${row.amount}`).join(' · ')}`}
        >
          <span
            className="cmdBarChip"
            data-lethal={max >= 21 || undefined}
            data-me={player.userId === meId || undefined}
          >
            <Swords size={11} />
            <span className="cmdBarName">{player.username}</span>
            {max}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function PlayersCard({
  room,
  meId,
  onFocusSeat,
}: {
  room: RoomState;
  meId?: string;
  onFocusSeat?: (seat: number) => void;
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
                {room.format === 'commander' && (() => {
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
                <span className="playerStat" title={t('tblHand')}>
                  {player.handCount}
                </span>
              </span>
            </div>
            {active && <span className="playerTurnDot" aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}
