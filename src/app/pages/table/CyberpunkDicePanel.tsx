import { Button, Pill, Size, Text, TextTone, Tooltip } from '@glacier/react';
import { Dices, Swords, Trophy } from '@glacier/icons';
import { useGame } from '../../state/gameStore.ts';
import { useT } from '../../i18n.ts';
import type { TablePlayer } from '../../net/types.ts';
import './cyberpunk-dice-panel.css';

/**
 * The Cyberpunk Gig objective + Fixer dice, as a right-rail card built from
 * Glacier components on the app theme (no bespoke chrome, no hardcoded neon).
 * Lives in the sidebar so the mat itself stays uncluttered. A Fixer die rolls
 * into the Gig area (gig.roll); the count of Gig dice is the win tracker — start
 * a turn with 7 to win. Rivals' dice can be STOLEN into your Gig (gig.steal),
 * which is how the count pushes past your own six.
 */

const GIG_WIN = 7;

export function CyberpunkDicePanel({ me, others }: { me: TablePlayer; others: TablePlayer[] }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const dice = me.gigDice ?? [];
  if (dice.length === 0) return null;

  const fixer = dice.filter((d) => !d.inGig);
  const gigs = dice.filter((d) => d.inGig);
  const won = gigs.length >= GIG_WIN;
  // Rivals with a rolled die you can steal from.
  const marks = others.filter((o) => (o.gigDice ?? []).some((d) => d.inGig));

  return (
    <div className="cpDicePanel">
      <div className="cpDiceHead">
        <span className="cpDiceTitle">
          <Trophy size={13} /> {t('cpGigs')}
        </span>
        <Pill size="sm" tone={won ? 'success' : 'accent'}>
          {gigs.length} / {GIG_WIN}
        </Pill>
      </div>

      {/* Gig area: rolled dice (click to send a die back). Stolen dice carry
          their origin and return to that rival's Gig instead of the Fixer. */}
      <div className="cpGigTray" data-empty={gigs.length === 0 || undefined}>
        {gigs.length === 0 ? (
          <Text size={Size.XSmall} tone={TextTone.Subtle}>
            {t('cpGigEmpty')}
          </Text>
        ) : (
          gigs.map((die, i) => (
            <Tooltip
              key={`${die.sides}:${die.stolen ? die.from : ''}:${i}`}
              content={die.stolen ? `${t('cpStolenFrom')} ${die.from}` : t('cpReturnDie')}
            >
              <Button
                size="sm"
                variant={won ? 'solid' : 'soft'}
                className={die.stolen ? 'cpDieStolen' : undefined}
                onClick={() => act({ kind: 'gig.return', sides: die.sides })}
              >
                d{die.sides} · <b>{die.value}</b>
              </Button>
            </Tooltip>
          ))
        )}
      </div>

      {/* Fixer: roll a die into the Gig area. */}
      <div className="cpFixer">
        <Text size={Size.XSmall} tone={TextTone.Muted} className="cpFixerLabel">
          <Dices size={12} /> {t('cpFixer')}
        </Text>
        <div className="cpFixerDice">
          {fixer.map((die, i) => (
            <Button
              key={`${die.sides}:${i}`}
              size="sm"
              variant="ghost"
              className="cpFixerDie"
              onClick={() => act({ kind: 'gig.roll', sides: die.sides })}
            >
              d{die.sides}
            </Button>
          ))}
          {fixer.length === 0 && (
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {t('cpFixerEmpty')}
            </Text>
          )}
        </div>
      </div>

      {/* Steal: take a rival's highest rolled die into your Gig. */}
      {marks.length > 0 && (
        <div className="cpSteal">
          <Text size={Size.XSmall} tone={TextTone.Muted} className="cpFixerLabel">
            <Swords size={12} /> {t('cpSteal')}
          </Text>
          <div className="cpStealTargets">
            {marks.map((rival) => {
              const count = (rival.gigDice ?? []).filter((d) => d.inGig).length;
              return (
                <Tooltip key={rival.userId} content={`${t('cpStealFrom')} ${rival.username}`}>
                  <Button size="sm" variant="soft" onClick={() => act({ kind: 'gig.steal', from: rival.userId })}>
                    {rival.username} · {count}
                  </Button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
