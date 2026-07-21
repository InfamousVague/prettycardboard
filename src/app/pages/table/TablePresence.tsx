import { useEffect, useRef, useState } from 'react';
import { send, onMessage } from '../../net/ws.ts';

/**
 * Live table presence: broadcasts my pointer position (normalized over the
 * table) plus the card I'm hovering, and renders every other player's cursor as
 * a floating 3D pointer with a ring around whatever board card they're hovering.
 * Purely ephemeral - it rides the `cursor` relay and never touches game state.
 */

interface RemoteCursor {
  username: string;
  seat: number;
  x: number;
  y: number;
  hover: string | null;
  ts: number;
}

const STALE_MS = 4000;
const SEND_INTERVAL = 45;

/** A distinct, legible hue per seat. */
function seatColor(seat: number): string {
  return `hsl(${(seat * 67) % 360} 85% 62%)`;
}

export function TablePresence({ meId, active }: { meId: string | undefined; active: boolean }) {
  // Which cursors exist (drives React nodes); live values live in the ref so the
  // rAF loop can glue them to the table/cards without re-rendering every frame.
  const cursors = useRef(new Map<string, RemoteCursor>());
  const [ids, setIds] = useState<string[]>([]);
  const nodes = useRef(new Map<string, { pointer: HTMLDivElement | null; ring: HTMLDivElement | null }>());

  const syncIds = () => {
    const next = [...cursors.current.keys()];
    setIds((prev) =>
      prev.length === next.length && prev.every((id) => next.includes(id)) ? prev : next,
    );
  };

  // Receive others' cursors.
  useEffect(() => {
    return onMessage((message) => {
      if (message.type !== 'cursor') return;
      if (message.fromUserId === meId) return;
      cursors.current.set(message.fromUserId, {
        username: message.username,
        seat: message.seat,
        x: message.x,
        y: message.y,
        hover: message.hover,
        ts: Date.now(),
      });
      syncIds();
    });
  }, [meId]);

  // Broadcast my own pointer + hovered card, throttled.
  useEffect(() => {
    if (!active) return;
    let last = 0;
    const onMove = (event: PointerEvent) => {
      const table = document.querySelector('.table');
      if (!table) return;
      const rect = table.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const now = Date.now();
      if (now - last < SEND_INTERVAL) return;
      last = now;
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const hover = el?.closest('.fieldCard')?.getAttribute('data-iid') ?? null;
      send({ type: 'cursor.move', x, y, hover });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [active]);

  // Glue pointers to the table and rings to their hovered cards; prune stale.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const table = document.querySelector('.table');
      const rect = table?.getBoundingClientRect();
      let dropped = false;
      for (const [id, cursor] of cursors.current) {
        if (Date.now() - cursor.ts > STALE_MS) {
          cursors.current.delete(id);
          dropped = true;
          continue;
        }
        const node = nodes.current.get(id);
        if (!node) continue;
        if (node.pointer && rect) {
          const px = rect.left + cursor.x * rect.width;
          const py = rect.top + cursor.y * rect.height;
          node.pointer.style.transform = `translate3d(${px}px, ${py}px, 0)`;
        }
        if (node.ring) {
          const card = cursor.hover
            ? document.querySelector<HTMLElement>(`.fieldCard[data-iid="${cursor.hover}"]`)
            : null;
          if (card) {
            const r = card.getBoundingClientRect();
            node.ring.style.opacity = '1';
            node.ring.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
            node.ring.style.width = `${r.width}px`;
            node.ring.style.height = `${r.height}px`;
          } else {
            node.ring.style.opacity = '0';
          }
        }
      }
      if (dropped) syncIds();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (ids.length === 0) return null;

  return (
    <div className="tablePresence" aria-hidden>
      {ids.map((id) => {
        const cursor = cursors.current.get(id);
        if (!cursor) return null;
        const color = seatColor(cursor.seat);
        return (
          <div key={id}>
            <div
              className="remoteHoverRing"
              style={{ borderColor: color, boxShadow: `0 0 0 2px ${color}, 0 0 18px ${color}` }}
              ref={(el) => {
                const entry = nodes.current.get(id) ?? { pointer: null, ring: null };
                entry.ring = el;
                nodes.current.set(id, entry);
              }}
            />
            <div
              className="remoteCursor"
              ref={(el) => {
                const entry = nodes.current.get(id) ?? { pointer: null, ring: null };
                entry.pointer = el;
                nodes.current.set(id, entry);
              }}
            >
              <svg width="26" height="30" viewBox="0 0 26 30" className="remoteCursorArrow">
                <path
                  d="M3 2 L3 22 L9 17 L13 26 L17 24 L13 15 L21 15 Z"
                  fill={color}
                  stroke="rgba(0,0,0,0.55)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="remoteCursorName" style={{ background: color }}>
                {cursor.username}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
