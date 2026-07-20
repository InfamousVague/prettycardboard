import { Button, Row, Text, Size, TextTone } from '@glacier/react';
import { CircleUserRound, LogOut } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';

/** Account tab: the signed-in name and a sign-out that also closes the modal. */
export function AccountTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const identity = useApp((state) => state.identity);
  const signOut = useApp((state) => state.signOut);

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-5)' }}>
      <Row align="center" gap={3}>
        <CircleUserRound size={40} aria-hidden />
        <div style={{ display: 'grid', gap: 'var(--glacier-space-1)' }}>
          <Text as="span" weight="medium">
            {identity?.username ?? '—'}
          </Text>
          <Text as="span" size={Size.Small} tone={TextTone.Muted}>
            {t('pfTempId')}
          </Text>
        </div>
      </Row>
      <div>
        <Button
          variant="danger"
          onClick={() => {
            signOut();
            onClose();
          }}
        >
          <LogOut size={16} />
          {t('pfSignOut')}
        </Button>
      </div>
    </div>
  );
}
