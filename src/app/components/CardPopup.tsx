import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconButton } from '@glacier/react';
import { X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { cyberpunkCard, cyberpunkImage } from '../data/cyberpunk.ts';
import { GameCard } from './GameCard.tsx';
import { CardDetailsBody } from './cardDetails.tsx';
import './cardpopup.css';

/**
 * The universal card lightbox: click any card anywhere in the app and it takes
 * the stage - flip-in entrance over a blurred backdrop, live tilt and foil at
 * full size, and a readable details panel (cost, type, rules text, artist).
 *
 * Mount CardPopupProvider once near the root; call useCardPopup().open(...)
 * from any card. Details resolve from the bundled precon data first, then a
 * cached Scryfall lookup (both handled by CardDetailsBody).
 */

export interface PopupCard {
  scryfallId?: string;
  name: string;
  imageUrl?: string;
  foil?: boolean;
}

const CardPopupContext = createContext<{ open: (card: PopupCard) => void }>({ open: () => {} });

export function useCardPopup() {
  return useContext(CardPopupContext);
}

export function CardPopupProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<PopupCard | null>(null);
  const open = useCallback((next: PopupCard) => setCard(next), []);
  const close = useCallback(() => setCard(null), []);
  const value = useMemo(() => ({ open }), [open]);

  useEffect(() => {
    if (!card) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, close]);

  return (
    <CardPopupContext.Provider value={value}>
      {children}
      <AnimatePresence>{card && <Popup card={card} onClose={close} />}</AnimatePresence>
    </CardPopupContext.Provider>
  );
}

function Popup({ card, onClose }: { card: PopupCard; onClose: () => void }) {
  const t = useT();
  // A Cyberpunk card is recognized by its id living in the bundled catalog; its
  // full art ships with the app, so we never hit Scryfall for it.
  const cyber = card.scryfallId ? cyberpunkCard(card.scryfallId) : undefined;
  const image = cyber ? cyberpunkImage(cyber.id) : card.imageUrl || cardImage(card.scryfallId);

  return (
    <motion.div
      className="cpBackdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
    >
      <div className="cpStage" onClick={(event) => event.stopPropagation()}>
        {/* flip-in: real card back on the reverse, rotating to the front */}
        <motion.div
          className="cpFlip"
          initial={{ rotateY: 180, scale: 0.82, y: 24 }}
          animate={{ rotateY: 0, scale: 1, y: 0 }}
          exit={{ rotateY: 120, scale: 0.86, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 20 }}
        >
          <div className="cpFront">
            <GameCard name={card.name} imageUrl={image} width={425} tilt={13} foil={card.foil ?? true} glow />
          </div>
          <div className="cpBack" aria-hidden />
        </motion.div>

        <motion.aside
          className="cpDetails"
          initial={{ opacity: 0, x: 26 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22, delay: 0.16 }}
        >
          <CardDetailsBody scryfallId={card.scryfallId} name={card.name} />
        </motion.aside>

        <IconButton className="cpClose" variant="ghost" aria-label={t('cpClose')} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </motion.div>
  );
}
