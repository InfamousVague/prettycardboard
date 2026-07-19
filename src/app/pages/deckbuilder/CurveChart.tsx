import { Text, TextTone, Size } from '@glacier/react';
import { useT } from '../../i18n.ts';
import { ManaSymbol } from '../../components/Mana.tsx';

/**
 * The mana-curve bar chart: mana values 0–7+ as token-colored bars, with the
 * official generic-mana symbols as axis labels. Lands and unknown cards are
 * excluded by the caller; the chart only draws what it is given.
 */
export function CurveChart({ buckets }: { buckets: number[] }) {
  const t = useT();
  const max = Math.max(1, ...buckets);
  return (
    <div className="curveChart" role="img" aria-label={`${t('dbCurve')}: ${buckets.join(', ')}`}>
      {buckets.map((count, manaValue) => (
        <div key={manaValue} className="curveCol">
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono className="curveCount">
            {count > 0 ? count : ''}
          </Text>
          <div className="curveTrack">
            <div
              className="curveBar"
              data-empty={count === 0 || undefined}
              style={{ height: `${count === 0 ? 0 : Math.max(8, (count / max) * 100)}%` }}
            />
          </div>
          <span className="curveLabel">
            <ManaSymbol symbol={String(manaValue)} size="0.9rem" />
            {manaValue === buckets.length - 1 && (
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} mono>
                +
              </Text>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
