import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertDialog, Button, IconButton, Input, Menu, MenuItem, MenuSub, NumberInput, Popover } from '@glacier/react';
import { Ban, Crown, Plus, Skull, SlidersHorizontal, Swords, Trash2 } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { zoneLabel } from '../../data/games.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, CombatState, MatPos, MatZone, RoomState, TablePlayer, Zone } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { useLongPress, menuEventFrom } from '../../hooks/useLongPress.ts';
import { flyFromAnchor, flightAnchor, setFlightAnchor } from './juice.ts';
import { formatPtCounter, parsePtCounter, ptCounterModifier } from './boardModes.ts';

/**
 * Split a battlefield into hosts and their attachments. Attached cards render
 * tucked under their host (down-right, z below, slightly scaled) and follow
 * its position. An attachment whose host vanished renders as a normal card.
 */
export function groupAttachments(cards: CardInst[]): {
  hosts: CardInst[];
  attachments: Map<string, CardInst[]>;
} {
  const byIid = new Map(cards.map((card) => [card.iid, card]));
  const attachments = new Map<string, CardInst[]>();
  const hosts: CardInst[] = [];
  for (const card of cards) {
    if (card.attachedTo && byIid.has(card.attachedTo)) {
      const list = attachments.get(card.attachedTo) ?? [];
      list.push(card);
      attachments.set(card.attachedTo, list);
    } else {
      hosts.push(card);
    }
  }
  return { hosts, attachments };
}

/**
 * The library as a physical object on the mat: a 3D pile of sleeved card
 * backs whose thickness tracks how many cards remain (approximate on
 * purpose - one visible layer per dozen or so cards). The top card carries
 * the flight anchor so draws still lift off the pile.
 */
function LibraryStack({ count, width, userId }: { count: number; width: number; userId: string }) {
  const height = Math.round(width * (680 / 488));
  const layers = count <= 0 ? 0 : Math.min(9, 1 + Math.ceil(count / 12));
  const step = Math.max(1, Math.round(width * 0.024));
  if (count <= 0) {
    return (
      <div ref={(el) => setFlightAnchor(`lib:${userId}`, el)}>
        <div className="pileEmpty" style={{ width }} />
      </div>
    );
  }
  // The container is exactly one card tall; the under-layers grow UPWARD out of
  // it (overflow visible) so the front card's bottom edge lines up with the
  // graveyard/exile piles beside it.
  return (
    <div className="libStack" style={{ width, height }}>
      <div className="libStack3d">
        {Array.from({ length: layers }, (_, index) => {
          const depth = layers - index; // painted back-to-front
          return (
            <span
              key={index}
              className="libLayer"
              style={{
                transform: `translate3d(${depth * step}px, ${depth * -step}px, ${depth * -3}px)`,
                filter: `brightness(${Math.max(0.35, 0.78 - depth * 0.06)})`,
              }}
              aria-hidden
            />
          );
        })}
        <div className="libTop" ref={(el) => setFlightAnchor(`lib:${userId}`, el)} />
      </div>
    </div>
  );
}

/** Find a battlefield card anywhere on the table (blocker thumbs, pairings). */
export function findFieldCard(room: RoomState, iid: string): CardInst | undefined {
  for (const player of room.players) {
    const hit = player.battlefield.find((card) => card.iid === iid);
    if (hit) return hit;
  }
  return undefined;
}

/** A card's counter editor, portalled by Glacier Popover: a labelled list of
 * active counters with steppers plus a compact add row. Counter keys that parse
 * as P/T modifiers (`+1/+1`, `+1/+6`) are summed independently for combat. */
