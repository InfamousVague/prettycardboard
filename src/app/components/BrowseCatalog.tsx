import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { Button, FilterChip, Heading, Pill, SearchField, SegmentedControl, Size, Text, TextTone, useToast } from '@glacier/react';
import { Check, Eye, Plus, Sparkles } from '@glacier/icons';
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
  /** Group label per group-mode id (e.g. { year: '2023', set: 'BLC' }). */
  groups: Record<string, string>;
  /** ISO-ish date for new/old sorting (empty when a game has no dates). */
  sortDate: string;
  cards: DeckCard[];
  game: string;
  /** Format passed to createDeck ("Commander" | "standard"). */
  format: string;
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
  facet: BrowseFacet;
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

  const q = query.trim().toLowerCase();
  const filtersActive = q.length > 0 || facets.length > 0;
  const toggleFacet = (value: string, selected: boolean) =>
    setFacets((current) => (selected ? [...current, value] : current.filter((v) => v !== value)));

  const sections = useMemo(() => {
    const match = (d: BrowseDeck) => {
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !(d.subtitle ?? '').toLowerCase().includes(q) &&
        !(d.badge ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return facets.length === 0 || facets.every((f) => d.facets.includes(f));
    };
    const cmp = (a: BrowseDeck, b: BrowseDeck) =>
      sort === 'az'
        ? a.name.localeCompare(b.name)
        : sort === 'old'
          ? a.sortDate.localeCompare(b.sortDate)
          : b.sortDate.localeCompare(a.sortDate);
    const byGroup = new Map<string, BrowseDeck[]>();
    for (const deck of decks) {
      if (!match(deck)) continue;
      const key = deck.groups[groupMode] ?? '';
      const list = byGroup.get(key);
      if (list) list.push(deck);
      else byGroup.set(key, [deck]);
    }
    return [...byGroup.entries()]
      .map(([title, ds]) => ({
        id: `browse-${title}`,
        title,
        decks: [...ds].sort(cmp),
        newest: ds.reduce((max, d) => (d.sortDate > max ? d.sortDate : max), ''),
      }))
      .filter((section) => section.decks.length > 0)
      .sort((a, b) => b.newest.localeCompare(a.newest) || a.title.localeCompare(b.title));
  }, [decks, q, facets, sort, groupMode]);

  const featured = useMemo(() => {
    if (!featuredIds) return [];
    const byId = new Map(decks.map((d) => [d.id, d]));
    return featuredIds.map((id) => byId.get(id)).filter((d): d is BrowseDeck => d !== undefined);
  }, [decks, featuredIds]);

  return (
    <>
      <div className="browseToolbar" role="group" aria-label={searchPlaceholder}>
        <div className="browseSearch">
          <SearchField value={query} onValueChange={setQuery} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
        </div>
        {facet.options.length > 0 && (
          <div className="browseColors" role="group" aria-label={facet.label}>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="browseToolbarLabel">
              {facet.label}
            </Text>
            {facet.options.map((option) => (
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
        {groupModes.length > 1 && (
          <SegmentedControl
            size="sm"
            aria-label={t('brGroupBy')}
            value={groupMode}
            onValueChange={setGroupMode}
            options={groupModes.map((mode) => ({ value: mode.id, label: mode.label }))}
          />
        )}
      </div>

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

      {sections.length === 0 ? (
        <EmptyFan quip={emptyQuip} />
      ) : (
        sections.map((section) => (
          <section key={section.id} id={section.id}>
            <div className="browseYearHead">
              <Heading level={2} noMargin>
                {section.title}
              </Heading>
              <Text as="span" size={Size.Small} tone={TextTone.Subtle} mono>
                {section.decks.length}
              </Text>
            </div>
            <div className="browseGrid">
              {section.decks.map((deck, index) => (
                <BrowseTile key={deck.id} deck={deck} index={index} owned={ownedNames.has(deck.name.toLowerCase())} />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function BrowseTile({ deck, index, owned }: { deck: BrowseDeck; index: number; owned: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const popup = useCardPopup();
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const inLibrary = owned || added;

  const add = async () => {
    setAdding(true);
    try {
      const { id } = await api.createDeck(deck.name, deck.format, deck.cards, null, deck.game);
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

  const openCover = deck.cardName
    ? () =>
        popup.open({
          scryfallId: deck.cardId,
          name: deck.cardName!,
          imageUrl: deck.game === 'cyberpunk' ? deck.cover : undefined,
        })
    : undefined;

  return (
    <motion.article
      className="browseTile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index, 10) * 0.03 }}
    >
      {deck.art && <div className="browseTileArt" style={{ backgroundImage: `url(${deck.art})` }} aria-hidden />}
      <div className="browseTileScrim" aria-hidden />
      <DeckStack name={deck.subtitle ?? deck.name} imageUrl={deck.cover} width={150} onClick={openCover}>
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
          <Button size="sm" variant="soft" onClick={() => setPreviewing(true)} aria-label={t('brPreview')}>
            <Eye size={14} />
            {t('brPreview')}
          </Button>
          <Button size="sm" variant={inLibrary ? 'soft' : 'solid'} loading={adding} onClick={add}>
            {inLibrary ? <Check size={14} /> : <Plus size={14} />}
            {inLibrary ? t('brAdded') : t('brAdd')}
          </Button>
        </div>
      </div>
      <DeckPreviewModal
        deck={deck}
        open={previewing}
        onClose={() => setPreviewing(false)}
        inLibrary={inLibrary}
        adding={adding}
        onAdd={add}
      />
    </motion.article>
  );
}
