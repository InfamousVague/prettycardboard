import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button, FormSection, Modal, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT } from './i18n.ts';
import type { Preferences } from './preferences.ts';
import { CARD_BACKS, DEFAULT_CARD_BACK, cardBackUrl } from './data/cardBacks.ts';
import { PLAYMATS, playmatUrl } from './data/playmats.ts';
import { presentThemes, THEME_LABEL_KEY, type AssetTheme } from './data/themes.ts';
import { GameCard } from './components/GameCard.tsx';
import { cardImage } from './data/cards.ts';
import { cyberpunkImage } from './data/cyberpunk.ts';

type Filter = 'all' | AssetTheme;

// Bundled sample faces for the split preview (both ship in public/cache), so the
// "in play" card shows a real Magic face on one half and a real Cyberpunk face
// on the other with no network.
const SAMPLE_MTG_ID = '2cfd4494-346c-4cbc-8072-e267254cefcc';
const SAMPLE_CYBER_ID = '81a8dec7-9541-4020-93e1-7d798a57dcbc';

/**
 * The card preview strip: the vendor-default back, the player's chosen back
 * (live), and a split card showing a real Magic face against a real Cyberpunk
 * face — so a glance shows both what the back looks like and how the two games'
 * cards read on the felt. A face-down GameCard paints whichever back its
 * `--pc-card-back` is set to.
 */
function CardPreview({ back }: { back: string }) {
  const t = useT();
  const backStyle = (id: string): CSSProperties => ({
    ['--pc-card-back' as string]: `url("${cardBackUrl(id)}")`,
  });
  return (
    <div className="custPreview">
      <figure className="custPreviewItem" style={backStyle(DEFAULT_CARD_BACK)}>
        <GameCard name="" faceDown width={84} tilt={0} />
        <figcaption>{t('custPreviewDefault')}</figcaption>
      </figure>
      <figure className="custPreviewItem" style={backStyle(back)}>
        <GameCard name="" faceDown width={84} tilt={0} />
        <figcaption>{t('custPreviewYours')}</figcaption>
      </figure>
      <figure className="custPreviewItem">
        <div className="custSplit" role="img" aria-label={t('custPreviewSplit')}>
          <img className="custSplitMtg" src={cardImage(SAMPLE_MTG_ID)} alt="" draggable={false} />
          <img className="custSplitCyber" src={cyberpunkImage(SAMPLE_CYBER_ID)} alt="" draggable={false} />
          <span className="custSplitSeam" aria-hidden />
        </div>
        <figcaption>{t('custPreviewSplit')}</figcaption>
      </figure>
    </div>
  );
}

/**
 * A picker grid that filters by asset theme. The catalog now spans Magic, the
 * Cyberpunk TCG and game-agnostic art, so a flat list no longer scales — a chip
 * row narrows the grid to one theme. Chips are derived from the items present,
 * so adding a themed asset surfaces its category with no code change; the row
 * hides itself entirely when everything shares one theme.
 */
function ThemedPicker<T extends { id: string; name: string; theme: AssetTheme }>({
  items,
  selectedId,
  onSelect,
  ariaLabel,
  gridClass,
  swatchClass,
  renderMedia,
}: {
  items: readonly T[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  gridClass: string;
  swatchClass: string;
  renderMedia: (item: T) => ReactNode;
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

/**
 * The table-setup modal: pick a playmat and a card back. Choices apply live
 * (the preference writes straight through), so the backdrop behind the modal's
 * own glass is the preview. Shown automatically on first launch and any time
 * afterwards from the Customize button on the rail.
 */
export function CustomizeModal({
  open,
  onClose,
  preferences,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t('custTitle')} size="lg">
      <div className="customizeBody">
        <Text size={Size.Small} tone={TextTone.Muted}>
          {t('custLede')}
        </Text>

        <FormSection title={t('custPreview')} description={t('custPreviewHint')} divider>
          <CardPreview back={preferences.cardBack} />
        </FormSection>

        <FormSection title={t('custPlaymat')} description={t('custPlaymatHint')} divider>
          <ThemedPicker
            items={PLAYMATS}
            selectedId={preferences.playmat}
            onSelect={(id) => onChange({ playmat: id })}
            ariaLabel={t('custPlaymat')}
            gridClass="matPicker"
            swatchClass="matSwatch"
            renderMedia={(mat) => (
              <>
                <img src={playmatUrl(mat.id)} alt={mat.name} loading="lazy" draggable={false} />
                <span className="matSwatchName">{mat.name}</span>
              </>
            )}
          />
        </FormSection>

        <FormSection title={t('setCardBack')} description={t('setCardBackHint')} divider>
          <ThemedPicker
            items={CARD_BACKS}
            selectedId={preferences.cardBack}
            onSelect={(id) => onChange({ cardBack: id })}
            ariaLabel={t('setCardBack')}
            gridClass="backPicker"
            swatchClass="backSwatch"
            renderMedia={(back) => (
              <img src={cardBackUrl(back.id)} alt={back.name} loading="lazy" draggable={false} />
            )}
          />
        </FormSection>

        <div className="customizeFoot">
          <Button onClick={onClose}>{t('custDone')}</Button>
        </div>
      </div>
    </Modal>
  );
}
