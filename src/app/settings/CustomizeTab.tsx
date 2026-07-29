import { useState, type CSSProperties } from 'react';
import { FormSection, SegmentedControl, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../i18n.ts';
import type { Preferences } from '../preferences.ts';
import { CARD_BACKS, DEFAULT_CARD_BACK, cardBackUrl } from '../data/cardBacks.ts';
import { DICE_SKINS } from '../data/diceSkins.ts';
import { type AssetTheme } from '../data/themes.ts';
import { GameCard } from '../components/GameCard.tsx';
import { PlaymatPicker, PlaymatUpload, ThemedPicker } from '../components/PlaymatPicker.tsx';
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
          <PlaymatPicker
            ariaLabel={t('custPlaymat')}
            selectedId={preferences.playmat}
            customId={preferences.customPlaymat}
            onSelect={(id) => onChange({ playmat: id })}
          />
          <PlaymatUpload onUploaded={(id) => onChange({ customPlaymat: id, playmat: id })} />
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
