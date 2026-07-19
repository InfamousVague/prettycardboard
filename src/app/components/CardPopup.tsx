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
import { Heading, IconButton, Size, Spinner, Text, TextTone } from '@glacier/react';
import { X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { PRECONS, cardImage } from '../data/cards.ts';
import { ManaCost, ManaSymbol, parseCost } from './Mana.tsx';
import { GameCard } from './GameCard.tsx';
import './cardpopup.css';

/**
 * The universal card lightbox: click any card anywhere in the app and it takes
 * the stage - flip-in entrance over a blurred backdrop, live tilt and foil at
 * full size, and a readable details panel (cost, type, rules text, artist).
 *
 * Mount CardPopupProvider once near the root; call useCardPopup().open(...)
 * from any card. Details resolve from the bundled precon data first, then a
 * cached Scryfall lookup.
 */

export interface PopupCard {
  scryfallId?: string;
  name: string;
  imageUrl?: string;
  foil?: boolean;
}

interface CardDetails {
  typeLine?: string;
  manaCost?: string;
  oracleText?: string;
  flavorText?: string;
  artist?: string;
  setName?: string;
  power?: string;
  toughness?: string;
}

const DETAILS = new Map<string, CardDetails>();

// The bundled precons carry full rules text; no network for the starter decks.
for (const precon of PRECONS) {
  for (const card of precon.cards) {
    DETAILS.set(card.id, {
      typeLine: card.typeLine,
      manaCost: card.manaCost,
      oracleText: card.oracleText,
      flavorText: card.flavorText,
      artist: card.artist,
      power: card.power,
      toughness: card.toughness,
    });
  }
}

async function fetchDetails(scryfallId: string): Promise<CardDetails> {
  const cached = DETAILS.get(scryfallId);
  if (cached) return cached;
  const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  const card = (await response.json()) as {
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
    flavor_text?: string;
    artist?: string;
    set_name?: string;
    power?: string;
    toughness?: string;
    card_faces?: {
      type_line?: string;
      mana_cost?: string;
      oracle_text?: string;
      flavor_text?: string;
      power?: string;
      toughness?: string;
    }[];
  };
  const face = card.card_faces?.[0];
  const details: CardDetails = {
    typeLine: card.type_line ?? face?.type_line,
    manaCost: card.mana_cost ?? face?.mana_cost,
    oracleText: card.oracle_text ?? face?.oracle_text,
    flavorText: card.flavor_text ?? face?.flavor_text,
    artist: card.artist,
    setName: card.set_name,
    power: card.power ?? face?.power,
    toughness: card.toughness ?? face?.toughness,
  };
  DETAILS.set(scryfallId, details);
  return details;
}

/** Rules text with inline {W}{U}{T} symbols rendered as the real glyphs. */
function OracleText({ text }: { text: string }) {
  const paragraphs = text.split('\n');
  return (
    <div className="cpOracle">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split(/(\{[^}]+\})/g).map((chunk, chunkIndex) =>
            /^\{[^}]+\}$/.test(chunk) ? (
              <ManaSymbol key={chunkIndex} symbol={chunk} size="0.95em" />
            ) : (
              <span key={chunkIndex}>{chunk}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
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
  const [details, setDetails] = useState<CardDetails | null>(
    card.scryfallId ? (DETAILS.get(card.scryfallId) ?? null) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (details || !card.scryfallId) return;
    let cancelled = false;
    fetchDetails(card.scryfallId)
      .then((loaded) => {
        if (!cancelled) setDetails(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [card.scryfallId, details]);

  const image = card.imageUrl || cardImage(card.scryfallId);
  const costSymbols = parseCost(details?.manaCost);

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
          <div className="cpTitleRow">
            <Heading level={2} noMargin>
              {card.name}
            </Heading>
            {costSymbols.length > 0 && <ManaCost cost={details?.manaCost} size="1.05rem" />}
          </div>
          {details?.typeLine && (
            <Text size={Size.Small} tone={TextTone.Muted} className="cpTypeLine">
              {details.typeLine}
              {details.power != null && details.toughness != null && (
                <span className="cpPT">
                  {details.power}/{details.toughness}
                </span>
              )}
            </Text>
          )}
          {details?.oracleText ? (
            <OracleText text={details.oracleText} />
          ) : failed ? null : card.scryfallId ? (
            <div className="cpLoading">
              <Spinner size="sm" aria-label={t('cpLoading')} />
              <Text size={Size.Small} tone={TextTone.Subtle}>
                {t('cpLoading')}
              </Text>
            </div>
          ) : null}
          {details?.flavorText && (
            <Text size={Size.Small} tone={TextTone.Subtle} className="cpFlavor">
              {details.flavorText}
            </Text>
          )}
          <div className="cpFooter">
            {details?.artist && (
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {t('cpArtist')} {details.artist}
              </Text>
            )}
            {details?.setName && (
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {details.setName}
              </Text>
            )}
          </div>
        </motion.aside>

        <IconButton className="cpClose" variant="ghost" aria-label={t('cpClose')} onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
    </motion.div>
  );
}
