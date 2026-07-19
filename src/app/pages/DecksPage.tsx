import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Button, EmptyState, Heading, Menu, MenuItem, Pill, Size, Text, TextTone, useToast } from '@glacier/react';
import { Download, Layers, Plus } from '@glacier/icons';
import { useT } from '../i18n.ts';
import * as api from '../net/api.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import { FORMATS } from '../data/formats.ts';
import type { DeckSummary } from '../net/types.ts';
import { GameCard } from '../components/GameCard.tsx';
import { DeckEditor } from './deckbuilder/DeckEditor.tsx';
import { ImportDialog } from './deckbuilder/ImportDialog.tsx';
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
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    refreshDecks().catch(() => {
      // Offline is fine - the store keeps whatever it had.
    });
  }, [refreshDecks]);

  const createDeck = async (format: string) => {
    setCreating(true);
    try {
      const { id } = await api.createDeck(t('dbUntitled'), format, []);
      await refreshDecks();
      selectDeck(id);
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    } finally {
      setCreating(false);
    }
  };

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
          <Menu
            aria-label={t('decksNew')}
            trigger={
              <Button loading={creating}>
                <Plus size={16} />
                {t('decksNew')}
              </Button>
            }
          >
            {FORMATS.map((format) => (
              <MenuItem key={format.id} onSelect={() => void createDeck(format.name)}>
                {format.name}
              </MenuItem>
            ))}
          </Menu>
        </div>
      </div>

      {decks.length === 0 ? (
        <EmptyState
          icon={<Layers size={22} />}
          title={t('decksTitle')}
          description={t('decksEmpty')}
          action={
            <Button onClick={() => void createDeck('Commander')} loading={creating}>
              <Plus size={16} />
              {t('decksNew')}
            </Button>
          }
        />
      ) : (
        <div className="deckGrid">
          {decks.map((deck, index) => (
            <DeckTile key={deck.id} deck={deck} index={index} onOpen={() => selectDeck(deck.id)} />
          ))}
        </div>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function DeckTile({ deck, index, onOpen }: { deck: DeckSummary; index: number; onOpen: () => void }) {
  const t = useT();
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
        <GameCard
          name={deck.commander || deck.name}
          imageUrl={deck.coverImageUrl || undefined}
          width={168}
          foil
          tilt={7}
        />
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
