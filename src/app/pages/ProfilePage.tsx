import { useEffect, useState } from 'react';
import { Avatar, Button, Heading, Pill, Select, Size, Text, TextTone, useLocale } from '@glacier/react';
import { motion } from 'motion/react';
import { useT } from '../i18n.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import * as api from '../net/api.ts';
import { COLOR_ORDER, PRECONS, cardImage, commanderArt, preconCommander } from '../data/cards.ts';
import { DeckStack } from '../components/DeckStack.tsx';
import { useCardPopup } from '../components/CardPopup.tsx';
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
      </motion.div>

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
