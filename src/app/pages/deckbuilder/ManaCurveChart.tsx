import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useT } from '../../i18n.ts';

/**
 * The mana curve drawn as an actual curve: a smooth accent line with a soft
 * gradient falling to the baseline, a labeled dot on every mana value, and
 * official mana-value glyphs as the axis. One series, one hue; counts stay
 * quiet ink; hover carries the exact figure.
 */

const SYMBOL_BASE = `${import.meta.env.BASE_URL}symbols/`;

interface CurveDatum {
  mv: number;
  label: string;
  count: number;
}

/**
 * Mana-value glyphs as axis ticks (SVG context, so <image>, not <img>).
 * The glyph centers on the tick; "7+" centers as one unit, plus included,
 * with the plus riding the glyph's vertical middle.
 */
const TICK_SIZE = 14;

function ManaTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const symbol = payload?.value?.replace('+', '') ?? '0';
  const plus = payload?.value?.endsWith('+');
  const shift = plus ? TICK_SIZE / 2 + 3 : TICK_SIZE / 2;
  return (
    <g transform={`translate(${(x ?? 0) - shift}, ${(y ?? 0) + 6})`}>
      <image href={`${SYMBOL_BASE}${symbol}.svg`} width={TICK_SIZE} height={TICK_SIZE} style={{ opacity: 0.9 }} />
      {plus && (
        <text
          x={TICK_SIZE + 2}
          y={TICK_SIZE / 2 + 3.5}
          fontSize={11}
          fontWeight={600}
          fill="var(--glacier-text-muted)"
          fontFamily="var(--glacier-font-mono)"
        >
          +
        </text>
      )}
    </g>
  );
}

/** A dot on every value, its count riding quietly above. */
function CountDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: CurveDatum }) {
  if (cx == null || cy == null || !payload) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill="var(--glacier-accent-solid)" stroke="var(--glacier-bg)" strokeWidth={2} />
      {payload.count > 0 && (
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fontSize={11}
          fontFamily="var(--glacier-font-mono)"
          fill="var(--glacier-text-muted)"
        >
          {payload.count}
        </text>
      )}
    </g>
  );
}

function GlassTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div className="curveTip">
      <span className="curveTipMv">
        <img src={`${SYMBOL_BASE}${String(label).replace('+', '')}.svg`} alt="" width={14} height={14} />
        {String(label).endsWith('+') && '+'}
      </span>
      <span className="curveTipCount">
        {payload[0]?.value} {t('decksCards')}
      </span>
    </div>
  );
}

export function ManaCurveChart({ buckets }: { buckets: number[] }) {
  const t = useT();
  const data: CurveDatum[] = buckets.map((count, mv) => ({
    mv,
    label: mv === buckets.length - 1 ? `${mv}+` : String(mv),
    count,
  }));
  const max = Math.max(1, ...buckets);

  return (
    <div className="curveChartWrap" role="img" aria-label={`${t('dbCurve')}: ${buckets.join(', ')}`}>
      <ResponsiveContainer width="100%" height={132}>
        <AreaChart data={data} margin={{ top: 20, right: 10, bottom: 0, left: 10 }}>
          <defs>
            <linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--glacier-accent-solid)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--glacier-accent-solid)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            axisLine={{ stroke: 'color-mix(in oklch, var(--glacier-border) 60%, transparent)', strokeWidth: 1 }}
            tickLine={false}
            tick={<ManaTick />}
            height={30}
            interval={0}
          />
          <YAxis hide domain={[0, max * 1.15]} />
          <Tooltip content={<GlassTooltip />} cursor={{ stroke: 'var(--glacier-border-strong)', strokeDasharray: '3 3' }} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="var(--glacier-accent-solid)"
            strokeWidth={2}
            fill="url(#curveFill)"
            dot={<CountDot />}
            activeDot={{ r: 5, fill: 'var(--glacier-accent-solid)', stroke: 'var(--glacier-bg)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
