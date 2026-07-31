import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { motion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { GameCard } from '../../components/GameCard.tsx';
import { cardImage } from '../../data/cards.ts';
import { isFoilInst } from '../../data/foil.ts';
import { prefersReducedMotion } from './juice.ts';
import type { CardInst } from '../../net/types.ts';

/** Bottom band of the viewport that raises the peeking hand while hovered. */
export const HAND_PEEK_ZONE = 230;

/**
 * One card of the fan with macOS-Dock magnification: the pointer's distance
 * to the card's center drives a gaussian bump - biggest under the cursor,
 * tapering through the neighbors, gone by roughly two cards away. Motion
 * values keep the whole effect off the React render path.
 *
 * Where the card sits along the fan is NOT a transform: `--slink` drives its
 * `inset-inline-start` in CSS, so the fan can be reshaped by writing one custom
 * property per card without going through React (see MyBoard's paintSlinky),
 * and the transform is left free for the lift, tilt and drag.
 */
export function HandCard({
  card,
  dataIid,
  width,
  offset,
  count,
  dimmed,
  faceDown,
  handX,
  playable,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
  onClick,
  onContextMenu,
}: {
  /** Enforced rooms: this card is legal to play right now (Arena gold glow). */
  playable?: boolean;
  card: CardInst;
  /** Marks the card for hit-testing during a touch hand-scrub (MyBoard). */
  dataIid?: string;
  width: number;
  /** This card's place along the fan, 0 at the near end and 1 at the far one. */
  offset: number;
  /** How many cards are in the fan, which sets how far it leans and bows. */
  count: number;
  dimmed: boolean;
  faceDown?: boolean;
  handX: MotionValue<number>;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClick: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 0..1 pointer proximity to this card's center (live rect read: the fan
  // reflows as cards are played and the measurement must follow). The falloff
  // width tracks the card size so the taper stays even at any scale.
  const bump = useTransform(handX, (x) => {
    const el = ref.current;
    if (!el || !Number.isFinite(x) || prefersReducedMotion()) return 0;
    const rect = el.getBoundingClientRect();
    const d = (x - (rect.left + rect.width / 2)) / Math.max(1, width);
    return Math.exp(-d * d);
  });
  const scale = useSpring(useTransform(bump, (v) => 1 + 0.3 * v), { stiffness: 430, damping: 30 });
  // Lift proportionally to the card size so bigger cards clear the fan.
  const liftMax = -34 * (width / 132);
  const lift = useSpring(useTransform(bump, (v) => liftMax * v), { stiffness: 430, damping: 30 });
  const z = useTransform(bump, (v) => Math.round(v * 20));

  // The lean and the bow both come from the card's place in the fan rather than
  // its index, and both are capped: with forty cards an index-driven tilt put
  // the outermost cards on their sides and pushed them a hand's height down the
  // screen. A fan is a fan at any size - only the density inside it changes.
  const away = (offset - 0.5) * 2; // -1 at the near end, +1 at the far one
  const lean = Math.min(13, count * 1.75);
  const bow = Math.min(22, count * 3) * (width / 132);

  // The dock magnification lifts the inner .handCardZoom (which carries GameCard's
  // data-preview-src) up out of the fan, while the .handCard::after hit-buffer
  // stays put on top of the base footprint - so a pointer on the card body lands on
  // the buffer, whose closest('[data-preview-src]') is null, and only the lifted top
  // edge pokes above it to reach the real anchor. Mirror the preview attrs onto the
  // stable .handCard so the whole card previews, wherever the pointer rests.
  const previewSrc = faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId);

  return (
    <motion.div
      ref={ref}
      className="handCard"
      style={{ zIndex: z, ['--slink' as string]: offset }}
      data-hand-iid={dataIid}
      data-playable={playable || undefined}
      data-preview-src={previewSrc}
      data-preview-name={previewSrc ? card.name : undefined}
      initial={{ y: 60, opacity: 0 }}
      animate={{
        y: Math.abs(away) * bow,
        opacity: dimmed ? 0.28 : 1,
        rotate: away * lean,
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <motion.div className="handCardZoom" style={{ scale, y: lift }}>
        <GameCard
          name={card.name}
          imageUrl={faceDown ? undefined : card.imageUrl || cardImage(card.scryfallId)}
          faceDown={faceDown}
          width={width}
          foil={isFoilInst(card)}
          tilt={0}
        />
      </motion.div>
    </motion.div>
  );
}
