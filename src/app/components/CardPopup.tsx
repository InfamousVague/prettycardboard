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
import { Button, IconButton } from '@glacier/react';
import { Repeat, X } from '../icons/backfilled.tsx';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { isFoil } from '../data/foil.ts';
import { cyberpunkCard, cyberpunkImage } from '../data/cyberpunk.ts';
import { isMoodId, moodImage } from '../data/moodswings.ts';
import { isYugiohId, yugiohImage } from '../data/yugioh.ts';
import { useFaces } from '../data/faces.ts';
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

/** Print aspect: a card this wide is this tall. */
const CARD_RATIO = 680 / 488;
/** The stage stacks the details under the card below this width (cardpopup.css). */
const STACK_PX = 736;

/** Landscape phone: the stage splits into a card third and a details two-thirds
 *  (cardpopup.css mirrors this test in a media query). */
function isSplit(vw: number, vh: number): boolean {
  return vh <= 480 && vw > vh;
}

/**
 * The lightbox card size, solved against the live viewport. A fixed 425px card
 * is 592px tall - taller than a landscape phone - so it ran off the bottom
 * edge; this keeps the whole card on screen at any orientation and never grows
 * past the original 425px on roomy screens.
 */
function useViewport(): { vw: number; vh: number } {
  const read = () =>
    typeof window === 'undefined'
      ? { vw: 1280, vh: 800 }
      : { vw: window.innerWidth, vh: window.innerHeight };
  const [size, setSize] = useState(read);
  useEffect(() => {
    // Bail when the dimensions are unchanged: a resize burst would otherwise
    // hand back a fresh object each tick and re-render the whole lightbox.
    const onResize = () =>
      setSize((prev) => {
        const next = read();
        return prev.vw === next.vw && prev.vh === next.vh ? prev : next;
      });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return size;
}

function popupCardWidth(vw: number, vh: number): number {
  if (isSplit(vw, vh)) {
    // The card owns the leading third of the screen, centered in it.
    return Math.round(Math.max(120, Math.min(425, vw / 3 - 32, (vh - 32) / CARD_RATIO)));
  }
  const stacked = vw < STACK_PX;
  // Side by side, the details column (24rem) and the stage gap take their cut.
  const availWidth = stacked ? vw - 48 : vw - 48 - 384 - 64;
  // Stacked, the card shares the column with the details block below it.
  const availHeight = (stacked ? vh * 0.62 : vh) - 96;
  return Math.round(Math.max(150, Math.min(425, availWidth, availHeight / CARD_RATIO)));
}

function Popup({ card, onClose }: { card: PopupCard; onClose: () => void }) {
  const t = useT();
  const { vw, vh } = useViewport();
  const split = isSplit(vw, vh);
  const cardWidth = popupCardWidth(vw, vh);
  // The card pans inside its own pane on touch. Constraining to the pane keeps
  // it from being flung behind the details panel and lost.
  const panePad = 24;
  const panX = Math.max(0, (vw / 3 - cardWidth) / 2 + panePad);
  const panY = Math.max(0, (vh - cardWidth * CARD_RATIO) / 2 + panePad);
  // A Cyberpunk card is recognized by its id living in the bundled catalog (its
  // full art ships with the app); a Yu-Gi-Oh card by its all-digits passcode; a
  // Mood Swings card by its `msw-` id. None of the three ever hits Scryfall.
  const cyber = card.scryfallId ? cyberpunkCard(card.scryfallId) : undefined;
  const ygo = isYugiohId(card.scryfallId);
  const mood = isMoodId(card.scryfallId);
  // Two-faced cards get a face toggle right here. This is where people come to
  // look at a card, so it is where "let me see the other side" belongs - it
  // works from the command zone, the hand and every pile viewer, none of which
  // have a board context menu to hang a Transform action off.
  const faces = useFaces(cyber || ygo || mood ? undefined : card.scryfallId);
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    setShowBack(false);
  }, [card.scryfallId]);
  const flippable = !!faces?.dfc && !!faces.backImage;
  const faceImg = flippable ? (showBack ? faces.backImage : faces.frontImage) : undefined;
  const image = cyber
    ? cyberpunkImage(cyber.id)
    : ygo
      ? card.imageUrl || yugiohImage(card.scryfallId)
      : mood
        ? card.imageUrl || moodImage(card.scryfallId)
        : faceImg || card.imageUrl || cardImage(card.scryfallId);
  const faceName = (flippable && (showBack ? faces.backName : faces.frontName)) || card.name;

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
      <div className="cpStage" data-split={split || undefined} onClick={(event) => event.stopPropagation()}>
        {/* flip-in: real card back on the reverse, rotating to the front */}
        <motion.div
          className="cpFlip"
          initial={{ rotateY: 180, scale: 0.82, y: 24 }}
          animate={{ rotateY: 0, scale: 1, y: 0 }}
          exit={{ rotateY: 120, scale: 0.86, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 20 }}
          drag={split}
          dragMomentum={false}
          dragElastic={0.08}
          dragConstraints={{ left: -panX, right: panX, top: -panY, bottom: panY }}
          whileDrag={{ cursor: 'grabbing' }}
        >
          <div className="cpFront">
            {/* The pointer tilt fights a drag gesture, so the pannable card is flat. */}
            <GameCard
              name={faceName}
              imageUrl={image}
              width={cardWidth}
              tilt={split ? 0 : 13}
              foil={isFoil(card)}
              glow
            />
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

        {flippable && (
          <Button
            className="cpFaceToggle"
            size="sm"
            variant="soft"
            onClick={() => setShowBack((back) => !back)}
          >
            <Repeat size={15} /> {showBack ? faces?.frontName : faces?.backName}
          </Button>
        )}
        <IconButton className="cpClose" variant="ghost" aria-label={t('cpClose')} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </motion.div>
  );
}
