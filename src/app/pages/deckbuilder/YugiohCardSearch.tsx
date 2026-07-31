import { useEffect, useMemo, useState } from 'react';
import { FilterChip, SearchField, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../../i18n.ts';
import {
  isExtraDeckCard,
  loadYugiohCatalog,
  yugiohImage,
  yugiohKind,
  type YugiohCard,
} from '../../data/yugioh.ts';
import { YUGIOH_KIND_ICON } from './yugiohDeck.tsx';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import '../cyberbrowse.css';

/**
 * The Yu-Gi-Oh analogue of CardSearch — a local filter like Cyberpunk's, but
 * over the lazily-fetched ~14,500-card catalog instead of a bundled 91. The
 * pool is too big to browse unfiltered, so results only render once a query or
 * chip narrows it, capped for the DOM's sake. Clicking a card adds it to the
 * deck (Extra Deck monsters route to the Extra board automatically).
 */

const RESULT_CAP = 96;

type Facet = 'monster' | 'spell' | 'trap' | 'extra';
const FACETS: Facet[] = ['monster', 'spell', 'trap', 'extra'];

export function YugiohCardSearch({ onAdd }: { onAdd: (card: YugiohCard) => void }) {
  const t = useT();
  const popup = useCardPopup();
  const [q, setQ] = useState('');
  const [facet, setFacet] = useState<Facet | null>(null);
  const [cards, setCards] = useState<YugiohCard[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadYugiohCatalog()
      .then((catalog) => alive && setCards(catalog.cards))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const { hits, hidden } = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!cards || (!needle && !facet)) return { hits: [], hidden: 0 };
    const matches: YugiohCard[] = [];
    let overflow = 0;
    for (const card of cards) {
      if (facet === 'extra' && !isExtraDeckCard(card)) continue;
      if (facet && facet !== 'extra' && (yugiohKind(card) !== facet || isExtraDeckCard(card))) continue;
      // Skip un-deckable frames (tokens, Speed Duel skill cards).
      if (card.frameType === 'token' || card.frameType === 'skill') continue;
      if (needle) {
        const hay = `${card.name} ${card.race ?? ''} ${card.type} ${card.archetype ?? ''}`.toLowerCase();
        if (!hay.includes(needle) && !card.desc.toLowerCase().includes(needle)) continue;
      }
      if (matches.length < RESULT_CAP) matches.push(card);
      else overflow++;
    }
    return { hits: matches, hidden: overflow };
  }, [cards, q, facet]);

  const facetLabel: Record<Facet, string> = {
    monster: t('dbMonsters'),
    spell: t('dbSpells'),
    trap: t('dbTraps'),
    extra: t('dbExtraDeck'),
  };

  return (
    <div className="cyberSearch ygoSearch">
      <SearchField value={q} onValueChange={setQ} placeholder={t('ygoSearch')} aria-label={t('ygoSearch')} />
      <div className="cyberSearchChips">
        {FACETS.map((f) => (
          <FilterChip
            key={f}
            size="sm"
            selected={facet === f}
            onSelectedChange={(sel) => setFacet(sel ? f : null)}
            icon={YUGIOH_KIND_ICON[f]}
          >
            {facetLabel[f]}
          </FilterChip>
        ))}
      </div>
      {failed ? (
        <Text size={Size.Small} tone={TextTone.Danger}>
          {t('obOffline')}
        </Text>
      ) : !cards ? (
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {t('ygoLoading')}
        </Text>
      ) : hits.length === 0 ? (
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {q.trim() || facet ? t('dbFilterNone') : t('ygoSearchHint')}
        </Text>
      ) : (
        <div className="cyberSearchScroll">
          <div className="cyberCardGrid cyberSearchGrid">
            {hits.map((card) => (
              <button
                key={card.id}
                type="button"
                className="cyberCardCell"
                onClick={() => onAdd(card)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  popup.open({ scryfallId: card.id, name: card.name, imageUrl: yugiohImage(card.id) });
                }}
                title={`${card.name} — ${t('brAdd')}`}
              >
                <GameCard name={card.name} imageUrl={yugiohImage(card.id)} fluid tilt={0} />
                {isExtraDeckCard(card) && (
                  <span className="cyberSearchLegend" aria-label={t('dbExtraDeck')}>
                    {YUGIOH_KIND_ICON.extra}
                  </span>
                )}
              </button>
            ))}
          </div>
          {hidden > 0 && (
            <Text size={Size.XSmall} tone={TextTone.Subtle} className="ygoSearchMore">
              +{hidden} {t('ygoMore')}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
