import { useState } from 'react';
import {
  Button,
  Fieldset,
  Label,
  SegmentedControl,
  Switch,
  Text,
  Size,
  TextTone,
  useToast,
} from '@glacier/react';
import { Bot, Eye, Swords, UserRound } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { launchBotMatch, type BotDifficulty, type BotStyle } from '../data/botMatch.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';

/**
 * Developer-mode bot matches: pick a shape (or a one-click preset) and the
 * shared launcher (data/botMatch.ts, also behind the Play plate's quick
 * presets on Home) builds the table - creates the room, flips on enforcement
 * when asked, seats the bots, and either starts an all-bot exhibition to
 * watch or drops YOU into the pregame lobby (deckless: the lobby's own deck
 * picker takes it from there).
 */
export function BotsTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [bots, setBots] = useState(2);
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  const [style, setStyle] = useState<BotStyle>('mixed');
  const [format, setFormat] = useState<'commander' | 'standard'>('commander');
  const [game, setGame] = useState<'mtg' | 'yugioh'>('mtg');
  const [enforced, setEnforced] = useState(false);
  const [launching, setLaunching] = useState(false);
  // Launching means leaving the current room. Leaving a STARTED game concedes
  // it (server rule), so that case demands a second, informed click.
  const [armed, setArmed] = useState(false);
  const myId = useApp((state) => state.identity?.userId);

  const launch = async (opts: {
    bots: number;
    difficulty: BotDifficulty;
    style: BotStyle;
    format: 'commander' | 'standard';
    game?: 'mtg' | 'yugioh';
    enforced: boolean;
    seat: boolean;
  }) => {
    if (launching) return;
    // Leaving a started, unfinished game to launch concedes it: make the
    // first click a warning, the second the decision.
    const current = useGame.getState();
    const seatedInLiveMatch =
      current.joinedRoomId != null &&
      !current.spectating &&
      current.room?.started === true &&
      current.room?.matchResult == null &&
      current.room.players.some((p) => p.userId === myId && !p.conceded);
    if (seatedInLiveMatch && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    setLaunching(true);
    try {
      await launchBotMatch({ name: t('botsRoomName'), ...opts });
      onClose();
    } catch (error) {
      toast({
        tone: 'danger',
        message: (error as Error).message === 'offline' ? t('botsOffline') : t('setBotDuelFailed'),
      });
    } finally {
      setLaunching(false);
    }
  };

  const custom = { bots, difficulty, style, format, game, enforced: game === 'mtg' && enforced };

  return (
    <div style={{ display: 'grid', gap: 'var(--glacier-space-6)' }}>
      {armed && (
        <Text size={Size.Small} tone={TextTone.Danger}>
          {t('botsConcedeWarn')}
        </Text>
      )}
      <Fieldset legend={t('botsPresets')} description={t('botsPresetsHint')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--glacier-space-2)' }}>
          <Button
            variant="soft"
            disabled={launching}
            onClick={() =>
              void launch({ bots: 2, difficulty: 'hard', style: 'mixed', format: 'commander', enforced: false, seat: false })
            }
          >
            <Swords size={15} /> {t('setBotDuel')}
          </Button>
          <Button
            variant="soft"
            disabled={launching}
            onClick={() =>
              void launch({ bots: 4, difficulty: 'normal', style: 'mixed', format: 'commander', enforced: false, seat: false })
            }
          >
            <Bot size={15} /> {t('botsPresetPod')}
          </Button>
          <Button
            variant="soft"
            disabled={launching}
            onClick={() =>
              void launch({ bots: 4, difficulty: 'hard', style: 'mixed', format: 'commander', enforced: true, seat: false })
            }
          >
            <Eye size={15} /> {t('botsPresetBrawl')}
          </Button>
          <Button
            variant="soft"
            disabled={launching}
            onClick={() =>
              void launch({
                bots: 2,
                difficulty: 'normal',
                style: 'mixed',
                format: 'standard',
                game: 'yugioh',
                enforced: false,
                seat: false,
              })
            }
          >
            <Swords size={15} /> {t('botsPresetDuel')}
          </Button>
        </div>
      </Fieldset>

      <Fieldset legend={t('botsCustom')} description={t('botsCustomHint')}>
        <div style={{ display: 'grid', gap: 'var(--glacier-space-4)' }}>
          <div className="split">
            <div className="control">
              <Label>{t('botsCount')}</Label>
              <SegmentedControl
                aria-label={t('botsCount')}
                fullWidth
                value={String(bots)}
                onValueChange={(value) => setBots(Number(value))}
                options={[
                  { value: '1', label: '1' },
                  { value: '2', label: '2' },
                  { value: '3', label: '3' },
                  { value: '4', label: '4' },
                ]}
              />
            </div>
            <div className="control">
              <Label>{t('botsDifficulty')}</Label>
              <SegmentedControl
                aria-label={t('botsDifficulty')}
                fullWidth
                value={difficulty}
                onValueChange={(value) => setDifficulty(value as BotDifficulty)}
                options={[
                  { value: 'easy', label: t('botsEasy') },
                  { value: 'normal', label: t('botsNormal') },
                  { value: 'hard', label: t('botsHard') },
                ]}
              />
            </div>
          </div>
          <div className="split">
            <div className="control">
              <Label>{t('botsStyle')}</Label>
              <SegmentedControl
                aria-label={t('botsStyle')}
                fullWidth
                value={style}
                onValueChange={(value) => setStyle(value as BotStyle)}
                options={[
                  { value: 'mixed', label: t('botsMixed') },
                  { value: 'casual', label: t('botsCasual') },
                  { value: 'aggro', label: t('botsAggro') },
                  { value: 'defensive', label: t('botsDefensive') },
                ]}
              />
            </div>
            <div className="control">
              <Label>{t('botsGame')}</Label>
              <SegmentedControl
                aria-label={t('botsGame')}
                fullWidth
                value={game}
                onValueChange={(value) => setGame(value as 'mtg' | 'yugioh')}
                options={[
                  { value: 'mtg', label: 'Magic' },
                  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
                ]}
              />
            </div>
            {game === 'mtg' && (
              <div className="control">
                <Label>{t('botsFormat')}</Label>
                <SegmentedControl
                  aria-label={t('botsFormat')}
                  fullWidth
                  value={format}
                  onValueChange={(value) => setFormat(value as 'commander' | 'standard')}
                  options={[
                    { value: 'commander', label: 'Commander' },
                    { value: 'standard', label: 'Standard' },
                  ]}
                />
              </div>
            )}
          </div>
          {game === 'mtg' && (
            <>
              <Switch
                label={t('botsEnforced')}
                checked={enforced}
                onCheckedChange={setEnforced}
              />
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {t('botsEnforcedHint')}
              </Text>
            </>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--glacier-space-2)' }}>
            <Button
              disabled={launching}
              onClick={() => void launch({ ...custom, seat: true })}
            >
              <UserRound size={15} /> {t('botsSeatMe')}
            </Button>
            <Button
              variant="soft"
              disabled={launching || bots < 2}
              onClick={() => void launch({ ...custom, seat: false })}
            >
              <Eye size={15} /> {t('botsWatch')}
            </Button>
          </div>
          <Text size={Size.XSmall} tone={TextTone.Subtle}>
            {bots < 2 ? t('botsWatchNeedsTwo') : t('botsSeatHint')}
          </Text>
        </div>
      </Fieldset>
    </div>
  );
}
