import { Button, FormSection, Modal, Size, Text, TextTone } from '@glacier/react';
import { useT } from './i18n.ts';
import type { Preferences } from './preferences.ts';
import { CARD_BACKS, cardBackUrl } from './data/cardBacks.ts';
import { PLAYMATS, playmatUrl } from './data/playmats.ts';

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

        <FormSection title={t('custPlaymat')} description={t('custPlaymatHint')} divider>
          <div className="matPicker" role="radiogroup" aria-label={t('custPlaymat')}>
            {PLAYMATS.map((mat) => (
              <button
                key={mat.id}
                type="button"
                role="radio"
                aria-checked={preferences.playmat === mat.id}
                className="matSwatch"
                data-selected={preferences.playmat === mat.id || undefined}
                title={mat.name}
                onClick={() => onChange({ playmat: mat.id })}
              >
                <img src={playmatUrl(mat.id)} alt={mat.name} loading="lazy" draggable={false} />
                <span className="matSwatchName">{mat.name}</span>
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection title={t('setCardBack')} description={t('setCardBackHint')} divider>
          <div className="backPicker" role="radiogroup" aria-label={t('setCardBack')}>
            {CARD_BACKS.map((back) => (
              <button
                key={back.id}
                type="button"
                role="radio"
                aria-checked={preferences.cardBack === back.id}
                className="backSwatch"
                data-selected={preferences.cardBack === back.id || undefined}
                title={back.name}
                onClick={() => onChange({ cardBack: back.id })}
              >
                <img src={cardBackUrl(back.id)} alt={back.name} loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </FormSection>

        <div className="customizeFoot">
          <Button onClick={onClose}>{t('custDone')}</Button>
        </div>
      </div>
    </Modal>
  );
}