function CounterManager({ card, onSet }: { card: CardInst; onSet: (counter: string, value: number) => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const entries = Object.entries(card.counters)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => Number(parsePtCounter(right) != null) - Number(parsePtCounter(left) != null) || left.localeCompare(right));
  const ptEntries = entries.filter(([kind]) => parsePtCounter(kind) != null);
  const others = entries.filter(([kind]) => parsePtCounter(kind) == null);
  const pt = ptCounterModifier(card.counters);

  const add = (kind: string) => {
    const trimmed = kind.trim();
    if (trimmed) onSet(trimmed, (card.counters[trimmed] ?? 0) + 1);
  };

  // Both P/T sides collapse into one canonical counter (e.g. "+1/+6"); editing
  // a side rewrites that single counter and clears any other P/T keys.
  const setPt = (power: number, toughness: number) => {
    const p = Math.trunc(Math.min(99, Math.max(-99, power)));
    const tuf = Math.trunc(Math.min(99, Math.max(-99, toughness)));
    const key = formatPtCounter(p, tuf);
    for (const [kind] of ptEntries) if (kind !== key) onSet(kind, 0);
    onSet(key, p === 0 && tuf === 0 ? 0 : 1);
  };

  return (
    <div className="counterManager" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="counterManagerHead">
        <SlidersHorizontal size={15} aria-hidden />
        <strong>{t('gpManageCounters')}</strong>
      </div>

      <div className="counterManagerSection">
        <span className="counterManagerLabel">{t('gpActiveCounters')}</span>
        {entries.length > 0 ? (
          <div className="counterManagerList">
            {ptEntries.length > 0 && (
              <div className="counterPtRow">
                <span className="counterManagerLabel">{t('gpPowerToughness')}</span>
                <div className="counterPtControls">
                  <div className="counterPtInputs">
                    <NumberInput
                      size="sm"
                      min={-99}
                      max={99}
                      value={pt.power}
                      aria-label={t('gpPowerModifier')}
                      onValueChange={(value) => Number.isFinite(value) && setPt(value, pt.toughness)}
                    />
                    <span className="counterPtSlash" aria-hidden>/</span>
                    <NumberInput
                      size="sm"
                      min={-99}
                      max={99}
                      value={pt.toughness}
                      aria-label={t('gpToughnessModifier')}
                      onValueChange={(value) => Number.isFinite(value) && setPt(pt.power, value)}
                    />
                  </div>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    aria-label={t('gpRemoveCounter').replace('{name}', t('gpPowerToughness'))}
                    onClick={() => setPt(0, 0)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
            )}
            {others.map(([kind, count]) => (
              <div key={kind} className="counterManagerRow">
                <span className="counterManagerName" title={kind}>{kind}</span>
                <NumberInput
                  size="sm"
                  min={0}
                  max={999}
                  value={count}
                  aria-label={`${kind}: ${t('gpCounterQuantity')}`}
                  onValueChange={(value) => Number.isFinite(value) && onSet(kind, Math.trunc(value))}
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t('gpRemoveCounter').replace('{name}', kind)}
                  onClick={() => onSet(kind, 0)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="counterManagerEmpty">{t('gpNoCounters')}</p>
        )}
      </div>

      <div className="counterManagerSection">
        <span className="counterManagerLabel">{t('gpAddCounter')}</span>
        <div className="counterQuickAdds">
          {['+1/+1', '-1/-1'].map((kind) => (
            <Button key={kind} size="sm" variant="soft" onClick={() => add(kind)}>
              {kind}
            </Button>
          ))}
        </div>
        <form
          className="counterNamedAdd"
          onSubmit={(event) => {
            event.preventDefault();
            add(name);
            setName('');
          }}
        >
          <Input
            size="sm"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('gpCounterNameHint')}
            aria-label={t('gpCounterName')}
          />
          <IconButton size="sm" type="submit" variant="soft" disabled={!name.trim()} aria-label={t('gpAddCounter')}>
            <Plus size={14} />
          </IconButton>
        </form>
      </div>
    </div>
  );
}

export function CounterBadges({
  card,
  onSet,
}: {
  card: CardInst;
  onSet?: (counter: string, value: number) => void;
}) {
  const t = useT();
  const entries = Object.entries(card.counters).filter(([, count]) => count > 0);
  const pt = ptCounterModifier(card.counters);
  const others = entries.filter(([kind]) => parsePtCounter(kind) == null);
  const hasPt = pt.power !== 0 || pt.toughness !== 0;
  if (!onSet && !hasPt && others.length === 0) return null;
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const badges = (
    <>
      {hasPt && (
        <span
          className="counterPill"
          data-tone={pt.power < 0 || pt.toughness < 0 ? 'debuff' : 'buff'}
          title={entries.filter(([kind]) => parsePtCounter(kind) != null).map(([kind, count]) => `${kind} × ${count}`).join(' · ')}
        >
          {sign(pt.power)} <span className="counterPillSlash">/</span> {sign(pt.toughness)}
        </span>
      )}
      {others.map(([kind, count]) => (
        <span key={kind} className="counterBadge" title={`${kind}: ${count}`}>
          {`${kind.charAt(0).toUpperCase()}${count}`}
        </span>
      ))}
      {!hasPt && others.length === 0 && <Plus className="counterEmptyPlus" size={13} aria-hidden />}
    </>
  );

  if (!onSet) return <span className="counterBadges">{badges}</span>;
  return (
    <span className="counterBadges" data-empty={entries.length === 0 || undefined}>
      <Popover
        className="counterPopover"
        placement="right-start"
        aria-label={t('gpManageCounters')}
        trigger={
          <button
            type="button"
            className="counterManagerTrigger"
            aria-label={t('gpManageCounters')}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {badges}
          </button>
        }
      >
        <CounterManager card={card} onSet={onSet} />
      </Popover>
    </span>
  );
}

/** Red attacker badge; renders on any card the table sees attacking. */
export function AttackBadge({ defenderName }: { defenderName?: string }) {
  return (
    <span className="attackBadge" title={defenderName}>
      <Swords size={11} />
    </span>
  );
}

/**
 * Blocker thumbs clustered beneath an attacker (no arrows, by design). Click
 * a thumb to break that pairing (combat.block toggles).
 */
export function BlockCluster({
  attackerIid,
  combat,
  room,
  canAct,
}: {
  attackerIid: string;
  combat: CombatState;
  room: RoomState;
  canAct: boolean;
}) {
  const act = useGame((state) => state.act);
  const blocks = combat.blocks.filter((block) => block.attackerIid === attackerIid);
  if (blocks.length === 0) return null;
  return (
    <span className="blockCluster">
      {blocks.map((block) => {
        const blocker = findFieldCard(room, block.blockerIid);
        return (
          <button
            key={block.blockerIid}
            type="button"
            className="blockThumb"
            title={blocker?.name}
            disabled={!canAct}
            onClick={(event) => {
              event.stopPropagation();
              act({ kind: 'combat.block', blockerIid: block.blockerIid, attackerIid });
            }}
          >
            {blocker && !blocker.faceDown && (blocker.imageUrl || cardImage(blocker.scryfallId)) ? (
              <img src={blocker.imageUrl || cardImage(blocker.scryfallId)} alt={blocker.name} draggable={false} />
            ) : (
              <span className="blockThumbBack" />
            )}
          </button>
        );
      })}
    </span>
  );
}

/** Commander tax chip shown on command-zone cards. */
export function TaxBadge({ value }: { value: number }) {
  const t = useT();
  if (value <= 0) return null;
  return (
    <span className="taxBadge">
      <Crown size={10} /> {t('gpCmdTax')} {value}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Zone piles: library / graveyard / exile / command                         */
/* ------------------------------------------------------------------------ */

/** The pile zones a player can reposition, in DOM order. */
export const MAT_ZONES: MatZone[] = ['library', 'graveyard', 'exile', 'command'];

/** Fallback pile centers when a layout names only some zones (mirrors the
 * default bottom-left strip). */
export const DEFAULT_MAT_LAYOUT: Record<MatZone, MatPos> = {
  library: { x: 0.055, y: 0.84 },
  graveyard: { x: 0.135, y: 0.84 },
  exile: { x: 0.215, y: 0.84 },
  command: { x: 0.3, y: 0.84 },
};

export function ZonePiles({
  player,
  mine,
  big,
  mat,
  canAct,
  onMenu,
  onHover,
  onDragOut,
  dragSuppressed,
  dropHint,
  layout,
  editing,
  onPileGrab,
}: {
  player: TablePlayer;
  mine?: boolean;
  /** Full-size piles for a staged opponent (a mirror of my own board). */
  big?: boolean;
  /** Cyberpunk mat mode: each pile is tagged (data-zone) so CSS can place it in
   * the mat quadrants (Deck/Trash right rail, Legends/Eddies bottom tray). */
  mat?: boolean;
  /** Seated, started, not spectating - gates every affordance. */
  canAct?: boolean;
  onMenu?: (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => void;
  onHover?: (card: CardInst | null) => void;
  /** Start dragging the pile's top card out onto the board (my piles). For the
   * library the card is a face-down placeholder — the server plays the real top
   * card, since the client never holds the hidden library. */
  onDragOut?: (event: ReactPointerEvent, card: CardInst, zone: 'graveyard' | 'exile' | 'library' | 'command') => void;
  /** True right after a drag/long-press so the pile's click (open viewer) is suppressed. */
  dragSuppressed?: () => boolean;
  /** The zone a card is currently being dragged over, for a drop-target ring. */
  dropHint?: Zone | null;
  /** Custom pile placement (mat editor): normalized centers by logical zone.
   * Any entry switches the piles to free placement over the board. */
  layout?: Partial<Record<MatZone, MatPos>>;
  /** Mat-edit mode: piles become drag handles and their own affordances mute. */
  editing?: boolean;
  onPileGrab?: (event: ReactPointerEvent, zone: MatZone) => void;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();
  const setPileView = useTableUi((state) => state.setPileView);
  const setLibIntent = useTableUi((state) => state.setLibIntent);
  const cardScale = useTableUi((state) => state.cardScale);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [libMenuOpen, setLibMenuOpen] = useState(false);
  // Zone rail labels are game-driven: MTG keeps its localized strings, Cyberpunk
  // relabels the physical slots (Deck / Trash / Eddies / Legend) from the registry.
  const gameId = useGame((state) => state.room?.game);
  const cyber = gameId === 'cyberpunk';
  const libLabel = cyber ? zoneLabel(gameId, 'library') : t('tblLibrary');
  const graveLabel = cyber ? zoneLabel(gameId, 'graveyard') : t('tblGraveyard');
  const exileLabel = cyber ? zoneLabel(gameId, 'exile') : t('tblExile');
  const cmdLabel = cyber ? zoneLabel(gameId, 'command') : t('tblCommand');

  const graveTop = player.graveyard[player.graveyard.length - 1];
  const exileTop = player.exile[player.exile.length - 1];
  // My own piles (and a staged opponent's mirror) ride the card-scale
  // preference; compact everywhere else.
  const width = mine || big ? Math.round(96 * cardScale) : 44;
  const emptyIcon = Math.max(16, Math.round(width * 0.34));
  const interactive = mine && canAct;

  // Touch has no right-click, so press-and-hold opens the zone card's menu.
  const graveLongPress = useLongPress((info) => {
    if (interactive && onMenu && graveTop) onMenu(menuEventFrom(info), graveTop.iid, 'graveyard');
  });
  // Library: left-click draws; right-click (or hold on touch) opens the menu.
  const libLongPress = useLongPress(() => setLibMenuOpen(true));

  const drawOne = () => {
    act({ kind: 'draw', count: 1 });
    flyFromAnchor(`lib:${player.userId}`, flightAnchor('hand:mine'), { faceDown: true, flip: true, width: 92 });
  };

  const libraryPile = (
    <div className="zonePile" data-drop={dropHint === 'library' || undefined} title={`${libLabel}: ${player.libraryCount}`}>
      <LibraryStack count={player.libraryCount} width={width} userId={player.userId} />
      <span className="pileCount">{player.libraryCount}</span>
    </div>
  );

  // Free placement (mat editor): each pile rides a .pileSlot wrapper that both
  // the Cyberpunk grid (data-zone slot names) and the custom layout target. The
  // wrapper - not the pile - is positioned, so pile internals stay untouched.
  const custom = !mat && (editing || Object.keys(layout ?? {}).length > 0);
  const slotProps = (zone: MatZone, slot: string) => {
    const pos = custom ? (layout?.[zone] ?? DEFAULT_MAT_LAYOUT[zone]) : undefined;
    return {
      className: 'pileSlot',
      'data-zone': slot,
      'data-mat-zone': zone,
      style: pos
        ? { position: 'absolute' as const, left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, transform: 'translate(-50%, -50%)' }
        : undefined,
      onPointerDown: editing && onPileGrab ? (event: ReactPointerEvent) => onPileGrab(event, zone) : undefined,
    };
  };

  return (
    <div
      className="zonePiles"
      data-mine={mine || undefined}
      data-mat={mat || undefined}
      data-custom={custom || undefined}
      data-editing={editing || undefined}
    >
      {/* library: mine opens the actions menu, theirs is a plain pile */}
      <div {...slotProps('library', 'deck')}>
      {interactive ? (
        <>
          <Menu
            aria-label={libLabel}
            placement="top-start"
            open={libMenuOpen}
            onOpenChange={setLibMenuOpen}
            trigger={
              <span className="pileTrigger">
                <button
                  type="button"
                  className="pileBtn"
                  aria-label={`${libLabel} — ${t('tblDraw')} 1`}
                  title={`${t('tblDraw')} 1`}
                  onClick={(event) => {
                    // Left-click draws; stop the click from reaching the Menu
                    // trigger (which would otherwise toggle the menu open). A drag
                    // just happened → it played the top card, so don't also draw.
                    event.stopPropagation();
                    if (dragSuppressed?.()) return;
                    drawOne();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setLibMenuOpen(true);
                  }}
                  onPointerDown={(event) => {
                    libLongPress.onPointerDown(event);
                    // Drag off the top of the deck to play it onto the felt.
                    if (onDragOut) {
                      onDragOut(
                        event,
                        { iid: `libtop:${player.userId}`, name: '', imageUrl: '', tapped: false, faceDown: true, counters: {}, x: 0, y: 0, isToken: false },
                        'library',
                      );
                    }
                  }}
                  onPointerMove={libLongPress.onPointerMove}
                  onPointerUp={libLongPress.onPointerUp}
                  onPointerLeave={libLongPress.onPointerLeave}
                  onClickCapture={libLongPress.onClickCapture}
                >
                  {libraryPile}
                </button>
              </span>
            }
          >
            <MenuItem onSelect={drawOne}>{`${t('tblDraw')} 1`}</MenuItem>
            <MenuSub label={t('gpPeek')}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                <MenuItem
                  key={count}
                  onSelect={() => {
                    setLibIntent('peek');
                    act({ kind: 'library.peek', count });
                  }}
                >
                  {count}
                </MenuItem>
              ))}
            </MenuSub>
            <MenuItem
              onSelect={() => {
                setLibIntent('search');
                act({ kind: 'library.search' });
              }}
            >
              {t('gpSearchLib')}
            </MenuItem>
            <MenuSub label={t('gpRevealTop')}>
              {[1, 2, 3, 4, 5].map((count) => (
                <MenuItem key={count} onSelect={() => act({ kind: 'library.reveal', count })}>
                  {count}
                </MenuItem>
              ))}
            </MenuSub>
            <MenuItem onSelect={() => setConfirmShuffle(true)}>{t('tblShuffle')}</MenuItem>
            <MenuItem onSelect={() => act({ kind: 'mulligan' })}>{t('tblMulligan')}</MenuItem>
          </Menu>
          <AlertDialog
            open={confirmShuffle}
            onClose={() => setConfirmShuffle(false)}
            title={t('tblShuffle')}
            description={`${libLabel}: ${player.libraryCount}`}
            actionLabel={t('tblShuffle')}
            cancelLabel={t('dbCancel')}
            dismissible
            onAction={() => {
              act({ kind: 'shuffle' });
              setConfirmShuffle(false);
            }}
          />
        </>
      ) : (
        libraryPile
      )}
      </div>

      {/* graveyard */}
      <div {...slotProps('graveyard', 'trash')}>
      <button
        type="button"
        className="pileBtn zonePile"
        data-drop={dropHint === 'graveyard' || undefined}
        title={graveLabel}
        onClick={() => {
          // A drag/long-press just happened - don't also open the viewer.
          if (dragSuppressed?.()) return;
          if (player.graveyard.length > 0) setPileView({ userId: player.userId, zone: 'graveyard' });
        }}
        onClickCapture={graveLongPress.onClickCapture}
        onContextMenu={interactive && onMenu && graveTop ? (event) => onMenu(event, graveTop.iid, 'graveyard') : undefined}
        onPointerDown={
          interactive
            ? (event) => {
                graveLongPress.onPointerDown(event);
                if (graveTop && onDragOut) onDragOut(event, graveTop, 'graveyard');
              }
            : undefined
        }
        onPointerMove={interactive ? graveLongPress.onPointerMove : undefined}
        onPointerUp={interactive ? graveLongPress.onPointerUp : undefined}
        onPointerEnter={() => graveTop && onHover?.(graveTop)}
        onPointerLeave={(event) => {
          onHover?.(null);
          graveLongPress.onPointerLeave(event);
        }}
      >
        <div ref={(el) => setFlightAnchor(`grave:${player.userId}`, el)}>
          {graveTop ? (
            <GameCard name={graveTop.name} imageUrl={graveTop.imageUrl || cardImage(graveTop.scryfallId)} width={width} tilt={0} />
          ) : (
            <div className="pileEmpty pileEmptyIcon" style={{ width }}>
              <Skull size={emptyIcon} />
            </div>
          )}
        </div>
        <span className="pileCaption">
          <span className="pileLabel">{graveLabel}</span>
          <span className="pileCount">{player.graveyard.length}</span>
        </span>
      </button>
      </div>

      {/* exile */}
      <div {...slotProps('exile', 'eddies')}>
      <button
        type="button"
        className="pileBtn zonePile"
        data-drop={dropHint === 'exile' || undefined}
        title={exileLabel}
        onClick={() => {
          if (dragSuppressed?.()) return;
          if (player.exile.length > 0) setPileView({ userId: player.userId, zone: 'exile' });
        }}
        onContextMenu={interactive && onMenu && exileTop ? (event) => onMenu(event, exileTop.iid, 'exile') : undefined}
        onPointerDown={interactive && exileTop && onDragOut ? (event) => onDragOut(event, exileTop, 'exile') : undefined}
        onPointerEnter={() => exileTop && onHover?.(exileTop)}
        onPointerLeave={() => onHover?.(null)}
      >
        <div ref={(el) => setFlightAnchor(`exile:${player.userId}`, el)}>
          {exileTop ? (
            <GameCard name={exileTop.name} imageUrl={exileTop.imageUrl || cardImage(exileTop.scryfallId)} width={width} tilt={0} />
          ) : (
            <div className="pileEmpty pileEmptyIcon" style={{ width }}>
              <Ban size={emptyIcon} />
            </div>
          )}
        </div>
        <span className="pileCaption">
          <span className="pileLabel">{exileLabel}</span>
          <span className="pileCount">{player.exile.length}</span>
        </span>
      </button>
      </div>

      {/* command zone */}
      <div {...slotProps('command', 'legends')}>
      <div className="zonePile zoneCommand" data-drop={dropHint === 'command' || undefined} title={cmdLabel} ref={(el) => setFlightAnchor(`cmd:${player.userId}`, el)}>
        {player.command.map((card) => (
          <CmdCard
            key={card.iid}
            card={card}
            tax={player.commanderTax?.[card.iid] ?? 0}
            width={width}
            interactive={!!interactive}
            userId={player.userId}
            onMenu={onMenu}
            onHover={onHover}
            // Cyberpunk Legends live in their tray and are Called in place, never
            // dragged onto the felt - MTG commanders drag out to cast.
            onDragOut={mat ? undefined : onDragOut}
            dragSuppressed={dragSuppressed}
          />
        ))}
        {player.command.length === 0 && <div className="pileEmpty" style={{ width }} />}
      </div>
      </div>
    </div>
  );
}

function CmdCard({
  card,
  tax,
  width,
  interactive,
  userId,
  onMenu,
  onHover,
  onDragOut,
  dragSuppressed,
}: {
  card: CardInst;
  tax: number;
  width: number;
  interactive: boolean;
  userId: string;
  onMenu?: (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => void;
  onHover?: (card: CardInst | null) => void;
  onDragOut?: (event: ReactPointerEvent, card: CardInst, zone: 'graveyard' | 'exile' | 'library' | 'command') => void;
  /** True right after a drag, so the post-drag click doesn't ALSO preview/cast. */
  dragSuppressed?: () => boolean;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();

  // Touch has no right-click; press-and-hold opens the commander's menu.
  const longPress = useLongPress((info) => {
    if (interactive && onMenu) onMenu(menuEventFrom(info), card.iid, 'command');
  });

  const preview = () => popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
  const cast = () => {
    act({ kind: 'cmd.cast', iid: card.iid, x: 0.55, y: 0.55 });
    flyFromAnchor(`cmd:${userId}`, flightAnchor('field:mine'), {
      imageUrl: card.imageUrl || cardImage(card.scryfallId),
      width: 92,
    });
  };

  // A single click PREVIEWS the commander (like every other card); casting it is
  // a deliberate double-click (or a drag onto the field). We hold the click for a
  // moment so a double-click can cancel the preview and cast instead.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  // The commander can be cast (unmounting this card) with the preview timer
  // still pending - never let it fire after unmount.
  useEffect(() => clearClick, []);
  // A face-down Legend is hidden info even from its owner; single-click Calls it
  // (flips it face-up to reveal). A face-up commander/Legend previews on click.
  const call = () => act({ kind: 'card.face', iid: card.iid, faceDown: false });
  const onClick = () => {
    // A drag-to-cast just ended: the browser still fires a click at the
    // pointer-captured card - don't ALSO preview (or Call) it.
    if (dragSuppressed?.()) return;
    if (card.faceDown) {
      if (interactive) call();
      return;
    }
    if (!interactive) {
      preview();
      return;
    }
    if (clickTimer.current) return; // second click of a double — dblclick handles it
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      preview();
    }, 220);
  };

  return (
    <div
      className="cmdCard"
      onPointerEnter={() => onHover?.(card)}
      onPointerDown={
        interactive
          ? (event) => {
              longPress.onPointerDown(event);
              // Arm a drag-to-cast alongside the long-press; the 6px threshold
              // keeps clicks/double-clicks working (face-down Legends stay put).
              if (!card.faceDown) onDragOut?.(event, card, 'command');
            }
          : undefined
      }
      onPointerMove={interactive ? longPress.onPointerMove : undefined}
      onPointerUp={interactive ? longPress.onPointerUp : undefined}
      onPointerLeave={(event) => {
        onHover?.(null);
        longPress.onPointerLeave(event);
      }}
      onClickCapture={longPress.onClickCapture}
      onDoubleClick={
        interactive && !card.faceDown
          ? () => {
              clearClick();
              cast();
            }
          : undefined
      }
      onContextMenu={interactive && onMenu ? (event) => onMenu(event, card.iid, 'command') : undefined}
    >
      {/* No name tooltip — the hover preview (HoverCardLayer) shows a face-up
          card on rest; a face-down Legend wears the card back (hidden info until
          Called). Commander tax stays on the badge below. */}
      <GameCard
        name={card.name}
        imageUrl={card.imageUrl || cardImage(card.scryfallId)}
        faceDown={card.faceDown}
        width={width}
        foil
        onClick={onClick}
      />
      <TaxBadge value={tax} />
    </div>
  );
}
