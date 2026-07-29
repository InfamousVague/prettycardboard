import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Button,
  IconButton,
  Pill,
  SearchField,
  SegmentedControl,
  Select,
  Size,
  Spinner,
  Text,
  TextTone,
} from '@glacier/react';
import { PackageOpen, Sparkles, X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { GameCard } from './GameCard.tsx';
import { PullFeed } from './PullFeed.tsx';
import {
  boosterArtUrl,
  boosterCardUrl,
  loadBoosterSets,
  loadSetPool,
  type BoosterSet,
} from '../data/boosterSets.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { RARITY_RANK, openPack, specFor, type PackCard } from '../data/boosters.ts';
import { recordPack } from '../data/packRecord.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import { useApp } from '../state/appStore.ts';
import './packDock.css';

/**
 * The floating pack dock: a pack to rip from ANYWHERE in the app.
 *
 * Waiting is most of a multiplayer game - for the last seat to join, for the
 * turn to come back round - and this is what you do with those minutes. It
 * mounts once, high in the tree, so the same dock follows the player from the
 * lobby to the table, and it collapses to one small button that remembers its
 * own state between sessions.
 *
 * Three rules shape everything below:
 *
 *   1. It must never cost anyone a game. The dock lives on the inline-START
 *      edge at mid-height, clear of the phone's thumb corners: End turn owns
 *      bottom-inline-end, the zone piles own bottom-inline-start. Incoming
 *      notifications are pointer-events:none, so a cheer can never eat a tap.
 *   2. The pack maths is not reimplemented here. `specFor`/`openPack` and the
 *      Scryfall pools are the booster page's, imported as-is - one collation
 *      model for the whole app.
 *   3. The SERVER decides what is new and what is notable. It owns the
 *      collection and the one `is_notable` rule, so the dock celebrates what
 *      comes back from /api/collection/pulls rather than guessing locally.
 */

/** Rarity bands, rarest first - the order a pack is read in. */
const RARITY_BANDS = ['mythic', 'rare', 'uncommon', 'common'] as const;

const RARITY_LABEL = {
  mythic: 'boMythic',
  rare: 'boRare',
  uncommon: 'boUncommon',
  common: 'boCommon',
} as const;

/** Limited Edition Alpha: where Black Lotus and the Power Nine live. */
const DEFAULT_SET_CODE = 'lea';

/** The floor on a pack opening, so the button cannot be spammed and the tear
 *  animation always gets to play through. */
const MIN_RIP_MS = 500;

/** How many face-down cards the wrapper shows while it is being torn. */
const RIP_CARDS = 5;

/** The set's three showcase cards, fanned out of the box on the shelf. */
const SHOWCASE = [0, 1, 2];

/** Collapsed/expanded state and the last set, so the dock reopens where it was. */
const MEMORY_KEY = 'pc.packdock';

/** How long an incoming pull notification stays on screen. */
const NOTICE_MS = 6500;

/** At most this many notifications stack at once; the oldest ages out first. */
const NOTICE_MAX = 3;

interface Memory {
  open: boolean;
  /** Dismissed entirely: the pill is gone until relaunched from the sidebar. */
  dismissed: boolean;
  /** Where the player dragged the pill, as a viewport offset. */
  pos: { x: number; y: number } | null;
  set: string;
}

function loadMemory(): Memory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Memory>) : {};
    return {
      open: parsed.open === true,
      set: typeof parsed.set === 'string' ? parsed.set : '',
      dismissed: parsed.dismissed === true,
      pos:
        parsed.pos && typeof parsed.pos === 'object'
          ? { x: Number((parsed.pos as { x: number }).x) || 0, y: Number((parsed.pos as { y: number }).y) || 0 }
          : null,
    };
  } catch {
    return { open: false, set: '', dismissed: false, pos: null };
  }
}

function saveMemory(memory: Memory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Private mode / quota: the dock just forgets between sessions.
  }
}

