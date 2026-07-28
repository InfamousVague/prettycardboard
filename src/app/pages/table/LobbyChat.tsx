import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Avatar, IconButton, Input, ScrollArea, Size, Text, TextTone } from '@glacier/react';
import { MessageSquare, Send } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import './lobbyChat.css';

/**
 * Basic lobby chat. The realtime plumbing already exists end to end - the store
 * keeps a capped `chat` log fed by the server's `chat` frames, and `sendChat`
 * pushes a `chat.send`. This is purely the surface: a scrollable, auto-following
 * message list plus a composer, built from Glacier primitives. Consecutive lines
 * from the same author within a minute are grouped under one avatar/heading.
 */

/** Short wall-clock time for a chat line (locale-aware, hour:minute). */
function chatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const GROUP_WINDOW_MS = 60_000;
const MAX_LEN = 300;

export function LobbyChat() {
  const t = useT();
  const chat = useGame((state) => state.chat);
  const sendChat = useGame((state) => state.sendChat);
  const myId = useApp((state) => state.identity?.userId);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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
    <section className="lobbyChat" aria-label={t('chatTitle')}>
      <header className="lobbyChatHead">
        <MessageSquare size={15} />
        <span>{t('chatTitle')}</span>
      </header>

      <ScrollArea className="lobbyChatScroll" maxHeight={240}>
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
              const grouped =
                prev != null && prev.from.userId === line.from.userId && line.ts - prev.ts < GROUP_WINDOW_MS;
              return (
                <li
                  key={`${line.ts}-${index}`}
                  className="lobbyChatMsg"
                  data-mine={mine || undefined}
                  data-grouped={grouped || undefined}
                >
                  <span className="lobbyChatAvatar">
                    {!grouped && <Avatar name={line.from.username} size="sm" />}
                  </span>
                  <div className="lobbyChatBody">
                    {!grouped && (
                      <span className="lobbyChatMeta">
                        <span className="lobbyChatFrom">{mine ? t('tblYou') : line.from.username}</span>
                        <time className="lobbyChatTime" dateTime={new Date(line.ts).toISOString()}>
                          {chatTime(line.ts)}
                        </time>
                      </span>
                    )}
                    <span className="lobbyChatText">{line.text}</span>
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
          placeholder={t('chatPlaceholder')}
          aria-label={t('chatPlaceholder')}
          autoComplete="off"
        />
        <IconButton type="submit" variant="solid" aria-label={t('chatSend')} disabled={!draft.trim()}>
          <Send size={16} />
        </IconButton>
      </form>
    </section>
  );
}
