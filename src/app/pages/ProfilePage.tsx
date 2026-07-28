import { useEffect, useState } from 'react';
import { Avatar, Button, Heading, Pill, Select, Size, Text, TextTone, useLocale } from '@glacier/react';
import { motion } from 'motion/react';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import { COLOR_ORDER, cardImage, commanderArt } from '../data/cards.ts';
import { PRECONS, preconCommander } from '../data/precons.ts';
import { DeckStack } from '../components/DeckStack.tsx';
import { useCardPopup } from '../components/CardPopup.tsx';
import { MatchHistory } from '../components/MatchHistory.tsx';
import { SaltPile } from '../components/SaltPile.tsx';
import { rankFor, winRate } from '../data/ranks.ts';
import type { MatchRow, MyDeckStats, UserStats } from '../net/types.ts';
import { ThumbsUp } from '@glacier/icons';
import './social.css';

const GAME_TAG: Record<string, string> = {
  'counter-blitz': 'FINAL FANTASY X',
  'limit-break': 'FINAL FANTASY VII',
  'revival-trance': 'FINAL FANTASY VI',
  'scions-spellcraft': 'FINAL FANTASY XIV',
};

function gameTag(id: string, name: string): string {
  const match = /\(([^)]+)\)\s*$/.exec(name);
  return GAME_TAG[id] ?? match?.[1] ?? '';
}

const PIP: Record<string, string> = {
  W: 'oklch(0.92 0.05 95)',
  U: 'oklch(0.62 0.14 250)',
  B: 'oklch(0.38 0.03 300)',
  R: 'oklch(0.6 0.19 30)',
  G: 'oklch(0.55 0.13 150)',
};

