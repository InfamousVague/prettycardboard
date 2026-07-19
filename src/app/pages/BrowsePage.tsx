import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Button,
  FilterChip,
  Heading,
  Pill,
  SearchField,
  SegmentedControl,
  Size,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { Check, Plus, Sparkles } from '@glacier/icons';
import { useT } from '../i18n.ts';
import * as api from '../net/api.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import { artCrop, cardImage } from '../data/cards.ts';
import {
  CATALOG,
  catalogByYear,
  catalogCardCount,
  catalogDeckCards,
  catalogIdentity,
  featuredDecks,
  type CatalogDeck,
} from '../data/catalog.ts';
import { ColorIdentity, ManaSymbol } from '../components/Mana.tsx';
import { DeckStack } from '../components/DeckStack.tsx';
import { EmptyFan } from '../components/Skeletons.tsx';
import { useCardPopup } from '../components/CardPopup.tsx';
import './browse.css';

/**
 * Browse: every Commander precon of recent years (2020→) as 3D deck stacks
 * with one-click "add to my decks". A toolbar filters by name, color identity
 * (contains every selected color), sorts within groups, and regroups the
 * catalog by year or by set code. Decks already in the library wear an owned
 * badge; the stack itself opens the commander in the card popup.
 */

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

type SortMode = 'new' | 'old' | 'az';
type GroupMode = 'year' | 'set';

function sortDecks(decks: CatalogDeck[], sort: SortMode): CatalogDeck[] {
  const sorted = [...decks];
  if (sort === 'az') sorted.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'old') sorted.sort((a, b) => a.date.localeCompare(b.date));
  else sorted.sort((a, b) => b.date.localeCompare(a.date));
  return sorted;
}

/** By-set groups: keyed by set code, newest release in each set first. */
function catalogBySet(): { code: string; decks: CatalogDeck[] }[] {
  const groups = new Map<string, CatalogDeck[]>();
  for (const deck of CATALOG) {
    const list = groups.get(deck.code);
    if (list) list.push(deck);
    else groups.set(deck.code, [deck]);
  }
  return [...groups.entries()]
    .map(([code, decks]) => ({ code, decks }))
    .sort((a, b) => {
      const newest = (decks: CatalogDeck[]) => decks.reduce((max, deck) => (deck.date > max ? deck.date : max), '');
      return newest(b.decks).localeCompare(newest(a.decks));
    });
}

