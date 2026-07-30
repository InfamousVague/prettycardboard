import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Button,
  EmptyState,
  Heading,
  Pill,
  ProgressBar,
  SearchField,
  SegmentedControl,
  Select,
  Size,
  Spinner,
  StatTile,
  Text,
  TextTone,
} from '@glacier/react';
import { Gem, Library, PackageOpen, Sparkles, Star } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { useCardPopup } from '../components/CardPopup.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
import { poolCards, useCollection } from '../state/collectionStore.ts';
import type { CollectionCard } from '../net/api.ts';
import type { BoosterSet, PoolCard, SetPool } from '../data/boosterSets.ts';
import './collection.css';

/**
 * Collection - the "Magic Pokedex".
 *
 * Every card the account has ever pulled, grouped into the sets it came from
 * and scored against those sets' real card counts, so the page reads as a
 * binder with holes in it rather than a list of loot. Three things carry that:
 *
 *   - a per-set completion bar (owned / set size) and one overall figure;
 *   - a missing view: once a set's pool is loaded, the cards you have NOT
 *     pulled appear as ghost slots alongside the ones you have;
 *   - a NEW treatment on first-time pulls, which survives reloads and clears
 *     as each card is looked at (see collectionStore for why that is local).
 *
 * Pools are the expensive part (Scryfall, rate-limited), so a set only fetches
 * one when the player asks that set what it is hiding.
 */

/** Owned cards rendered per set before the section asks to be expanded. */
const PAGE = 24;
/** Ghost slots rendered per set before the missing list asks to be expanded. */
const MISSING_PAGE = 24;

const RARITY_RANK: Record<string, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

type View = 'owned' | 'missing' | 'all';

