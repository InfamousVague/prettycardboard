import { useEffect, useMemo, useState } from 'react';
import { Heading, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useVisibleGames } from '../hooks/useVisibleGames.ts';
import {
  CATALOG,
  catalogCardCount,
  catalogDeckCards,
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
  // Cyberpunk is a WIP game: if it was the sticky choice but the dev toggle is
  // off, fall back to Magic so the hidden game never renders.
  const cyberVisible = games.some((g) => g.id === 'cyberpunk');
  useEffect(() => {
    if (game === 'cyberpunk' && !cyberVisible) setGame('mtg');
  }, [game, cyberVisible]);

  const mtg: BrowseDeck[] = useMemo(
    () =>
      CATALOG.map((deck) => {
        const commander = deck.commanders[0];
        const identity = catalogIdentity(deck);
        const extra = deck.commanders.length > 1 ? ` +${deck.commanders.length - 1}` : '';
        return {
          id: deck.id,
          name: deck.name,
          subtitle: commander ? `${commander.name}${extra}` : undefined,
          cover: commander ? cardImage(commander.sid) : undefined,
          art: commander ? artCrop(commander.sid) : undefined,
          badge: deck.code,
          identity: <ColorIdentity colors={identity} />,
          metaText: `${catalogCardCount(deck)} ${t('decksCards')} · ${deck.date.slice(0, 7)}`,
          cardId: commander?.sid,
          cardName: commander?.name,
          facets: identity,
          groups: { year: deck.date.slice(0, 4), set: deck.code },
          sortDate: deck.date,
          cards: catalogDeckCards(deck),
          game: 'mtg',
          format: 'Commander',
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

  const mtgFacet: BrowseFacet = {
    label: t('brFilterColors'),
    options: WUBRG.map((color) => ({
      value: color,
      node: <ManaSymbol symbol={color} size="1.05em" />,
      ariaLabel: `${t('brFilterColors')} ${color}`,
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

  return (
    <div className="page browsePage">
      <div className="browseHead">
        <Heading level={1}>{game === 'cyberpunk' ? t('brTitleCyber') : t('brTitle')}</Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {game === 'cyberpunk' ? t('brLedeCyber') : t('brLede')}
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
      ) : (
        <BrowseCatalog
          decks={mtg}
          featuredIds={featuredDecks().map((deck) => deck.id)}
          facet={mtgFacet}
          groupModes={[
            { id: 'year', label: t('brGroupYear') },
            { id: 'set', label: t('brGroupSet') },
          ]}
          searchPlaceholder={t('brSearch')}
          emptyQuip={t('esUntapped')}
        />
      )}
    </div>
  );
}
