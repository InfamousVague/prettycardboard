import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Button,
  Heading,
  IconButton,
  SearchField,
  Size,
  Text,
  TextTone,
  Tooltip,
  useToast,
} from '@glacier/react';
import { Check, UserMinus, UserPlus, X } from '@glacier/icons';
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

/**
 * The guild roster: a felt-backed band with the squad tallies (online, in a
 * match, total, incoming requests), one big RECRUIT station for search+add,
 * then requests and the roster as notched cards whose leading edge glows with
 * presence. Same flows as before - search, add, accept/decline, invite,
 * spectate, remove - re-clothed.
 */
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

  const onlineCount = friends.friends.filter((friend) => friend.online).length;
  const inMatchCount = friends.friends.filter((friend) => friend.online && friend.roomId).length;

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
      {/* ---- the guild band: felt art, big title, squad tallies ---- */}
      <header className="frBand">
        <div className="frBandArt" aria-hidden />
        <div className="frBandScrim" aria-hidden />
        <div className="frBandMain">
          <Heading level={1} noMargin className="frBandTitle">
            {t('frTitle')}
          </Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="frBandLede">
            {t('frLede')}
          </Text>
        </div>
        <div className="frTallies">
          <div className="frTally" data-presence="online">
            <span className="frTallyValue">{onlineCount}</span>
            <span className="frTallyLabel">{t('frOnline')}</span>
          </div>
          <div className="frTally" data-presence="ingame">
            <span className="frTallyValue">{inMatchCount}</span>
            <span className="frTallyLabel">{t('frInGame')}</span>
          </div>
          <div className="frTally">
            <span className="frTallyValue">{friends.friends.length}</span>
            <span className="frTallyLabel">{t('frTitle')}</span>
          </div>
          {friends.incoming.length > 0 && (
            <div className="frTally frTallyBadge" role="status">
              <span className="frTallyValue">{friends.incoming.length}</span>
              <span className="frTallyLabel">{t('frRequests')}</span>
            </div>
          )}
        </div>
      </header>

      {/* ---- RECRUIT: the one clear search-and-add moment ---- */}
      <section className="frRecruit" aria-label={t('frRecruit')}>
        <div className="frRecruitPlate">
          <span className="frRecruitTitle">
            <UserPlus size={18} aria-hidden /> {t('frRecruit')}
          </span>
          <div className="frRecruitField">
            <SearchField
              value={query}
              onValueChange={setQuery}
              placeholder={t('frSearch')}
              aria-label={t('frSearch')}
            />
          </div>
        </div>
        {hits.length > 0 && (
          <div className="frGrid">
            {hits.map((hit) => {
              const already = friendIds.has(hit.userId);
              const pending = sent.has(hit.userId) || outgoingIds.has(hit.userId);
              return (
                <article key={hit.userId} className="frCard" data-presence={hit.online ? 'online' : 'offline'}>
                  <span className="frCardAvatar">
                    <Avatar name={hit.username} size="md" />
                  </span>
                  <div className="frCardWho">
                    <span className="frCardName">{hit.username}</span>
                    <span className="frCardStatus">{hit.online ? t('frOnline') : t('frOffline')}</span>
                  </div>
                  <div className="frCardActions">
                    <Button size="sm" variant="soft" disabled={already || pending} onClick={() => add(hit.userId)}>
                      {already ? t('frTitle') : pending ? t('frSent') : t('frAdd')}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- incoming requests ---- */}
      {friends.incoming.length > 0 && (
        <section className="frReqs">
          <div className="frHeadRow">
            <Heading level={2} noMargin className="frKicker">
              {t('frRequests')}
            </Heading>
            <span className="frReqCount" aria-label={t('frRequests')}>
              {friends.incoming.length}
            </span>
          </div>
          <div className="frGrid">
            {friends.incoming.map((request) => (
              <article key={request.id} className="frCard frCardReq">
                <span className="frCardAvatar">
                  <Avatar name={request.from.username} size="md" />
                </span>
                <div className="frCardWho">
                  <span className="frCardName">{request.from.username}</span>
                  <span className="frCardStatus">{t('frRequests')}</span>
                </div>
                <div className="frCardActions">
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
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---- the roster ---- */}
      <section className="frRosterSec">
        <Heading level={2} noMargin className="frKicker">
          {t('frRoster')}
        </Heading>
        {friends.friends.length === 0 ? (
          <EmptyFan quip={t('frNone')} />
        ) : (
          <div className="frGrid">
            {roster.map((friend, index) => {
              const presence = presenceOf(friend);
              return (
                <article
                  key={friend.userId}
                  className="frCard"
                  data-presence={presence}
                  style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
                >
                  <span className="frCardAvatar">
                    <Avatar name={friend.username} size="md" />
                  </span>
                  <div className="frCardWho">
                    <span className="frCardName">{friend.username}</span>
                    <span className="frCardStatus">
                      {presence === 'ingame' ? t('frInGame') : presence === 'online' ? t('frOnline') : t('frOffline')}
                    </span>
                  </div>
                  <div className="frCardActions">
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
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
