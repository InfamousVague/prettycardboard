import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Button, Size, Text, TextTone } from '@glacier/react';
import { PackageOpen, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { artCrop, cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useMobileLayout } from '../../hooks/useIsPhone.ts';
import { fanKey, fanStack, useFanPhase } from '../../components/packVisuals.tsx';
import { focusFromPointer, slinkyOffsets } from '../../components/slinky.ts';
import type { PackCard } from '../../data/boosters.ts';
import type { SetPool } from '../../data/boosterSets.ts';
import './packOpening.css';

/**
 * The fullscreen pack opening.
 *
 * A pack is a small piece of theatre, so this takes over the screen and plays
 * it out: the wrapper tears along a jagged seam, the two halves fly apart, and
 * the cards spill into two fans - the bulk of the pack in one, the cards you
 * actually care about in the other, so the payoff reads at a glance.
 *
 * The tear is two copies of the wrapper clipped by complementary polygons, so
 * the seam always matches perfectly no matter the pack's size on screen.
 */

type Phase = 'sealed' | 'tearing' | 'fanned';

/**
 * Body-scroll lock, reference counted. A naive snapshot-and-restore breaks when
 * two overlays overlap for a tick (React mounts the replacement before it
 * unmounts the outgoing one), which left the page permanently unscrollable
 * after closing. Only the first lock snapshots, only the last one restores.
 */
let scrollLocks = 0;
let scrollPrevious = '';

function lockBodyScroll(): () => void {
  if (scrollLocks === 0) {
    scrollPrevious = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks -= 1;
    if (scrollLocks === 0) document.body.style.overflow = scrollPrevious;
  };
}

/**
 * How long the rip runs before the cards take over.
 *
 * Must outlast the halves themselves (240ms delay + 780ms flight, see
 * .poHalfTop / .poHalfBottom) or the cards mount over a wrapper that is still
 * on screen and slice straight through it.
 */
const TEAR_MS = 1040;

/**
 * The seam. Both halves are cut from the SAME list of points, so the top piece
 * ends exactly where the bottom piece begins and the tear never shows a gap.
 */
const SEAM = [
  [0, 32],
  [7, 27],
  [15, 34],
  [23, 28],
  [31, 35],
  [39, 29],
  [47, 36],
  [55, 30],
  [63, 37],
  [71, 31],
  [79, 36],
  [87, 30],
  [94, 35],
  [100, 29],
] as const;

const seamPath = SEAM.map(([x, y]) => `${x}% ${y}%`).join(', ');
const CLIP_TOP = `polygon(0 0, 100% 0, ${[...SEAM].reverse().map(([x, y]) => `${x}% ${y}%`).join(', ')})`;
const CLIP_BOTTOM = `polygon(${seamPath}, 100% 100%, 0 100%)`;

export function PackOpening({
  cards,
  pool,
  setName,
  setIcon,
  art,
  backSrc,
  onOpenAnother,
  onClose,
}: {
  cards: PackCard[];
  /** The whole set pool, so the theatre can show what is actually pullable. */
  pool?: SetPool | null;
  setName: string;
  setIcon?: string;
  /** The set's cached poster art: wraps the sealed pack and floods the room.
      Null degrades to the card-back wrapper on a plain stage. */
  art: string | null;
  backSrc: string;
  onOpenAnother: () => void;
  onClose: () => void;
}) {
  const t = useT();
  // Everything this pack COULD contain, rarest first - the odds made concrete.
  const pullable = useMemo(
    () => (pool ? [...pool.mythic, ...pool.rare, ...pool.uncommon, ...pool.common] : []),
    [pool],
  );
  const mobile = useMobileLayout();
  const [phase, setPhase] = useState<Phase>('sealed');

  // The pack splits into what you flip past and what you stop on.
  const { bulk, highlights } = useMemo(() => {
    const bulk: PackCard[] = [];
    const highlights: PackCard[] = [];
    for (const card of cards) {
      if (card.slot === 'common' || card.slot === 'land') bulk.push(card);
      else highlights.push(card);
    }
    return { bulk, highlights };
  }, [cards]);

  const best = useMemo(
    () => (cards.some((c) => c.rarity === 'mythic') ? 'mythic' : cards.some((c) => c.rarity === 'rare') ? 'rare' : undefined),
    [cards],
  );

  // The first pack arrives sealed, to be torn. Every pack after it comes from
  // "Open another", which already reads as the tear - so it rips immediately
  // rather than making the player click twice for the same thing.
  //
  // Comparing the previous pack rather than flipping a boolean keeps this
  // correct under StrictMode, which runs effects twice on mount: a flag would
  // be cleared by the first run and leave the very first pack pre-torn.
  const previousPack = useRef<PackCard[] | null>(null);
  useEffect(() => {
    const isFirst = previousPack.current === null || previousPack.current === cards;
    previousPack.current = cards;
    setPhase(isFirst ? 'sealed' : 'tearing');
  }, [cards]);

  // The rip is timed, not frame-driven, so it completes even if the tab is
  // backgrounded mid-animation.
  useEffect(() => {
    if (phase !== 'tearing') return;
    const timer = setTimeout(() => setPhase('fanned'), TEAR_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const tear = useCallback(() => {
    setPhase((current) => (current === 'sealed' ? 'tearing' : current));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== ' ' && event.key !== 'Enter') return;
      // preventDefault on a bubbled keydown cancels a native <button>'s own
      // activation, so only claim the key when there is actually a sealed pack
      // to tear AND no control owns the keystroke - otherwise "Open another",
      // "Done" and the close button are dead to the keyboard.
      if (phase !== 'sealed') return;
      const target = event.target as Element | null;
      if (target?.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      tear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, tear, onClose]);

  // The page behind must not scroll while the overlay owns the screen.
  useEffect(lockBodyScroll, []);

  // Portalled to <body> deliberately: the route frame is an animated element,
  // and a transformed ancestor becomes the containing block for position:fixed
  // - inside it the overlay would only cover the content column, not the app.
  return createPortal(
    <div className="poRoot" data-phase={phase} role="dialog" aria-modal="true" aria-label={setName}>
      {art && <div className="poBackdrop" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}
      <div className="poAmbient" data-rarity={phase === 'fanned' ? best : undefined} aria-hidden />

      <div className="poBar">
        <span className="poSetTag">
          {setIcon && <img className="poSetIcon" src={setIcon} alt="" aria-hidden />}
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {setName}
          </Text>
        </span>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('cpClose')}>
          <X size={18} />
        </Button>
      </div>

      {/* Split: the set's own art holds the left, the pack and its cards get
          the rest. The showcase is the thing you are opening; the stage is what
          came out of it, and neither has to share a centred column with the
          other any more. */}
      <div className="poBody">
        <aside className="poShowcase" onClick={(event) => event.stopPropagation()}>
          {art && (
            <div className="poShowcaseArt" style={{ backgroundImage: `url("${art}")` }} role="img" aria-label={setName} />
          )}
          <div className="poShowcaseInfo">
            {setIcon && <img className="poShowcaseIcon" src={setIcon} alt="" aria-hidden />}
            <Text as="span" size={Size.Large} weight="semibold" className="poShowcaseName">
              {setName}
            </Text>
          </div>
      {pullable.length > 0 && (
        <div className="poPool">
          <span className="poPoolHead">
            {t('boPullable')} · {pullable.length}
          </span>
          <ul className="poPoolList">
            {pullable.map((card) => (
              <li key={card.id} className="poPoolRow" data-rarity={card.rarity}>
                <img className="poPoolArt" src={artCrop(card.id)} alt="" loading="lazy" decoding="async" />
                <span className="poPoolName">{card.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

        </aside>

      <div className="poStage" onClick={phase === 'sealed' ? tear : undefined}>
        {phase !== 'fanned' ? (
          <div className="poPack" data-tearing={phase === 'tearing' || undefined}>
            {/* The stack inside, revealed as the wrapper comes apart. */}
            <div className="poInner" aria-hidden>
              <div className="poInnerCard" style={{ backgroundImage: `url("${backSrc}")` }} />
              <div className="poInnerGlow" />
            </div>

            {/* Two halves of one wrapper, cut along the same seam. With poster
                art the wrapper is the set's real booster: art panel, foil
                crimps, set name - otherwise the card back stands in. */}
            <div
              className="poHalf poHalfTop"
              data-art={art ? '' : undefined}
              style={{ backgroundImage: `url("${art ?? backSrc}")`, clipPath: CLIP_TOP }}
              aria-hidden
            >
              <div className="poCrimp" data-edge="top" />
              <div className="poSheen" />
            </div>
            <div
              className="poHalf poHalfBottom"
              data-art={art ? '' : undefined}
              style={{ backgroundImage: `url("${art ?? backSrc}")`, clipPath: CLIP_BOTTOM }}
              aria-hidden
            >
              <div className="poSheen" />
              {setIcon && <img className="poWrapperIcon" src={setIcon} alt="" />}
              {art && <span className="poWrapperName">{setName}</span>}
              <div className="poCrimp" data-edge="bottom" />
            </div>
          </div>
        ) : mobile ? (
          // A phone has no room for two arcs: the pack lays out as one line you
          // swipe, best cards first so the payoff is what you land on.
          <div className="poLine">
            {[...highlights, ...bulk].map((card, index) => (
              <div
                key={`${card.id}-${index}`}
                className="poLineCard"
                data-rarity={card.rarity}
                style={{ animationDelay: `${Math.min(index, 12) * 0.045}s` }}
              >
                <GameCard name={card.name} imageUrl={cardImage(card.id)} fluid foil={card.foil} tilt={4} />
              </div>
            ))}
          </div>
        ) : (
          <div className="poFans">
            <Fan cards={highlights} label={t('boTheGoods')} feature />
            <Fan cards={bulk} label={t('boTheRest')} />
          </div>
        )}
      </div>

      </div>

      <div className="poFoot" onClick={(event) => event.stopPropagation()}>
        {phase === 'sealed' && (
          <Button size="lg" onClick={tear}>
            <PackageOpen size={18} aria-hidden />
            {t('boOpenPack')}
          </Button>
        )}
        {phase === 'fanned' && (
          <>
            <Button size="lg" onClick={onOpenAnother}>
              <PackageOpen size={18} aria-hidden />
              {t('boOpenAnother')}
            </Button>
            <Button size="lg" variant="soft" onClick={onClose}>
              {t('boDone')}
            </Button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * One arc of cards. Each card pivots around a point below the fan, which is
 * what makes a spread of cards read as a hand rather than a row.
 *
 * The cards arrive as a stack and open a beat later - see useFanPhase - into a
 * FIXED arc, across which they are dealt by weight rather than evenly (see
 * slinky.ts). The ends stay tucked, the pointer opens whatever it is over, and
 * a fifteen-card pack takes exactly as much of the screen as a three-card one.
 */
function Fan({ cards, label, feature }: { cards: PackCard[]; label: string; feature?: boolean }) {
  const phase = useFanPhase(fanKey(cards));
  const [hover, setHover] = useState<number | null>(null);
  if (cards.length === 0) return null;
  const count = cards.length;
  // Wide fans need a tighter per-card angle or the ends point at the floor.
  // The pivot sits deep below the cards (see .poFanCard), so even at this
  // spread the arc stays shallow while sweeping most of the screen's width.
  const spread = Math.min(74, count * 10);
  // At rest the fan focuses its own middle, so the density lands at the edges.
  const focus = phase === 'open' && hover !== null ? hover : (count - 1) / 2;
  const offsets = slinkyOffsets(count, focus);

  return (
    <div className="poFan" data-feature={feature || undefined}>
      <div
        className="poFanArc"
        data-open={phase === 'open' || undefined}
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          const at = focusFromPointer(event.clientX, event.currentTarget.getBoundingClientRect(), count);
          // Quantised to a fifth of a card - the transition hides the steps and
          // a sweep no longer re-renders every card in the fan every frame.
          setHover(at === null ? null : Math.round(at * 5) / 5);
        }}
        onPointerLeave={() => setHover(null)}
      >
        {cards.map((card, index) => {
          const angle = count > 1 ? -spread / 2 + (offsets[index] ?? 0) * spread : 0;
          return (
            <div
              key={`${card.id}-${index}`}
              className="poFanCard"
              data-rarity={card.rarity}
              data-foil={card.foil || undefined}
              // `rotate` and `translate` are their own CSS properties, so the
              // stack-to-arc transition and the keyframed `transform` entrance
              // compose instead of overwriting each other.
              style={{
                ...(phase === 'stacked'
                  ? fanStack(index, count)
                  : { rotate: `${angle.toFixed(2)}deg`, translate: '0% 0%' }),
                zIndex: index,
                animationDelay: `${0.018 * index + (feature ? 0 : 0.1)}s`,
                transitionDelay: phase === 'open' ? '0s' : `${0.026 * index}s`,
              }}
            >
              <GameCard name={card.name} imageUrl={cardImage(card.id)} fluid foil={card.foil} tilt={4} />
            </div>
          );
        })}
      </div>
      <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="poFanLabel">
        {label}
      </Text>
    </div>
  );
}