/** Identity + showcase deck hero + the Final Fantasy precon shelf. */
export function ProfilePage() {
  const t = useT();
  const locale = useLocale();
  const identity = useApp((state) => state.identity);
  const signOut = useApp((state) => state.signOut);
  const decks = useApp((state) => state.decks);
  const selectDeck = useUi((state) => state.selectDeck);
  const popup = useCardPopup();

  // The showcase pick persists per account.
  const showcaseKey = identity ? `pc.showcase.${identity.userId}` : null;
  const [showcaseId, setShowcaseId] = useState<string | null>(() =>
    showcaseKey ? localStorage.getItem(showcaseKey) : null,
  );
  useEffect(() => {
    setShowcaseId(showcaseKey ? localStorage.getItem(showcaseKey) : null);
  }, [showcaseKey]);

  const pickShowcase = (id: string) => {
    setShowcaseId(id);
    if (showcaseKey) localStorage.setItem(showcaseKey, id);
  };

  // One profile fetch for the account age; omitted quietly when unreachable.
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((info) => {
        if (!cancelled && info.createdAt) setCreatedAt(info.createdAt);
      })
      .catch(() => {
        // stats degrade gracefully offline
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The record: lifetime aggregates, my decks broken down, and the games
  // themselves. All three are garnish - a failure leaves the section off
  // rather than blocking the page.
  const [stats, setStats] = useState<UserStats | null>(null);
  const [deckStats, setDeckStats] = useState<MyDeckStats[] | null>(null);
  const [history, setHistory] = useState<MatchRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [s, d, h] = await Promise.all([
        api.myStats().catch(() => null),
        api.myDeckStats().catch(() => null),
        api.matches().catch(() => null),
      ]);
      if (cancelled) return;
      setStats(s);
      setDeckStats(d);
      setHistory(h);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only decks the table has actually rated can be ranked by saltiness, and a
  // single rater is identifiable in a duel - so a lone rating stays private.
  const ratedDecks = (deckStats ?? []).filter((deck) => deck.saltCount > 1);
  const saltiest = [...ratedDecks].sort((a, b) => b.salt - a.salt).slice(0, 3);
  const mostEndorsed = [...(deckStats ?? [])]
    .filter((deck) => deck.endorsements > 0)
    .sort((a, b) => b.endorsements - a.endorsements)
    .slice(0, 3);
  const rank = stats ? rankFor(stats.played) : null;
  const rate = stats ? winRate(stats) : null;

  const memberSince = (() => {
    if (!createdAt) return null;
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date);
  })();

  const showcaseDeck = showcaseId ? decks.find((deck) => deck.id === showcaseId) : undefined;
  const cover = showcaseDeck?.coverImageUrl || '';

  const openDeck = (id: string) => {
    selectDeck(id);
    window.location.hash = '/decks';
  };

  return (
    <div className="page profilePage">
      <motion.header
        className="pfHero"
        data-has-art={cover ? '' : undefined}
        initial={{ y: 18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      >
        {cover && <div className="pfHeroArt" style={{ backgroundImage: `url(${cover})` }} aria-hidden />}
        <div className="pfHeroScrim" aria-hidden />
        <div className="pfHeroContent">
          <span className="pfAvatar">
            <Avatar name={identity?.username ?? '?'} size="lg" />
          </span>
          <div className="profileWho">
            <Heading level={1} noMargin>
              {identity?.username}
            </Heading>
            <Text size={Size.Small} tone={TextTone.Muted}>
              {t('pfTempId')}
            </Text>
          </div>
          <Button variant="ghost" onClick={signOut}>
            {t('pfSignOut')}
          </Button>
        </div>
        <div className="pfShowcaseRow">
          <div className="pfShowcasePick">
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {t('pfFavDeck')}
            </Text>
            <Select
              size="sm"
              options={decks.map((deck) => ({ value: deck.id, label: deck.name }))}
              value={showcaseId ?? undefined}
              onValueChange={pickShowcase}
              placeholder={t('pfChooseFav')}
              aria-label={t('pfFavDeck')}
            />
          </div>
          {showcaseDeck && (
            <button type="button" className="pfShowcaseDeck" onClick={() => openDeck(showcaseDeck.id)}>
              <span className="pfShowcaseName">{showcaseDeck.name}</span>
              <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                {showcaseDeck.commander}
              </Text>
            </button>
          )}
        </div>
      </motion.header>

      <motion.div
        className="pfStats"
        initial={{ y: 14, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 20, delay: 0.06 }}
      >
        <div className="pfStat">
          <span className="pfStatValue">{decks.length}</span>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {t('pfDeckCount')}
          </Text>
        </div>
        {memberSince && (
          <div className="pfStat">
            <span className="pfStatValue">{memberSince}</span>
            <Text size={Size.Small} tone={TextTone.Muted}>
              {t('pfMemberSince')}
            </Text>
          </div>
        )}
        {stats && stats.played > 0 && (
          <>
            <div className="pfStat">
              <span className="pfStatValue">
                {stats.wins}<span className="pfStatSep">/</span>{stats.losses}
              </span>
              <Text size={Size.Small} tone={TextTone.Muted}>
                {rate != null ? `${t('pfRecord')} · ${rate}%` : t('pfRecord')}
              </Text>
            </div>
            {rank && (
              <div className="pfStat">
                <span className="pfStatValue">{rank.title}</span>
                <Text size={Size.Small} tone={TextTone.Muted}>
                  {t('pfRank')} {rank.level}
                </Text>
              </div>
            )}
            <div className="pfStat">
              <span className="pfStatValue pfStatEndorse">
                <ThumbsUp size={18} aria-hidden /> {stats.endorsements}
              </span>
              <Text size={Size.Small} tone={TextTone.Muted}>
                {t('pmEndorseCount')}
              </Text>
            </div>
            <div className="pfStat">
              <span className="pfStatValue pfStatSalt">
                {/* Held back at a single rater: in a duel, one rating names
                    its rater - the same threshold the lobby and the deck list
                    below use. */}
                <SaltPile size={18} aria-hidden /> {stats.saltCount > 1 ? stats.salt.toFixed(1) : '—'}
              </span>
              <Text size={Size.Small} tone={TextTone.Muted} title={t('pfSaltHint')}>
                {t('pfSalt')}
              </Text>
            </div>
          </>
        )}
      </motion.div>

      {/* Your decks, judged by the people who had to play against them. Salt
          rates a DECK, never its owner, so every label here says so. */}
      {(saltiest.length > 0 || mostEndorsed.length > 0) && (
        <section className="pfDeckStats">
          <Heading level={2}>{t('pfDeckRep')}</Heading>
          <Text tone={TextTone.Muted}>{t('pfDeckRepLede')}</Text>
          <div className="pfDeckCols">
            {saltiest.length > 0 && (
              <div className="pfDeckCol">
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="pfDeckColHead">
                  {t('pfSaltiest')}
                </Text>
                {saltiest.map((deck) => (
                  <div key={deck.deckId} className="pfDeckRow">
                    <span className="pfDeckName">{deck.name ?? t('dbUntitled')}</span>
                    <span className="pfDeckFig pfStatSalt">
                      <SaltPile size={13} aria-hidden /> {deck.salt.toFixed(1)}
                      <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                        ({deck.saltCount})
                      </Text>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {mostEndorsed.length > 0 && (
              <div className="pfDeckCol">
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="pfDeckColHead">
                  {t('pfMostEndorsed')}
                </Text>
                {mostEndorsed.map((deck) => (
                  <div key={deck.deckId} className="pfDeckRow">
                    <span className="pfDeckName">{deck.name ?? t('dbUntitled')}</span>
                    <span className="pfDeckFig pfStatEndorse">
                      <ThumbsUp size={13} aria-hidden /> {deck.endorsements}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {history != null && history.length > 0 && (
        <section className="matchHistory">
          <Heading level={2}>{t('plHistory')}</Heading>
          <MatchHistory matches={history} myUsername={identity?.username} />
        </section>
      )}

      <section>
        <Heading level={2}>{t('pfPrecons')}</Heading>
        <Text tone={TextTone.Muted}>{t('pfPreconsLede')}</Text>

        <div className="preconGrid">
          {PRECONS.map((deck, index) => {
            const commander = preconCommander(deck);
            const identityColors = COLOR_ORDER.filter((color) => commander.colorIdentity.includes(color));
            const owned = decks.find((entry) => entry.name === deck.name);
            return (
              <motion.article
                key={deck.id}
                className="preconCard"
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 140, damping: 18, delay: index * 0.07 }}
              >
                <div
                  className="preconHero"
                  style={{ backgroundImage: `url(${commanderArt(commander.id)})` }}
                  aria-hidden
                />
                <div className="preconBody">
                  <div className="preconArtCard">
                    <DeckStack
                      name={commander.name}
                      imageUrl={cardImage(commander.id)}
                      width={140}
                      onClick={() => popup.open({ scryfallId: commander.id, name: commander.name, foil: true })}
                    />
                  </div>
                  <div className="preconInfo">
                    <Pill size="sm" variant="outline">
                      {gameTag(deck.id, deck.name)}
                    </Pill>
                    <Heading level={3} noMargin>
                      {deck.name.replace(/\s*\([^)]*\)\s*$/, '')}
                    </Heading>
                    <Text size={Size.Small} tone={TextTone.Muted}>
                      {commander.name}
                    </Text>
                    <span className="preconPips" aria-hidden>
                      {identityColors.map((color) => (
                        <i key={color} style={{ background: PIP[color] }} />
                      ))}
                    </span>
                    <Text size={Size.Small} tone={TextTone.Subtle}>
                      {deck.strategy}
                    </Text>
                    {owned && (
                      <Button size="sm" variant="soft" onClick={() => openDeck(owned.id)}>
                        {t('navDecks')} →
                      </Button>
                    )}
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
