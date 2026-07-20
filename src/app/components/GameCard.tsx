import { memo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import './gamecard.css';

/**
 * The card. One component renders every Magic card in the app - deck rows,
 * profile showcases, and the live table - with the premium treatment: a
 * pointer-tracked 3D tilt, a moving specular glare, and a holographic foil
 * sheen that sweeps with the pointer, all GPU-composited. Tilt is driven by
 * motion springs so entering/leaving feels weighted, never snappy.
 */

export interface GameCardProps {
  name: string;
  imageUrl?: string;
  /** Card width in px; height follows the 488x680 print ratio. */
  width?: number;
  /** Fill the parent's width instead (aspect-ratio keeps the print shape). */
  fluid?: boolean;
  faceDown?: boolean;
  tapped?: boolean;
  /** Holo-foil sheen layer (commanders, showcase cards). */
  foil?: boolean;
  /** Max tilt in degrees; 0 disables the pointer parallax. */
  tilt?: number;
  /** Soft accent glow behind the card (legendary/selected treatment). */
  glow?: boolean;
  selected?: boolean;
  onClick?: () => void;
  onContextMenu?: (event: PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const RATIO = 680 / 488;

/**
 * Memoized: GameCard is the app's heaviest leaf (springs + transforms + foil +
 * glare) and is rendered per card across the whole board, so it re-renders on
 * every ws event and every drag frame through its parents. Callers that pass
 * only primitive props (hand cards, zone piles) now skip reconciliation when
 * nothing about the card changed; callers that pass fresh `children`/handlers
 * every render (field/opponent cards) still re-render until those are hoisted.
 */
export const GameCard = memo(function GameCard({
  name,
  imageUrl,
  width = 160,
  fluid = false,
  faceDown = false,
  tapped = false,
  foil = false,
  tilt = 10,
  glow = false,
  selected = false,
  onClick,
  onContextMenu,
  className,
  style,
  children,
}: GameCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovering, setHovering] = useState(false);

  // Pointer position within the card, 0..1. Springs carry the tilt so the
  // card eases back to rest instead of snapping.
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 320, damping: 28, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 320, damping: 28, mass: 0.6 });

  const rotateY = useTransform(sx, [0, 1], [-tilt, tilt]);
  const rotateX = useTransform(sy, [0, 1], [tilt, -tilt]);
  const glareX = useTransform(sx, [0, 1], ['20%', '80%']);
  const glareY = useTransform(sy, [0, 1], ['20%', '80%']);
  const sheenPos = useTransform(sx, [0, 1], ['0%', '100%']);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tilt === 0 || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
    py.set(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)));
  };

  const reset = () => {
    setHovering(false);
    px.set(0.5);
    py.set(0.5);
  };

  const height = Math.round(width * RATIO);
  const sizing: CSSProperties = fluid
    ? { width: '100%', aspectRatio: `488 / 680` }
    : { width, height };

  return (
    <div
      className={`gcPerspective${className ? ` ${className}` : ''}`}
      style={{ ...sizing, ...style }}
      onClick={onClick}
      onContextMenu={onContextMenu}
      // Front-facing cards opt into the global hover-zoom (HoverCardLayer):
      // resting the pointer on the card floats a larger copy above it.
      data-preview-src={!faceDown && imageUrl ? imageUrl : undefined}
      data-preview-name={!faceDown && imageUrl ? name : undefined}
    >
      <motion.div
        ref={ref}
        className="gcCard"
        data-face-down={faceDown || undefined}
        data-selected={selected || undefined}
        data-glow={glow || undefined}
        animate={{ rotate: tapped ? 90 : 0, scale: hovering && tilt > 0 ? 1.04 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{ rotateX: tilt ? rotateX : 0, rotateY: tilt ? rotateY : 0 }}
        onPointerMove={onPointerMove}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={reset}
        role={onClick ? 'button' : undefined}
        aria-label={faceDown ? 'Face-down card' : name}
      >
        {faceDown ? (
          <div className="gcArt gcBackFace" aria-hidden />
        ) : imageUrl ? (
          <img className="gcArt" src={imageUrl} alt="" draggable={false} loading="lazy" />
        ) : (
          <div className="gcProxy">
            <span>{name}</span>
          </div>
        )}
        {!faceDown && foil && (
          <motion.div className="gcFoil" aria-hidden style={{ backgroundPositionX: sheenPos }} />
        )}
        {!faceDown && tilt > 0 && (
          <motion.div
            className="gcGlare"
            aria-hidden
            style={{
              opacity: hovering ? 1 : 0,
              background: `radial-gradient(farthest-corner circle at var(--gx) var(--gy), rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.08) 28%, rgba(0,0,0,0.22) 90%)`,
              ['--gx' as string]: glareX,
              ['--gy' as string]: glareY,
            }}
          />
        )}
      </motion.div>
      {/* Badges live OUTSIDE the clipped card face so corner overlays (attack,
          counters) can protrude past the edge without being cropped. */}
      {children != null && <div className="gcOverlay">{children}</div>}
    </div>
  );
});
