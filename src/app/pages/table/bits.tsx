import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { AlertDialog, Menu, MenuItem, MenuSub, Tooltip } from '@glacier/react';
import { Ban, Crown, Skull, Swords } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, CombatState, RoomState, TablePlayer, Zone } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { useLongPress, menuEventFrom } from '../../hooks/useLongPress.ts';
import { flyFromAnchor, flightAnchor, setFlightAnchor } from './juice.ts';

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

/** Counter badges with a readable initial: "+3" for +1/+1, "L2" for loyalty... */
export function CounterBadges({ card }: { card: CardInst }) {
  const entries = Object.entries(card.counters).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  const label = (kind: string, count: number) => {
    if (kind === '+1/+1') return `+${count}`;
    if (kind === '-1/-1') return `-${count}`;
    return `${kind.charAt(0).toUpperCase()}${count}`;
  };
  return (
    <span className="counterBadges">
      {entries.map(([kind, count]) => (
        <span key={kind} className="counterBadge" title={kind}>
          {label(kind, count)}
        </span>
      ))}
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

export function ZonePiles({
  player,
  mine,
  big,
  canAct,
  onMenu,
  onHover,
  onDragOut,
  dragSuppressed,
  dropHint,
}: {
  player: TablePlayer;
  mine?: boolean;
  /** Full-size piles for a staged opponent (a mirror of my own board). */
  big?: boolean;
  /** Seated, started, not spectating - gates every affordance. */
  canAct?: boolean;
  onMenu?: (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => void;
  onHover?: (card: CardInst | null) => void;
  /** Start dragging the pile's top card back out onto the board (my piles). */
  onDragOut?: (event: ReactPointerEvent, card: CardInst, zone: 'graveyard' | 'exile') => void;
  /** True right after a drag/long-press so the pile's click (open viewer) is suppressed. */
  dragSuppressed?: () => boolean;
  /** The zone a card is currently being dragged over, for a drop-target ring. */
  dropHint?: Zone | null;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();
  const setPileView = useTableUi((state) => state.setPileView);
  const setLibIntent = useTableUi((state) => state.setLibIntent);
  const cardScale = useTableUi((state) => state.cardScale);
  const [confirmShuffle, setConfirmShuffle] = useState(false);
  const [libMenuOpen, setLibMenuOpen] = useState(false);

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
    <div className="zonePile" data-drop={dropHint === 'library' || undefined} title={`${t('tblLibrary')}: ${player.libraryCount}`}>
      <LibraryStack count={player.libraryCount} width={width} userId={player.userId} />
      <span className="pileCount">{player.libraryCount}</span>
    </div>
  );

  return (
    <div className="zonePiles" data-mine={mine || undefined}>
      {/* library: mine opens the actions menu, theirs is a plain pile */}
      {interactive ? (
        <>
          <Menu
            aria-label={t('tblLibrary')}
            placement="top-start"
            open={libMenuOpen}
            onOpenChange={setLibMenuOpen}
            trigger={
              <span className="pileTrigger">
                <button
                  type="button"
                  className="pileBtn"
                  aria-label={`${t('tblLibrary')} — ${t('tblDraw')} 1`}
                  title={`${t('tblDraw')} 1`}
                  onClick={(event) => {
                    // Left-click draws; stop the click from reaching the Menu
                    // trigger (which would otherwise toggle the menu open).
                    event.stopPropagation();
                    drawOne();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setLibMenuOpen(true);
                  }}
                  onPointerDown={libLongPress.onPointerDown}
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
            description={`${t('tblLibrary')}: ${player.libraryCount}`}
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

      {/* graveyard */}
      <button
        type="button"
        className="pileBtn zonePile"
        data-drop={dropHint === 'graveyard' || undefined}
        title={t('tblGraveyard')}
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
          <span className="pileLabel">{t('tblGraveyard')}</span>
          <span className="pileCount">{player.graveyard.length}</span>
        </span>
      </button>

      {/* exile */}
      <button
        type="button"
        className="pileBtn zonePile"
        data-drop={dropHint === 'exile' || undefined}
        title={t('tblExile')}
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
          <span className="pileLabel">{t('tblExile')}</span>
          <span className="pileCount">{player.exile.length}</span>
        </span>
      </button>

      {/* command zone */}
      <div className="zonePile zoneCommand" data-drop={dropHint === 'command' || undefined} title={t('tblCommand')} ref={(el) => setFlightAnchor(`cmd:${player.userId}`, el)}>
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
          />
        ))}
        {player.command.length === 0 && <div className="pileEmpty" style={{ width }} />}
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
}: {
  card: CardInst;
  tax: number;
  width: number;
  interactive: boolean;
  userId: string;
  onMenu?: (event: ReactPointerEvent | React.MouseEvent, iid: string, zone: Zone) => void;
  onHover?: (card: CardInst | null) => void;
}) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();

  // Touch has no right-click; press-and-hold opens the commander's menu.
  const longPress = useLongPress((info) => {
    if (interactive && onMenu) onMenu(menuEventFrom(info), card.iid, 'command');
  });

  return (
    <div
      className="cmdCard"
      onPointerEnter={() => onHover?.(card)}
      onPointerDown={interactive ? longPress.onPointerDown : undefined}
      onPointerMove={interactive ? longPress.onPointerMove : undefined}
      onPointerUp={interactive ? longPress.onPointerUp : undefined}
      onPointerLeave={(event) => {
        onHover?.(null);
        longPress.onPointerLeave(event);
      }}
      onClickCapture={longPress.onClickCapture}
      onContextMenu={interactive && onMenu ? (event) => onMenu(event, card.iid, 'command') : undefined}
    >
      <Tooltip content={tax > 0 ? `${t('gpCmdTax')}: ${tax}` : card.name}>
        <div>
          <GameCard
            name={card.name}
            imageUrl={card.imageUrl || cardImage(card.scryfallId)}
            width={width}
            foil
            tilt={0}
            onClick={
              interactive
                ? () => {
                    act({ kind: 'cmd.cast', iid: card.iid, x: 0.55, y: 0.55 });
                    flyFromAnchor(`cmd:${userId}`, flightAnchor('field:mine'), {
                      imageUrl: card.imageUrl || cardImage(card.scryfallId),
                      width: 92,
                    });
                  }
                : () => popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl })
            }
          />
        </div>
      </Tooltip>
      <TaxBadge value={tax} />
    </div>
  );
}
