import { memo, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Button, FilterChip, Heading, Pill, SearchField, SegmentedControl, Size, Text, TextTone, useToast } from '@glacier/react';
import { Check, Eye, Plus, Sparkles } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import * as api from '../net/api.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import type { DeckCard } from '../net/types.ts';
import { DeckStack } from './DeckStack.tsx';
import { EmptyFan } from './Skeletons.tsx';
import { useCardPopup } from './CardPopup.tsx';
import { DeckPreviewModal } from './DeckPreviewModal.tsx';
import '../pages/browse.css';

/**
 * One deck in the discover catalog, normalized across games. Each game adapts
 * its own catalog (MTG precons, Cyberpunk per-Legend decks) into this shape so a
 * single layout renders both.
 */
export interface BrowseDeck {
  id: string;
  name: string;
  /** Commander / Legend name shown under the title. */
  subtitle?: string;
  /** DeckStack cover image. */
  cover?: string;
  /** Blurred fill art behind the tile. */
  art?: string;
  /** Small code/badge pill (set code, faction…). */
  badge?: string;
  /** Identity chip (mana pips, color swatch…), rendered as-is. */
  identity?: ReactNode;
  /** Right-hand meta line, e.g. "100 cards · 2023-05". */
  metaText: string;
  /** Cover card id + name for the click-to-preview popup. */
  cardId?: string;
  cardName?: string;
  /** Values this deck matches, for the filter chips. */
  facets: string[];
  /** Product kind ("Duel Deck"), searchable and shown on the tile. */
  kind?: string;
  /** Group label per group-mode id (e.g. { year: '2023', set: 'BLC' }). */
  groups: Record<string, string>;
  /** ISO-ish date for new/old sorting (empty when a game has no dates). */
  sortDate: string;
  cards: DeckCard[];
  game: string;
  /** Format passed to createDeck ("Commander" | "standard"). */
  format: string;
  /**
   * Fetches the deck's list on demand, for catalogs whose search results do not
   * carry one. An Archidekt page returns 24 decks; pulling every list up front
   * would be 24 requests to show a grid nobody has clicked yet, so a community
   * tile arrives empty and fills itself the first time it is previewed or
   * added. Bundled catalogs ship their cards and leave this undefined.
   */
  loadCards?: () => Promise<DeckCard[]>;
}

export interface BrowseFacet {
  label: string;
  options: { value: string; node: ReactNode; ariaLabel: string }[];
}

type SortMode = 'new' | 'old' | 'az';

/**
 * The shared discover layout used by every game's Browse: a toolbar (search +
 * facet chips + sort + group), a featured shelf, and grouped grids of add-able
 * deck tiles. Games differ only in the catalog + facet/group config they pass.
 */
