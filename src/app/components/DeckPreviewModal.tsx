import { useMemo } from 'react';
import { Button, Modal, Size, Text, TextTone } from '@glacier/react';
import { Check, Plus } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { resolveCardImage } from '../data/games.ts';
import { GameCard } from './GameCard.tsx';
import { useCardPopup } from './CardPopup.tsx';
import type { BrowseDeck } from './BrowseCatalog.tsx';
import './deckPreview.css';

/**
 * A read-only look at a catalog deck's full contents before it's added to the
 * library — the anchor cards (Commander / Legends) first, then the rest, each a
 * clickable thumbnail (opens the fullscreen CardPopup) with a copy-count badge.
 * The Add button lives in the footer so the "look, then commit" flow stays in
 * one place.
 */
export function DeckPreviewModal({
  deck,
  open,
  onClose,
  inLibrary,
  adding,
  onAdd,
}: {
  deck: BrowseDeck;
  open: boolean;
  onClose: () => void;
  inLibrary: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const t = useT();
  const popup = useCardPopup();

  // Anchor cards (the Commander / Legends board) lead; everything else follows
  // in name order. Quantities are preserved as a badge rather than repeated art.
  const ordered = useMemo(() => {
    const rank = (board: string) => (board === 'commander' ? 0 : board === 'side' ? 2 : 1);
    return [...deck.cards].sort((a, b) => rank(a.board) - rank(b.board) || a.name.localeCompare(b.name));
  }, [deck.cards]);

  return (
    <Modal open={open} onClose={onClose} title={deck.name} size="lg">
      {/* `data-modal-overflow="contained"` switches the panel to a fixed height
          (overflow hidden) so this column can bound itself and scroll only the
          card grid, keeping the head + footer pinned. */}
      <div className="deckPreviewModal" data-modal-overflow="contained">
        <div className="deckPreviewHead">
          {deck.identity}
          {deck.subtitle && (
            <Text as="span" size={Size.Small} tone={TextTone.Muted}>
              {deck.subtitle}
            </Text>
          )}
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
            {deck.metaText}
          </Text>
        </div>

        <div className="deckPreviewScroll">
          <div className="deckPreviewGrid">
            {ordered.map((card) => (
              <button
                key={`${card.board}:${card.scryfallId}`}
                type="button"
                className="deckPreviewCard"
                onClick={() =>
                  popup.open({
                    scryfallId: card.scryfallId,
                    name: card.name,
                    imageUrl: resolveCardImage(deck.game, card.scryfallId),
                  })
                }
                aria-label={card.name}
              >
                <GameCard
                  name={card.name}
                  imageUrl={resolveCardImage(deck.game, card.scryfallId)}
                  fluid
                  tilt={0}
                  foil={card.board === 'commander'}
                />
                {card.quantity > 1 && (
                  <span className="deckPreviewQty" aria-hidden>
                    ×{card.quantity}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="deckPreviewFoot">
          <Button variant="ghost" onClick={onClose}>
            {t('cpClose')}
          </Button>
          <Button variant={inLibrary ? 'soft' : 'solid'} loading={adding} onClick={onAdd}>
            {inLibrary ? <Check size={14} /> : <Plus size={14} />}
            {inLibrary ? t('brAdded') : t('brAdd')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
