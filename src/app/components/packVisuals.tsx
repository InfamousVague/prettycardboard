import { useEffect, useState, type ReactNode } from 'react';
import { Pill } from '@glacier/react';
import { Sparkles } from '../icons/backfilled.tsx';
import { cardImage } from '../data/cards.ts';
import { GameCard } from './GameCard.tsx';
import { boosterArtUrl } from '../data/boosterSets.ts';
import { focusFromPointer, slinkyOffsets } from './slinky.ts';
import './packDock.css';

/**
 * The pack dock's card theatre, shared.
 *
 * All of this began inside PackDock and is still styled by packDock.css - it
 * moved out when the booster draft needed the same set symbols, the same
 * poster-art probe and the same fanned reveal. Forking it would have meant two
 * set-icon treatments and two art-retry policies drifting apart, so the dock
 * imports its own visuals from here and the draft uses exactly the same code.
 */

/**
 * How many times to re-probe a set's poster art before giving up on it.
 *
 * The server fetches a cold set's art from Scryfall on the first request, one
 * set at a time behind a global lock, and answers 404 if that fetch loses -
 * deliberately WITHOUT caching the miss, so the next request retries. A single
 * `onError` treated that transient loss as "this set has no art" for the rest
 * of the session, which is how the placeholder kept winning over real art.
 */
const ART_RETRIES = 2;

/** Long enough for the server's warm pass to finish and land on disk. */
const ART_RETRY_MS = 1400;

/**
 * The set's poster art, or null until it is known to load.
 *
 * A probe rather than an inline `onError` for two reasons: the URL is wanted in
 * several places at once (both halves of the torn wrapper, the showcase, the
 * draft's backdrop) and should be decided once, and a probe can retry without
 * flickering a broken image on screen while it does.
 */
export function useBoosterArt(code: string): string | null {
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    setReady(null);
    if (!code) return;
    let alive = true;
    let timer: number | undefined;
    const url = boosterArtUrl(code);
    const attempt = (retriesLeft: number) => {
      const probe = new Image();
      probe.onload = () => {
        if (alive) setReady(url);
      };
      probe.onerror = () => {
        if (!alive || retriesLeft <= 0) return;
        timer = window.setTimeout(() => attempt(retriesLeft - 1), ART_RETRY_MS);
      };
      probe.src = url;
    };
    attempt(ART_RETRIES);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [code]);
  return ready;
}

/**
 * A set symbol, in the set's own colour.
 *
 * Scryfall ships these as black SVGs, drawn for white paper - which is why the
 * one under the pack title was invisible. Flattening them to white with a
 * filter fixes the contrast but throws away the only thing distinguishing one
 * row from another in a list of hundreds, so they are painted as a MASK over a
 * colour instead: the shape survives, the colour is ours to pick.
 *
 * The hue is hashed from the set code, so it is arbitrary but stable - Alpha is
 * always the same green - while the list as a whole reads as a spread of
 * colour. Lightness and chroma are fixed, so nothing lands unreadable on glass.
 */
export function SetIcon({ code, url, className }: { code: string; url: string; className?: string }) {
  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) >>> 0;
  }
  const mask = `url("${url}")`;
  return (
    <span
      className={className}
      aria-hidden
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
        backgroundColor: `oklch(0.8 0.15 ${hash % 360})`,
      }}
    />
  );
}

/** Identity of a specific printing in a specific finish. */
export function pullKey(scryfallId: string, foil: boolean): string {
  return `${scryfallId}:${foil ? 'f' : 'n'}`;
}

/** Where .pdFanCard pivots, in card-heights below the card's top edge. */
const FAN_PIVOT = 3.2;
/** Card width in card-heights - a Magic card is 63mm x 88mm. */
const CARD_ASPECT = 63 / 88;

/**
 * How tall a fan actually is, in card-heights.
 *
 * Rotating about a pivot this far below the cards LOWERS the outer cards' top
 * edges, so the arc never needs headroom above - only below, for how far the
 * outermost bottom corner swings down. A fixed multiplier had to assume the
 * worst case, which left a band of dead space over every fan.
 */
export function arcHeight(spread: number): number {
  const bottom = FAN_PIVOT - 1; // the card's bottom edge, above the pivot
  const half = CARD_ASPECT / 2;
  const radius = Math.hypot(bottom, half);
  const swept = Math.atan(half / bottom) + (spread / 2) * (Math.PI / 180);
  return 1 + (bottom - radius * Math.cos(swept));
}

/** The minimum a fanned card needs to know about itself. */
export interface FanCard {
  id: string;
  name: string;
  rarity: string;
  foil: boolean;
}

/** How long the cards stay stacked before the arc opens. */
const STACK_MS = 360;

/** How long the arc takes to open - keep in step with .pdFanCard's transition. */
const OPEN_MS = 660;

/** Where a fan is in its reveal: a stack, on its way open, or settled. */
export type FanPhase = 'stacked' | 'opening' | 'open';

/**
 * How far through its reveal a fan is.
 *
 * Cards used to materialise already fanned, which put them on screen at their
 * final angles while the wrapper was still coming apart - so the outer cards
 * cut straight through the halves of the pack they were supposedly still
 * inside. Coming out as a stack first is both the fix and what actually
 * happens when you open a booster: the cards leave together, then spread.
 *
 * The third phase exists for the slinky. Opening is a long, eased sweep and
 * following the pointer has to be immediate, and both move the same property -
 * so the fan cannot simply have one transition. `open` is the flag the CSS
 * hangs the fast transition off, and it only arrives once the slow one is done.
 *
 * Keyed on a string rather than the array, because callers routinely build the
 * card list inline (`pool.slice(-7)`) and a new array every render would reset
 * the stack forever.
 */
