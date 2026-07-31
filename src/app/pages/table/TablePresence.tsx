import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { send, onMessage } from '../../net/ws.ts';
import { seatColor } from './seatColors.ts';

/**
 * Live table presence: broadcasts my pointer position (normalized over the
 * table) plus the card I'm hovering, and renders every other player's cursor as
 * a floating 3D pointer with a ring around whatever board card they're hovering.
 * Purely ephemeral - it rides the `cursor` relay and never touches game state.
 */

interface RemoteCursor {
  username: string;
  seat: number;
  /** Which seat's playmat the position is relative to (null = not over one). */
  mat: number | null;
  x: number;
  y: number;
  hover: string | null;
  ts: number;
}

const STALE_MS = 4000;
const SEND_INTERVAL = 45;

export function TablePresence({ meId, active }: { meId: string | undefined; active: boolean }) {
  // Which cursors exist (drives React nodes); live values live in the ref so the
  // rAF loop can glue them to the table/cards without re-rendering every frame.
  const cursors = useRef(new Map<string, RemoteCursor>());
  const [ids, setIds] = useState<string[]>([]);
  const nodes = useRef(new Map<string, HTMLDivElement | null>());
  // Cards currently wearing a remote-hover outline, so they can be cleared when
  // the hover moves on. The outline lives on the card element itself so it
  // rotates with the card's tilt/tap transform instead of a detached box.
  const outlined = useRef(new Set<HTMLElement>());
  /** True once we've told the table the pointer left every mat, so leaving does
   *  not spam one message per move. */
  const offMat = useRef(false);

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
        mat: message.mat ?? null,
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
      const el = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      // Only a playmat carries a cursor. Anywhere else - the rail, the header,
      // the hand strip, off the board entirely - reports "no mat" so viewers
      // hide the pointer instead of parking it somewhere meaningless.
      const mat = el?.closest<HTMLElement>('[data-mat-seat]') ?? null;
      const now = Date.now();
      if (now - last < SEND_INTERVAL) return;
      last = now;
      if (!mat) {
        if (!offMat.current) {
          offMat.current = true;
          send({ type: 'cursor.move', x: 0, y: 0, hover: null, mat: null });
        }
        return;
      }
      offMat.current = false;
      // Normalized WITHIN that mat, so the viewer can replay it on their own
      // copy of the same mat whatever size or place it has in their layout.
      const rect = mat.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const seat = Number(mat.getAttribute('data-mat-seat'));
      const hover = el?.closest('.fieldCard')?.getAttribute('data-iid') ?? null;
      send({ type: 'cursor.move', x, y, hover, mat: Number.isFinite(seat) ? seat : null });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [active]);

  // Glue pointers to the table and outline hovered cards; prune stale.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const table = document.querySelector('.table');
      const rect = table?.getBoundingClientRect();
      let dropped = false;
      // Which card each live cursor hovers, so we can outline exactly those and
      // clear the rest. Last writer wins if two players hover the same card.
      const wanted = new Map<string, string>();
      for (const [id, cursor] of cursors.current) {
        if (Date.now() - cursor.ts > STALE_MS) {
          cursors.current.delete(id);
          dropped = true;
          continue;
        }
        const pointer = nodes.current.get(id);
        if (pointer) {
          // Their mat, located in MY layout - so the pointer lands on exactly
          // the card they are hovering even though our boards are arranged
          // differently (staged, grid, mirrored).
          const mat =
            cursor.mat != null
              ? document.querySelector<HTMLElement>(`[data-mat-seat="${cursor.mat}"]`)
              : null;
          const box = mat?.getBoundingClientRect() ?? null;
          if (!box) {
            // Off-mat, or that mat is not on screen right now: hide rather than
            // guess a position.
            pointer.style.visibility = 'hidden';
          } else {
            pointer.style.visibility = '';
            const px = box.left + cursor.x * box.width;
            const py = box.top + cursor.y * box.height;
            pointer.style.transform = `translate3d(${px}px, ${py}px, 0)`;
          }
        }
        if (cursor.hover) wanted.set(cursor.hover, seatColor(cursor.seat, 0.5));
      }
      // Apply outlines to hovered cards. The ring must ride the INNER .gcCard:
      // it sits at the bottom of the whole transform chain (wrapper rest tilt ->
      // shell hover-lift/drag -> tap rotate), so it tracks every pose. The
      // wrapper's box never rotates on tap - a ring there reads misaligned.
      const seen = new Set<HTMLElement>();
      for (const [iid, color] of wanted) {
        const card = document.querySelector<HTMLElement>(`.fieldCard[data-iid="${iid}"] .gcCard`);
        if (!card) continue;
        card.style.outline = `3px solid ${color}`;
        card.style.outlineOffset = '-1px';
        seen.add(card);
        outlined.current.add(card);
      }
      for (const el of [...outlined.current]) {
        if (seen.has(el)) continue;
        el.style.outline = '';
        el.style.outlineOffset = '';
        outlined.current.delete(el);
      }
      if (dropped) syncIds();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Leave no orphaned outlines behind on unmount.
      for (const el of outlined.current) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
      outlined.current.clear();
    };
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
              className="remoteCursor"
              ref={(el) => {
                nodes.current.set(id, el);
              }}
            >
              <svg
                className="remoteCursorChevron"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                aria-hidden
              >
                <path
                  d="M10 3 L3 3 L3 10"
                  fill="none"
                  stroke={color}
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span
                className="remoteCursorPill"
                style={{ ['--cursor-color' as string]: color } as CSSProperties}
              >
                {cursor.username}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
