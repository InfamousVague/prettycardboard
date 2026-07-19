import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar, Kbd, SearchField, Size, StatusDot, Text, TextTone, useToast } from '@glacier/react';
import { Layers, Package, User } from '@glacier/icons';
import { useT } from '../i18n.ts';
import * as api from '../net/api.ts';
import { useApp } from '../state/appStore.ts';
import { useUi } from '../state/uiStore.ts';
import { cardImage } from '../data/cards.ts';
import { CATALOG, catalogDeckCards, type CatalogDeck } from '../data/catalog.ts';
import { searchCards, type ScryCard } from '../data/scryfall.ts';
import { useCardPopup } from './CardPopup.tsx';
import './spotlight.css';

/**
 * The command palette: Cmd/Ctrl+K from anywhere, one query across your decks,
 * the precon catalog, Scryfall cards, and friends. Enter (or click) acts:
 * decks open, catalog decks add to your library, cards open the lightbox,
 * friends jump to the roster.
 */

interface Hit {
  key: string;
  group: 'decks' | 'catalog' | 'cards' | 'friends';
  title: string;
  subtitle?: string;
  thumb?: string;
  online?: boolean;
  action: () => void | Promise<void>;
}

export function Spotlight() {
  const t = useT();
  const { toast } = useToast();
  const decks = useApp((state) => state.decks);
  const friends = useApp((state) => state.friends);
  const refreshDecks = useApp((state) => state.refreshDecks);
  const selectDeck = useUi((state) => state.selectDeck);
  const popup = useCardPopup();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cards, setCards] = useState<ScryCard[]>([]);
  const [active, setActive] = useState(0);
  const searchSeq = useRef(0);

  // Global shortcut.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setCards([]);
      setActive(0);
    }
  }, [open]);

  // Remote card search, debounced; local sources filter instantly.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setCards([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchCards(q);
        if (searchSeq.current === seq) setCards(results.slice(0, 5));
      } catch {
        // card search is best-effort
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const close = useCallback(() => setOpen(false), []);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const list: Hit[] = [];
    const matches = (text: string) => q.length > 0 && text.toLowerCase().includes(q);

    for (const deck of decks.filter((entry) => matches(entry.name) || matches(entry.commander ?? ''))) {
      list.push({
        key: `deck-${deck.id}`,
        group: 'decks',
        title: deck.name,
        subtitle: deck.commander,
        thumb: deck.coverImageUrl || undefined,
        action: () => {
          selectDeck(deck.id);
          window.location.hash = '/decks';
          close();
        },
      });
    }
    for (const deck of CATALOG.filter(
      (entry) => matches(entry.name) || entry.commanders.some((commander) => matches(commander.name)),
    ).slice(0, 6)) {
      list.push({
        key: `cat-${deck.id}`,
        group: 'catalog',
        title: deck.name,
        subtitle: deck.commanders[0]?.name,
        thumb: deck.commanders[0] ? cardImage(deck.commanders[0].sid) : undefined,
        action: () => addCatalogDeck(deck),
      });
    }
    for (const card of cards) {
      list.push({
        key: `card-${card.id}`,
        group: 'cards',
        title: card.name,
        subtitle: card.type_line,
        thumb: cardImage(card.id),
        action: () => {
          popup.open({ scryfallId: card.id, name: card.name });
          close();
        },
      });
    }
    for (const friend of friends.friends.filter((entry) => matches(entry.username))) {
      list.push({
        key: `friend-${friend.userId}`,
        group: 'friends',
        title: friend.username,
        online: friend.online,
        action: () => {
          window.location.hash = '/friends';
          close();
        },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, decks, cards, friends, selectDeck, close, popup]);

  const addCatalogDeck = async (deck: CatalogDeck) => {
    try {
      const { id } = await api.createDeck(deck.name, 'Commander', catalogDeckCards(deck));
      await refreshDecks();
      toast({ tone: 'success', message: `${deck.name} → ${t('decksTitle')}` });
      selectDeck(id);
      window.location.hash = '/decks';
    } catch {
      toast({ tone: 'danger', message: t('obOffline') });
    }
    close();
  };

  useEffect(() => {
    setActive(0);
  }, [hits.length]);

  const onKeyNav = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(hits.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter' && hits[active]) {
      event.preventDefault();
      void hits[active].action();
    }
  };

  const GROUP_LABEL = { decks: t('spDecks'), catalog: t('spCatalog'), cards: t('spCards'), friends: t('spFriends') };
  const GROUP_ICON = {
    decks: <Layers size={13} />,
    catalog: <Package size={13} />,
    cards: null,
    friends: <User size={13} />,
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="splBackdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onClick={close}
        >
          <motion.div
            className="splPanel"
            initial={{ y: -14, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={onKeyNav}
          >
            <SearchField
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder={t('spPlaceholder')}
              shortcut={<Kbd>esc</Kbd>}
              aria-label={t('spPlaceholder')}
            />
            <div className="splResults">
              {hits.length === 0 && query.trim().length > 0 && (
                <Text size={Size.Small} tone={TextTone.Subtle} className="splNone">
                  {t('spNoResults')}
                </Text>
              )}
              {(['decks', 'catalog', 'cards', 'friends'] as const).map((group) => {
                const groupHits = hits.filter((hit) => hit.group === group);
                if (groupHits.length === 0) return null;
                return (
                  <div key={group} className="splGroup">
                    <span className="splGroupHead">
                      {GROUP_ICON[group]}
                      {GROUP_LABEL[group]}
                    </span>
                    {groupHits.map((hit) => {
                      const index = hits.indexOf(hit);
                      return (
                        <button
                          key={hit.key}
                          type="button"
                          className="splHit"
                          data-active={index === active || undefined}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => void hit.action()}
                        >
                          {hit.group === 'friends' ? (
                            <Avatar name={hit.title} size="sm" />
                          ) : hit.thumb ? (
                            <span className="splThumb" style={{ backgroundImage: `url(${hit.thumb})` }} />
                          ) : (
                            <span className="splThumb" />
                          )}
                          <span className="splHitText">
                            <span className="splHitTitle">{hit.title}</span>
                            {hit.subtitle && <span className="splHitSub">{hit.subtitle}</span>}
                          </span>
                          {hit.online !== undefined && (
                            <StatusDot tone={hit.online ? 'success' : 'neutral'} size="sm" />
                          )}
                          <span className="splAction">
                            {hit.group === 'catalog' ? t('spAdd') : t('spOpen')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
