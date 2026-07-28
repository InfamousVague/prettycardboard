import { IconButton, Size, Text, TextTone, Tooltip, useLocale } from '@glacier/react';
import { Crown, Layers, Play } from '@glacier/icons';
import { useT } from '../i18n.ts';
import type { MatchRow } from '../net/types.ts';
import { GameTag } from './GameTag.tsx';
import './matchHistory.css';

/** "1h 02m" / "18m 30s" / "42s" from milliseconds. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Coarse "5 minutes ago" style label from an ISO timestamp or epoch ms. */
export function relativeWhen(when: string | number, locale: string): string {
  const then = typeof when === 'number' ? when : new Date(when).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(seconds, 'second');
}

/**
 * The games you have played, newest first: who was there, how it ended, and a
 * way back into any table that still has a replay. Shared by the Play lobby and
 * the profile, so both read identically - the profile is just the long view.
 */
export function MatchHistory({
  matches,
  myUsername,
  onReplay,
  limit,
}: {
  matches: MatchRow[];
  myUsername?: string;
  /** Omitted on surfaces that cannot join a table (the profile). */
  onReplay?: (roomId: string) => void;
  limit?: number;
}) {
  const t = useT();
  const locale = useLocale();
  const shown = limit != null ? matches.slice(0, limit) : matches;
  return (
    <div className="matchList">
      {shown.map((match, index) => {
        const others = match.players.map((p) => p.username).filter((name) => name !== myUsername);
        return (
          <div key={`${match.playedAt}-${index}`} className="matchRow">
            <div className="matchRowMain">
              <span className="matchName">
                <GameTag game={match.game} showName={false} /> {match.name || t('playTitle')}
              </span>
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="matchWith">
                {others.length > 0 ? `${t('plWith')} ${others.join(', ')}` : t('plSolo')}
              </Text>
              {match.matchId && (
                <span className="matchStats">
                  {match.won != null && (
                    <span className="matchStat" data-win={match.won || undefined}>
                      {match.won ? t('pmWinAbbr') : t('pmLossAbbr')}
                    </span>
                  )}
                  {match.winnerUsername && (
                    <span className="matchStat">
                      <Crown size={11} /> {match.winnerUsername}
                    </span>
                  )}
                  {match.turns != null && (
                    <span className="matchStat">
                      {match.turns} {t('pmTurnsWord')}
                    </span>
                  )}
                  {match.durationMs != null && <span className="matchStat">{fmtDuration(match.durationMs)}</span>}
                  {match.cardsPlayed != null && (
                    <span className="matchStat">
                      <Layers size={11} /> {match.cardsPlayed}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="matchRowSide">
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                {relativeWhen(match.playedAt, locale)}
              </Text>
              {onReplay && match.replayable && match.roomId && (
                <Tooltip content={t('gpWatchReplay')}>
                  <IconButton
                    size="sm"
                    variant="soft"
                    aria-label={t('gpWatchReplay')}
                    onClick={() => onReplay(match.roomId!)}
                  >
                    <Play size={15} />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