export function useFanPhase(key: string): FanPhase {
  const [phase, setPhase] = useState<FanPhase>('stacked');
  useEffect(() => {
    setPhase('stacked');
    const opening = setTimeout(() => setPhase('opening'), STACK_MS);
    const open = setTimeout(() => setPhase('open'), STACK_MS + OPEN_MS);
    return () => {
      clearTimeout(opening);
      clearTimeout(open);
    };
  }, [key]);
  return phase;
}

/** A stable identity for a fan's contents, for useFanPhase. */
export function fanKey(cards: readonly FanCard[]): string {
  return `${cards.length}:${cards[0]?.id ?? ''}:${cards[cards.length - 1]?.id ?? ''}`;
}

/**
 * Where a card sits before the arc opens: a stack, but not a perfect one - a
 * degree or so of drift each way is what makes it read as many cards rather
 * than one thick card.
 */
export function fanStack(index: number, count: number): { rotate: string; translate: string } {
  const off = index - (count - 1) / 2;
  return {
    rotate: `${(off * 1.15).toFixed(2)}deg`,
    translate: `${(off * 0.9).toFixed(2)}% ${(-index * 0.32).toFixed(2)}%`,
  };
}

/**
 * One arc of cards. Each card pivots around a point well below the fan, which
 * is what makes a spread read as a hand rather than a row - the same trick the
 * fullscreen opener uses, sized for the dock's stage.
 *
 * The arc it sweeps is FIXED, and the cards are dealt out across it by weight
 * (see slinky.ts) rather than evenly, so the ends stay tucked and whichever
 * part of the fan the pointer is over opens up. That is what lets a big pack
 * keep the same footprint as a small one instead of running off the stage.
 */
export function PackFan({
  cards,
  label,
  feature,
  newKeys,
  newLabel,
  badge,
}: {
  cards: FanCard[];
  label: string;
  /** The half worth stopping on, drawn larger. */
  feature?: boolean;
  newKeys?: Set<string>;
  newLabel?: string;
  /** An extra overlay per card, for surfaces that mark cards their own way. */
  badge?: (card: FanCard, index: number) => ReactNode;
}) {
  // Before the early return: this fan may go from empty to full in place.
  const phase = useFanPhase(fanKey(cards));
  const [hover, setHover] = useState<number | null>(null);
  if (cards.length === 0) return null;
  const count = cards.length;
  // Wide fans need a tighter per-card angle or the ends point at the floor.
  const spreadAngle = Math.min(70, count * 10);
  // At rest the fan focuses its own middle, which is what puts the density at
  // the edges: the centre cards claim the room and the outer ones tuck in
  // behind each other, the way a real fan of cards sits in a hand.
  const focus = phase === 'open' && hover !== null ? hover : (count - 1) / 2;
  const offsets = slinkyOffsets(count, focus);

  return (
    <div className="pdFan" data-feature={feature || undefined}>
      <div
        className="pdFanArc"
        data-open={phase === 'open' || undefined}
        style={{ ['--pd-arc-h' as string]: arcHeight(spreadAngle).toFixed(3) }}
        onPointerMove={(event) => {
          // A luxury for pointers that hover. A touch is either scrolling the
          // dock or about to tap a card, and neither wants the fan reshuffling
          // itself under the finger.
          if (event.pointerType !== 'mouse') return;
          const at = focusFromPointer(event.clientX, event.currentTarget.getBoundingClientRect(), count);
          // Quantised to a fifth of a card: the transition smooths the steps
          // away completely, and it keeps a pointer sweep from re-rendering
          // every card in the fan on every frame.
          setHover(at === null ? null : Math.round(at * 5) / 5);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {cards.map((card, index) => {
          const fresh = !!newKeys?.has(pullKey(card.id, card.foil));
          const angle = count > 1 ? -spreadAngle / 2 + (offsets[index] ?? 0) * spreadAngle : 0;
          return (
            <div
              key={`${card.id}-${index}`}
              className="pdFanCard"
              data-rarity={card.rarity}
              data-foil={card.foil || undefined}
              // `rotate` and `translate` are their own CSS properties, so the
              // stack-to-arc transition and the keyframed `transform` entrance
              // compose instead of fighting.
              style={{
                ...(phase === 'stacked'
                  ? fanStack(index, count)
                  : { rotate: `${angle.toFixed(2)}deg`, translate: '0% 0%' }),
                zIndex: index,
                animationDelay: `${0.02 * index + (feature ? 0 : 0.12)}s`,
                transitionDelay: phase === 'open' ? '0s' : `${0.026 * index}s`,
              }}
            >
              <GameCard
                name={card.name}
                imageUrl={cardImage(card.id)}
                fluid
                foil={card.foil}
                tilt={4}
              />
              {fresh && newLabel && (
                <Pill
                  size="sm"
                  tone="accent"
                  variant="solid"
                  className="pdCardNew"
                  icon={<Sparkles size={11} />}
                >
                  {newLabel}
                </Pill>
              )}
              {badge?.(card, index)}
            </div>
          );
        })}
      </div>
      <span className="pdFanLabel">{label}</span>
    </div>
  );
}
