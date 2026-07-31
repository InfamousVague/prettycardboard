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
import { closeRoom, createRoom } from '../net/api.ts';
import { isConnected, send } from '../net/ws.ts';
import { useApp } from '../state/appStore.ts';
import { useGame } from '../state/gameStore.ts';
import type { RoomState } from '../net/types.ts';

type BotStyle = 'mixed' | 'casual' | 'aggro' | 'defensive';
type Difficulty = 'easy' | 'normal' | 'hard';

/** The style each seated bot gets: a fixed pick, or a rotating mix. */
const MIX: Array<'casual' | 'aggro' | 'defensive'> = ['aggro', 'defensive', 'casual'];

/**
 * Developer-mode bot matches: pick a shape (or a one-click preset) and the tab
 * builds the table - creates the room, flips on enforcement when asked, seats
 * the bots, and either starts an all-bot exhibition to watch or drops YOU into
 * the pregame lobby (deckless: the lobby's own deck picker takes it from
 * there). Everything goes through the same store actions a person would use,
 * so joinedRoomId and routing stay coherent.
 */
export function BotsTab({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const [bots, setBots] = useState(2);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [style, setStyle] = useState<BotStyle>('mixed');
  const [format, setFormat] = useState<'commander' | 'standard'>('commander');
  const [enforced, setEnforced] = useState(false);
  const [launching, setLaunching] = useState(false);
  // Launching means leaving the current room. Leaving a STARTED game concedes
  // it (server rule), so that case demands a second, informed click.
  const [armed, setArmed] = useState(false);
  const myId = useApp((state) => state.identity?.userId);

  /** Wait until the joined room satisfies `ready`, or throw. */
  const awaitRoom = async (roomId: string, ready: (room: RoomState) => boolean) => {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const room = useGame.getState().room;
      if (room?.roomId === roomId && ready(room)) return room;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error('room never settled');
  };

  const launch = async (opts: {
    bots: number;
    difficulty: Difficulty;
    style: BotStyle;
    format: 'commander' | 'standard';
    enforced: boolean;
    seat: boolean;
  }) => {
    if (launching) return;
    // Everything after room creation rides the socket; a reconnect window
    // would silently drop the joins and bot seats.
    if (!isConnected()) {
      toast({ tone: 'danger', message: t('botsOffline') });
      return;
    }
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
    let created: string | null = null;
    try {
      const seats = opts.bots + (opts.seat ? 1 : 0);
      const { roomId } = await createRoom(t('botsRoomName'), seats, false, { format: opts.format });
      created = roomId;
      // Through the store's own actions (raw sends would leave joinedRoomId
      // stale and the store would drop the new room's states): vacate
      // whatever room we were in, then take a chair or the spectator rail.
      const game = useGame.getState();
      if (game.joinedRoomId) game.leave();
      if (opts.seat) {
        // Deckless on purpose: the pregame lobby's deck picker is the deck UI.
        game.join(roomId);
      } else {
        game.spectate(roomId);
      }
      const first = await awaitRoom(roomId, () => true);
      // The state always carries the room's full settings; enforcement is a
      // one-flag change on top of them.
      if (opts.enforced && first.settings) {
        send({ type: 'room.settings', settings: { ...first.settings, enforced: true } });
      }
      for (let i = 0; i < opts.bots; i += 1) {
        send({
          type: 'bot.add',
          style: opts.style === 'mixed' ? MIX[i % MIX.length] : opts.style,
          difficulty: opts.difficulty,
        });
      }
      const want = opts.bots + (opts.seat ? 1 : 0);
      await awaitRoom(roomId, (room) => (room.players?.length ?? 0) >= want);
      // An exhibition starts itself; a seated match waits in the lobby for
      // you to pick a deck and hit start.
      if (!opts.seat) useGame.getState().start();
      onClose();
    } catch {
      // Leave no half-built table behind: step out of it if we got in, and
      // close it (we are its host) so it never lingers as an orphan.
      const game = useGame.getState();
      if (created && game.joinedRoomId === created) game.leave();
      if (created) void closeRoom(created).catch(() => null);
      toast({ tone: 'danger', message: t('setBotDuelFailed') });
    } finally {
      setLaunching(false);
    }
  };

  const custom = { bots, difficulty, style, format, enforced };

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
                onValueChange={(value) => setDifficulty(value as Difficulty)}
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
          </div>
          <Switch
            label={t('botsEnforced')}
            checked={enforced}
            onCheckedChange={setEnforced}
          />
          <Text size={Size.XSmall} tone={TextTone.Subtle}>
            {t('botsEnforcedHint')}
          </Text>
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
