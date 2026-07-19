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

  const searchResults = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return order;
    return order.filter((card) => card.name.toLowerCase().includes(query));
  }, [order, filter]);

  if (!libraryCards) return null;

  return (
    <Modal
      open
      onClose={close}
      size={mode === 'search' ? 'xl' : 'lg'}
      title={mode === 'search' ? t('gpSearchLib') : t('gpPeek')}
      description={mode === 'search' ? undefined : `${t('tblLibrary')} · ${order.length}`}
    >
      {mode === 'peek' ? (
        <div className="libPeek">
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
        <div className="libSearch">
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
      <ScrollArea className="pileScroll">
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
  const freeFirst = room.format === 'commander' && room.players.length >= 3 ? 1 : 0;
  const owed = Math.max(0, (mulligan?.taken ?? 0) - freeFirst);

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
                  width={128}
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

export function RollBanner() {
  const log = useGame((state) => state.log);
  const [banner, setBanner] = useState<{ seq: number; text: string } | null>(null);
  const lastSeen = useRef<number>(0);

  // Never replay history on mount (rejoin/resume keeps its log).
  useEffect(() => {
    lastSeen.current = useGame.getState().log.at(-1)?.seq ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const last = log[log.length - 1];
    if (!last || last.seq <= lastSeen.current) return;
    lastSeen.current = last.seq;
    if (ROLLISH.test(last.text)) {
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

