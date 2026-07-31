import { useEffect, useRef, useState } from 'react';
import { Avatar, IconButton, Input, ScrollArea, Size, Text, TextTone } from '@glacier/react';
import { Bot, MessageSquare, Send, Sparkles, X } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { artCrop } from '../../data/cards.ts';
import './lobbyChat.css';

/**
 * Chat for a room, used both in the pregame lobby and at the table. The
 * realtime plumbing already exists end to end - the store keeps a capped `chat`
 * log fed by the server's `chat` frames, and `sendChat` pushes a `chat.send`.
 * This is purely the surface: a scrollable, auto-following message list plus a
 * composer, built from Glacier primitives. Consecutive lines from the same
 * author within a minute are grouped under one avatar/heading.
 *
 * Notable pack pulls arrive on the same transcript (see `ChatLine.pull`) and
 * render as a card rather than a sentence, so the table sees what was opened.
 */

/** Short wall-clock time for a chat line (locale-aware, hour:minute). */
function chatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const GROUP_WINDOW_MS = 60_000;
const MAX_LEN = 300;

export function LobbyChat({
  variant = 'lobby',
  onClose,
}: {
  variant?: 'lobby' | 'table';
  /** Renders a close affordance in the header (the table aside supplies it). */
  onClose?: () => void;
}) {
  const t = useT();
  const chat = useGame((state) => state.chat);
  const sendChat = useGame((state) => state.sendChat);
  const myId = useApp((state) => state.identity?.userId);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const atTable = variant === 'table';
  const title = atTable ? t('tblChat') : t('chatTitle');
  const placeholder = atTable ? t('tblChatPlaceholder') : t('chatPlaceholder');

  // Follow the tail as messages arrive (and on first mount).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    sendChat(text);
    setDraft('');
  };

  return (
    <section className="lobbyChat" data-variant={variant} aria-label={title}>
      <header className="lobbyChatHead">
        <MessageSquare size={15} />
        <span>{title}</span>
        {onClose && (
          <IconButton
            size="sm"
            variant="ghost"
            aria-label={t('tblChatClose')}
            className="lobbyChatClose"
            onClick={onClose}
          >
            <X size={15} />
          </IconButton>
        )}
      </header>

      <ScrollArea className="lobbyChatScroll" maxHeight={atTable ? undefined : 240}>
        {chat.length === 0 ? (
          <div className="lobbyChatEmpty">
            <Text as="span" size={Size.Small} tone={TextTone.Subtle}>
              {t('chatEmpty')}
            </Text>
          </div>
        ) : (
          <ul className="lobbyChatList">
            {chat.map((line, index) => {
              const mine = line.from.userId === myId;
              const prev = chat[index - 1];
              // A pull always opens its own block: grouping a card under the
              // heading of a sentence someone typed reads as a reply to it.
              const grouped =
                prev != null &&
                prev.from.userId === line.from.userId &&
                line.ts - prev.ts < GROUP_WINDOW_MS &&
                !line.pull &&
                !prev.pull;
              return (
                <li
                  key={`${line.ts}-${index}`}
                  className="lobbyChatMsg"
                  data-mine={mine || undefined}
                  data-grouped={grouped || undefined}
                  data-pull={line.pull ? line.pull.rarity : undefined}
                >
                  <span className="lobbyChatAvatar">
                    {!grouped && <Avatar name={line.from.username} size="sm" />}
                  </span>
                  <div className="lobbyChatBody">
                    {!grouped && (
                      <span className="lobbyChatMeta">
                        <span className="lobbyChatFrom">
                          {mine ? t('tblYou') : line.from.username}
                          {line.from.userId.startsWith('bot:') && (
                            <Bot size={11} className="lobbyChatBotMark" aria-hidden />
                          )}
                        </span>
                        <time className="lobbyChatTime" dateTime={new Date(line.ts).toISOString()}>
                          {chatTime(line.ts)}
                        </time>
                      </span>
                    )}
                    {line.pull ? (
                      <span className="lobbyChatPull">
                        <img
                          className="lobbyChatPullArt"
                          src={artCrop(line.pull.scryfallId)}
                          alt=""
                          loading="lazy"
                          draggable={false}
                        />
                        <span className="lobbyChatPullBody">
                          <span className="lobbyChatPullName">{line.pull.name}</span>
                          <span className="lobbyChatPullMeta">
                            <Sparkles size={11} aria-hidden />
                            {t('chatPulled')}
                            {' · '}
                            {line.pull.setCode.toUpperCase()}
                            {line.pull.foil && ` · ${t('chatPullFoil')}`}
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="lobbyChatText">{line.text}</span>
                    )}
                  </div>
                </li>
              );
            })}
            <div ref={endRef} aria-hidden />
          </ul>
        )}
      </ScrollArea>

      <form className="lobbyChatForm" onSubmit={submit}>
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_LEN))}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
        />
        <IconButton type="submit" variant="solid" aria-label={t('chatSend')} disabled={!draft.trim()}>
          <Send size={16} />
        </IconButton>
      </form>
    </section>
  );
}
