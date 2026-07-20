import type { SVGProps } from 'react';

/**
 * A salt shaker tipped over, pouring salt out of its cap into a growing pile —
 * the app's "saltiness" glyph. lucide (the @glacier/icons source) has no salt
 * icon, so this mirrors its API: a `size` prop, `currentColor` fill, a 24x24
 * viewBox. It drops in wherever a lucide icon would. Filled rather than stroked
 * so it still reads at the 12-13px it's used at.
 */
export function SaltPile({ size = 24, ...props }: { size?: number | string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      {/* the shaker: flat-based body, tipped so the cap points down, with the
          grain stream leaving the cap */}
      <g transform="translate(-2.5 -2) rotate(130 12 12) scale(0.85)">
        <path d="M9.8 3.2h4.4q.55 0 .45 .55l-.45 1.8q1.1 .7 1.1 2.2v7q0 1-1 1h-4.8q-1 0-1-1v-7q0-1.5 1.1-2.2l-.45-1.8q-.1-.55 .45-.55Z" />
        <circle cx="12" cy="1.8" r=".8" />
        <circle cx="10.7" cy=".2" r=".8" />
        <circle cx="13.3" cy=".4" r=".8" />
        <circle cx="11.8" cy="-1.5" r=".8" />
        <circle cx="13" cy="-3" r=".72" />
      </g>
      {/* the small pile of salt building up under the grain stream (to the
          lower-right, where the tipped cap actually pours) */}
      <path d="M16.3 22.6C17.9 20.3 21.1 20.3 22.7 22.6Z" />
    </svg>
  );
}
