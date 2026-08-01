import { RANKS, type RankInfo } from '../data/ranks.ts';
import './rankEmblem.css';

/**
 * A rank's insignia, DRAWN rather than shipped: seven shapes that climb a
 * ladder (a lone pip, one chevron, two, a star, a laurel-flanked star, a
 * crown, a full laurel), each in its tier's colour. Nothing to upload and
 * nothing to 404 - the emblem is vector text, so it is crisp at the 14px in
 * a lobby chip and at the 120px watermark behind a profile hero.
 *
 * `filled` tiers below the current one stay visible but quiet, so the badge
 * reads as progress along a ladder rather than a single icon.
 */
export function RankEmblem({
  rank,
  size = 20,
  className,
  title,
}: {
  rank: Pick<RankInfo, 'tier' | 'color' | 'emblem' | 'title'>;
  size?: number;
  className?: string;
  /** Adds an accessible name; omit for purely decorative uses. */
  title?: string;
}) {
  const stroke = Math.max(1.4, size * 0.075);
  const c = rank.color;
  return (
    <svg
      className={className ? `rankEmblem ${className}` : 'rankEmblem'}
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ color: c }}
    >
      {/* The plate every emblem sits on: a soft disc in the tier's colour. */}
      <circle cx="16" cy="16" r="15" fill="currentColor" opacity={0.14} />
      <circle cx="16" cy="16" r="15" fill="none" stroke="currentColor" strokeWidth={stroke * 0.8} opacity={0.55} />
      <Shape emblem={rank.emblem} stroke={stroke} />
    </svg>
  );
}

function Shape({ emblem, stroke }: { emblem: RankInfo['emblem']; stroke: number }) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (emblem) {
    case 'pip':
      return <circle cx="16" cy="16" r="3.6" fill="currentColor" />;
    case 'chevron':
      return <path d="M9 19 L16 12 L23 19" {...line} />;
    case 'chevron2':
      return (
        <>
          <path d="M9 21 L16 14 L23 21" {...line} />
          <path d="M9 15 L16 8 L23 15" {...line} />
        </>
      );
    case 'star':
      return <Star stroke={stroke} />;
    case 'wreath':
      return (
        <>
          <Star stroke={stroke * 0.9} scale={0.78} />
          <path d="M8 22 C6 18 6 13 8 10" {...line} />
          <path d="M24 22 C26 18 26 13 24 10" {...line} />
        </>
      );
    case 'crown':
      return (
        <>
          <path d="M8 21 L8 13 L12 16 L16 10 L20 16 L24 13 L24 21 Z" {...line} />
          <path d="M8 24 L24 24" {...line} />
        </>
      );
    case 'laurel':
      return (
        <>
          <Star stroke={stroke * 0.9} scale={0.72} />
          <path d="M7 23 C4 18 4.5 12 8 8" {...line} />
          <path d="M25 23 C28 18 27.5 12 24 8" {...line} />
          <path d="M9 20 L6.5 19" {...line} />
          <path d="M9.5 16 L7 15" {...line} />
          <path d="M23 20 L25.5 19" {...line} />
          <path d="M22.5 16 L25 15" {...line} />
        </>
      );
  }
}

/** A five-pointed star centered on the plate, drawn from its ten vertices. */
function Star({ stroke, scale = 1 }: { stroke: number; scale?: number }) {
  const outer = 9 * scale;
  const inner = outer * 0.42;
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    // Start at the top point: -90deg, then every 36deg.
    const a = (-90 + i * 36) * (Math.PI / 180);
    points.push(`${(16 + r * Math.cos(a)).toFixed(2)},${(16 + r * Math.sin(a)).toFixed(2)}`);
  }
  return (
    <polygon
      points={points.join(' ')}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={stroke * 0.5}
      strokeLinejoin="round"
    />
  );
}

/**
 * The full ladder as a row of emblems, current tier lit and the rest dimmed -
 * "where you are, and what is left". Used on the profile plate, where there
 * is room to show the whole climb.
 */
export function RankLadder({ tier, size = 16 }: { tier: number; size?: number }) {
  return (
    <span className="rankLadder" aria-hidden>
      {RANKS.map((r, i) => (
        <RankEmblem
          key={r.title}
          rank={{ tier: i, color: r.color, emblem: r.emblem, title: r.title }}
          size={size}
          className={i === tier ? 'rankLadderNow' : i < tier ? 'rankLadderDone' : 'rankLadderTodo'}
        />
      ))}
    </span>
  );
}
