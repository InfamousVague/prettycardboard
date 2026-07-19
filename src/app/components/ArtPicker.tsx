import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Heading, IconButton, Size, Text, TextTone } from '@glacier/react';
import { X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { fetchPrintings, type Printing } from '../data/scryfall.ts';
import { CardRowSkeleton } from './Skeletons.tsx';
import './pickers.css';

/**
 * Right-click customization modals.
 *
 * ArtPicker: every paper printing of a card as a wall of art; picking one
 * swaps the deck entry's Scryfall id to that printing, so the choice ships
 * with the deck itself (the server just stores the id).
 *
 * HeaderCardPicker: the deck's own cards; picking one becomes the deck's
 * header/cover card (persisted in the deck's `header` field).
 */

function PickerShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <motion.div
      className="pkBackdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        className="pkPanel"
        initial={{ y: 18, scale: 0.98, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="pkHead">
          <div>
            <Heading level={2} visualLevel={3} noMargin>
              {title}
            </Heading>
            {subtitle && (
              <Text size={Size.Small} tone={TextTone.Muted}>
                {subtitle}
              </Text>
            )}
          </div>
          <IconButton variant="ghost" aria-label={t('cpClose')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ArtPicker({
  scryfallId,
  name,
  onSelect,
  onClose,
}: {
  scryfallId: string;
  name: string;
  onSelect: (printingId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [printings, setPrintings] = useState<Printing[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPrintings(scryfallId)
      .then((loaded) => {
        if (!cancelled) setPrintings(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scryfallId]);

  return (
    <PickerShell title={t('apArtwork')} subtitle={name} onClose={onClose}>
      {failed ? (
        <Text size={Size.Small} tone={TextTone.Danger} className="pkHint">
          {t('obOffline')}
        </Text>
      ) : printings === null ? (
        <div className="pkLoading">
          <CardRowSkeleton count={4} width={104} />
        </div>
      ) : (
        <div className="pkGrid">
          {printings.map((printing) => (
            <button
              key={printing.id}
              type="button"
              className="pkCard"
              data-current={printing.id === scryfallId || undefined}
              onClick={() => {
                onSelect(printing.id);
                onClose();
              }}
            >
              <img src={cardImage(printing.id)} alt={printing.setName} loading="lazy" draggable={false} />
              <span className="pkCaption">
                <span className="pkSet">{printing.setName}</span>
                <span className="pkMeta">
                  {printing.set.toUpperCase()}
                  {printing.releasedAt ? ` · ${printing.releasedAt.slice(0, 4)}` : ''}
                  {printing.artist ? ` · ${printing.artist}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </PickerShell>
  );
}

export interface HeaderCandidate {
  scryfallId: string;
  name: string;
}

export function HeaderCardPicker({
  cards,
  current,
  deckName,
  onSelect,
  onClose,
}: {
  cards: HeaderCandidate[];
  current?: string | null;
  deckName: string;
  onSelect: (scryfallId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <PickerShell title={t('apHeaderCard')} subtitle={deckName} onClose={onClose}>
      <Text size={Size.Small} tone={TextTone.Subtle} className="pkHint">
        {t('apHeaderHint')}
      </Text>
      <div className="pkGrid">
        {cards.map((card) => (
          <button
            key={card.scryfallId}
            type="button"
            className="pkCard"
            data-current={card.scryfallId === current || undefined}
            onClick={() => {
              onSelect(card.scryfallId);
              onClose();
            }}
          >
            <img src={cardImage(card.scryfallId)} alt={card.name} loading="lazy" draggable={false} />
            <span className="pkCaption">
              <span className="pkSet">{card.name}</span>
            </span>
          </button>
        ))}
      </div>
    </PickerShell>
  );
}
