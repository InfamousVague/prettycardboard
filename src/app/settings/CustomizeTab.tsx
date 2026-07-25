import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, FormSection, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { Upload } from '@glacier/icons';
import { useT } from '../i18n.ts';
import type { Preferences } from '../preferences.ts';
import { CARD_BACKS, DEFAULT_CARD_BACK, cardBackUrl } from '../data/cardBacks.ts';
import { PLAYMATS, playmatBackground, playmatUrl } from '../data/playmats.ts';
import { uploadPlaymat } from '../net/api.ts';
import { DICE_SKINS } from '../data/diceSkins.ts';
import { presentThemes, THEME_LABEL_KEY, type AssetTheme } from '../data/themes.ts';
import { GameCard } from '../components/GameCard.tsx';
import { cardImage } from '../data/cards.ts';
import { cyberpunkImage } from '../data/cyberpunk.ts';

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
 * cards read on the felt.
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
 * A picker grid that filters by asset theme. The catalog spans Magic, the
 * Cyberpunk TCG, solid color-token swatches, and game-agnostic art, so a chip
 * row narrows the grid to one theme. Chips are derived from the items present,
 * so a new themed asset surfaces its category with no code change.
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
 * Upload-your-own playmat: the image goes to the server (one per account),
 * comes back as a `custom-…` id, and syncs to every viewer through the normal
 * playmat preference + `playmat.set` flow. The last upload stays pickable as
 * its own tile beside the bundled mats.
 */
function UploadMatRow({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = preferences.customPlaymat;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError(t('custUploadTooBig'));
      return;
    }
    setBusy(true);
    try {
      const { id } = await uploadPlaymat(file);
      onChange({ customPlaymat: id, playmat: id });
    } catch {
      setError(t('custUploadFailed'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="matUploadRow">
      {custom && (
        <button
          type="button"
          role="radio"
          aria-checked={preferences.playmat === custom}
          className="matSwatch matSwatchCustom"
          data-selected={preferences.playmat === custom || undefined}
          title={t('custUploadYours')}
          onClick={() => onChange({ playmat: custom })}
        >
          <img src={playmatUrl(custom)} alt={t('custUploadYours')} draggable={false} />
          <span className="matSwatchName">{t('custUploadYours')}</span>
        </button>
      )}
      <div className="matUploadActions">
        <Button variant="soft" size="sm" loading={busy} onClick={() => inputRef.current?.click()}>
          <Upload size={15} /> {t('custUpload')}
        </Button>
        <Text as="span" size={Size.XSmall} tone={error ? TextTone.Danger : TextTone.Subtle}>
          {error ?? t('custUploadHint')}
        </Text>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => void pick(event.target.files?.[0])}
      />
    </div>
  );
}

/**
 * The Customize tab of the Settings modal: pick a playmat (bundled artwork or a
 * solid Glacier-token color under a faint grid) and a card back, with a live
 * preview. Choices write straight through to preferences, so the app re-themes
 * as you click.
 */
export function CustomizeTab({
  preferences,
  onChange,
}: {
  preferences: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}) {
  const t = useT();
  const [section, setSection] = useState<'playmat' | 'deck' | 'dice'>('playmat');
  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <SegmentedControl
        fullWidth
        aria-label={t('custTitle')}
        value={section}
        onValueChange={(value) => setSection(value as 'playmat' | 'deck' | 'dice')}
        options={[
          { value: 'playmat', label: t('custPlaymat') },
          { value: 'deck', label: t('custDeckTab') },
          { value: 'dice', label: t('custDice') },
        ]}
      />

      {section === 'playmat' && (
        <FormSection title={t('custPlaymat')} description={t('custPlaymatHint')}>
          <UploadMatRow preferences={preferences} onChange={onChange} />
          <ThemedPicker
            items={PLAYMATS}
            selectedId={preferences.playmat}
            onSelect={(id) => onChange({ playmat: id })}
            ariaLabel={t('custPlaymat')}
            gridClass="matPicker"
            swatchClass="matSwatch"
            renderMedia={(mat) => (
              <>
                {mat.token ? (
                  <span
                    className="matColorFill"
                    aria-hidden
                    style={{ backgroundImage: playmatBackground(mat.id) }}
                  />
                ) : (
                  <img src={playmatUrl(mat.id)} alt={mat.name} loading="lazy" draggable={false} />
                )}
                <span className="matSwatchName">{mat.name}</span>
              </>
            )}
          />
        </FormSection>
      )}

      {section === 'deck' && (
        <>
          <FormSection title={t('custPreview')} description={t('custPreviewHint')} divider>
            <CardPreview back={preferences.cardBack} />
          </FormSection>
          <FormSection title={t('setCardBack')} description={t('setCardBackHint')}>
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
        </>
      )}

      {section === 'dice' && (
        <FormSection title={t('custDice')} description={t('custDiceHint')}>
          <div className="diceSkinPicker" role="radiogroup" aria-label={t('custDice')}>
            {DICE_SKINS.map((skin) => (
              <button
                key={skin.id}
                type="button"
                role="radio"
                aria-checked={preferences.diceSkin === skin.id}
                className="diceSwatch"
                data-selected={preferences.diceSkin === skin.id || undefined}
                title={skin.name}
                onClick={() => onChange({ diceSkin: skin.id })}
              >
                <span
                  className="diceSwatchFace"
                  data-material={skin.material}
                  data-texture={skin.texture || undefined}
                  style={{
                    backgroundColor: skin.accent ? 'var(--glacier-accent-solid)' : skin.color,
                    color: skin.accent ? 'var(--glacier-accent-contrast, #141018)' : skin.pip,
                  }}
                >
                  20
                </span>
                <span className="diceSwatchName">{skin.name}</span>
              </button>
            ))}
          </div>
        </FormSection>
      )}
    </div>
  );
}
