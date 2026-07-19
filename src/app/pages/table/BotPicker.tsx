import { Button, Menu, MenuItem, MenuSub } from '@glacier/react';
import { Bot } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { send } from '../../net/ws.ts';

/**
 * Host-only, pre-start: seat a server-driven AI opponent. Style picks the
 * temperament, the submenu picks which FF precon it pilots. The server
 * answers with a fresh room.state, so no local state to manage.
 */

const BOT_DECKS: { code: string; name: string }[] = [
  { code: 'FIC-1', name: 'Counter Blitz (FINAL FANTASY X)' },
  { code: 'FIC-2', name: 'Limit Break (FINAL FANTASY VII)' },
  { code: 'FIC-3', name: 'Revival Trance (FINAL FANTASY VI)' },
  { code: 'FIC-4', name: 'Scions & Spellcraft (FINAL FANTASY XIV)' },
];

type BotStyle = 'casual' | 'aggro' | 'defensive';

export function BotPicker({ compact }: { compact?: boolean }) {
  const t = useT();
  const styles: { style: BotStyle; label: string }[] = [
    { style: 'casual', label: t('gpBotCasual') },
    { style: 'aggro', label: t('gpBotAggro') },
    { style: 'defensive', label: t('gpBotDefensive') },
  ];

  const addBot = (style: BotStyle, deckCode?: string) => {
    send({ type: 'bot.add', style, ...(deckCode ? { deckCode } : {}) });
  };

  return (
    <Menu
      aria-label={t('gpAddBot')}
      placement="bottom"
      trigger={
        <Button size="sm" variant={compact ? 'soft' : 'solid'}>
          <Bot size={15} /> {t('gpAddBot')}
        </Button>
      }
    >
      {styles.map(({ style, label }) => (
        <MenuSub key={style} label={label}>
          <MenuItem onSelect={() => addBot(style)}>{t('gpBotRandomDeck')}</MenuItem>
          {BOT_DECKS.map((deck) => (
            <MenuItem key={deck.code} onSelect={() => addBot(style, deck.code)}>
              {deck.name}
            </MenuItem>
          ))}
        </MenuSub>
      ))}
    </Menu>
  );
}
