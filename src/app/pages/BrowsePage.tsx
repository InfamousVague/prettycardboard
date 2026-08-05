import { useEffect, useMemo, useState } from 'react';
import { Heading, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT, type MessageKey } from '../i18n.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import { GameSelect, gameLabel } from '../components/GameSelect.tsx';
import { getGame } from '../data/games.ts';
import {
  CATALOG,
  deckFamily,
  type DeckFamily,
  catalogCardCount,
  catalogDeckCards,
  catalogFace,
  catalogIdentity,
  featuredDecks,
} from '../data/catalog.ts';
import {
  CYBERPUNK_COLORS,
  CYBERPUNK_COLOR_HEX,
  cyberpunkCatalog,
  cyberpunkImage,
  cyberpunkStarters,
} from '../data/cyberpunk.ts';
import { yugiohImage, yugiohStarters } from '../data/yugioh.ts';
import { yugiohDeckCatalog } from '../data/yugiohDecks.ts';
import { BOX_SIZE, MOOD_CARDS, moodBox, moodImage, moodSlug } from '../data/moodswings.ts';
import { artCrop, cardImage } from '../data/cards.ts';
import { ColorIdentity, ManaSymbol } from '../components/Mana.tsx';
import { BrowseCatalog, type BrowseDeck, type BrowseFacet } from '../components/BrowseCatalog.tsx';
import { CommunityCatalog } from '../components/CommunityCatalog.tsx';
import './browse.css';

/**
 * Browse: one shared discover layout (BrowseCatalog) for every card game. A game
 * switcher picks which catalog to show; each game adapts its own decks (MTG
 * precons by year/set, Cyberpunk per-Legend decks by color) into the common
 * BrowseDeck shape, so the toolbar, featured shelf, grouped grids, and
 * add-to-my-decks tiles are identical across games.
 */

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/** Group heading for the "by game" shelf, which only appears once more than
 *  one catalog is on screen. */
function gameGroup(id: string): string {
  return gameLabel(getGame(id).name);
}

/** Split a Cyberpunk identity label ("Red / Green") into its colours. */
function splitColors(color: string): string[] {
  return color
    .split('/')
    .map((c) => c.trim())
    .filter(Boolean);
}

function ColorSwatch({ color }: { color: string }) {
  const parts = splitColors(color);
  // A single colour fills flat; a dual identity splits the swatch diagonally.
  const background =
    parts.length > 1
      ? `linear-gradient(135deg, ${parts.map((c) => CYBERPUNK_COLOR_HEX[c] ?? 'transparent').join(', ')})`
      : (CYBERPUNK_COLOR_HEX[parts[0] ?? color] ?? 'transparent');
  return <span className="cyberSwatch" style={{ background }} aria-hidden />;
}