export function CollectionPage({ onOpenBoosters }: { onOpenBoosters?: () => void }) {
  const t = useT();
  const phone = useMobileLayout();

  const cards = useCollection((state) => state.cards);
  const totalPulls = useCollection((state) => state.totalPulls);
  const loading = useCollection((state) => state.loading);
  const loaded = useCollection((state) => state.loaded);
  const failed = useCollection((state) => state.failed);
  const setInfo = useCollection((state) => state.setInfo);
  const pools = useCollection((state) => state.pools);
  const poolLoading = useCollection((state) => state.poolLoading);
  const seen = useCollection((state) => state.seen);
  const refresh = useCollection((state) => state.refresh);
  const loadPool = useCollection((state) => state.loadPool);
  const markSeen = useCollection((state) => state.markSeen);
  const markAllSeen = useCollection((state) => state.markAllSeen);

  const [query, setQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [view, setView] = useState<View>('owned');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Refresh on every visit, not just the first: packs are opened on another
  // route, so arriving here is exactly when the collection may have grown.
  // Whatever the store already holds stays on screen while it revalidates.
  useEffect(() => {
    refresh().catch(() => {
      // The store records the failure; nothing to do here.
    });
  }, [refresh]);

  /**
   * Ownership, counted ONE way for the whole page.
   *
   * A printing is owned once, whatever finish it arrived in. The collection is
   * stored per (printing, finish), so a foil of a card already owned arrives as
   * a second row: counting rows would score it twice against the set's card
   * count, and could never agree with the pool-loaded branch below, which
   * counts pool entries by id. Foils are a flourish, counted on their own tile
   * and never against completion.
   */
  const ownedIndex = useMemo(() => {
    const ids = new Set<string>();
    const bySet: Record<string, number> = {};
    for (const card of cards) {
      if (ids.has(card.scryfallId)) continue;
      ids.add(card.scryfallId);
      bySet[card.setCode] = (bySet[card.setCode] ?? 0) + 1;
    }
    return { ids, bySet, total: ids.size };
  }, [cards]);

  /** Cards grouped by set, newest set first. */
  const groups = useMemo(() => {
    const bySet = new Map<string, CollectionCard[]>();
    for (const card of cards) {
      const list = bySet.get(card.setCode);
      if (list) list.push(card);
      else bySet.set(card.setCode, [card]);
    }
    return [...bySet.entries()]
      .map(([code, list]) => ({
        code,
        cards: list.slice().sort(
          (a, b) =>
            (RARITY_RANK[a.rarity] ?? 4) - (RARITY_RANK[b.rarity] ?? 4) || a.name.localeCompare(b.name),
        ),
      }))
      .sort((a, b) => {
        const releasedA = setInfo[a.code]?.released ?? '';
        const releasedB = setInfo[b.code]?.released ?? '';
        return releasedB.localeCompare(releasedA) || a.code.localeCompare(b.code);
      });
  }, [cards, setInfo]);

  const newCount = useMemo(
    () => cards.reduce((count, card) => (seen.has(card.scryfallId) ? count : count + 1), 0),
    [cards, seen],
  );

  const foilCount = useMemo(() => cards.filter((card) => card.foil).length, [cards]);

  /** Overall completion across every set the player has started. */
  const overall = useMemo(() => {
    let owned = 0;
    let size = 0;
    for (const group of groups) {
      const known = setInfo[group.code]?.cardCount ?? 0;
      if (known <= 0) continue;
      owned += Math.min(ownedIndex.bySet[group.code] ?? 0, known);
      size += known;
    }
    return { owned, size, pct: size > 0 ? Math.round((owned / size) * 100) : 0 };
  }, [groups, setInfo, ownedIndex]);

  const shownGroups = useMemo(
    () => (setFilter === 'all' ? groups : groups.filter((group) => group.code === setFilter)),
    [groups, setFilter],
  );

  const setOptions = useMemo(
    () => [
      { value: 'all', label: t('collAllSets') },
      ...groups.map((group) => ({
        value: group.code,
        label: setInfo[group.code]?.name ?? group.code.toUpperCase(),
      })),
    ],
    [groups, setInfo, t],
  );

  if (loading && !loaded) {
    return (
      <div className="page collectionPage">
        <div className="collNotice">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (failed && cards.length === 0) {
    return (
      <div className="page collectionPage">
        <div className="collNotice">
          <Text tone={TextTone.Muted}>{t('collFailed')}</Text>
          <Button variant="soft" onClick={() => void refresh()}>
            {t('collRetry')}
          </Button>
        </div>
      </div>
    );
  }

  if (loaded && cards.length === 0) {
    return (
      <div className="page collectionPage">
        <div className="collHead">
          <Heading level={1}>{t('collTitle')}</Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="lede">
            {t('collLede')}
          </Text>
        </div>
        <EmptyState
          icon={<Library size={22} />}
          title={t('collEmptyTitle')}
          description={t('collEmptyBody')}
          action={
            <Button onClick={() => (onOpenBoosters ? onOpenBoosters() : (window.location.hash = '/boosters'))}>
              <PackageOpen size={16} aria-hidden />
              {t('collEmptyAction')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page collectionPage">
      <div className="collHead">
        <div>
          <Heading level={1}>{t('collTitle')}</Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="lede">
            {t('collLede')}
          </Text>
        </div>
        {newCount > 0 && (
          <Button variant="soft" onClick={markAllSeen}>
            <Sparkles size={16} aria-hidden />
            {t('collMarkAllSeen')}
          </Button>
        )}
      </div>

      <div className="collStats">
        {/* Distinct printings, by the same rule the completion bars use - the
            server's total counts a foil as its own row, which would put a
            bigger number here than the bars below can ever add up to. */}
        <StatTile icon={<Library size={18} />} value={ownedIndex.total} label={t('collUnique')} />
        <StatTile icon={<PackageOpen size={18} />} value={totalPulls} label={t('collTotalPulls')} />
        <StatTile icon={<Star size={18} />} value={groups.length} label={t('collSetsSeen')} />
        <StatTile icon={<Gem size={18} />} value={foilCount} label={t('collFoils')} />
        <StatTile
          icon={<Sparkles size={18} />}
          value={`${overall.pct}%`}
          label={t('collCompletion')}
          hint={overall.size > 0 ? `${overall.owned} / ${overall.size}` : undefined}
        />
      </div>

      <div className="collToolbar" role="group" aria-label={t('collSearch')}>
        <div className="collSearch">
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder={t('collSearch')}
            aria-label={t('collSearch')}
          />
        </div>
        <Select
          value={setFilter}
          onValueChange={setSetFilter}
          options={setOptions}
          aria-label={t('collAllSets')}
          className="collSetSelect"
        />
        <SegmentedControl
          size="sm"
          aria-label={t('collAllRarities')}
          value={rarity}
          onValueChange={setRarity}
          options={[
            { value: 'all', label: t('collAllRarities') },
            { value: 'common', label: t('collCommon') },
            { value: 'uncommon', label: t('collUncommon') },
            { value: 'rare', label: t('collRare') },
            { value: 'mythic', label: t('collMythic') },
          ]}
        />
        <SegmentedControl
          size="sm"
          aria-label={t('collViewOwned')}
          value={view}
          onValueChange={(next) => setView(next as View)}
          options={[
            { value: 'owned', label: t('collViewOwned') },
            { value: 'missing', label: t('collViewMissing') },
            { value: 'all', label: t('collViewAll') },
          ]}
        />
      </div>

      <div className="collSets">
        {shownGroups.map((group) => (
          <SetSection
            key={group.code}
            code={group.code}
            cards={group.cards}
            ownedCount={ownedIndex.bySet[group.code] ?? 0}
            info={setInfo[group.code]}
            pool={pools[group.code]}
            poolLoading={poolLoading[group.code] === true}
            ownedIds={ownedIndex.ids}
            seen={seen}
            query={query}
            rarity={rarity}
            view={view}
            phone={phone}
            expanded={expanded[group.code] === true}
            onToggleExpand={() =>
              setExpanded((prev) => ({ ...prev, [group.code]: !prev[group.code] }))
            }
            onLoadPool={() => void loadPool(group.code)}
            onSeen={markSeen}
          />
        ))}
      </div>
    </div>
  );
}

/** One set's shelf: the completion readout, the cards you have, the holes. */
function SetSection({
  code,
  cards,
  ownedCount,
  info,
  pool,
  poolLoading,
  ownedIds,
  seen,
  query,
  rarity,
  view,
  phone,
  expanded,
  onToggleExpand,
  onLoadPool,
  onSeen,
}: {
  code: string;
  cards: CollectionCard[];
  /** Distinct printings owned in this set - finishes already collapsed. */
  ownedCount: number;
  info?: BoosterSet;
  pool?: SetPool;
  poolLoading: boolean;
  ownedIds: Set<string>;
  seen: Set<string>;
  query: string;
  rarity: string;
  view: View;
  phone: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onLoadPool: () => void;
  onSeen: (id: string) => void;
}) {
  const t = useT();
  const popup = useCardPopup();
  const needle = query.trim().toLowerCase();
  const width = phone ? 92 : 128;

  const owned = useMemo(
    () =>
      cards.filter(
        (card) =>
          (rarity === 'all' || card.rarity === rarity) &&
          (!needle || card.name.toLowerCase().includes(needle)),
      ),
    [cards, rarity, needle],
  );

  const poolAll = useMemo(() => (pool ? poolCards(pool) : []), [pool]);

  /** Everything the set can yield that has never been pulled. */
  const missing = useMemo(() => {
    if (!pool) return [];
    return poolAll
      .filter(
        (card) =>
          !ownedIds.has(card.id) &&
          (rarity === 'all' || card.rarity === rarity) &&
          (!needle || card.name.toLowerCase().includes(needle)),
      )
      .sort(
        (a, b) => (RARITY_RANK[a.rarity] ?? 4) - (RARITY_RANK[b.rarity] ?? 4) || a.name.localeCompare(b.name),
      );
  }, [pool, poolAll, ownedIds, rarity, needle]);

  // Scoring, in order of trust:
  //   pool loaded  -> count the pool entries you own. Owned + missing then sums
  //                   to the set size exactly, so the bar can never overshoot
  //                   on a printing the booster pool does not list.
  //   pool unknown -> the same distinct printings over Scryfall's set size,
  //                   clamped. Both branches count printings, never finishes,
  //                   so loading a pool cannot change the number.
  const poolSize = poolAll.length;
  const size = poolSize > 0 ? poolSize : (info?.cardCount ?? 0);
  const scored =
    poolSize > 0
      ? poolAll.reduce((count, card) => (ownedIds.has(card.id) ? count + 1 : count), 0)
      : Math.min(ownedCount, size || ownedCount);
  const pct = size > 0 ? Math.round((scored / size) * 100) : 0;

  const showOwned = view !== 'missing';
  const showMissing = view !== 'owned';

  const visibleOwned = expanded ? owned : owned.slice(0, PAGE);
  const visibleMissing = expanded ? missing : missing.slice(0, MISSING_PAGE);
  const hiddenCount =
    (showOwned ? owned.length - visibleOwned.length : 0) +
    (showMissing ? missing.length - visibleMissing.length : 0);
  // Whether the section can overflow at all - so an expanded-but-short shelf
  // does not offer a "Show less" that collapses nothing.
  const overflows =
    (showOwned && owned.length > PAGE) || (showMissing && missing.length > MISSING_PAGE);

  const nothingShown =
    (!showOwned || visibleOwned.length === 0) && (!showMissing || visibleMissing.length === 0);
  // A set filtered down to nothing is noise - drop the whole shelf, unless it
  // is only empty because the missing list has not been fetched yet.
  if (nothingShown && !(showMissing && !pool)) return null;

  return (
    <section className="collSet" aria-label={info?.name ?? code.toUpperCase()}>
      <header className="collSetHead">
        <div className="collSetIdent">
          {info?.iconUrl && <img className="collSetIcon" src={info.iconUrl} alt="" aria-hidden />}
          <div className="collSetNames">
            <span className="collSetName">{info?.name ?? code.toUpperCase()}</span>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
              {code.toUpperCase()}
              {info?.released ? ` · ${info.released.slice(0, 4)}` : ''}
            </Text>
          </div>
        </div>
        <div className="collSetScore">
          <span className="collSetCount">
            {scored}
            <span className="collSetOf"> / {size > 0 ? size : '—'}</span>
          </span>
          <ProgressBar
            value={scored}
            max={size > 0 ? size : 1}
            size="sm"
            aria-label={t('collCompletion')}
            className="collSetBar"
          />
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
            {size > 0 ? `${pct}%` : t('collCompletion')}
          </Text>
        </div>
      </header>

      {showMissing && !pool && (
        <div className="collPoolPrompt">
          <Text size={Size.Small} tone={TextTone.Subtle}>
            {poolLoading ? t('collLoadingSet') : t('collMissingUnknown')}
          </Text>
          {poolLoading ? (
            <Spinner size="sm" />
          ) : (
            <Button size="sm" variant="soft" onClick={onLoadPool}>
              {t('collShowMissing')}
            </Button>
          )}
        </div>
      )}

      <div className="collGrid">
        {showOwned &&
          visibleOwned.map((card, index) => (
            <OwnedTile
              // A printing owned in both finishes arrives as two rows with the
              // same id, so the key has to carry the finish too - otherwise the
              // pair collides and the second tile remounts on every re-render.
              key={`${card.scryfallId}:${card.foil ? 'f' : 'n'}`}
              card={card}
              index={index}
              width={width}
              isNew={!seen.has(card.scryfallId)}
              onOpen={() => {
                onSeen(card.scryfallId);
                popup.open({ scryfallId: card.scryfallId, name: card.name, foil: card.foil });
              }}
            />
          ))}
        {showMissing &&
          visibleMissing.map((card) => <GhostTile key={`m-${card.id}`} card={card} width={width} />)}
      </div>

      {nothingShown && showMissing && pool && (
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {t('collNoResults')}
        </Text>
      )}

      {overflows && (
        <div className="collMore">
          <Button size="sm" variant="ghost" onClick={onToggleExpand}>
            {expanded ? t('collShowLess') : `${t('collShowMore')} (${hiddenCount})`}
          </Button>
        </div>
      )}
    </section>
  );
}

/** A card you own. First-time pulls glow and wear a NEW flag until looked at. */
function OwnedTile({
  card,
  index,
  width,
  isNew,
  onOpen,
}: {
  card: CollectionCard;
  index: number;
  width: number;
  isNew: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <motion.div
      className="collTile"
      data-rarity={card.rarity}
      data-new={isNew || undefined}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut', delay: Math.min(index, 12) * 0.02 }}
    >
      <GameCard
        name={card.name}
        imageUrl={cardImage(card.scryfallId)}
        width={width}
        foil={card.foil}
        glow={isNew}
        tilt={6}
        onClick={onOpen}
      >
        {isNew && (
          <Pill size="sm" tone="accent" variant="solid" className="collNewFlag">
            {t('collNew')}
          </Pill>
        )}
        {card.pullCount > 1 && (
          <span className="collDupes" title={t('collCopies')}>
            ×{card.pullCount}
          </span>
        )}
        {card.foil && !isNew && <span className="collFoilFlag">{t('collFoil')}</span>}
      </GameCard>
    </motion.div>
  );
}

/** A card the set can yield that has never been pulled: an empty binder slot. */
function GhostTile({ card, width }: { card: PoolCard; width: number }) {
  const t = useT();
  return (
    <div className="collTile collGhost" data-rarity={card.rarity}>
      {/* No art: an unpulled card is a name on an empty sleeve, not a spoiler
          of what the pack would have given you. */}
      <GameCard name={card.name} width={width} tilt={0} />
      {/* The dashed, drained sleeve is the only "you do not own this" cue a
          sighted player gets; in the "Both" view owned and missing cards are
          interleaved, so this carries the same fact non-visually. */}
      <span className="collGhostSr">{t('collViewMissing')}</span>
    </div>
  );
}
