import { Text, Size, TextTone, Tooltip } from '@glacier/react';
import { useT } from '../../i18n.ts';
import { CURVE_BUCKETS } from '../../data/deckMeta.ts';
import type { DeckMeta, RoomState, TablePlayer } from '../../net/types.ts';
import type { ReactElement } from 'react';

/**
 * Deck stats on hovering a seat's deck.
 *
 * Everything shown here is already public: `deckMeta` is pushed by the deck's
 * OWNER before the match and is deliberately aggregate-only (see
 * data/deckMeta.ts) - a curve and some counts, never a card list. What the
 * hover changes is convenience, and convenience is exactly what a competitive
 * table should not hand out, so `ranked` suppresses it wholesale.
 */

/** May this viewer read `player`'s deck stats? Your own deck is always fair
 *  game; an opponent's is public at a casual table and closed at a ranked one
 *  (which nothing sets yet - see GameSettings.ranked). */
export function deckStatsVisible(room: RoomState, player: TablePlayer, mine: boolean): boolean {
  if (!player.deckMeta) return false;
  if (mine) return true;
  return !room.settings?.ranked;
}

const CURVE_LABELS = ['0', '1', '2', '3', '4', '5', '6', '7+'];

function ManaCurve({ curve }: { curve: number[] }) {
  const t = useT();
  const peak = Math.max(1, ...curve);
  return (
    <div className="deckStatsCurve" role="img" aria-label={t('dsCurve')}>
      {curve.slice(0, CURVE_BUCKETS).map((count, mv) => (
        <div className="deckStatsBarCol" key={mv}>
          <span className="deckStatsBarCount">{count || ''}</span>
          <div className="deckStatsBarTrack">
            {/* Height is a share of the tallest bucket, so a 40-card deck and
                a 100-card deck both fill the panel rather than one reading
                as a flat line. */}
            <div
              className="deckStatsBar"
              style={{ height: `${Math.round((count / peak) * 100)}%` }}
              data-empty={count === 0 || undefined}
            />
          </div>
          <span className="deckStatsBarLabel">{CURVE_LABELS[mv]}</span>
        </div>
      ))}
    </div>
  );
}

function StatsPanel({ meta, game }: { meta: DeckMeta; game: string }) {
  const t = useT();
  const cyber = game === 'cyberpunk';
  const ygo = game === 'yugioh';
  const rows: string[] = [];
  if (cyber) {
    if (meta.ram != null) rows.push(`${meta.ram} RAM`);
    if (meta.avgCost != null) rows.push(`${t('dbAvgCost')} ${meta.avgCost}`);
  } else if (ygo) {
    if (meta.monsters != null) rows.push(`${meta.monsters} ${t('dbMonsters')}`);
    if (meta.spells != null) rows.push(`${meta.spells} ${t('dbSpells')}`);
    if (meta.traps != null) rows.push(`${meta.traps} ${t('dbTraps')}`);
    if (meta.extra) rows.push(`+${meta.extra} ${t('dbExtraDeck')}`);
    if (meta.avgAtk != null) rows.push(`${t('dbAvgAtk')} ${meta.avgAtk}`);
  } else {
    if (meta.creatures != null) rows.push(`${meta.creatures} ${t('preCreatures')}`);
    if (meta.lands != null) rows.push(`${meta.lands} ${t('preLands')}`);
    if (meta.spells != null) rows.push(`${meta.spells} ${t('preSpells')}`);
    if (meta.other) rows.push(`${meta.other} ${t('dsOther')}`);
  }
  const showCurve = !cyber && !ygo && (meta.curve?.some((n) => n > 0) ?? false);
  return (
    <div className="deckStats">
      <div className="deckStatsHead">
        <Text as="span" size={Size.XSmall} weight="semibold">
          {meta.size} {t('dsCards')}
        </Text>
        {meta.colors && meta.colors.length > 0 && (
          <span className="deckStatsPips">
            {meta.colors.map((color) => (
              <i key={color} className="deckStatsPip" data-color={color} />
            ))}
          </span>
        )}
        {!cyber && !ygo && meta.avgMv != null && meta.avgMv > 0 && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
            {t('preAvgMv')} {meta.avgMv}
          </Text>
        )}
      </div>
      {rows.length > 0 && (
        <Text as="p" size={Size.XSmall} tone={TextTone.Subtle} className="deckStatsRow">
          {rows.join(' · ')}
        </Text>
      )}
      {showCurve && <ManaCurve curve={meta.curve!} />}
    </div>
  );
}

/**
 * Wraps a deck pile so resting on it shows that seat's stats. Renders the
 * trigger untouched when there is nothing to show (no meta, or a ranked
 * table), so callers never branch.
 */
export function DeckStatsHover({
  room,
  player,
  mine,
  children,
}: {
  room: RoomState;
  player: TablePlayer;
  mine: boolean;
  children: ReactElement;
}) {
  const visible = deckStatsVisible(room, player, mine);
  return (
    <Tooltip
      disabled={!visible}
      placement="top"
      delay={320}
      className="deckStatsTip"
      content={player.deckMeta ? <StatsPanel meta={player.deckMeta} game={room.game ?? 'mtg'} /> : null}
    >
      {children}
    </Tooltip>
  );
}
