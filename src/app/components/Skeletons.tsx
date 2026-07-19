import type { ReactNode } from 'react';
import { Text, Size, TextTone } from '@glacier/react';
import './skeletons.css';

/**
 * MTG-flavored waiting and empty moments: shimmering card backs while decks
 * load, and a fanned empty-deck illustration with a flavor-text quip when a
 * page has nothing to show yet.
 */

/** A shimmering face-down card, sized like the real thing. */
export function CardBackSkeleton({ width = 132 }: { width?: number }) {
  const height = Math.round(width * (680 / 488));
  return (
    <span className="skCard" style={{ width, height }} aria-hidden>
      <span className="skBackArt" />
      <span className="skSheen" />
    </span>
  );
}

/** A row of shimmering card backs (deck grids, browse loading). */
export function CardRowSkeleton({ count = 5, width = 132 }: { count?: number; width?: number }) {
  return (
    <div className="skRow" role="status" aria-live="polite">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="skDelay" style={{ animationDelay: `${index * 90}ms` }}>
          <CardBackSkeleton width={width} />
        </span>
      ))}
    </div>
  );
}

/** Empty state: three fanned card backs and a quip, flavor-text style. */
export function EmptyFan({ quip, action }: { quip: string; action?: ReactNode }) {
  return (
    <div className="skEmpty">
      <div className="skFan" aria-hidden>
        <CardBackSkeleton width={96} />
        <CardBackSkeleton width={96} />
        <CardBackSkeleton width={96} />
      </div>
      <Text size={Size.Small} tone={TextTone.Subtle} className="skQuip">
        {quip}
      </Text>
      {action}
    </div>
  );
}
