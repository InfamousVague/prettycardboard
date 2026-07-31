import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pill, Size, Text, TextTone } from '@glacier/react';
import { useT } from '../../i18n.ts';
import { getDeck, deckStats } from '../../net/api.ts';
import { formatFor } from '../../data/formats.ts';
import { computeDeckMeta } from '../../data/deckMeta.ts';
import { estimateBracket, bracketKey, type BracketEstimate } from '../../data/brackets.ts';
import { resolveCardImage } from '../../data/games.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { GameTag } from '../../components/GameTag.tsx';
import { SaltPile } from '../../components/SaltPile.tsx';
import { ColorPips } from './shared.tsx';
import type { DeckMeta, DeckStats, DeckSummary } from '../../net/types.ts';
import './deckInspector.css';

/**
 * A right-click summary of a deck: identity, colors, format, all-time record,
 * how salty opponents found it, and its estimated Commander bracket. Deliberately
 * NOT the card list (that is the deck editor) - just the at-a-glance profile.
 * Colors and the bracket estimate need the full card list, so it loads the deck
 * on open; the record + salt come from the deck-stats endpoint.
 */
export function DeckInspector({ deck, open, onClose }: { deck: DeckSummary; open: boolean; onClose: () => void }) {
  const t = useT();
  const cyber = (deck.game || 'mtg') === 'cyberpunk';
  const ygo = (deck.game || 'mtg') === 'yugioh';
  const mtg = !cyber && !ygo;
  const fmt = formatFor(deck.format);
  const cover = deck.coverImageUrl || (deck.coverCardId ? resolveCardImage(deck.game, deck.coverCardId) : undefined);

  const [meta, setMeta] = useState<DeckMeta | null>(null);
  const [bracket, setBracket] = useState<BracketEstimate | null>(null);
  const [stats, setStats] = useState<DeckStats | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setMeta(null);
    setBracket(null);
    setStats(null);
    void getDeck(deck.id)
      .then(async (full) => {
        if (!alive) return;
        if (mtg) setBracket(estimateBracket(full.cards));
        const computed = await computeDeckMeta(full, deck.game || 'mtg');
        if (alive) setMeta(computed);
      })
      .catch(() => {});
    void deckStats(deck.id)
      .then((s) => alive && setStats(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, deck.id, deck.game, mtg]);

  const row = (label: string, value: ReactNode) => (
    <div className="diRow">
      <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="diRowLabel">
        {label}
      </Text>
      <span className="diRowValue">{value}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title={t('diTitle')} size="sm">
      <div className="deckInspector">
        <header className="diHead">
          <div className="diCover">
            <GameCard name={deck.commander || deck.name} imageUrl={cover} width={96} foil tilt={0} />
          </div>
          <div className="diIdentity">
            <span className="diName">{deck.name}</span>
            <span className="diTags">
              <GameTag game={deck.game} />
              {mtg && (
                <Pill size="sm" variant="soft">
                  {fmt.name}
                </Pill>
              )}
            </span>
            {deck.commander && (
              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                {deck.commander}
              </Text>
            )}
          </div>
        </header>

        <div className="diStats">
          {row(t('diCards'), <span className="diNumeric">{deck.cardCount}</span>)}
          {ygo &&
            meta != null &&
            row(
              t('anTypes'),
              <span className="diNumeric">
                {meta.monsters ?? 0}M · {meta.spells ?? 0}S · {meta.traps ?? 0}T
                {meta.extra ? ` · +${meta.extra}` : ''}
              </span>,
            )}
          {mtg &&
            row(
              t('diColors'),
              meta == null ? (
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                  …
                </Text>
              ) : meta.colors && meta.colors.length > 0 ? (
                <ColorPips colors={meta.colors} />
              ) : (
                <Text as="span" size={Size.XSmall} tone={TextTone.Muted}>
                  {t('diColorless')}
                </Text>
              ),
            )}
          {row(
            t('diRecord'),
            stats == null ? (
              '…'
            ) : (
              <span className="diNumeric">
                {stats.wins}W · {stats.losses}L
              </span>
            ),
          )}
          {row(
            t('diSalt'),
            stats == null ? (
              '…'
            ) : stats.saltCount > 0 ? (
              <span className="diSalt">
                <SaltPile size={13} /> {stats.salt.toFixed(1)}
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                  ({stats.saltCount})
                </Text>
              </span>
            ) : (
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted}>
                {t('diUnrated')}
              </Text>
            ),
          )}
          {mtg &&
            fmt.brackets &&
            bracket != null &&
            row(
              `${t('bkBracket')} · ${t('bkEstimate')}`,
              <span className="diBracket" data-bracket={bracket.bracket}>
                <span className="diBracketNum">{bracket.bracket}</span>
                <span>{t(bracketKey(bracket.bracket))}</span>
                {bracket.gameChangers.length > 0 && (
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                    · {bracket.gameChangers.length} {t('bkGameChangers')}
                  </Text>
                )}
              </span>,
            )}
        </div>
      </div>
    </Modal>
  );
}
