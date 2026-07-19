import { useEffect } from 'react';
import { useToast } from '@glacier/react';
import { useT } from '../i18n.ts';
import * as ws from '../net/ws.ts';
import { useApp } from '../state/appStore.ts';

/**
 * Social notifications, visible anywhere in the shell: friend requests,
 * accepted requests, and game invites arrive as toasts the moment the server
 * pushes them. A visibility-change refresh backstops anything that happened
 * while the tab was asleep or the socket was down.
 */
export function Notifier() {
  const t = useT();
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = ws.onMessage((message) => {
      if (message.type === 'friend.request') {
        toast({ tone: 'info', message: `${message.from.username} ${t('ntFriendRequest')}` });
      } else if (message.type === 'friend.accepted') {
        toast({ tone: 'success', message: `${message.by.username} ${t('ntFriendAccepted')}` });
      } else if (message.type === 'invite') {
        toast({ tone: 'info', message: `${message.from.username} ${t('ntInvited')} ${message.roomName}` });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [toast, t]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useApp.getState().identity) {
        void useApp.getState().refreshFriends();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return null;
}