export function BrowseCatalog({
  decks,
  featuredIds,
  facet,
  groupModes,
  searchPlaceholder,
  emptyQuip,
}: {
  decks: BrowseDeck[];
  featuredIds?: string[];
  /** One row of filter chips, or several (colors AND kind, say). */
  facet: BrowseFacet | BrowseFacet[];
  groupModes: { id: string; label: string }[];
  searchPlaceholder: string;
  emptyQuip: string;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [facets, setFacets] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>('new');
  const [groupMode, setGroupMode] = useState(groupModes[0]?.id ?? '');
  const ownedDecks = useApp((state) => state.decks);
  const ownedNames = useMemo(() => new Set(ownedDecks.map((d) => d.name.toLowerCase())), [ownedDecks]);

  const facetRows = Array.isArray(facet) ? facet : [facet];
  // The field updates on the keystroke; the catalog re-filters behind it. With
  // 1,700 decks the filter+sort is far too slow to run between keypresses, and
  // typing into a laggy field is the thing that made this page feel broken.
  const liveQ = query.trim().toLowerCase();
  const q = useDeferredValue(liveQ);
  const settling = q !== liveQ;
  const filtersActive = q.length > 0 || facets.length > 0;
  const toggleFacet = (value: string, selected: boolean) =>
    setFacets((current) => (selected ? [...current, value] : current.filter((v) => v !== value)));

  /** Where a query hit, worst rank last. A search for "atraxa" wants the deck
   *  called Atraxa before every deck she merely appears in, which is the order
   *  grouping-by-year threw away. */
  const rankOf = (d: BrowseDeck, needle: string) => {
    const name = d.name.toLowerCase();
    if (name === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    if ((d.subtitle ?? '').toLowerCase().includes(needle)) return 3;
    return 4;
  };

  const matched = useMemo(() => {
    const hit = (d: BrowseDeck) =>
      !q ||
      d.name.toLowerCase().includes(q) ||
      (d.subtitle ?? '').toLowerCase().includes(q) ||
      (d.badge ?? '').toLowerCase().includes(q) ||
      (d.kind ?? '').toLowerCase().includes(q);
    return decks.filter((d) => hit(d) && (facets.length === 0 || facets.every((f) => d.facets.includes(f))));
  }, [decks, q, facets]);

  const cmp = useMemo(() => {
    const base = (a: BrowseDeck, b: BrowseDeck) =>
      sort === 'az'
        ? a.name.localeCompare(b.name)
        : sort === 'old'
          ? a.sortDate.localeCompare(b.sortDate)
          : b.sortDate.localeCompare(a.sortDate);
    // A query orders by how well it matched first; browsing has no query to
    // rank by, so it falls straight through to the chosen sort.
    return q ? (a: BrowseDeck, b: BrowseDeck) => rankOf(a, q) - rankOf(b, q) || base(a, b) : base;
  }, [sort, q]);

  /** Searching returns one ranked list; browsing keeps the grouped shelves.
   *  Both flatten to the same row stream so paging counts tiles, not sections -
   *  otherwise one page is 8 decks and the next is 300. */
  const rows = useMemo(() => {
    const out: ({ kind: 'head'; id: string; title: string; count: number } | { kind: 'deck'; deck: BrowseDeck })[] = [];
    if (q) {
      for (const deck of [...matched].sort(cmp)) out.push({ kind: 'deck', deck });
      return out;
    }
    const byGroup = new Map<string, BrowseDeck[]>();
    for (const deck of matched) {
      // Group modes are unioned across the picked games, so a deck can be shown
      // under a cut its own catalog does not have (a dateless Cyberpunk deck
      // while grouping by year). It falls back to its game rather than piling
      // up under a blank heading.
      const key = deck.groups[groupMode] || deck.groups.game || '';
      const list = byGroup.get(key);
      if (list) list.push(deck);
      else byGroup.set(key, [deck]);
    }
    const groups = [...byGroup.entries()]
      .map(([title, ds]) => ({
        title,
        decks: ds.sort(cmp),
        newest: ds.reduce((max, d) => (d.sortDate > max ? d.sortDate : max), ''),
      }))
      .sort((a, b) => b.newest.localeCompare(a.newest) || a.title.localeCompare(b.title));
    for (const group of groups) {
      out.push({ kind: 'head', id: `browse-${group.title}`, title: group.title, count: group.decks.length });
      for (const deck of group.decks) out.push({ kind: 'deck', deck });
    }
    return out;
  }, [matched, cmp, groupMode, q]);

  const jumpTargets = useMemo(
    () => rows.filter((row): row is { kind: 'head'; id: string; title: string; count: number } => row.kind === 'head'),
    [rows],
  );

  // Paging resets whenever the result set changes - keeping page 6 after a new
  // search would open on a wall of decks nobody asked to see.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [q, facets, sort, groupMode, decks]);

  const shownRows = useMemo(() => {
    const limit = page * PAGE_SIZE;
    const out: typeof rows = [];
    let count = 0;
    for (const row of rows) {
      if (row.kind === 'deck') {
        if (count >= limit) break;
        count += 1;
      }
      out.push(row);
    }
    // A heading with nothing under it is the tail of a cut-off page.
    while (out.length && out[out.length - 1]?.kind === 'head') out.pop();
    return out;
  }, [rows, page]);

  const shownCount = shownRows.reduce((n, row) => n + (row.kind === 'deck' ? 1 : 0), 0);
  const remaining = matched.length - shownCount;

  const featured = useMemo(() => {
    if (!featuredIds) return [];
    const byId = new Map(decks.map((d) => [d.id, d]));
    return featuredIds.map((id) => byId.get(id)).filter((d): d is BrowseDeck => d !== undefined);
  }, [decks, featuredIds]);

  return (
    <>
      {/* Search owns the top line at full width - sharing a row with two chip
          groups squeezed it to a box too narrow to finish its own placeholder.
          Everything that narrows the results sits on the line below it. */}
      <div className="browseToolbar" role="group" aria-label={searchPlaceholder}>
        <div className="browseSearch">
          <SearchField value={query} onValueChange={setQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        </div>
        <div className="browseToolbarRow">
          {facetRows.map(
            (row) =>
              row.options.length > 0 && (
                <div className="browseColors" role="group" aria-label={row.label} key={row.label}>
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="browseToolbarLabel">
                    {row.label}
                  </Text>
                  {row.options.map((option) => (
                    <FilterChip
                      key={option.value}
                      size="sm"
                      selected={facets.includes(option.value)}
                      onSelectedChange={(selected) => toggleFacet(option.value, selected)}
                      aria-label={option.ariaLabel}
                      className="browseColorChip"
                    >
                      {option.node}
                    </FilterChip>
                  ))}
                </div>
              ),
          )}
          <SegmentedControl
            size="sm"
            aria-label={t('brSort')}
            value={sort}
            onValueChange={(value) => setSort(value as SortMode)}
            options={[
              { value: 'new', label: t('brSortNew') },
              { value: 'old', label: t('brSortOld') },
              { value: 'az', label: t('brSortAz') },
            ]}
          />
          {/* Grouping only describes the browse shelves; a search returns one
              ranked list, so the control would be lying about the layout. */}
          {groupModes.length > 1 && !q && (
            <SegmentedControl
              size="sm"
              aria-label={t('brGroupBy')}
              value={groupMode}
              onValueChange={setGroupMode}
              options={groupModes.map((mode) => ({ value: mode.id, label: mode.label }))}
            />
          )}
        </div>
      </div>

      {/* What the filters actually did, in numbers. Without it a page of 60 out
          of 1,700 reads as "that is all there is". */}
      <div className="browseCount" aria-live="polite">
        <Text as="span" size={Size.Small} tone={TextTone.Subtle}>
          {matched.length === decks.length
            ? t('brCountAll').replace('{n}', String(decks.length))
            : t('brCountSome').replace('{n}', String(matched.length)).replace('{all}', String(decks.length))}
          {remaining > 0 && ` · ${t('brShowing').replace('{n}', String(shownCount))}`}
        </Text>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery('');
              setFacets([]);
            }}
          >
            {t('brClear')}
          </Button>
        )}
      </div>

      {jumpTargets.length > 1 && (
        <nav className="browseJump" aria-label={t('brGroupBy')}>
          {jumpTargets.map((head) => (
            <Button
              key={head.id}
              size="sm"
              variant="soft"
              onClick={() => document.getElementById(head.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {head.title}
            </Button>
          ))}
        </nav>
      )}

      {!filtersActive && featured.length > 0 && (
        <section>
          <div className="browseYearHead">
            <Sparkles size={15} aria-hidden />
            <Heading level={2} noMargin>
              {t('brFeatured')}
            </Heading>
          </div>
          <div className="browseGrid">
            {featured.map((deck, index) => (
              <BrowseTile key={deck.id} deck={deck} index={index} owned={ownedNames.has(deck.name.toLowerCase())} />
            ))}
          </div>
        </section>
      )}

      {matched.length === 0 ? (
        <EmptyFan quip={emptyQuip} />
      ) : (
        <div className="browseResults" data-settling={settling || undefined}>
          {/* One flat stream: headings open a grid, decks fill it. Searching
              emits no headings at all, so results read as one ranked list. */}
          {shownRows.map((row, index) =>
            row.kind === 'head' ? (
              <div className="browseYearHead" id={row.id} key={row.id}>
                <Heading level={2} noMargin>
                  {row.title}
                </Heading>
                <Text as="span" size={Size.Small} tone={TextTone.Subtle} mono>
                  {row.count}
                </Text>
              </div>
            ) : shownRows[index - 1]?.kind === 'deck' ? null : (
              // The first deck after a heading owns the grid for the run that
              // follows it, so the grid is one element per shelf, not per tile.
              <div className="browseGrid" key={row.deck.id}>
                {runFrom(shownRows, index).map((deck, offset) => (
                  <BrowseTile
                    key={deck.id}
                    deck={deck}
                    index={offset}
                    owned={ownedNames.has(deck.name.toLowerCase())}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      )}

      {remaining > 0 && (
        <Button variant="soft" size="sm" className="browseShowAll" onClick={() => setPage((n) => n + 1)}>
          {t('brShowMore').replace('{n}', String(Math.min(remaining, PAGE_SIZE)))}
        </Button>
      )}
    </>
  );
}

/** Tiles rendered per page. Big enough that scrolling feels continuous, small
 *  enough that a keystroke re-renders a page rather than an archive - the old
 *  page mounted 725 tiles at once and cost ~740ms of blocking work per key. */
const PAGE_SIZE = 60;

type Row =
  | { kind: 'head'; id: string; title: string; count: number }
  | { kind: 'deck'; deck: BrowseDeck };

/** The unbroken run of decks starting at `from`. */
function runFrom(rows: Row[], from: number): BrowseDeck[] {
  const out: BrowseDeck[] = [];
  for (let i = from; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.kind !== 'deck') break;
    out.push(row.deck);
  }
  return out;
}

/** memo: a keystroke re-renders the catalog, and without this every visible
 *  tile re-rendered with it even when its own deck had not changed. */
export const BrowseTile = memo(function BrowseTile({
  deck,
  index,
  owned,
}: {
  deck: BrowseDeck;
  index: number;
  owned: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const popup = useCardPopup();
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Filled in for a deck that arrived without its list (see loadCards).
  const [fetched, setFetched] = useState<DeckCard[] | null>(null);
  const [opening, setOpening] = useState(false);
  const inLibrary = owned || added;
  const cards = fetched ?? deck.cards;

  /** The deck's list, fetching it once if this catalog does not ship one. */
  const resolveCards = async (): Promise<DeckCard[] | null> => {
    if (cards.length > 0) return cards;
    if (!deck.loadCards) return null;
    try {
      const list = await deck.loadCards();
      setFetched(list);
      return list;
    } catch {
      toast({ tone: 'danger', message: t('brFetchFailed') });
      return null;
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const list = await resolveCards();
      if (!list?.length) return;
      const { id } = await api.createDeck(deck.name, deck.format, list, null, deck.game);
      await refreshDecks();
      setAdded(true);
      toast({ tone: 'success', message: `${deck.name} → ${t('decksTitle')}` });
      selectDeck(id);
      window.location.hash = '/decks';
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setAdding(false);
    }
  };

  /** Preview waits for the list, so the modal never opens onto an empty grid. */
  const openPreview = async () => {
    if (cards.length > 0) {
      setPreviewing(true);
      return;
    }
    setOpening(true);
    const list = await resolveCards();
    setOpening(false);
    if (list?.length) setPreviewing(true);
  };

  const openCover = deck.cardName
    ? () =>
        popup.open({
          scryfallId: deck.cardId,
          name: deck.cardName!,
          // Non-MTG covers resolve locally; only Scryfall ids resolve from the id alone.
          imageUrl: deck.game !== 'mtg' ? deck.cover : undefined,
        })
    : undefined;

  const body = (
    <>
      {deck.art && <div className="browseTileArt" style={{ backgroundImage: `url(${deck.art})` }} aria-hidden />}
      <div className="browseTileScrim" aria-hidden />
      <DeckStack name={deck.subtitle ?? deck.name} imageUrl={deck.cover} width={112} onClick={openCover}>
        {inLibrary && (
          <Pill size="sm" tone="success" className="browseOwnedPill" title={t('brOwned')} aria-label={t('brOwned')}>
            <Check size={12} aria-hidden />
          </Pill>
        )}
      </DeckStack>
      <div className="browseTileBody">
        <div className="browseTileTop">
          {deck.badge && (
            <Pill size="sm" variant="outline" className="browseTileCode">
              {deck.badge}
            </Pill>
          )}
          {deck.identity}
        </div>
        <div className="browseTileText">
          <span className="browseTileName">{deck.name}</span>
          {deck.subtitle && (
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="browseTileCommander">
              {deck.subtitle}
            </Text>
          )}
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
            {deck.metaText}
          </Text>
        </div>
        <div className="browseTileActions">
          {/* The label drops on a narrow tile (see the container query in
              browse.css) so Preview and Add always fit on one line. The
              aria-label carries the name either way. */}
          <Button size="sm" variant="soft" loading={opening} onClick={openPreview} aria-label={t('brPreview')}>
            <Eye size={14} />
            <span className="browseTileBtnLabel">{t('brPreview')}</span>
          </Button>
          <Button size="sm" variant={inLibrary ? 'soft' : 'solid'} loading={adding} onClick={add}>
            {inLibrary ? <Check size={14} /> : <Plus size={14} />}
            {inLibrary ? t('brAdded') : t('brAdd')}
          </Button>
        </div>
      </div>
      {/* Mounted only while open. Every tile used to carry its own modal, and
          each one sorted the deck's whole card list on mount - a page of tiles
          meant a page of hidden modals sorting tens of thousands of rows. */}
      {previewing && (
        <DeckPreviewModal
          deck={fetched ? { ...deck, cards: fetched } : deck}
          open
          onClose={() => setPreviewing(false)}
          inLibrary={inLibrary}
          adding={adding}
          onAdd={add}
        />
      )}
    </>
  );

  // Only the first row or two animate in. A motion component is real per-frame
  // work and there is one per tile; past the fold nobody sees the entrance.
  if (index >= 12) return <article className="browseTile">{body}</article>;
  return (
    <motion.article
      className="browseTile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: index * 0.03 }}
    >
      {body}
    </motion.article>
  );
});
