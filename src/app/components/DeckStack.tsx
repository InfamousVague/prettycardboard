import { useRef, type PointerEvent, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import './deckstack.css';

/**
 * A deck as a physical object: the commander card riding a stack of sleeved
 * cards, with pointer-tracked 3D tilt. The under-layers are real card backs,
 * fanned a few pixels each, separating slightly on hover so the stack reads
 * as depth, not decoration. Used by the deck library, browse tiles, and the
 * profile showcase.
 */

const LAYERS = [3, 2, 1] as const; // painted back-to-front

export function DeckStack({
  name,
  imageUrl,
  width = 168,
  tilt = 11,
  onClick,
  children,
}: {
  name: string;
  imageUrl?: string;
  width?: number;
  tilt?: number;
  onClick?: () => void;
  /** Overlay content on the top card (badges). */
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 300, damping: 26, mass: 0.7 });
  const sy = useSpring(py, { stiffness: 300, damping: 26, mass: 0.7 });
  const rotateY = useTransform(sx, [0, 1], [-tilt, tilt]);
  const rotateX = useTransform(sy, [0, 1], [tilt * 0.75, -tilt * 0.75]);

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
    py.set(Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)));
  };

  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  const height = Math.round(width * (680 / 488));

  return (
    <div
      className="dsPerspective"
      style={{ width: width + 14, height: height + 14 }}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => event.key === 'Enter' && onClick() : undefined}
      aria-label={name}
    >
      <motion.div ref={ref} className="dsStack" style={{ rotateX, rotateY }}>
        {LAYERS.map((layer) => (
          <div
            key={layer}
            className="dsLayer"
            style={{
              width,
              height,
              transform: `translate3d(${layer * 3}px, ${layer * 3}px, ${layer * -14}px)`,
            }}
            aria-hidden
          />
        ))}
        <div className="dsTop" style={{ width, height }}>
          {imageUrl ? (
            <img src={imageUrl} alt="" draggable={false} loading="lazy" />
          ) : (
            <span className="dsProxy">{name}</span>
          )}
          {children}
        </div>
      </motion.div>
    </div>
  );
}
