import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Reorder, motion } from 'motion/react';
import {
  AlertDialog,
  Button,
  Modal,
  ScrollArea,
  SearchField,
  Text,
  Size,
  TextTone,
} from '@glacier/react';
import { ArrowDownToLine, ArrowUpToLine, Dices, Hand as HandIcon, Shuffle, Sparkles } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, RoomState, TablePlayer, Zone } from '../../net/types.ts';
import { formatFor } from '../../data/formats.ts';
import { useTableUi } from './tableUi.ts';
import { flyToAnchor } from './juice.ts';

/**
 * The table's modal moments: private library windows (peek with drag-reorder
 * and send-to-bottom, search with filter and fetch-to-hand), public pile
 * browsers, the opening-hand mulligan flow, the commander-return prompt, and
 * a transient banner for dice results.
 */

const ZONE_KEYS: Partial<Record<Zone, 'tblLibrary' | 'tblHand' | 'tblGraveyard' | 'tblExile' | 'tblCommand'>> = {
  library: 'tblLibrary',
  hand: 'tblHand',
  graveyard: 'tblGraveyard',
  exile: 'tblExile',
  command: 'tblCommand',
};

/* ------------------------------------------------------------------------ */
/* Library viewer (peek + search)                                            */
/* ------------------------------------------------------------------------ */

