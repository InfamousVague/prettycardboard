import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MessageSquare, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import type { ChatLine } from '../../state/gameStore.ts';
import './chatBall.css';

/** How long a floated line stays up before it retires itself. */
const LIFE_MS = 7000;
/** Most bubbles on screen at once - past three the stack starts covering the
 *  board, and the chat panel is one click away for the backlog. */
const MAX_FLOATING = 3;

interface Floating {
  /** Monotonic; ChatLine has no id and two identical lines are legal. */
  key: number;
  line: ChatLine;
}

/**
 * The chat, as a ball in the bottom corner with its newest lines floating above
 * it - Messenger's chat head, rather than a toggle buried in a nav row.
 *
 * Lines only float while the panel is CLOSED. With it open the transcript is
 * already on screen and a bubble would be the same message twice, so incoming
 * lines are consumed silently and only the unread count is reset.
 */
export function ChatBall({
  chat,
  open,
  unread,
  onToggle,
}: {
  chat: ChatLine[];
  open: boolean;
  unread: number;
  onToggle: () => void;
}) {
  const t = useT();
  const [floating, setFloating] = useState<Floating[]>([]);
  // How much of `chat` this component has already reacted to. A ref, not
  // state: it must update in the same pass that queues the bubbles, or a second
  // render would re-float the same lines.
  const consumed = useRef(chat.length);
  const nextKey = useRef(0);

  useEffect(() => {
    // A room switch replaces the array wholesale and it can be SHORTER than
    // what we consumed; without this the counter would sit above the new
    // length and swallow every line until the transcript caught up.
    if (chat.length < consumed.current) consumed.current = chat.length;
    if (chat.length === consumed.current) return;
    const fresh = chat.slice(consumed.current);
    consumed.current = chat.length;
    if (open) return;
    setFloating((current) =>
      [...current, ...fresh.map((line) => ({ key: nextKey.current++, line }))].slice(-MAX_FLOATING),
    );
  }, [chat, open]);

  // Opening the panel clears the stack: the same lines are in the transcript.
  useEffect(() => {
    if (open) setFloating([]);
  }, [open]);

  // One timer per bubble, cleaned up on unmount so a room change cannot leave
  // a timer holding a reference to a stale setState.
  useEffect(() => {
    if (floating.length === 0) return;
    const timers = floating.map((item) =>
      window.setTimeout(
        () => setFloating((current) => current.filter((other) => other.key !== item.key)),
        LIFE_MS,
      ),
    );
    return () => timers.forEach(window.clearTimeout);
  }, [floating]);

  return (
    <div className="chatBallRoot">
      <div className="chatBallStack" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {floating.map((item) => (
            <motion.button
              key={item.key}
              type="button"
              className="chatBubble"
              onClick={onToggle}
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <span className="chatBubbleFrom">{item.line.from.username}</span>
              <span className="chatBubbleText">{item.line.text}</span>
              {/* Dismiss one line without opening the whole panel. A span, not a
                  nested button - a button inside a button is invalid markup and
                  React will not render it. */}
              <span
                className="chatBubbleClose"
                role="button"
                tabIndex={0}
                aria-label={t('tblChatClose')}
                onClick={(event) => {
                  event.stopPropagation();
                  setFloating((current) => current.filter((other) => other.key !== item.key));
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  setFloating((current) => current.filter((other) => other.key !== item.key));
                }}
              >
                <X size={12} aria-hidden />
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      <button
        type="button"
        className="chatBall"
        data-open={open || undefined}
        aria-label={open ? t('tblChatClose') : t('tblChatOpen')}
        aria-expanded={open}
        onClick={onToggle}
      >
        <MessageSquare size={22} aria-hidden />
        {!open && unread > 0 && (
          <span className="chatBallCount" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