export function BrowsePage() {
  const t = useT();
  const [query, setQuery] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [sort, setSort] = useState<SortMode>('new');
  const [group, setGroup] = useState<GroupMode>('year');
  const ownedDecks = useApp((state) => state.decks);

  const featured = useMemo(() => featuredDecks(), []);
  const ownedNames = useMemo(() => new Set(ownedDecks.map((deck) => deck.name.toLowerCase())), [ownedDecks]);

  const q = query.trim().toLowerCase();
  const filtersActive = q.length > 0 || colors.length > 0;

  const matches = (deck: CatalogDeck) => {
    if (
      q.length > 0 &&
      !deck.name.toLowerCase().includes(q) &&
      !deck.code.toLowerCase().includes(q) &&
      !deck.commanders.some((commander) => commander.name.toLowerCase().includes(q))
    ) {
      return false;
    }
    if (colors.length > 0) {
      const identity = catalogIdentity(deck);
      if (!colors.every((color) => identity.includes(color))) return false;
    }
    return true;
  };

  const sections = useMemo(() => {
    const raw =
      group === 'year'
        ? catalogByYear().map(({ year, decks }) => ({ id: `browse-${year}`, title: year, decks }))
        : catalogBySet().map(({ code, decks }) => ({ id: `browse-${code}`, title: code, decks }));
    return raw
      .map((section) => ({ ...section, decks: sortDecks(section.decks.filter(matches), sort) }))
      .filter((section) => section.decks.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, sort, q, colors]);

  const toggleColor = (color: string, selected: boolean) => {
    setColors((current) => (selected ? [...current, color] : current.filter((entry) => entry !== color)));
  };

  return (
    <div className="page browsePage">
      <div className="browseHead">
        <Heading level={1}>{t('brTitle')}</Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {t('brLede')}
        </Text>
      </div>

      <div className="browseToolbar" role="group" aria-label={t('brTitle')}>
        <div className="browseSearch">
          <SearchField value={query} onValueChange={setQuery} placeholder={t('brSearch')} aria-label={t('brSearch')} />
        </div>
        <div className="browseColors" role="group" aria-label={t('brFilterColors')}>
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="browseToolbarLabel">
            {t('brFilterColors')}
          </Text>
          {WUBRG.map((color) => (
            <FilterChip
              key={color}
              size="sm"
              selected={colors.includes(color)}
              onSelectedChange={(selected) => toggleColor(color, selected)}
              aria-label={`${t('brFilterColors')} ${color}`}
              className="browseColorChip"
            >
              <ManaSymbol symbol={color} size="1.05em" />
            </FilterChip>
          ))}
        </div>
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
        <SegmentedControl
          size="sm"
          aria-label={t('brGroupBy')}
          value={group}
          onValueChange={(value) => setGroup(value as GroupMode)}
          options={[
            { value: 'year', label: t('brGroupYear') },
            { value: 'set', label: t('brGroupSet') },
          ]}
        />
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
              <PreconTile key={deck.id} deck={deck} index={index} owned={ownedNames.has(deck.name.toLowerCase())} />
            ))}
          </div>
        </section>
      )}

      {sections.length === 0 ? (
        <EmptyFan quip={t('esUntapped')} />
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
                <PreconTile key={deck.id} deck={deck} index={index} owned={ownedNames.has(deck.name.toLowerCase())} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PreconTile({ deck, index, owned }: { deck: CatalogDeck; index: number; owned: boolean }) {
  const t = useT();
  const { toast } = useToast();
  const popup = useCardPopup();
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const commander = deck.commanders[0];
  const identity = catalogIdentity(deck);
  const inLibrary = owned || added;

  const add = async () => {
    setAdding(true);
    try {
      const { id } = await api.createDeck(deck.name, 'Commander', catalogDeckCards(deck));
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

  return (
    <motion.article
      className="browseTile"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index, 10) * 0.03 }}
    >
      {/* The commander's own art, blurred, fills the tile's empty space; a
          scrim keeps the chrome and text on the end side readable. */}
      {commander && (
        <div
          className="browseTileArt"
          style={{ backgroundImage: `url(${artCrop(commander.sid)})` }}
          aria-hidden
        />
      )}
      <div className="browseTileScrim" aria-hidden />
      <DeckStack
        name={commander?.name ?? deck.name}
        imageUrl={commander ? cardImage(commander.sid) : undefined}
        width={150}
        onClick={commander ? () => popup.open({ scryfallId: commander.sid, name: commander.name }) : undefined}
      >
        {inLibrary && (
          <Pill size="sm" tone="success" className="browseOwnedPill" title={t('brOwned')} aria-label={t('brOwned')}>
            <Check size={12} aria-hidden />
          </Pill>
        )}
      </DeckStack>
      <div className="browseTileBody">
        <div className="browseTileTop">
          <Pill size="sm" variant="outline" className="browseTileCode">
            {deck.code}
          </Pill>
          <ColorIdentity colors={identity} />
        </div>
        <div className="browseTileText">
          <span className="browseTileName">{deck.name}</span>
          {commander && (
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="browseTileCommander">
              {commander.name}
              {deck.commanders.length > 1 ? ` +${deck.commanders.length - 1}` : ''}
            </Text>
          )}
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
            {catalogCardCount(deck)} {t('decksCards')} · {deck.date.slice(0, 7)}
          </Text>
        </div>
        <Button size="sm" variant={inLibrary ? 'soft' : 'solid'} loading={adding} onClick={add}>
          {inLibrary ? <Check size={14} /> : <Plus size={14} />}
          {inLibrary ? t('brAdded') : t('brAdd')}
        </Button>
      </div>
    </motion.article>
  );
}
