import { Avatar, Button, Card, Size, Text } from '@glacier/react';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';

/**
 * A global, actionable invite popup. Whenever a friend invites you to their
 * table, a card slides in over WHATEVER route you are on (home, decks, even
 * mid-match) with Accept / Decline. Accept joins the room with your default
 * deck; Decline dismisses it. This is the actionable counterpart to the passive
 * social toasts in Notifier - invites are the one social event that needs a
 * decision, so they get a real popup, not a toast.
 */
export function InvitePopup() {
  const t = useT();
  const invites = useApp((state) => state.invites);
  const dismissInvite = useApp((state) => state.dismissInvite);
  const decks = useApp((state) => state.decks);
  const join = useGame((state) => state.join);
  const joinedRoomId = useGame((state) => state.joinedRoomId);

  // Never nag about a table you are already seated at.
  const pending = invites.filter((invite) => invite.roomId !== joinedRoomId);
  if (pending.length === 0) return null;

  return (
    <div className="invitePopup" role="region" aria-label={t('playInvites')}>
      {pending.map((invite) => (
        <Card key={invite.roomId} elevation={3} className="invitePopupCard">
          <div className="invitePopupBody">
            <Avatar name={invite.from.username} size="sm" />
            <Text size={Size.Small}>
              <strong>{invite.from.username}</strong> {t('playInviteFrom')} <strong>{invite.roomName}</strong>
            </Text>
          </div>
          <div className="invitePopupActions">
            <Button
              size="sm"
              onClick={() => {
                dismissInvite(invite.roomId);
                join(invite.roomId, decks[0]?.id);
              }}
            >
              {t('playAccept')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismissInvite(invite.roomId)}>
              {t('playDismiss')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
