import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { IconButton, SearchField, Size, Spinner, Text, TextTone, Tooltip } from '@glacier/react';
import { Crown, Plus } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { cardImage } from '../../data/cards.ts';
import { canBeCommander, getCardMeta, searchCards, type ScryCard } from '../../data/scryfall.ts';
import { useCardPopup } from '../../components/CardPopup.tsx';
import { ManaPips } from './shared.tsx';

/**
 * The Scryfall search pane: a debounced full-text search whose results add to
 * the main deck on click, with a crown action to seat a legendary creature in
 * the command zone.
 */

type SearchStatus = 'idle' | 'loading' | 'done' | 'error';

export interface CardSearchProps {
  onAdd: (card: ScryCard) => void;
  onSetCommander: (card: ScryCard) => void;
  /** Commander-led formats show the crown action on legendary creatures. */
  allowCommander?: boolean;
}

export function CardSearch({ onAdd, onSetCommander, allowCommander = true }: CardSearchProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryCard[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const searchSeq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const seq = ++searchSeq.current;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const cards = await searchCards(q);
        if (searchSeq.current === seq) {
          setResults(cards);
          setStatus('done');
        }
      } catch {
        if (searchSeq.current === seq) {
          setResults([]);
          setStatus('error');
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const open = status === 'loading' || status === 'error' || (status === 'done' && query.trim().length >= 2);

  return (
    <div className="cardSearch" onKeyDown={(event) => event.key === 'Escape' && setQuery('')}>
      <div className="cardSearchField">
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t('dbSearchPlaceholder')}
          aria-label={t('dbSearch')}
        />
        {status === 'loading' && (
          <span className="cardSearchSpin">
            <Spinner size="sm" aria-label="" />
          </span>
        )}
      </div>

      {open && (
        <div className="cardSearchDrop">
          {status === 'error' && (
            <Text size={Size.Small} tone={TextTone.Danger} className="cardSearchHint">
              {t('dbSearchFailed')}
            </Text>
          )}
          {status === 'done' && results.length === 0 && (
            <Text size={Size.Small} tone={TextTone.Muted} className="cardSearchHint">
              {t('dbSearchNone')}
            </Text>
          )}
          <AnimatePresence initial={false}>
            {results.map((card) => (
              <SearchResult key={card.id} card={card} onAdd={onAdd} onSetCommander={onSetCommander} allowCommander={allowCommander} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SearchResult({ card, onAdd, onSetCommander, allowCommander = true }: CardSearchProps & { card: ScryCard }) {
  const t = useT();
  const popup = useCardPopup();
  const meta = getCardMeta(card.id);
  const commanderable = allowCommander && canBeCommander(meta);

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="searchRow"
    >
      {/* The thumbnail is its own zoom target: it opens the card lightbox,
          while the row text keeps its primary add-to-deck action. */}
      <button
        type="button"
        className="searchRowPeek"
        aria-label={card.name}
        onClick={() => popup.open({ scryfallId: card.id, name: card.name })}
      >
        <img className="searchThumb" src={cardImage(card.id)} alt="" loading="lazy" draggable={false} />
      </button>
      <button type="button" className="searchRowMain" onClick={() => onAdd(card)}>
        <span className="searchRowText">
          <span className="searchRowName">
            <span className="searchRowTitle">{card.name}</span>
            <ManaPips cost={meta?.manaCost} />
          </span>
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="searchRowType">
            {meta?.typeLine ?? ''}
          </Text>
        </span>
        <span className="searchRowAdd" aria-hidden>
          <Plus size={15} />
        </span>
        <span className="srOnly">{t('dbAdd')}</span>
      </button>
      {commanderable && (
        <Tooltip content={t('dbSetCommander')}>
          <IconButton
            aria-label={t('dbSetCommander')}
            size="sm"
            variant="ghost"
            className="searchRowCrown"
            onClick={() => onSetCommander(card)}
          >
            <Crown size={15} />
          </IconButton>
        </Tooltip>
      )}
    </motion.div>
  );
}