export function BrowsePage() {
  const t = useT();
  // The initial game can be preset by a discover shelf (Home → Cyberpunk
  // starters); the choice is persisted so switching stays sticky. Several games
  // can be browsed at once, so the sticky value is a comma-joined list - a
  // single id written by a shelf still reads back as a one-game selection.
  const games = useVisibleGames();
  const [picked, setPickedState] = useState<string[]>(
    () => (sessionStorage.getItem('pc_browse_game') || 'mtg').split(',').filter(Boolean),
  );
  const setPicked = (value: string[]) => {
    sessionStorage.setItem('pc_browse_game', value.join(','));
    setPickedState(value);
  };
  // Drop ids this user cannot see (a WIP game with the dev toggle off, or a
  // stale id). Clearing the picker means "everything", which is a better empty
  // state than a page with no catalog on it.
  const visible = picked.filter((id) => games.some((g) => g.id === id));
  const active = visible.length > 0 ? visible : games.map((g) => g.id);
  useEffect(() => {
    if (visible.length !== picked.length) setPicked(visible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked.join(','), games.length]);
  const on = (id: string) => active.includes(id);
  const only = (id: string) => active.length === 1 && active[0] === id;

  // Where the decks come from: the precons that ship with the app, or what
  // people have published on Archidekt. Archidekt is a Magic site, so the
  // switch only exists when Magic is the one game on screen - mixing a deck
  // search into a multi-game catalog has nothing to merge it with.
  const [source, setSource] = useState<'precon' | 'community'>('precon');
  const community = only('mtg') && source === 'community';
  useEffect(() => {
    if (!only('mtg')) setSource('precon');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.join(',')]);

  const mtg: BrowseDeck[] = useMemo(
    () =>
      CATALOG.map((deck) => {
        const commander = deck.commanders[0];
        const face = catalogFace(deck);
        const identity = catalogIdentity(deck);
        const extra = deck.commanders.length > 1 ? ` +${deck.commanders.length - 1}` : '';
        return {
          id: deck.id,
          name: deck.name,
          subtitle: commander ? `${commander.name}${extra}` : deck.type,
          cover: face ? cardImage(face.sid) : undefined,
          art: face ? artCrop(face.sid) : undefined,
          badge: deck.code,
          identity: <ColorIdentity colors={identity} />,
          metaText: `${catalogCardCount(deck)} ${t('decksCards')} · ${deck.date.slice(0, 7)}`,
          cardId: face?.sid,
          cardName: face?.name,
          // Colours AND kind share one selection list, so picking Blue plus
          // Duel narrows to blue duel decks rather than widening.
          facets: [...identity, deckFamily(deck.type)],
          kind: deck.type,
          groups: {
            year: deck.date.slice(0, 4),
            set: deck.code,
            kind: deck.type ?? 'Deck',
            game: gameGroup('mtg'),
          },
          sortDate: deck.date,
          cards: catalogDeckCards(deck),
          game: 'mtg',
          // Only the commander families are commander decks; a theme deck or a
          // duel deck imported as Commander would be told it is 40 cards short.
          format: deckFamily(deck.type) === 'commander' ? 'Commander' : 'Standard',
        };
      }),
    [t],
  );

  const cyber: BrowseDeck[] = useMemo(
    () =>
      cyberpunkCatalog().map((deck) => {
        const count = deck.cards.reduce((sum, card) => sum + card.quantity, 0);
        const image = cyberpunkImage(deck.legend.id);
        return {
          id: deck.id,
          name: deck.name,
          subtitle: deck.legend.classifications.join(', ') || deck.color,
          cover: image,
          art: image,
          badge: deck.color,
          identity: <ColorSwatch color={deck.color} />,
          metaText: `${count} ${t('decksCards')}`,
          cardId: deck.legend.id,
          cardName: deck.legend.displayName,
          facets: splitColors(deck.color),
          groups: { color: deck.color, game: gameGroup('cyberpunk') },
          sortDate: '',
          cards: deck.cards,
          game: 'cyberpunk',
          format: 'standard',
        };
      }),
    [t],
  );

  const ygo: BrowseDeck[] = useMemo(() => {
    // The two bundled starters (also the featured shelf) lead…
    const starters: BrowseDeck[] = yugiohStarters().map((deck) => {
      const count = deck.cards
        .filter((card) => card.board === 'main')
        .reduce((sum, card) => sum + card.quantity, 0);
      const coverName = deck.cards.find((card) => card.scryfallId === deck.cover)?.name ?? deck.name;
      const image = yugiohImage(deck.cover);
      return {
        id: deck.id,
        name: deck.name,
        subtitle: coverName,
        cover: image,
        art: image,
        metaText: `${count} ${t('decksCards')}`,
        cardId: deck.cover,
        cardName: coverName,
        kind: 'Starter',
        facets: ['Starter'],
        // The bundled starters carry no release date, so they need an explicit
        // Year bucket or that grouping renders them under a blank heading.
        groups: { kind: 'Starter', year: t('brKindStarter'), game: gameGroup('yugioh') },
        sortDate: '',
        cards: deck.cards,
        game: 'yugioh',
        format: 'standard',
      };
    });
    // …followed by every official deck product Konami has boxed (synced from
    // YGOPRODeck's set listings; every card qty 1, see yugiohDecks.ts).
    const products: BrowseDeck[] = yugiohDeckCatalog().map((deck) => {
      const count = deck.cards.reduce((sum, card) => sum + card.qty, 0);
      const coverName = deck.cards.find((card) => card.id === deck.cover)?.name ?? deck.name;
      const image = yugiohImage(deck.cover);
      const year = deck.date.slice(0, 4);
      return {
        id: deck.id,
        name: deck.name,
        subtitle: coverName,
        cover: image,
        art: image,
        badge: deck.code || undefined,
        metaText: `${count} ${t('decksCards')}`,
        cardId: deck.cover,
        cardName: coverName,
        kind: deck.kind,
        facets: [deck.kind],
        groups: { kind: deck.kind, ...(year ? { year } : {}), game: gameGroup('yugioh') },
        sortDate: deck.date,
        cards: deck.cards.map((card) => ({
          scryfallId: card.id,
          name: card.name,
          quantity: card.qty,
          board: card.board,
        })),
        game: 'yugioh',
        format: 'standard',
      };
    });
    return [...starters, ...products];
  }, [t]);

  /**
   * Mood Swings has no deck products to browse - you do not build, and there
   * is no second box to compare. What it does have is the set itself, so the
   * catalog is the two honest ways to take it to a table: a randomized box (the
   * actual product, 45 of the 133) and the complete run of cards. Falling
   * through to Magic's precons here was the bug this fixes.
   */
  const mood: BrowseDeck[] = useMemo(() => {
    const cover = moodImage(moodSlug('Love'));
    const all = MOOD_CARDS.map((card) => ({
      scryfallId: card.id,
      name: card.name,
      quantity: 1,
      board: 'main' as const,
    }));
    const base = { cover, art: cover, cardId: moodSlug('Love'), cardName: 'Love', game: 'moodswings', format: 'standard', sortDate: '' };
    return [
      {
        ...base,
        id: 'msw-box',
        name: t('brMoodBox'),
        subtitle: t('brMoodBoxSub'),
        metaText: `${BOX_SIZE} ${t('decksCards')}`,
        kind: t('brMoodBox'),
        facets: [],
        groups: { kind: t('brMoodBox'), game: gameGroup('moodswings') },
        cards: moodBox(),
      },
      {
        ...base,
        id: 'msw-set',
        name: t('brMoodSet'),
        subtitle: t('brMoodSetSub'),
        metaText: `${all.length} ${t('decksCards')}`,
        kind: t('brMoodSet'),
        facets: [],
        groups: { kind: t('brMoodSet'), game: gameGroup('moodswings') },
        cards: all,
      },
    ];
  }, [t]);

  // With several catalogs on screen at once, two rows both labelled "Colors"
  // read as one broken control - so each row says whose colours it is filtering.
  const multi = active.length > 1;
  const facetLabel = (base: string, gameId: string) => (multi ? `${gameGroup(gameId)} · ${base}` : base);

  const mtgFacet: BrowseFacet = {
    label: facetLabel(t('brFilterColors'), 'mtg'),
    options: WUBRG.map((color) => ({
      value: color,
      node: <ManaSymbol symbol={color} size="1.05em" />,
      ariaLabel: `${t('brFilterColors')} ${color}`,
    })),
  };
  // Thirty years of product names collapse to the handful of things a player
  // is actually choosing between.
  const KINDS: { value: DeckFamily; key: MessageKey }[] = [
    { value: 'commander', key: 'brKindCommander' },
    { value: 'starter', key: 'brKindStarter' },
    { value: 'duel', key: 'brKindDuel' },
    { value: 'competitive', key: 'brKindCompetitive' },
    { value: 'multiplayer', key: 'brKindMultiplayer' },
    { value: 'jumpstart', key: 'brKindJumpstart' },
    { value: 'other', key: 'brKindOther' },
  ];
  const mtgKindFacet: BrowseFacet = {
    label: facetLabel(t('brFilterKind'), 'mtg'),
    options: KINDS.map(({ value, key }) => ({
      value,
      node: t(key),
      ariaLabel: `${t('brFilterKind')} ${t(key)}`,
    })),
  };
  const cyberFacet: BrowseFacet = {
    label: facetLabel(t('brFilterColors'), 'cyberpunk'),
    options: CYBERPUNK_COLORS.map((color) => ({
      value: color,
      node: <ColorSwatch color={color} />,
      ariaLabel: color,
    })),
  };
  // Facet values match the product kinds yugiohDecks.ts ships ('Other' — the
  // 2-player sets — stays reachable by search and the unfiltered grid).
  const YGO_KINDS: { value: string; key: MessageKey }[] = [
    { value: 'Starter', key: 'brKindStarter' },
    { value: 'Structure', key: 'brKindStructure' },
    { value: 'Speed Duel', key: 'brKindSpeedDuel' },
  ];
  const ygoKindFacet: BrowseFacet = {
    label: facetLabel(t('brFilterKind'), 'yugioh'),
    options: YGO_KINDS.map(({ value, key }) => ({
      value,
      node: t(key),
      ariaLabel: `${t('brFilterKind')} ${t(key)}`,
    })),
  };

  // Only the picked games contribute. A game with nothing to browse contributes
  // nothing at all rather than borrowing another game's catalog - which is what
  // Mood Swings used to do, showing Magic precons under its own name.
  const key = active.join(',');
  const decks = useMemo(
    () => [
      ...(on('mtg') ? mtg : []),
      ...(on('cyberpunk') ? cyber : []),
      ...(on('yugioh') ? ygo : []),
      ...(on('moodswings') ? mood : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, mtg, cyber, ygo, mood],
  );
  const featuredIds = useMemo(
    () => [
      ...(on('mtg') ? featuredDecks().map((deck) => deck.id) : []),
      ...(on('cyberpunk') ? cyberpunkStarters().map((starter) => starter.id) : []),
      ...(on('yugioh') ? yugiohStarters().map((starter) => starter.id) : []),
      ...(on('moodswings') ? ['msw-box'] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const facetRows: BrowseFacet[] = [
    ...(on('mtg') ? [mtgFacet, mtgKindFacet] : []),
    ...(on('cyberpunk') ? [cyberFacet] : []),
    ...(on('yugioh') ? [ygoKindFacet] : []),
  ];
  // Group modes are whatever the picked catalogs can all be cut by. Year and
  // kind survive a mixed selection; set and colour belong to one game each, so
  // they only appear when that game is the one on screen.
  const groupModes = [
    ...(multi ? [{ id: 'game', label: t('playGame') }] : []),
    ...(on('mtg') || on('yugioh') ? [{ id: 'year', label: t('brGroupYear') }] : []),
    ...(on('mtg') || on('yugioh') || on('moodswings') ? [{ id: 'kind', label: t('brGroupKind') }] : []),
    ...(only('cyberpunk') ? [{ id: 'color', label: t('brFilterColors') }] : []),
    ...(only('mtg') ? [{ id: 'set', label: t('brGroupSet') }] : []),
  ];

  const title = community
    ? t('brTitleCommunity')
    : only('cyberpunk')
      ? t('brTitleCyber')
      : only('yugioh')
        ? t('brTitleYugioh')
        : only('moodswings')
          ? t('brTitleMood')
          : only('mtg')
            ? t('brTitle')
            : t('brTitleAll');
  const lede = community
    ? t('brLedeCommunity')
    : only('cyberpunk')
      ? t('brLedeCyber')
      : only('yugioh')
        ? t('brLedeYugioh')
        : only('moodswings')
          ? t('brLedeMood')
          : only('mtg')
            ? t('brLede')
            : t('brLedeAll');

  return (
    <div className="page browsePage">
      <div className="browseHead">
        <Heading level={1}>{title}</Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {lede}
        </Text>
        <div className="browseGameSwitch">
          <GameSelect
            aria-label={t('playGame')}
            value={visible}
            onValueChange={setPicked}
            placeholder={t('brAllGames')}
          />
          {only('mtg') && (
            <SegmentedControl
              aria-label={t('brSource')}
              value={source}
              onValueChange={(value) => setSource(value as 'precon' | 'community')}
              options={[
                { value: 'precon', label: t('brSourcePrecon') },
                { value: 'community', label: t('brSourceCommunity') },
              ]}
            />
          )}
        </div>
      </div>

      {community ? (
        <CommunityCatalog />
      ) : (
        <BrowseCatalog
          key={key}
          decks={decks}
          featuredIds={featuredIds}
          facet={facetRows}
          groupModes={groupModes}
          searchPlaceholder={t('brSearch')}
          emptyQuip={t('esUntapped')}
        />
      )}
    </div>
  );
}
