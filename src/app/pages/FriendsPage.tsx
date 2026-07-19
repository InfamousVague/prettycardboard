import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  CounterBadge,
  Heading,
  IconButton,
  SearchField,
  Size,
  StatusDot,
  Text,
  TextTone,
  Tooltip,
  useToast,
} from '@glacier/react';
import { Check, UserMinus, X } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import * as api from '../net/api.ts';
import * as ws from '../net/ws.ts';
import type { FriendEntry, UserHit } from '../net/types.ts';
import { EmptyFan } from '../components/Skeletons.tsx';
import './social.css';

type Presence = 'online' | 'ingame' | 'offline';

function presenceOf(friend: FriendEntry): Presence {
  if (!friend.online) return 'offline';
  return friend.roomId ? 'ingame' : 'online';
}

/** Friends: search+add, requests, presence, invite into your table, spectate. */
export function FriendsPage() {
  const t = useT();
  const { toast } = useToast();
  const identity = useApp((state) => state.identity);
  const friends = useApp((state) => state.friends);
  const refreshFriends = useApp((state) => state.refreshFriends);
  const room = useGame((state) => state.room);
  const spectate = useGame((state) => state.spectate);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<UserHit[]>([]);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const searchSeq = useRef(0);

  // Debounced live search.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(q);
        if (searchSeq.current === seq) {
          setHits(results.filter((hit) => hit.userId !== identity?.userId));
        }
      } catch {
        // search is best-effort
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, identity?.userId]);

  // Presence changes land in the store; refresh the full payload on mount.
  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  const friendIds = new Set(friends.friends.map((friend) => friend.userId));
  const outgoingIds = new Set(friends.outgoing.map((request) => request.to.userId));

  // Online first (in-game counts as online), then alphabetical.
  const roster = useMemo(
    () =>
      [...friends.friends].sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.username.localeCompare(b.username);
      }),
    [friends.friends],
  );

  const add = async (userId: string) => {
    try {
      await api.sendFriendRequest(userId);
      setSent((prev) => new Set(prev).add(userId));
      await refreshFriends();
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    }
  };

  const respond = async (id: string, accept: boolean) => {
    try {
      if (accept) await api.acceptFriendRequest(id);
      else await api.declineFriendRequest(id);
      await refreshFriends();
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    }
  };

  return (
    <div className="page friendsPage">
      <Heading level={1}>{t('frTitle')}</Heading>
      <Text size={Size.Large} tone={TextTone.Muted} className="lede">
        {t('frLede')}
      </Text>

      <section>
        <div className="friendSearch">
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder={t('frSearch')}
            aria-label={t('frSearch')}
          />
        </div>
        {hits.length > 0 && (
          <div className="friendHits">
            {hits.map((hit) => {
              const already = friendIds.has(hit.userId);
              const pending = sent.has(hit.userId) || outgoingIds.has(hit.userId);
              return (
                <Card key={hit.userId} className="friendRow">
                  <Avatar name={hit.username} size="sm" />
                  <span className="frWho">
                    <Text as="span" className="frName">
                      {hit.username}
                    </Text>
                  </span>
                  <StatusDot tone={hit.online ? 'success' : 'neutral'} size="sm" />
                  <span className="frActions">
                    <Button size="sm" variant="soft" disabled={already || pending} onClick={() => add(hit.userId)}>
                      {already ? t('frTitle') : pending ? t('frSent') : t('frAdd')}
                    </Button>
                  </span>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {friends.incoming.length > 0 && (
        <section>
          <div className="frHeadRow">
            <Heading level={2} noMargin>
              {t('frRequests')}
            </Heading>
            <CounterBadge count={friends.incoming.length} size="sm" aria-label={t('frRequests')} />
          </div>
          <div className="friendHits">
            {friends.incoming.map((request) => (
              <Card key={request.id} className="friendRow">
                <Avatar name={request.from.username} size="sm" />
                <span className="frWho">
                  <Text as="span" className="frName">
                    {request.from.username}
                  </Text>
                </span>
                <span className="frActions">
                  <Tooltip content={t('playAccept')}>
                    <IconButton size="sm" aria-label={t('playAccept')} onClick={() => respond(request.id, true)}>
                      <Check size={16} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={t('playDismiss')}>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      aria-label={t('playDismiss')}
                      onClick={() => respond(request.id, false)}
                    >
                      <X size={16} />
                    </IconButton>
                  </Tooltip>
                </span>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <Heading level={2}>{t('frTitle')}</Heading>
        {friends.friends.length === 0 ? (
          <EmptyFan quip={t('frNone')} />
        ) : (
          <div className="friendHits">
            {roster.map((friend) => {
              const presence = presenceOf(friend);
              return (
                <Card key={friend.userId} className="friendRow">
                  <span className="frAvatar" data-presence={presence}>
                    <Avatar name={friend.username} size="sm" />
                  </span>
                  <span className="frWho">
                    <Text as="span" className="frName">
                      {friend.username}
                    </Text>
                    <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                      {presence === 'ingame' ? t('frInGame') : presence === 'online' ? t('frOnline') : t('frOffline')}
                    </Text>
                  </span>
                  <span className="frActions">
                    {room && friend.online && (
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => {
                          ws.send({ type: 'invite.send', toUserId: friend.userId, roomId: room.roomId });
                          toast({ tone: 'success', message: `${t('frInvite')} → ${friend.username}` });
                        }}
                      >
                        {t('frInvite')}
                      </Button>
                    )}
                    {friend.roomId && (
                      <Button size="sm" variant="soft" onClick={() => spectate(friend.roomId!)}>
                        {t('frSpectate')}
                      </Button>
                    )}
                    <Tooltip content={t('frRemove')}>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label={t('frRemove')}
                        onClick={() => api.removeFriend(friend.userId).then(refreshFriends)}
                      >
                        <UserMinus size={16} />
                      </IconButton>
                    </Tooltip>
                  </span>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
