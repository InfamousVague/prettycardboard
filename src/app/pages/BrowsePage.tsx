import { useEffect, useMemo, useState } from 'react';
import { Heading, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT, type MessageKey } from '../i18n.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
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
import { artCrop, cardImage } from '../data/cards.ts';
import { ColorIdentity, ManaSymbol } from '../components/Mana.tsx';
import { BrowseCatalog, type BrowseDeck, type BrowseFacet } from '../components/BrowseCatalog.tsx';
import './browse.css';

/**
 * Browse: one shared discover layout (BrowseCatalog) for every card game. A game
 * switcher picks which catalog to show; each game adapts its own decks (MTG
 * precons by year/set, Cyberpunk per-Legend decks by color) into the common
 * BrowseDeck shape, so the toolbar, featured shelf, grouped grids, and
 * add-to-my-decks tiles are identical across games.
 */

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

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
  // starters); the choice is persisted so switching stays sticky.
  const games = useVisibleGames();
  const [game, setGameState] = useState(() => sessionStorage.getItem('pc_browse_game') || 'mtg');
  const setGame = (value: string) => {
    sessionStorage.setItem('pc_browse_game', value);
    setGameState(value);
  };
  // If the sticky choice is a game this user cannot see (a WIP game with the
  // dev toggle off, or a stale id), fall back to Magic so it never renders.
  const gameVisible = games.some((g) => g.id === game);
  useEffect(() => {
    if (!gameVisible) setGame('mtg');
  }, [game, gameVisible]);

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
          groups: { year: deck.date.slice(0, 4), set: deck.code, kind: deck.type ?? 'Deck' },
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
          groups: { color: deck.color },
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
        groups: { kind: 'Starter', year: t('brKindStarter') },
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
        groups: { kind: deck.kind, ...(year ? { year } : {}) },
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

  const mtgFacet: BrowseFacet = {
    label: t('brFilterColors'),
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
    label: t('brFilterKind'),
    options: KINDS.map(({ value, key }) => ({
      value,
      node: t(key),
      ariaLabel: `${t('brFilterKind')} ${t(key)}`,
    })),
  };
  const cyberFacet: BrowseFacet = {
    label: t('brFilterColors'),
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
    label: t('brFilterKind'),
    options: YGO_KINDS.map(({ value, key }) => ({
      value,
      node: t(key),
      ariaLabel: `${t('brFilterKind')} ${t(key)}`,
    })),
  };

  return (
    <div className="page browsePage">
      <div className="browseHead">
        <Heading level={1}>
          {game === 'cyberpunk' ? t('brTitleCyber') : game === 'yugioh' ? t('brTitleYugioh') : t('brTitle')}
        </Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {game === 'cyberpunk' ? t('brLedeCyber') : game === 'yugioh' ? t('brLedeYugioh') : t('brLede')}
        </Text>
        <div className="browseGameSwitch">
          <SegmentedControl
            aria-label={t('playGame')}
            value={game}
            onValueChange={setGame}
            options={games.map((g) => ({ value: g.id, label: g.name.replace('Magic: The Gathering', 'Magic') }))}
          />
        </div>
      </div>

      {game === 'cyberpunk' ? (
        <BrowseCatalog
          decks={cyber}
          featuredIds={cyberpunkStarters().map((starter) => starter.id)}
          facet={cyberFacet}
          groupModes={[{ id: 'color', label: t('brFilterColors') }]}
          searchPlaceholder={t('brSearch')}
          emptyQuip={t('esUntapped')}
        />
      ) : game === 'yugioh' ? (
        <BrowseCatalog
          decks={ygo}
          featuredIds={yugiohStarters().map((starter) => starter.id)}
          facet={[ygoKindFacet]}
          groupModes={[
            { id: 'kind', label: t('brGroupKind') },
            { id: 'year', label: t('brGroupYear') },
          ]}
          searchPlaceholder={t('brSearch')}
          emptyQuip={t('esUntapped')}
        />
      ) : (
        <BrowseCatalog
          decks={mtg}
          featuredIds={featuredDecks().map((deck) => deck.id)}
          facet={[mtgFacet, mtgKindFacet]}
          groupModes={[
            { id: 'year', label: t('brGroupYear') },
            { id: 'kind', label: t('brGroupKind') },
            { id: 'set', label: t('brGroupSet') },
          ]}
          searchPlaceholder={t('brSearch')}
          emptyQuip={t('esUntapped')}
        />
      )}
    </div>
  );
}
