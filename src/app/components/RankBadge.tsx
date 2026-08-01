import { RANK_META, TIER_NUMERAL, rankEmblem, rankFrame, type Division } from '../data/rankTiers.ts';
import './rankBadge.css';

/**
 * A competitive rank badge: the emblem, and the tier numeral riding its foot.
 *
 * The numeral is live type rather than baked into the art - there are 36
 * divisions and only 8 emblems, and a numeral rendered as type stays crisp at
 * every size and can localise. Mythic has no numeral: it is untiered.
 */
export function RankBadge({
  division,
  size = 40,
  showLabel = false,
  className,
}: {
  division: Division;
  /** Rendered edge length in px. The art is 512 square, so anything up to 256
   *  is a clean downscale; above that it softens. */
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = RANK_META[division.rank];
  const label = division.label;
  // Below this the numeral plate is a smudge - measured in the ladder gallery
  // at the sizes the app actually uses. The lobby chip renders at 20-28px, so
  // this is the common case, not an edge case: the emblem carries the rank by
  // its silhouette and colour, and the label carries the tier.
  const showTier = division.tier != null && size >= 32;
  return (
    <span
      className={['rankBadge', className].filter(Boolean).join(' ')}
      style={{ ['--rank-size' as string]: `${size}px`, ['--rank-accent' as string]: meta.accent }}
      data-rank={division.rank}
    >
      <span className="rankBadgeArt">
        <img src={rankEmblem(division.rank)} alt="" draggable={false} />
        {showTier && (
          // aria-hidden: the accessible name is the full label on the wrapper,
          // so a screen reader says "Gold III" once rather than "Gold" then "III".
          <span className="rankBadgeTier" aria-hidden>
            {TIER_NUMERAL[division.tier!]}
          </span>
        )}
      </span>
      {showLabel ? (
        <span className="rankBadgeLabel">{label}</span>
      ) : (
        <span className="srOnly">{label}</span>
      )}
    </span>
  );
}

/**
 * An avatar wearing its owner's rank ring. The ring art is transparent through
 * the middle, so it composites straight over the portrait rather than needing a
 * cut-out - which is why the avatar is inset by the ring's own band width.
 */
export function RankAvatarFrame({
  rank,
  size = 64,
  children,
}: {
  rank: Division['rank'];
  size?: number;
  children: React.ReactNode;
}) {
  return (
    <span className="rankAvatar" style={{ ['--rank-size' as string]: `${size}px` }}>
      <span className="rankAvatarInner">{children}</span>
      <img className="rankAvatarRing" src={rankFrame(rank)} alt="" draggable={false} aria-hidden />
    </span>
  );
}
