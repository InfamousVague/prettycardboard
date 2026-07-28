import { useState, type ReactNode } from 'react';
import { SegmentedControl } from '@glacier/react';
import { useT } from '../i18n.ts';
import { PLAYMATS, playmatBackground, playmatUrl } from '../data/playmats.ts';
import { presentThemes, THEME_LABEL_KEY, type AssetTheme } from '../data/themes.ts';

type Filter = 'all' | AssetTheme;

/**
 * A picker grid that filters by asset theme. The catalog spans Magic, the
 * Cyberpunk TCG, solid color-token swatches, and game-agnostic art, so a chip
 * row narrows the grid to one theme. Chips are derived from the items present,
 * so a new themed asset surfaces its category with no code change.
 *
 * Shared by the Customize tab (playmats, card backs) and the deck editor's
 * per-deck mat, so all three pick from one grid with one set of behaviours.
 */
export function ThemedPicker<T extends { id: string; name: string; theme: AssetTheme }>({
  items,
  selectedId,
  onSelect,
  ariaLabel,
  gridClass,
  swatchClass,
  renderMedia,
  lead,
}: {
  items: readonly T[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  gridClass: string;
  swatchClass: string;
  renderMedia: (item: T) => ReactNode;
  /** An extra swatch rendered before the catalog (the deck's "no mat" tile). */
  lead?: ReactNode;
}) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>('all');
  const themes = presentThemes(items);
  const shown = filter === 'all' ? items : items.filter((item) => item.theme === filter);

  return (
    <>
      {themes.length > 1 && (
        <div className="pickerFilter">
          <SegmentedControl
            aria-label={ariaLabel}
            fullWidth
            value={filter}
            onValueChange={(value) => setFilter(value as Filter)}
            options={[
              { value: 'all', label: t('custThemeAll') },
              ...themes.map((theme) => ({ value: theme, label: t(THEME_LABEL_KEY[theme]) })),
            ]}
          />
        </div>
      )}
      <div className={gridClass} role="radiogroup" aria-label={ariaLabel}>
        {lead}
        {shown.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={selectedId === item.id}
            className={swatchClass}
            data-selected={selectedId === item.id || undefined}
            title={item.name}
            onClick={() => onSelect(item.id)}
          >
            {renderMedia(item)}
          </button>
        ))}
      </div>
    </>
  );
}

/** One mat's face: a color token paints itself, artwork loads its webp. */
export function PlaymatSwatchMedia({ id, name }: { id: string; name: string }) {
  const mat = PLAYMATS.find((entry) => entry.id === id);
  return (
    <>
      {mat?.token ? (
        <span className="matColorFill" aria-hidden style={{ backgroundImage: playmatBackground(id) }} />
      ) : (
        <img src={playmatUrl(id)} alt={name} loading="lazy" draggable={false} />
      )}
      <span className="matSwatchName">{name}</span>
    </>
  );
}

/**
 * The playmat grid. `selectedId` empty means nothing in the catalog is chosen -
 * used by the deck editor, where "none" means the deck defers to the player's
 * own mat preference and is offered as its own leading tile.
 */
export function PlaymatPicker({
  selectedId,
  onSelect,
  ariaLabel,
  noneLabel,
  onNone,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** Present = offer a "use my own mat" tile ahead of the catalog. */
  noneLabel?: string;
  onNone?: () => void;
}) {
  return (
    <ThemedPicker
      items={PLAYMATS}
      selectedId={selectedId}
      onSelect={onSelect}
      ariaLabel={ariaLabel}
      gridClass="matPicker"
      swatchClass="matSwatch"
      lead={
        noneLabel != null && onNone != null ? (
          <button
            type="button"
            role="radio"
            aria-checked={selectedId === ''}
            className="matSwatch matSwatchNone"
            data-selected={selectedId === '' || undefined}
            title={noneLabel}
            onClick={onNone}
          >
            <span className="matSwatchName">{noneLabel}</span>
          </button>
        ) : undefined
      }
      renderMedia={(mat) => <PlaymatSwatchMedia id={mat.id} name={mat.name} />}
    />
  );
}
