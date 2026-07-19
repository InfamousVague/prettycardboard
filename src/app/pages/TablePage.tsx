import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertDialog, Avatar, Button, IconButton, Input, Kbd, Pill, Text, Size, TextTone, Tooltip, useToast } from '@glacier/react';
import { Copy, Crown, Eye, Flag, Heart, Link2, LogOut, ScrollText, Skull, Sparkles, Users, Zap } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import { cardImage } from '../data/cards.ts';
import { tableShareUrl } from '../data/pendingJoin.ts';
import { GameCard } from '../components/GameCard.tsx';
import type { CardInst, GameAction, GameActionV2, RoomState, TablePlayer, Zone } from '../net/types.ts';
import { useTableUi } from './table/tableUi.ts';
import { MyBoard } from './table/MyBoard.tsx';
import { SeatFrame } from './table/SeatFrame.tsx';
import { PhaseRibbon } from './table/PhaseRibbon.tsx';
import { StackTray } from './table/StackTray.tsx';
import { CmdChoiceDialog, LibraryViewer, MulliganOverlay, PileViewer, RollBanner } from './table/overlays.tsx';
import { AttackTargetModal, CombatResultsModal, DefenseModal, DefenseReturnChip } from './table/CombatModals.tsx';
import { PostMatch } from './table/PostMatch.tsx';
import { PreMatch } from './table/PreMatch.tsx';
import { TurnCue } from './table/TurnCue.tsx';
import { flightAnchor, flyCard } from './table/juice.ts';
import { onStatus, send } from '../net/ws.ts';
import { loadPreferences } from '../preferences.ts';
import { BotPicker } from './table/BotPicker.tsx';
import { MiniBoard } from './table/MiniBoard.tsx';
import { installTableShims } from './table/shims.ts';
import './table/table.css';

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
  const room = useGame((state) => state.room);
  const spectating = useGame((state) => state.spectating);
  const act = useGame((state) => state.act);
  const leave = useGame((state) => state.leave);
  const start = useGame((state) => state.start);

  const [menu, setMenu] = useState<Menu | null>(null);
  const [pinnedSeat, setPinnedSeat] = useState<number | null>(null);
  const [preview, setPreview] = useState<CardInst | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);
  // The matchup splash: only for the false->true start transition witnessed
  // live (a reload into a running game skips straight to the table).
  const [preMatch, setPreMatch] = useState(false);
  const prevStarted = useRef<boolean | null>(null);
  // The dock keeps showing the LAST hovered card; the live hover (nullable)
  // only matters for the T-to-tap hotkey.
  const hoverRef = useRef<CardInst | null>(null);
  const handleHover = (card: CardInst | null) => {
    hoverRef.current = card;
    if (card) setPreview(card);
  };

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
      if (ui.attackPick) ui.setAttackPick(null);
      if (ui.defenseHidden) ui.setDefenseHidden(false);
    }
  }, [combatActive]);

  // Mirror my playmat choice into the room (the felt wears the active
  // player's mat), on join and whenever preferences change.
  const roomId = room?.roomId;
  useEffect(() => {
    if (!roomId || spectating) return;
    const share = () => send({ type: 'playmat.set', id: loadPreferences().playmat });
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
    if (prevStarted.current === false && startedNow === true) setPreMatch(true);
    prevStarted.current = startedNow;
  }, [startedNow]);

  // Combat always stages the ACTIVE seat (the attacker): my own board when I
  // attack (declare attackers there), the opponent's when I defend (click an
  // attacker to assign a blocker). Clearing any manual pin makes it follow.
  const combatOn = room?.combat != null;
  useEffect(() => {
    if (combatOn) setPinnedSeat(null);
  }, [combatOn]);

  // Keyboard: Space passes the turn; T taps the hovered battlefield card.
  // Both ignore typing surfaces, menus/dialogs, and focused controls.

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const isSpace = event.code === 'Space';
      const isTap = event.key === 't' || event.key === 'T';
      if (!isSpace && !isTap) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"]')) return;
      if (isSpace && target?.closest('button')) return;
      const state = useGame.getState();
      const current = state.room;
      const seatMe = current?.players.find((player) => player.userId === useApp.getState().identity?.userId);
      if (!current?.started || current.matchResult || state.spectating || seatMe == null) return;
      if (isSpace) {
        if (current.activeSeat !== seatMe.seat) return;
        event.preventDefault();
        state.act({ kind: 'turn.pass' });
        return;
      }
      const hovered = hoverRef.current;
      const mine = hovered && seatMe.battlefield.find((card) => card.iid === hovered.iid);
      if (!mine) return;
      event.preventDefault();
      state.act({ kind: 'card.tap', iid: mine.iid, tapped: !mine.tapped });
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
  const canAct = !spectating && me != null && room.started;

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
    <div className="table" onContextMenu={(event) => event.preventDefault()}>
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
          <Tooltip content={t('tblShareHint')}>
            <Button size="sm" variant="soft" onClick={shareInvite}>
              <Link2 size={15} /> {t('tblShare')}
            </Button>
          </Tooltip>
          {isHost && !room.started && !spectating && room.players.length < room.seats && (
            <BotPicker compact />
          )}
          {isHost && !room.started && !spectating && (
            <Button size="sm" onClick={start}>
              <Sparkles size={15} /> {t('tblStart')}
            </Button>
          )}
          {room.started && me && !spectating && !me.conceded && !room.matchResult && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmConcede(true)}>
              <Flag size={15} /> {t('tblConcede')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={leave}>
            <LogOut size={15} /> {t('tblLeave')}
          </Button>
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
                onDamageMe={(delta) => me && act({ kind: 'cmd.damage', fromSeat: player.seat, delta })}
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
                {isHost && !spectating && room.players.length < room.seats && <BotPicker />}
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
              onDamageMe={(delta) => me && act({ kind: 'cmd.damage', fromSeat: stagedPlayer.seat, delta })}
              stage
            />
          </div>
        )}

        {/* ---- my board: the stage when it's mine, a hand strip otherwise ---- */}
        {me && !spectating && (
          <MyBoard me={me} room={room} onMenu={openMenu} onHover={handleHover} hideField={room.started && !stagedIsMe} />
        )}
        {spectating && me == null && !stagedPlayer && <div className="tableSpectatorSpace" />}

        {/* ---- the shared stack, floating center ---- */}
        <StackTray room={room} canAct={canAct} />
      </div>

      {/* ---- right dock: players + log ---- */}
      <SidePanel preview={preview} room={room} meId={identity?.userId} stagedSeat={stagedSeat} onFocusSeat={setPinnedSeat} />

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
      <LibraryViewer />
      <PileViewer room={room} me={me} canAct={!spectating && me != null} />
      {me && !spectating && !preMatch && <MulliganOverlay room={room} me={me} />}
      {me && !spectating && <CmdChoiceDialog me={me} />}
      {preMatch && <PreMatch room={room} onClose={() => setPreMatch(false)} />}
      {/* Combat v3: target picker, defender response, resolved breakdown. */}
      {me && !spectating && <AttackTargetModal room={room} me={me} />}
      {me && !spectating && <DefenseModal room={room} me={me} />}
      {me && !spectating && <DefenseReturnChip room={room} me={me} />}
      <CombatResultsModal room={room} />
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
          {item('Reveal hand', { kind: 'reveal.hand' })}
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
  preview,
  room,
  meId,
  stagedSeat,
  onFocusSeat,
}: {
  preview: CardInst | null;
  room: RoomState;
  meId?: string;
  stagedSeat?: number | null;
  onFocusSeat?: (seat: number) => void;
}) {
  const t = useT();
  const log = useGame((state) => state.log);
  const [showLog, setShowLog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the log pinned to the newest entry while it is open.
  useEffect(() => {
    if (showLog) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [log.length, showLog]);

  const markers = room.markers ?? {};
  const players = [...room.players].sort((a, b) => a.seat - b.seat);

  return (
    <aside className="tableSide">
      <div className="sidePreview" data-empty={!preview || undefined}>
        {preview && (
          <GameCard
            name={preview.name}
            imageUrl={preview.faceDown ? undefined : preview.imageUrl || cardImage(preview.scryfallId)}
            faceDown={preview.faceDown}
            width={200}
            tilt={0}
          />
        )}
      </div>

      <div className="sideHead">
        <span className="sideHeadTitle">
          <Users size={13} />
          {showLog ? t('tblLog') : t('tblPlayers')}
        </span>
        <Tooltip content={t('tblLog')}>
          <IconButton
            variant={showLog ? 'soft' : 'ghost'}
            size="sm"
            aria-label={t('tblLog')}
            aria-pressed={showLog}
            data-active={showLog || undefined}
            onClick={() => setShowLog((open) => !open)}
          >
            <ScrollText size={16} />
          </IconButton>
        </Tooltip>
      </div>

      {showLog ? (
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
      ) : (
        <div className="sidePlayers">
          {room.started && stagedSeat != null && (
            <div className="miniBoards">
              {players
                .filter((player) => player.seat !== stagedSeat)
                .map((player) => (
                  <MiniBoard
                    key={player.userId}
                    player={player}
                    active={room.activeSeat === player.seat}
                    onStage={() => onFocusSeat?.(player.seat)}
                  />
                ))}
            </div>
          )}
          {players.map((player) => {
            const active = room.started && room.activeSeat === player.seat;
            const isMe = player.userId === meId;
            const isHost = room.hostUserId === player.userId;
            const focusable = room.started && !isMe;
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
      )}
    </aside>
  );
}
