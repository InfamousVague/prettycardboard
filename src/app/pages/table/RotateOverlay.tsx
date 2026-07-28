import { Text, Size, TextTone } from '@glacier/react';
import { RotateCcw, RotateCw } from '@glacier/icons';
import { useT } from '../../i18n.ts';

/**
 * The rotate ask, both directions. The live board is landscape-shaped (every
 * shipped mobile card game agrees) while every other page is a portrait
 * document; rather than serve a cramped layout, a phone held the wrong way gets
 * this fullscreen cover with an animated rotating-phone glyph. It disappears
 * the moment the device turns.
 */
export function RotateOverlay({ to = 'landscape' }: { to?: 'landscape' | 'portrait' }) {
  const t = useT();
  const toPortrait = to === 'portrait';
  const Arrow = toPortrait ? RotateCw : RotateCcw;
  return (
    <div className="rotateOverlay" role="status" aria-live="polite" data-to={to}>
      <span className="rotatePhone" aria-hidden>
        <span className="rotatePhoneBody">
          <span className="rotatePhoneNotch" />
        </span>
        {/* Sized to sit ON the phone's screen. It shares the body's centre of
            rotation and never animates, so the handset turns around it. */}
        <Arrow className="rotateArrow" size={30} strokeWidth={1.6} absoluteStrokeWidth />
      </span>
      <Text as="p" size={Size.Large} weight="bold">
        {t(toPortrait ? 'tblRotateBackTitle' : 'tblRotateTitle')}
      </Text>
      <Text as="p" size={Size.Small} tone={TextTone.Muted}>
        {t(toPortrait ? 'tblRotateBackHint' : 'tblRotateHint')}
      </Text>
    </div>
  );
}