export function LibraryViewer() {
  const t = useT();
  const act = useGame((state) => state.act);
  const libraryCards = useGame((state) => state.libraryCards);
  const clearLibraryCards = useGame((state) => state.clearLibraryCards);
  const libIntent = useTableUi((state) => state.libIntent);
  const setLibIntent = useTableUi((state) => state.setLibIntent);
  const popup = useCardPopup();

  const mode = libIntent ?? 'peek';
  const [order, setOrder] = useState<CardInst[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const dirty = useRef(false);
  const orderRef = useRef(order);
  orderRef.current = order;

  useEffect(() => {
    setOrder(libraryCards ?? []);
    setSelected(new Set());
    setFilter('');
    dirty.current = false;
  }, [libraryCards]);

  const close = () => {
    clearLibraryCards();
    setLibIntent(null);
  };

  const commitOrder = () => {
    if (!dirty.current) return;
    dirty.current = false;
    act({ kind: 'library.reorder', iids: orderRef.current.map((card) => card.iid) });
  };

  const toBottom = () => {
    if (selected.size === 0) return;
    const iids = order.filter((card) => selected.has(card.iid)).map((card) => card.iid);
    act({ kind: 'library.bottom', iids });
    setOrder((prev) => prev.filter((card) => !selected.has(card.iid)));
    setSelected(new Set());
  };

  // Take a peeked card to hand / straight onto the battlefield. The server
  // shrinks the peek window instead of dropping it (CardMove retains the rest),
  // so the remaining fan still reorders and bottoms.
  const takeCard = (card: CardInst, to: 'hand' | 'battlefield') => {
    act(
      to === 'hand'
        ? { kind: 'card.move', iid: card.iid, to: 'hand' }
        : { kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.5, y: 0.45 },
    );
    const rest = orderRef.current.filter((c) => c.iid !== card.iid);
    if (rest.length === 0) {
      close();
      return;
    }
    setOrder(rest);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(card.iid);
      return next;
    });
  };

  const searchResults = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return order;
    return order.filter((card) => card.name.toLowerCase().includes(query));
  }, [order, filter]);

  // The `search` intent now opens the scrollable LibrarySidebar (drag to play);
  // the modal is only for `peek` (reorder the top N).
  if (!libraryCards || libIntent === 'search') return null;

  return (
    <Modal
      open
      onClose={close}
      size="lg"
      title={t('gpPeek')}
      description={`${t('tblLibrary')} · ${order.length}`}
    >
      {mode === 'peek' ? (
        <div className="libPeek pcMobileFull">
          <Reorder.Group
            axis="x"
            values={order}
            onReorder={(next: CardInst[]) => {
              dirty.current = true;
              setOrder(next);
            }}
            className="libPeekRow"
            as="div"
          >
            {order.map((card, index) => (
              <Reorder.Item
                key={card.iid}
                value={card}
                as="div"
                className="libPeekCard"
                data-selected={selected.has(card.iid) || undefined}
                whileDrag={{ scale: 1.07, zIndex: 20 }}
                onDragEnd={() => setTimeout(commitOrder, 0)}
                onTap={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(card.iid)) next.delete(card.iid);
                    else next.add(card.iid);
                    return next;
                  })
                }
              >
                <span className="libIndex">{index + 1}</span>
                <GameCard
                  name={card.name}
                  imageUrl={card.imageUrl || cardImage(card.scryfallId)}
                  width={118}
                  tilt={0}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
                  }}
                />
                {/* Stop pointerdown so the buttons never arm the drag/tap-select. */}
                <div className="libCardActions" onPointerDown={(event) => event.stopPropagation()}>
                  <Button size="sm" variant="soft" onClick={() => takeCard(card, 'hand')}>
                    {t('tblHand')}
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => takeCard(card, 'battlefield')}>
                    {t('gpPlayCard')}
                  </Button>
                </div>
              </Reorder.Item>
            ))}
          </Reorder.Group>
          <div className="libActions">
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              1 = {t('tblLibrary')} ↑
            </Text>
            <Button size="sm" variant="soft" disabled={selected.size === 0} onClick={toBottom}>
              <ArrowDownToLine size={14} /> {t('gpToBottom')}
              {selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
          </div>
        </div>
      ) : (
        <div className="libSearch pcMobileFull">
          <SearchField
            size="sm"
            value={filter}
            onValueChange={setFilter}
            placeholder={t('dbSearchPlaceholder')}
            glass
          />
          <ScrollArea className="libSearchScroll">
            <div className="libSearchGrid">
              {searchResults.map((card) => (
                <div key={card.iid} className="libSearchCard">
                  <GameCard
                    name={card.name}
                    imageUrl={card.imageUrl || cardImage(card.scryfallId)}
                    width={116}
                    tilt={0}
                    onClick={() => popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl })}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      act({ kind: 'card.move', iid: card.iid, to: 'hand' });
                      flyToAnchor(event.currentTarget, 'hand:mine', {
                        imageUrl: card.imageUrl || cardImage(card.scryfallId),
                        width: 104,
                      });
                      setOrder((prev) => prev.filter((c) => c.iid !== card.iid));
                    }}
                  >
                    <HandIcon size={13} /> {t('tblHand')}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="libActions">
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {searchResults.length} / {order.length}
            </Text>
            <Button
              size="sm"
              variant="soft"
              onClick={() => {
                act({ kind: 'shuffle' });
                close();
              }}
            >
              <Shuffle size={14} /> {t('tblShuffle')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Reveal tray: "reveals the top N", fanned for EVERY viewer                 */
/* ------------------------------------------------------------------------ */

/**
 * The shared reveal fan. `library.reveal` broadcasts the full card list to all
 * viewers (spectators included) in its room.event payload; the store keeps it
 * as revealTray and prunes cards as they move. The revealing player also gets
 * per-card Take / Play actions - plain card.move by iid, which the server
 * already accepts from the library. Dismissing is viewer-local (reveals are
 * ephemeral: never in room.state, gone on reload).
 */
export function RevealTray({ room, canAct, meId }: { room: RoomState; canAct: boolean; meId?: string }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const tray = useGame((state) => state.revealTray);
  const clearRevealTray = useGame((state) => state.clearRevealTray);
  const popup = useCardPopup();
  if (!tray) return null;
  const actor = room.players.find((player) => player.userId === tray.actor);
  const mine = canAct && meId != null && meId === tray.actor;
  return (
    <Modal
      open
      onClose={clearRevealTray}
      size="lg"
      title={`${actor?.username ?? '?'} ${t('gpReveals')}`}
      description={`${t('tblLibrary')} · ${tray.cards.length}`}
    >
      <div className="libPeek pcMobileFull">
        <div className="libPeekRow">
          {tray.cards.map((card, index) => (
            <div key={card.iid} className="libPeekCard">
              <span className="libIndex">{index + 1}</span>
              <GameCard
                name={card.name}
                imageUrl={card.imageUrl || cardImage(card.scryfallId)}
                width={118}
                tilt={0}
                onContextMenu={(event) => {
                  event.preventDefault();
                  popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl });
                }}
              />
              {mine && (
                <div className="libCardActions">
                  <Button size="sm" variant="soft" onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'hand' })}>
                    {t('tblHand')}
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.5, y: 0.45 })}
                  >
                    {t('gpPlayCard')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Public pile browser (graveyard / exile, any player)                       */
/* ------------------------------------------------------------------------ */

export function PileViewer({ room, me, canAct }: { room: RoomState; me: TablePlayer | undefined; canAct: boolean }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const pileView = useTableUi((state) => state.pileView);
  const setPileView = useTableUi((state) => state.setPileView);
  const popup = useCardPopup();

  const player = pileView ? room.players.find((p) => p.userId === pileView.userId) : undefined;
  const cards = player && pileView ? player[pileView.zone] : [];
  const mine = canAct && me != null && player?.userId === me.userId;

  // The pile emptied out from under the viewer - nothing left to browse.
  useEffect(() => {
    if (pileView && cards.length === 0) setPileView(null);
  }, [pileView, cards.length, setPileView]);

  if (!pileView || !player) return null;

  const zoneKey = pileView.zone === 'graveyard' ? 'tblGraveyard' : 'tblExile';
  const otherZone: Zone = pileView.zone === 'graveyard' ? 'exile' : 'graveyard';
  const otherKey = ZONE_KEYS[otherZone]!;

  return (
    <Modal
      open
      onClose={() => setPileView(null)}
      size="xl"
      title={`${player.username} · ${t(zoneKey)}`}
      description={`${cards.length}`}
    >
      <ScrollArea className="pileScroll pcMobileFull">
        <div className="pileGrid">
          {[...cards].reverse().map((card) => (
            <div key={card.iid} className="pileCard">
              <GameCard
                name={card.name}
                imageUrl={card.imageUrl || cardImage(card.scryfallId)}
                width={124}
                tilt={0}
                onClick={() => popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl })}
              />
              {mine && (
                <div className="pileActions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'hand' })}
                  >
                    {t('tblHand')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'battlefield', x: 0.5, y: 0.55 })}
                  >
                    <Sparkles size={12} />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => act({ kind: 'card.move', iid: card.iid, to: otherZone })}>
                    {t(otherKey)}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('tblLibrary')} ↑`}
                    onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'library', index: 0 })}
                  >
                    <ArrowUpToLine size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`${t('tblLibrary')} ↓`}
                    onClick={() => act({ kind: 'card.move', iid: card.iid, to: 'library', index: -1 })}
                  >
                    <ArrowDownToLine size={12} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Mulligan flow                                                             */
/* ------------------------------------------------------------------------ */

export function MulliganOverlay({ room, me }: { room: RoomState; me: TablePlayer }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const mulligan = me.mulligan;
  const hand = me.hand ?? [];
  // Mirror the server exactly (turns.rs free_first_mulls + MullKeep): the host's
  // freeMulligans override beats the classic default (?? not ||: an explicit 0
  // must win), and Vancouver never bottoms cards.
  const freeFirst = room.settings?.unlimitedMulligans
    ? Number.POSITIVE_INFINITY
    : (room.settings?.freeMulligans ??
      (formatFor(room.format).hasCommander && room.players.length >= 3 ? 1 : 0));
  const vancouver = room.settings?.mulliganRule === 'vancouver';
  const owed = vancouver ? 0 : Math.max(0, (mulligan?.taken ?? 0) - freeFirst);

  // The fan fills the width of the screen: size each card so the whole hand
  // spans ~95vw. Cards overlap by 32px (margin-inline: -16px), so a card's
  // footprint is (width - 32); solve for width that packs `n` across the row.
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  // The 132px comfort floor defeats the auto-fit on phones (7 cards need
  // ~732px); below ~600px let the solve win down to a 72px sliver minimum.
  const cardFloor = vw < 600 ? 72 : 132;
  const cardW = Math.round(Math.min(260, Math.max(cardFloor, (vw * 0.95 - 32) / Math.max(hand.length, 1) + 32)));

  useEffect(() => {
    // Fresh hand or fresh decision - reset local picks.
    setPicking(false);
    setPicked(new Set());
  }, [mulligan?.taken]);

  if (mulligan?.state !== 'deciding') return null;

  const togglePick = (iid: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(iid)) next.delete(iid);
      else if (next.size < owed) next.add(iid);
      return next;
    });
  };

  const keep = () => {
    if (owed === 0) act({ kind: 'mull.keep', bottomIids: [] });
    else if (picking && picked.size === owed) act({ kind: 'mull.keep', bottomIids: [...picked] });
    else setPicking(true);
  };

  return (
    <motion.div
      className="mullOverlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('tblMulligan')}
    >
      <div className="mullPanel">
        <div className="mullHead">
          <Text as="span" weight="semibold">
            {picking ? t('gpMullBottom') : t('tblMulligan')}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {picking ? `${picked.size} / ${owed}` : `${t('gpMullTake')}: ${mulligan.taken}`}
          </Text>
        </div>
        <div className="mullFan" data-picking={picking || undefined}>
          {hand.map((card, index) => {
            const spread = index - (hand.length - 1) / 2;
            return (
              <motion.div
                key={card.iid}
                className="mullCard"
                data-picked={picked.has(card.iid) || undefined}
                initial={{ y: 80, opacity: 0, rotate: 0 }}
                animate={{
                  y: Math.abs(spread) * 9 + (picked.has(card.iid) ? -26 : 0),
                  opacity: 1,
                  rotate: spread * 4,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 24, delay: index * 0.04 }}
                onClick={() => picking && togglePick(card.iid)}
              >
                <GameCard
                  name={card.name}
                  imageUrl={card.imageUrl || cardImage(card.scryfallId)}
                  width={cardW}
                  tilt={picking ? 0 : 8}
                  selected={picked.has(card.iid)}
                />
              </motion.div>
            );
          })}
        </div>
        <div className="mullActions">
          {!picking ? (
            <>
              <Button variant="soft" onClick={() => act({ kind: 'mull.take' })}>
                <Dices size={15} /> {t('gpMullTake')}
              </Button>
              <Button onClick={keep}>{t('gpMullKeep')}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setPicking(false)}>
                {t('dbCancel')}
              </Button>
              <Button disabled={picked.size !== owed} onClick={keep}>
                {t('gpMullKeep')}
              </Button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------------ */
/* Commander return prompt                                                   */
/* ------------------------------------------------------------------------ */

export function CmdChoiceDialog({ me }: { me: TablePlayer | undefined }) {
  const t = useT();
  const cmdChoice = useGame((state) => state.cmdChoice);
  const answerCmdChoice = useGame((state) => state.answerCmdChoice);

  const card = useMemo(() => {
    if (!cmdChoice || !me) return undefined;
    const pools: CardInst[][] = [
      me.battlefield,
      me.graveyard,
      me.exile,
      me.command,
      me.hand ?? [],
    ];
    for (const pool of pools) {
      const hit = pool.find((c) => c.iid === cmdChoice.iid);
      if (hit) return hit;
    }
    return undefined;
  }, [cmdChoice, me]);

  if (!cmdChoice) return null;

  const zoneKey = ZONE_KEYS[cmdChoice.to as Zone];
  const destination = zoneKey ? t(zoneKey) : cmdChoice.to;

  return (
    <AlertDialog
      open
      onClose={() => {
        // Dismissal (Escape / cancel) declines; a Yes answer already cleared the store.
        if (useGame.getState().cmdChoice) answerCmdChoice(cmdChoice.iid, false);
      }}
      title={t('gpCmdReturn')}
      description={`${card?.name ?? ''} → ${destination}`}
      actionLabel={t('playAccept')}
      cancelLabel={t('playDismiss')}
      dismissible
      onAction={() => answerCmdChoice(cmdChoice.iid, true)}
    >
      {card && (
        <div className="cmdChoiceCard">
          <GameCard
            name={card.name}
            imageUrl={card.imageUrl || cardImage(card.scryfallId)}
            width={120}
            foil
            tilt={0}
          />
        </div>
      )}
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------------ */
/* Dice banner: surface roll results the moment they land in the log         */
/* ------------------------------------------------------------------------ */

// Dice results and combat damage both deserve the center-stage banner.
const ROLLISH = /\broll(s|ed)?\b|\bHeads\b|\bTails\b|loses \d+ life|commander damage/i;
// A dice/coin result: hold the banner until the 3D dice have settled so the
// number isn't spoiled mid-tumble. Non-dice banners (life, combat) show at once.
const DICE_RESULT = /\broll(s|ed)?\b|\bHeads\b|\bTails\b/i;
const DICE_SETTLE_MS = 1700;

export function RollBanner() {
  const log = useGame((state) => state.log);
  const [banner, setBanner] = useState<{ seq: number; text: string } | null>(null);
  const lastSeen = useRef<number>(0);
  const pending = useRef<number | undefined>(undefined);

  // Never replay history on mount (rejoin/resume keeps its log).
  useEffect(() => {
    lastSeen.current = useGame.getState().log.at(-1)?.seq ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(pending.current), []);

  useEffect(() => {
    const last = log[log.length - 1];
    if (!last || last.seq <= lastSeen.current) return;
    lastSeen.current = last.seq;
    if (!ROLLISH.test(last.text)) return;
    window.clearTimeout(pending.current);
    if (DICE_RESULT.test(last.text)) {
      // Wait for the dice to stop moving before revealing the number.
      pending.current = window.setTimeout(
        () => setBanner({ seq: last.seq, text: last.text }),
        DICE_SETTLE_MS,
      );
    } else {
      setBanner({ seq: last.seq, text: last.text });
    }
  }, [log]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(timer);
  }, [banner]);

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.seq}
          className="rollBanner"
          initial={{ opacity: 0, y: -16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        >
          <Dices size={15} />
          <span>{banner.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

