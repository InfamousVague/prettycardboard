import { useMemo, useState } from 'react';
import { FilterChip, SearchField } from '@glacier/react';
import { Crown } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import {
  CYBERPUNK_CARDS,
  CYBERPUNK_COLORS,
  CYBERPUNK_COLOR_HEX,
  CYBERPUNK_TYPES,
  cyberpunkImage,
  type CyberpunkCard,
} from '../../data/cyberpunk.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import '../cyberbrowse.css';

/**
 * The Cyberpunk analogue of CardSearch: a local filter over the bundled 91-card
 * catalog. Clicking a card adds it to the deck (a Legend replaces the anchor).
 * No network - the catalog ships with the app.
 */
export function CyberpunkCardSearch({ onAdd }: { onAdd: (card: CyberpunkCard) => void }) {
  const t = useT();
  const popup = useCardPopup();
  const [q, setQ] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);

  const cards = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CYBERPUNK_CARDS.filter((card) => {
      if (color && card.color !== color) return false;
      if (type && card.type !== type) return false;
      if (needle) {
        const hay = `${card.displayName} ${card.classifications.join(' ')} ${card.rulesText ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [q, color, type]);

  return (
    <div className="cyberSearch">
      <SearchField value={q} onValueChange={setQ} placeholder={t('brSearch')} aria-label={t('brSearch')} />
      <div className="cyberSearchChips">
        {CYBERPUNK_COLORS.map((c) => (
          <FilterChip
            key={c}
            size="sm"
            selected={color === c}
            onSelectedChange={(sel) => setColor(sel ? c : null)}
            style={{ ['--game-accent' as string]: CYBERPUNK_COLOR_HEX[c] }}
            className="cyberColorChip"
          >
            {c}
          </FilterChip>
        ))}
        {CYBERPUNK_TYPES.map((tp) => (
          <FilterChip key={tp} size="sm" selected={type === tp} onSelectedChange={(sel) => setType(sel ? tp : null)}>
            {tp}
          </FilterChip>
        ))}
      </div>
      <div className="cyberSearchScroll">
        <div className="cyberCardGrid cyberSearchGrid">
          {cards.map((card) => (
            <button
              key={card.id}
              type="button"
              className="cyberCardCell"
              onClick={() => onAdd(card)}
              onContextMenu={(event) => {
                event.preventDefault();
                popup.open({ scryfallId: card.id, name: card.displayName, imageUrl: cyberpunkImage(card.id), foil: true });
              }}
              title={`${card.displayName} — ${t('brAdd')}`}
            >
              <GameCard name={card.displayName} imageUrl={cyberpunkImage(card.id)} fluid tilt={0} />
              {card.type === 'Legend' && (
                <span className="cyberSearchLegend" aria-label="Legend">
                  <Crown size={11} />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
