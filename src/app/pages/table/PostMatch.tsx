import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Avatar, Button, Text, Size, TextTone, Tooltip } from '@glacier/react';
import { Crown, Flame, LogOut, Skull, ThumbsUp, Timer, Trophy } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import type { MatchStatsPlayer, RoomState } from '../../net/types.ts';

/**
 * The post-match screen. Appears once the room carries a matchResult (one
 * non-conceded player left) and stays available for the life of the room:
 * dismissing it leaves a floating Results pill to bring it back.
 *
 * Social layer: endorse fellow players (good sport, great game) and rate how
 * salty their DECK made you (1-5 flames). Both are per-match, server-deduped,
 * and feed the all-time numbers shown on every row (W-L record, endorsements,
 * average turn pace, per-deck record + salt score).
 */

/** "1h 02m" / "18m 30s" / "42s" from milliseconds. */
function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Compact per-turn pace: "1m 35s" / "45s". */
function fmtTurn(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

const SALT_STEPS = [1, 2, 3, 4, 5] as const;

export function PostMatch({
  room,
  meId,
  spectating,
  onLeave,
}: {
  room: RoomState;
  meId?: string;
  spectating: boolean;
  onLeave: () => void;
}) {
  const t = useT();
  const result = room.matchResult;
  const [dismissed, setDismissed] = useState(false);
  const [stats, setStats] = useState<Record<string, MatchStatsPlayer> | null>(null);
  const [endorsed, setEndorsed] = useState<Set<string>>(new Set());
  const [salted, setSalted] = useState<Record<string, number>>({});

  const matchId = result?.matchId;
  const ranked = result?.ranked ?? false;
  const panelRef = useRef<HTMLDivElement>(null);

  // All-time aggregates + my prior submissions (reopening the screen after a
  // reload keeps the buttons in their submitted state). Unranked matches mint
  // no server rows, so there is nothing to fetch.
  useEffect(() => {
    if (!matchId || !ranked) return;
    let alive = true;
    api
      .matchStats(matchId)
      .then((payload) => {
        if (!alive) return;
        setStats(Object.fromEntries(payload.players.map((p) => [p.userId, p])));
        // Merge with (not replace) optimistic local submissions in flight.
        setEndorsed((prev) => new Set([...prev, ...payload.players.filter((p) => p.myEndorsed).map((p) => p.userId)]));
        const mine: Record<string, number> = {};
        for (const p of payload.players) {
          if (p.deckId && p.mySalt != null) mine[p.deckId] = p.mySalt;
        }
        setSalted((prev) => ({ ...mine, ...prev }));
      })
      .catch(() => {
        // Stats are garnish; the result screen works without them.
      });
    return () => {
      alive = false;
    };
  }, [matchId, ranked]);

  // Own the keyboard: the table's Space/T hotkeys ignore events originating
  // inside a [role=dialog], which needs focus to land here.
  const open = result != null && !dismissed;
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  if (!result) return null;

  // Endorse/salt are for people who PLAYED this ranked match (the server
  // enforces the same rules; this just hides dead controls).
  const isParticipant =
    ranked && !spectating && meId != null && result.players.some((p) => p.userId === meId);

  // Optimistic with rollback: a failed call re-enables the control so the
  // submission can be retried (the server side is idempotent).
  const endorse = (userId: string) => {
    setEndorsed((prev) => new Set(prev).add(userId));
    api.endorsePlayer(result.matchId, userId).catch(() => {
      setEndorsed((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });
  };

  const rateSalt = (deckId: string, value: number) => {
    const previous = salted[deckId];
    setSalted((prev) => ({ ...prev, [deckId]: value }));
    api.saltRateDeck(result.matchId, deckId, value).catch(() => {
      setSalted((prev) => {
        const next = { ...prev };
        if (previous == null) delete next[deckId];
        else next[deckId] = previous;
        return next;
      });
    });
  };

  // Winner first, then seat order.
  const ordered = [...result.players].sort((a, b) => {
    if (a.userId === result.winnerUserId) return -1;
    if (b.userId === result.winnerUserId) return 1;
    return a.seat - b.seat;
  });

  if (dismissed) {
    return (
      <button type="button" className="pmReopen" onClick={() => setDismissed(false)}>
        <Trophy size={14} />
        {t('pmResults')}
      </button>
    );
  }

  return (
    <motion.div
      className="pmOverlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label={t('pmResults')}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        className="pmPanel"
        initial={{ y: 26, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        <div className="pmHero">
          <span className="pmTrophy" aria-hidden>
            <Trophy size={30} />
          </span>
          <Text as="p" size={Size.Large} weight="bold" className="pmTitle">
            {result.winnerUsername} {t('pmWins')}
          </Text>
          <Text as="p" size={Size.Small} tone={TextTone.Muted}>
            {result.turns} {t('pmTurnsWord')} · {fmtDuration(result.durationMs)}
          </Text>
        </div>

        <div className="pmRows">
          {ordered.map((p) => {
            const s = stats?.[p.userId];
            const winner = p.userId === result.winnerUserId;
            const isMe = p.userId === meId;
            const canEndorse = isParticipant && !isMe && !p.isBot;
            const canSalt = isParticipant && !isMe && p.deckId != null;
            const saltValue = p.deckId ? salted[p.deckId] : undefined;
            return (
              <div key={p.userId} className="pmRow" data-winner={winner || undefined} data-dead={p.conceded || undefined}>
                <Avatar name={p.username} size="md" />
                <div className="pmBody">
                  <span className="pmNameRow">
                    <span className="pmName">{p.username}</span>
                    {winner && (
                      <span className="pmBadge pmBadgeWin" title={t('pmWinner')}>
                        <Crown size={12} />
                      </span>
                    )}
                    {p.conceded && (
                      <span className="pmBadge pmBadgeDead" title={t('tblConceded')}>
                        <Skull size={12} />
                      </span>
                    )}
                    {isMe && <span className="playerYou">{t('tblYou')}</span>}
                  </span>
                  {p.deckName && <span className="pmDeckName">{p.deckName}</span>}
                  <span className="pmStats">
                    <span className="pmStat" title={t('pmTurnsTaken')}>
                      {p.turnsTaken} {t('pmTurnsWord')}
                    </span>
                    <span className="pmStat" title={t('pmAvgTurn')}>
                      <Timer size={12} /> {fmtTurn(p.avgTurnMs)}
                      {t('pmPerTurn')}
                    </span>
                    {s && !p.isBot && (
                      <span className="pmStat" title={t('pmRecord')}>
                        {s.wins}
                        {t('pmWinAbbr')} · {s.losses}
                        {t('pmLossAbbr')}
                      </span>
                    )}
                    {s && !p.isBot && s.endorsements > 0 && (
                      <span className="pmStat" title={t('pmEndorseCount')}>
                        <ThumbsUp size={12} /> {s.endorsements}
                      </span>
                    )}
                    {s?.deck && (
                      <span className="pmStat" title={t('pmDeckRecord')}>
                        {t('pmDeckWord')} {s.deck.wins}
                        {t('pmWinAbbr')} · {s.deck.losses}
                        {t('pmLossAbbr')}
                      </span>
                    )}
                    {s?.deck && s.deck.saltCount > 0 && (
                      <span className="pmStat pmStatSalt" title={t('pmSaltScore')}>
                        <Flame size={12} /> {s.deck.salt.toFixed(1)}
                      </span>
                    )}
                  </span>
                </div>
                {(canEndorse || canSalt) && (
                  <div className="pmActionsCol">
                    {canEndorse && (
                      <Button
                        size="sm"
                        variant={endorsed.has(p.userId) ? 'solid' : 'soft'}
                        disabled={endorsed.has(p.userId)}
                        onClick={() => endorse(p.userId)}
                      >
                        <ThumbsUp size={13} /> {endorsed.has(p.userId) ? t('pmEndorsed') : t('pmEndorse')}
                      </Button>
                    )}
                    {canSalt && p.deckId && (
                      <div className="pmSaltRow">
                        <Tooltip content={t('pmSaltHint')}>
                          <span className="pmSaltLabel">
                            <Flame size={12} />
                            <span className="pmSaltHintText">{t('pmSaltShort')}</span>
                          </span>
                        </Tooltip>
                        {SALT_STEPS.map((step) => (
                          <button
                            key={step}
                            type="button"
                            className="pmSaltStep"
                            data-lit={saltValue != null && step <= saltValue ? '' : undefined}
                            aria-label={`${t('pmSaltHint')} ${step}/5`}
                            onClick={() => rateSalt(p.deckId!, step)}
                          >
                            <Flame size={13} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="pmFooter">
          <Button variant="soft" onClick={() => setDismissed(true)}>
            {t('pmBack')}
          </Button>
          <Button variant="ghost" onClick={onLeave}>
            <LogOut size={14} /> {t('pmLeave')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
