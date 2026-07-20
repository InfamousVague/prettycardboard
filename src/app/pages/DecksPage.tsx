import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Button, EmptyState, Heading, Pill, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { Download, Layers, Plus } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import { GAME_LIST, resolveCardImage } from '../data/games.ts';
import type { DeckSummary } from '../net/types.ts';
import { GameCard } from '../components/GameCard.tsx';
import { GameTag } from '../components/GameTag.tsx';
import { DeckEditor } from './deckbuilder/DeckEditor.tsx';
import { ImportDialog } from './deckbuilder/ImportDialog.tsx';
import { NewDeckWizard } from './deckbuilder/NewDeckWizard.tsx';
import '../components/gamecard.css';
import './deckbuilder/decks.css';

/**
 * Decks: the library grid when nothing is selected, the deck editor when the
 * contextual sidebar (or a tile) picks a deck. Selection lives in uiStore so
 * the sidebar and this page stay in step.
 */
export function DecksPage() {
  const selectedDeckId = useUi((state) => state.selectedDeckId);
  // Remount the editor per deck so its load/save state never bleeds across.
  return selectedDeckId ? <DeckEditor key={selectedDeckId} deckId={selectedDeckId} /> : <DeckLibrary />;
}

function DeckLibrary() {
  const t = useT();
  const decks = useApp((state) => state.decks);
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [importOpen, setImportOpen] = useState(false);
  const [newDeckOpen, setNewDeckOpen] = useState(false);
  // Which game's decks to show. 'all' spans every game.
  const [gameFilter, setGameFilter] = useState('all');
  const shown = gameFilter === 'all' ? decks : decks.filter((deck) => (deck.game || 'mtg') === gameFilter);

  useEffect(() => {
    refreshDecks().catch(() => {
      // Offline is fine - the store keeps whatever it had.
    });
  }, [refreshDecks]);

  // A "New deck" action from elsewhere (sidebar, home) opens the wizard here.
  const newDeckIntent = useUi((state) => state.newDeckIntent);
  const clearNewDeckIntent = useUi((state) => state.clearNewDeckIntent);
  useEffect(() => {
    if (newDeckIntent) {
      setNewDeckOpen(true);
      clearNewDeckIntent();
    }
  }, [newDeckIntent, clearNewDeckIntent]);

  return (
    <div className="page decksPage">
      <div className="decksHead">
        <div>
          <Heading level={1}>{t('decksTitle')}</Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="lede">
            {t('decksLede')}
          </Text>
        </div>
        <div className="decksActions">
          <Button variant="soft" onClick={() => setImportOpen(true)}>
            <Download size={16} />
            {t('decksImport')}
          </Button>
          <Button onClick={() => setNewDeckOpen(true)}>
            <Plus size={16} />
            {t('decksNew')}
          </Button>
        </div>
      </div>

      {decks.length > 0 && (
        <div className="decksFilter">
          <SegmentedControl
            value={gameFilter}
            onValueChange={setGameFilter}
            options={[
              { value: 'all', label: t('decksAllGames') },
              ...GAME_LIST.map((g) => ({ value: g.id, label: g.name.replace('Magic: The Gathering', 'Magic') })),
            ]}
          />
        </div>
      )}

      {decks.length === 0 ? (
        <EmptyState
          icon={<Layers size={22} />}
          title={t('decksTitle')}
          description={t('decksEmpty')}
          action={
            <Button onClick={() => setNewDeckOpen(true)}>
              <Plus size={16} />
              {t('decksNew')}
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<Layers size={22} />} title={t('decksTitle')} description={t('playNoDecksForGame')} />
      ) : (
        <div className="deckGrid">
          {shown.map((deck, index) => (
            <DeckTile key={deck.id} deck={deck} index={index} onOpen={() => selectDeck(deck.id)} />
          ))}
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <NewDeckWizard open={newDeckOpen} onClose={() => setNewDeckOpen(false)} />
    </div>
  );
}

function DeckTile({ deck, index, onOpen }: { deck: DeckSummary; index: number; onOpen: () => void }) {
  const t = useT();
  // MTG ships a Scryfall cover URL; Cyberpunk resolves its bundled art from the
  // cover card id.
  const cover = deck.coverImageUrl || (deck.coverCardId ? resolveCardImage(deck.game, deck.coverCardId) : undefined);
  return (
    <motion.button
      type="button"
      className="deckTile"
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: 'easeOut', delay: Math.min(index, 8) * 0.035 }}
    >
      <div className="deckTileArt">
        <GameCard name={deck.commander || deck.name} imageUrl={cover} width={168} foil tilt={7} />
        <GameTag game={deck.game} showName={false} className="deckTileGame" />
      </div>
      <div className="deckTileInfo">
        <span className="deckTileName">{deck.name}</span>
        {deck.commander && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckTileCommander">
            {deck.commander}
          </Text>
        )}
        <span className="deckTileMeta">
          <Pill size="sm" tone="accent" variant="soft">
            {deck.format}
          </Pill>
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
            {deck.cardCount} {t('decksCards')}
          </Text>
        </span>
      </div>
    </motion.button>
  );
}
