import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Long-press for touch, right-click for mouse. Touch devices have no
 * contextmenu, so the "secondary action" (open the artwork picker, the card
 * menu) is reached by pressing and holding. The returned handlers spread onto
 * any element:
 *
 *   const lp = useLongPress(() => openMenu());
 *   <div {...lp} onContextMenu={(e) => { e.preventDefault(); openMenu(); }} />
 *
 * Mouse pointers are ignored here (they use onContextMenu); a real drag or a
 * scroll cancels the press, and the click that follows a fired long-press is
 * swallowed so a tap-and-hold never also triggers the element's onClick.
 */

const HOLD_MS = 450;
const MOVE_CANCEL_PX = 10;

/** What the press was over, captured at pointerdown so a deferred callback (e.g.
 * opening a positioned menu) still has valid coordinates and target. */
export interface LongPressInfo {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
  onPointerLeave: (event: ReactPointerEvent) => void;
  onClickCapture: (event: React.MouseEvent) => void;
}

/** Adapts a long-press into the pointer-event shape a context-menu opener
 * expects (currentTarget for the anchor rect, clientX/Y for placement). */
export function menuEventFrom(info: LongPressInfo): ReactPointerEvent {
  return {
    preventDefault: () => {},
    stopPropagation: () => {},
    currentTarget: info.currentTarget,
    clientX: info.clientX,
    clientY: info.clientY,
  } as unknown as ReactPointerEvent;
}

export function useLongPress(onLongPress: (info: LongPressInfo) => void, holdMs = HOLD_MS): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  };

  return {
    onPointerDown: (event) => {
      // Touch and pen only; mouse keeps its native right-click path.
      if (event.pointerType === 'mouse') return;
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      // The React event is recycled after this handler returns, so snapshot
      // what a deferred callback might need now.
      const info: LongPressInfo = {
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: event.currentTarget,
      };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress(info);
      }, holdMs);
    },
    onPointerMove: (event) => {
      const start = origin.current;
      if (!start) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_CANCEL_PX) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onClickCapture: (event) => {
      // The tap that ends a long-press must not also fire the element's click.
      if (fired.current) {
        event.preventDefault();
        event.stopPropagation();
        fired.current = false;
      }
    },
  };
}