/** One transient "they pulled something" notification. */
interface Notice {
  id: string;
  username: string;
  name: string;
  scryfallId: string;
  rarity: string;
  foil: boolean;
}

/** A pulled card is identified by printing AND finish: a foil is its own card. */
function pullKey(scryfallId: string, foil: boolean): string {
  return `${scryfallId}:${foil ? 'f' : 'n'}`;
}

/** Rarest first, foils ahead of their non-foil twins. */
function bestFirst(cards: PackCard[]): PackCard[] {
  return [...cards].sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || Number(b.foil) - Number(a.foil),
  );
}

export default function PackDock() {
  const t = useT();
  const identity = useApp((state) => state.identity);

  const [memory] = useState(loadMemory);
  const [open, setOpen] = useState(memory.open);
  // Dismissed = the pill is gone entirely; the sidebar's Boosters entry brings
  // it back (see the pc:open-packdock listener below).
  const [dismissed, setDismissed] = useState(memory.dismissed);
  const [pos, setPos] = useState(memory.pos ?? { x: 0, y: 0 });
  const [tab, setTab] = useState<'pack' | 'feed'>('pack');

  const [sets, setSets] = useState<BoosterSet[] | null>(null);
  const [setsFailed, setSetsFailed] = useState(false);
  const [code, setCode] = useState(memory.set);
  const [query, setQuery] = useState('');

  // The set's product art can 404 for obscure sets, so the shelf tracks what
  // actually loaded and degrades to the plain name rather than a broken image.
  const [artFailed, setArtFailed] = useState(false);
  const [shotsFailed, setShotsFailed] = useState<number[]>([]);

  const [busy, setBusy] = useState(false);
  const [poolFailed, setPoolFailed] = useState(false);
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<'idle' | 'saved' | 'offline'>('idle');

  const [feed, setFeed] = useState<api.FeedPull[] | null>(null);
  const [feedFailed, setFeedFailed] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  /** Pulls that landed while the dock was shut - the dot on the button. */
  const [unread, setUnread] = useState(0);

  // The websocket listener is mounted for the whole session, so it reads the
  // panel's state through a ref rather than re-subscribing on every toggle.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    saveMemory({ open, set: code, dismissed, pos });
  }, [open, code, dismissed, pos]);

  // Relaunch after a dismiss: the sidebar's Boosters entry fires this, so the
  // pill is never lost for good. Opens the panel too - you asked for packs.
  useEffect(() => {
    const relaunch = () => {
      setDismissed(false);
      setOpen(true);
    };
    window.addEventListener('pc:open-packdock', relaunch);
    return () => window.removeEventListener('pc:open-packdock', relaunch);
  }, []);

  // The set list is a session-cached fetch shared with the boosters page, but
  // it is still a network call: nothing loads until the dock is first opened.
  useEffect(() => {
    if (!open || sets || setsFailed) return;
    let alive = true;
    loadBoosterSets()
      .then((list) => alive && setSets(list))
      .catch(() => alive && setSetsFailed(true));
    return () => {
      alive = false;
    };
  }, [open, sets, setsFailed]);

  // A remembered set that no longer exists (or a first run) falls back to
  // Limited Edition Alpha - the first set ever printed, and the only place the
  // Power Nine come out of a pack, which is the draw. Newest-released is the
  // fallback if Alpha is somehow missing from the list.
  useEffect(() => {
    if (!sets || sets.length === 0) return;
    if (sets.some((entry) => entry.code === code)) return;
    const alpha = sets.find((entry) => entry.code === DEFAULT_SET_CODE);
    const fallback = sets.find((entry) => !entry.preview) ?? sets[0]!;
    setCode((alpha ?? fallback).code);
  }, [sets, code]);

  const refreshFeed = useCallback(async () => {
    try {
      const rows = await api.pullFeed(30);
      setFeed(rows);
      setFeedFailed(false);
    } catch {
      setFeedFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'feed' || feed || feedFailed) return;
    void refreshFeed();
  }, [open, tab, feed, feedFailed, refreshFeed]);

  // Opening the dock clears the "something happened" dot.
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  /** Hand the pack to the server, then celebrate exactly what it flags. */
  const record = useCallback(
    async (cards: PackCard[], entry: BoosterSet) => {
      try {
        // The POST, the table announcement and the library nudge all live in
        // data/packRecord.ts, so the boosters page records a pack exactly the
        // way the dock does.
        const result = await recordPack(cards, entry.code, entry.released);
        setNewKeys(new Set(result.new.map((card) => pullKey(card.scryfallId, card.foil))));
        setSaved('saved');
        // My own notable pulls are in the feed now; refresh so the tab agrees.
        if (result.notable.length > 0) void refreshFeed();
      } catch {
        // Offline, or signed out mid-session: the pack still opened, it just
        // did not land anywhere. Say so rather than pretending it counted.
        setSaved('offline');
      }
    },
    [refreshFeed],
  );

  /** The set on the shelf right now. */
  const entry = useMemo(() => sets?.find((item) => item.code === code) ?? null, [sets, code]);

  // A different set is a different product shot: give its art a clean chance.
  useEffect(() => {
    setArtFailed(false);
    setShotsFailed([]);
  }, [code]);

  const rip = useCallback(async () => {
    if (!entry || busy) return;
    setBusy(true);
    setPoolFailed(false);
    setSaved('idle');
    setNewKeys(new Set());
    // Clear the previous pack so the reveal animation replays from nothing
    // rather than cross-fading one pack into the next.
    setPack(null);
    const started = Date.now();
    try {
      // Cached per set for the session by the booster module, so only the
      // first pack of a set pays for the pool.
      const pool = await loadSetPool(entry.code);
      const cards = bestFirst(openPack(pool, specFor(entry.released, entry.setType), entry.released));
      // A pack is a moment, not a button press: hold the tear for at least
      // MIN_RIP_MS however fast the pool resolved, so the animation reads and
      // the button cannot be machine-gunned.
      const elapsed = Date.now() - started;
      if (elapsed < MIN_RIP_MS) await new Promise((resolve) => setTimeout(resolve, MIN_RIP_MS - elapsed));
      setPack(cards);
      await record(cards, entry);
    } catch {
      setPoolFailed(true);
    } finally {
      setBusy(false);
    }
  }, [entry, busy, record]);

  // Other people's pulls: a transient notification, and a live row in the feed.
  useEffect(() => {
    return ws.onMessage((message) => {
      if (message.type !== 'pull') return;
      if (message.fromUserId === useApp.getState().identity?.userId) return;
      const notice: Notice = {
        id: `${message.fromUserId}:${message.ts}:${message.scryfallId}`,
        username: message.username,
        name: message.name,
        scryfallId: message.scryfallId,
        rarity: message.rarity,
        foil: message.foil,
      };
      setNotices((list) =>
        list.some((entry) => entry.id === notice.id) ? list : [...list, notice].slice(-NOTICE_MAX),
      );
      setFeed((rows) =>
        rows === null
          ? rows
          : [
              {
                id: notice.id,
                userId: message.fromUserId,
                username: message.username,
                scryfallId: message.scryfallId,
                name: message.name,
                setCode: message.setCode,
                rarity: message.rarity,
                foil: message.foil,
                ts: message.ts,
                mine: false,
              },
              ...rows.filter((row) => row.id !== notice.id),
            ].slice(0, 30),
      );
      if (!openRef.current) setUnread((count) => count + 1);
    });
  }, []);

  // Notifications age out oldest-first. Re-arming on every change is
  // deliberate: a burst of pulls stays readable instead of flashing past.
  useEffect(() => {
    if (notices.length === 0) return;
    const timer = setTimeout(() => setNotices((list) => list.slice(1)), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notices]);

  const options = useMemo(() => {
    if (!sets) return [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? sets.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) || entry.code.toLowerCase().includes(needle),
        )
      : sets;
    // A select is not a catalogue: the booster page owns browsing 150 sets.
    // This is the shortlist, plus whatever is currently selected so the
    // trigger never renders an empty label.
    const shortlist = matches.slice(0, 60);
    if (code && !shortlist.some((entry) => entry.code === code)) {
      const selected = sets.find((entry) => entry.code === code);
      if (selected) shortlist.unshift(selected);
    }
    return shortlist.map((entry) => ({
      value: entry.code,
      label: `${entry.name} · ${entry.released.slice(0, 4)}`,
    }));
  }, [sets, query, code]);

  const newCount = newKeys.size;

  // These are Magic packs, so every face-down card in the dock wears the real
  // Magic back - never a placeholder, and never the Cyberpunk back a player may
  // have picked for their own table. Published as --pc-card-back over the pack
  // area, which is the property GameCard's face-down side reads.
  const backSrc = cardBackUrl(effectiveCardBack(undefined, 'mtg'));

  // The wrapper is coming off: the pool is resolving, or the MIN_RIP_MS floor
  // is still running. `busy` stays true a little longer while the server
  // records the pack, but by then the cards are already on screen - so the
  // tearing state keys off "no cards yet", not off `busy`.
  const ripping = busy && !pack;

  // The dock is an account feature: packs land in a collection, and pulls are
  // announced under a name. Signed out, there is nothing to mount.
  if (!identity) return null;

  // Portalled to <body> like the other app-wide overlays: route frames are
  // animated, and a transformed ancestor would become the containing block for
  // position:fixed - the dock would then be trapped inside the content column.
  return createPortal(
    <>
      <div className="pdNotices" role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {notices.map((notice) => (
            <motion.div
              key={notice.id}
              className="pdNotice"
              data-rarity={notice.rarity}
              initial={{ opacity: 0, x: -18, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -18, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <img className="pdNoticeArt" src={cardImage(notice.scryfallId)} alt="" aria-hidden />
              <span className="pdNoticeBody">
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                  {notice.username} {t('pdPulled')}
                </Text>
                <Text as="span" size={Size.XSmall} className="pdNoticeName">
                  {notice.name}
                </Text>
              </span>
              {notice.foil && (
                <Pill size="sm" variant="soft" tone="accent">
                  {t('boFoil')}
                </Pill>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* The pill can be dragged anywhere, and the panel belongs to it: the
          whole dock carries the pill's offset so the panel opens where the
          player left the pill rather than back at its parked position. */}
      <div
        className="pdDock"
        data-open={open || undefined}
        data-dismissed={dismissed || undefined}
        style={{ translate: `${pos.x}px calc(-50% + ${pos.y}px)` }}
      >
        <AnimatePresence initial={false} mode="wait">
          {dismissed ? null : open ? (
            <motion.div
              key="panel"
              className="pdPanel"
              role="dialog"
              aria-label={t('pdTitle')}
              initial={{ opacity: 0, scale: 0.94, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.94, x: -10 }}
              transition={{ type: 'spring', stiffness: 460, damping: 36 }}
            >
              <div className="pdHead">
                <span className="pdHeadTitle">
                  <PackageOpen size={16} aria-hidden />
                  <Text as="span" size={Size.Small}>
                    {t('pdTitle')}
                  </Text>
                </span>
                <IconButton
                  aria-label={t('pdCloseDock')}
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  <X size={16} />
                </IconButton>
              </div>

              <SegmentedControl
                size="sm"
                fullWidth
                aria-label={t('pdTitle')}
                value={tab}
                onValueChange={(value) => setTab(value === 'feed' ? 'feed' : 'pack')}
                options={[
                  { value: 'pack', label: t('pdTabPack') },
                  { value: 'feed', label: t('pdTabFeed') },
                ]}
              />

              <div className="pdBody">
                {tab === 'pack' ? (
                  <>
                    <Text size={Size.XSmall} tone={TextTone.Subtle}>
                      {t('pdLede')}
                    </Text>

                    {setsFailed ? (
                      <Text size={Size.XSmall} tone={TextTone.Muted}>
                        {t('boSetsFailed')}
                      </Text>
                    ) : !sets ? (
                      <div className="pdEmpty">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      <div className="pdPicker">
                        <SearchField
                          size="sm"
                          value={query}
                          onValueChange={setQuery}
                          placeholder={t('boSearch')}
                          aria-label={t('boSearch')}
                        />
                        {options.length > 0 ? (
                          <Select
                            size="sm"
                            fullWidth
                            aria-label={t('pdSet')}
                            value={code}
                            onValueChange={setCode}
                            options={options}
                          />
                        ) : (
                          <Text size={Size.XSmall} tone={TextTone.Muted}>
                            {t('pdNoMatch')}
                          </Text>
                        )}
                      </div>
                    )}

                    {/* The product on the shelf: the set's poster art wearing
                        its name, with three of its cards fanned out of the box.
                        Choosing a pack should feel like picking a box up, not
                        like reading a dropdown. Art that 404s (obscure sets, a
                        cold cache) degrades to the plain name; a showcase card
                        that 404s degrades to a face-down Magic back. */}
                    {entry && (
                      <div
                        className="pdShelf"
                        data-noart={artFailed || undefined}
                        data-tearing={ripping || undefined}
                        style={{ ['--pc-card-back' as string]: `url("${backSrc}")` }}
                      >
                        <span className="pdShelfBox">
                          {!artFailed && (
                            <img
                              className="pdShelfArt"
                              src={boosterArtUrl(entry.code)}
                              alt=""
                              aria-hidden
                              loading="lazy"
                              decoding="async"
                              onError={() => setArtFailed(true)}
                            />
                          )}
                          {entry.iconUrl && (
                            <img className="pdShelfIcon" src={entry.iconUrl} alt="" aria-hidden />
                          )}
                          <span className="pdShelfSeam" aria-hidden />
                          <span className="pdShelfTag">{ripping ? t('pdTearing') : t('pdSealed')}</span>
                        </span>
                        <span className="pdShelfBody">
                          <span className="pdShelfName">{entry.name}</span>
                          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
                            {entry.code.toUpperCase()} · {entry.released.slice(0, 4)}
                          </Text>
                          <span className="pdShelfFan" aria-hidden>
                            {SHOWCASE.map((index) =>
                              shotsFailed.includes(index) ? (
                                <span
                                  key={`${entry.code}-back-${index}`}
                                  className="pdShelfCard"
                                  data-back=""
                                  style={{ backgroundImage: `url("${backSrc}")` }}
                                />
                              ) : (
                                <img
                                  key={`${entry.code}-${index}`}
                                  className="pdShelfCard"
                                  src={boosterCardUrl(entry.code, index)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  onError={() =>
                                    setShotsFailed((list) =>
                                      list.includes(index) ? list : [...list, index],
                                    )
                                  }
                                />
                              ),
                            )}
                          </span>
                        </span>
                      </div>
                    )}

                    <Button
                      size="sm"
                      fullWidth
                      loading={busy}
                      disabled={!sets || !code}
                      onClick={() => void rip()}
                    >
                      <PackageOpen size={16} aria-hidden />
                      {/* `busy` outlives the reveal by however long the server
                          takes to record the pack; the tearing label belongs to
                          the part BEFORE the cards land. */}
                      {ripping ? t('pdTearing') : pack ? t('boOpenAnother') : t('boOpenPack')}
                    </Button>

                    {/* The MIN_RIP_MS floor made visible: the wrapper comes off
                        a row of real face-down cards that shudder and lift, so
                        the half-second reads as an opening rather than a freeze. */}
                    {ripping && (
                      <div
                        className="pdRip"
                        role="status"
                        aria-label={t('pdTearing')}
                        style={{ ['--pc-card-back' as string]: `url("${backSrc}")` }}
                      >
                        {Array.from({ length: RIP_CARDS }, (_, index) => (
                          <div
                            className="pdRipCard"
                            key={index}
                            style={{ animationDelay: `${index * 0.06}s` }}
                          >
                            <GameCard name={t('pdTearing')} faceDown fluid tilt={0} />
                          </div>
                        ))}
                      </div>
                    )}

                    {poolFailed && (
                      <Text size={Size.XSmall} tone={TextTone.Muted}>
                        {t('boPoolFailed')}
                      </Text>
                    )}

                    {pack && (
                      <>
                        <Text size={Size.XSmall} tone={newCount > 0 ? TextTone.Default : TextTone.Subtle}>
                          {saved === 'offline'
                            ? t('pdNotSaved')
                            : newCount > 0
                              ? `${newCount} ${t('pdNewCards')}`
                              : saved === 'saved'
                                ? t('pdNoNew')
                                : ''}
                        </Text>
                        {/* Grouped by rarity, rarest band first: a pack reads as
                            "what did I hit" rather than an undifferentiated
                            grid. Each band carries its own glow (see the CSS). */}
                        {RARITY_BANDS.map((rarity) => {
                          const band = pack.filter((card) => card.rarity === rarity);
                          if (band.length === 0) return null;
                          return (
                            <section className="pdBand" key={rarity} data-rarity={rarity}>
                              <span className="pdBandHead">
                                {t(RARITY_LABEL[rarity])} · {band.length}
                              </span>
                              <div className="pdCards">
                                {band.map((card, index) => {
                                  const fresh = newKeys.has(pullKey(card.id, card.foil));
                                  return (
                                    <div
                                      className="pdCard"
                                      key={`${card.id}-${index}`}
                                      data-rarity={card.rarity}
                                      data-foil={card.foil || undefined}
                                      data-new={fresh || undefined}
                                      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
                                    >
                                      <GameCard
                                        name={card.name}
                                        imageUrl={cardImage(card.id)}
                                        fluid
                                        foil={card.foil}
                                        tilt={6}
                                      />
                                      {fresh && (
                                        <span className="pdCardNew">
                                          <Sparkles size={11} aria-hidden />
                                          {t('pdNew')}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </>
                    )}
                  </>
                ) : (
                  <PullFeed
                    rows={feed}
                    failed={feedFailed}
                    onRetry={() => {
                      setFeedFailed(false);
                      void refreshFeed();
                    }}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="fab"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
            >
              {/* A labelled pill rather than a bare icon, draggable anywhere on
                  screen, with its own dismiss. Drag is motion's, so it never
                  fights the board's own pointer handlers. */}
              <motion.div
                className="pdPill"
                drag
                dragMomentum={false}
                dragElastic={0.04}
                initial={false}
                // The offset lives on the dock (so the panel moves with it);
                // motion only needs to carry the in-flight drag and snap back
                // to zero once the dock has taken the new position.
                animate={{ x: 0, y: 0 }}
                onDragEnd={(_event, info) => {
                  setPos((prev) => ({ x: prev.x + info.offset.x, y: prev.y + info.offset.y }));
                }}
                whileDrag={{ cursor: 'grabbing', scale: 1.03 }}
              >
                <Button
                  size="sm"
                  variant="glass"
                  className="pdPillMain"
                  aria-label={t('pdOpenDock')}
                  onClick={() => setOpen(true)}
                >
                  <PackageOpen size={16} aria-hidden />
                  <span className="pdPillLabel">{t('pdOpenPacks')}</span>
                  {unread > 0 && <span className="pdFabDot" aria-hidden />}
                </Button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  className="pdPillClose"
                  aria-label={t('pdDismissDock')}
                  onClick={() => setDismissed(true)}
                >
                  <X size={13} aria-hidden />
                </IconButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>,
    document.body,
  );
}
