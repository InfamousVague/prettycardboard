import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertDialog,
  Button,
  Heading,
  IconButton,
  Pill,
  ProgressBar,
  Select,
  Size,
  Text,
  TextTone,
  Tooltip,
} from '@glacier/react';
import {
  ChevronLeft,
  Cog,
  Crown,
  Flame,
  Minus,
  Mountain,
  Plus,
  ScrollText,
  Shapes,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from '@glacier/icons';
import { useT } from '../../i18n.ts';
import * as api from '../../net/api.ts';
import type { Deck, DeckCard } from '../../net/types.ts';
import { useApp } from '../../state/appStore.ts';
import { useUi } from '../../state/uiStore.ts';
import { artCrop, cardImage } from '../../data/cards.ts';
import { resolveCardImage } from '../../data/games.ts';
import { aliasCardMeta, getCardMeta, hydrateCardMeta, type ScryCard } from '../../data/scryfall.ts';
import { bracketKey, estimateBracket } from '../../data/brackets.ts';
import { FORMATS, formatFor, formatTarget, isBasicLand } from '../../data/formats.ts';
import { applyDeckTint, clearDeckTint } from '../../state/accent.ts';
import { DEFAULT_PREFERENCES, loadPreferences } from '../../preferences.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { GameTag } from '../../components/GameTag.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import { CardRowSkeleton } from '../../components/Skeletons.tsx';
import { ArtPicker, HeaderCardPicker } from '../../components/ArtPicker.tsx';
import { useLongPress } from '../../hooks/useLongPress.ts';
import { CardSearch } from './CardSearch.tsx';
import { CyberpunkCardSearch } from './CyberpunkCardSearch.tsx';
import type { CyberpunkCard } from '../../data/cyberpunk.ts';
import { ManaCurveChart } from './ManaCurveChart.tsx';
import { ColorPips, ManaPips, TYPE_LABEL, TYPE_ORDER, typeBucket, type TypeBucket } from './shared.tsx';
import { cyberColorHex, cyberDeckStats, cyberTypeIcon } from './cyberDeck.tsx';

/**
 * The deck editor: decklist on the start side, Scryfall search on the end
 * side, a stats strip (curve / identity / size) between the header and the
 * panes. Every change debounce-autosaves (800ms) through api.updateDeck and
 * refreshes the sidebar's deck list.
 */

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 800;
const CURVE_BUCKETS = 8; // 0..7+
const COMMANDER_TARGET = 100;

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH * (680 / 488));

interface HoverPreview {
  scryfallId: string;
  name: string;
  x: number;
  y: number;
}

export function DeckEditor({ deckId }: { deckId: string }) {
  const t = useT();
  const selectDeck = useUi((state) => state.selectDeck);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<HoverPreview | null>(null);
  // Bumped when unknown-card metadata arrives, so groups/curve/identity recompute.
  const [metaVersion, setMetaVersion] = useState(0);
  const [artFor, setArtFor] = useState<DeckCard | null>(null);
  const [headerPicking, setHeaderPicking] = useState(false);
  const saveSeq = useRef(0);
  const randomHeaderRef = useRef<string | null>(null);

  // --- load ---
  useEffect(() => {
    let cancelled = false;
    randomHeaderRef.current = null;
    setDeck(null);
    setLoadFailed(false);
    setSaveState('clean');
    api
      .getDeck(deckId)
      .then((loaded) => {
        if (cancelled) return;
        setDeck(loaded);
        // Imported decks may be full of cards this session has never seen;
        // learn their type lines and identities, then recompute the stats.
        void hydrateCardMeta(loaded.cards.map((card) => card.scryfallId)).then((learned) => {
          if (!cancelled && learned > 0) setMetaVersion((version) => version + 1);
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  // --- autosave (debounced; reruns with the freshest deck on every edit) ---
  useEffect(() => {
    if (saveState !== 'dirty' || !deck) return;
    const seq = ++saveSeq.current;
    const timer = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateDeck(deck.id, deck.name, deck.format, deck.cards, deck.header ?? null);
        if (saveSeq.current === seq) setSaveState('saved');
        void useApp.getState().refreshDecks();
      } catch {
        if (saveSeq.current === seq) setSaveState('error');
      }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [deck, saveState]);

  // Flush pending edits on unmount (back within the debounce window, deck
  // switch) so nothing typed in the last 800ms is lost. Fire-and-forget.
  const latest = useRef<{ deck: Deck | null; saveState: SaveState }>({ deck: null, saveState: 'clean' });
  latest.current = { deck, saveState };
  useEffect(
    () => () => {
      const { deck: last, saveState: state } = latest.current;
      if (last && state === 'dirty') {
        api
          .updateDeck(last.id, last.name, last.format, last.cards, last.header ?? null)
          .then(() => useApp.getState().refreshDecks())
          .catch(() => {
            // Nothing to surface - the editor is gone.
          });
      }
    },
    [],
  );

  const mutate = useCallback((fn: (deck: Deck) => Deck) => {
    setDeck((current) => (current ? fn(current) : current));
    setSaveState('dirty');
  }, []);

  const editCards = useCallback(
    (fn: (cards: DeckCard[]) => DeckCard[]) => mutate((d) => ({ ...d, cards: fn(d.cards) })),
    [mutate],
  );

  // --- edits ---
  const rename = (name: string) => mutate((d) => ({ ...d, name }));

  const addCard = (card: ScryCard) =>
    editCards((cards) => {
      const existing = cards.find((c) => c.scryfallId === card.id && c.board === 'main');
      if (existing) {
        return cards.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...cards, { scryfallId: card.id, name: card.name, quantity: 1, board: 'main' }];
    });

  const setCommander = (card: ScryCard) =>
    editCards((cards) => {
      const rest = cards.filter((c) => c.scryfallId !== card.id);
      // The previous commander steps down into the main deck, never vanishing.
      const demoted = rest.map((c) => (c.board === 'commander' ? { ...c, board: 'main' as const } : c));
      return [{ scryfallId: card.id, name: card.name, quantity: 1, board: 'commander' }, ...demoted];
    });

  // Cyberpunk add: a Legend takes the anchor (command) slot, replacing any
  // existing one; everything else stacks in the main deck.
  const addCyberCard = (card: CyberpunkCard) =>
    editCards((cards) => {
      if (card.type === 'Legend') {
        const rest = cards.filter((c) => c.scryfallId !== card.id);
        const demoted = rest.map((c) => (c.board === 'commander' ? { ...c, board: 'main' as const } : c));
        return [{ scryfallId: card.id, name: card.displayName, quantity: 1, board: 'commander' }, ...demoted];
      }
      const existing = cards.find((c) => c.scryfallId === card.id && c.board === 'main');
      if (existing) return cards.map((c) => (c === existing ? { ...c, quantity: c.quantity + 1 } : c));
      return [...cards, { scryfallId: card.id, name: card.displayName, quantity: 1, board: 'main' }];
    });

  const changeQuantity = (target: DeckCard, delta: number) =>
    editCards((cards) =>
      cards
        .map((c) => (c === target ? { ...c, quantity: c.quantity + delta } : c))
        .filter((c) => c.quantity > 0),
    );

  const changeArtwork = (target: DeckCard, printingId: string) => {
    if (printingId === target.scryfallId) return;
    // The chosen printing inherits everything the session knows about the card,
    // so grouping, curve, and identity checks survive the art swap.
    aliasCardMeta(target.scryfallId, printingId);
    mutate((d) => ({
      ...d,
      cards: d.cards.map((c) =>
        c === target || (c.scryfallId === target.scryfallId && c.board === target.board)
          ? { ...c, scryfallId: printingId }
          : c,
      ),
      header: d.header === target.scryfallId ? printingId : d.header,
    }));
  };

  const openArtPicker = (card: DeckCard) => {
    setPreview(null);
    setArtFor(card);
  };

  const setHeaderCard = (scryfallId: string) => {
    mutate((d) => ({ ...d, header: scryfallId }));
  };

  const removeCard = (target: DeckCard) => {
    setPreview(null); // the hovered row is about to unmount; pointerleave won't fire
    editCards((cards) => cards.filter((c) => c !== target));
  };

  const goBack = () => {
    selectDeck(null);
    void useApp.getState().refreshDecks();
  };

  const deleteDeck = async () => {
    setDeleting(true);
    try {
      await api.deleteDeck(deckId);
      // The deck is gone; make sure the unmount flush never resurrects it.
      latest.current = { deck: null, saveState: 'clean' };
      setConfirmDelete(false);
      goBack();
    } finally {
      setDeleting(false);
    }
  };

  // --- hover preview, clamped inside the viewport ---
  const showPreview = (card: DeckCard) => (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return; // hover preview is a mouse affordance
    const rect = event.currentTarget.getBoundingClientRect();
    const gap = 14;
    const rightX = rect.right + gap;
    const x =
      rightX + PREVIEW_WIDTH <= window.innerWidth - 8
        ? rightX
        : Math.max(8, rect.left - gap - PREVIEW_WIDTH);
    const y = Math.min(
      Math.max(8, rect.top + rect.height / 2 - PREVIEW_HEIGHT / 2),
      window.innerHeight - PREVIEW_HEIGHT - 8,
    );
    setPreview({ scryfallId: card.scryfallId, name: card.name, x, y });
  };
  const hidePreview = () => setPreview(null);

  // --- derived stats ---
  const derived = useMemo(() => {
    if (!deck) return null;
    const commanderCards = deck.cards.filter((c) => c.board === 'commander');
    const mainCards = deck.cards.filter((c) => c.board === 'main');
    const sideCards = deck.cards.filter((c) => c.board === 'side');

    const groups = new Map<TypeBucket, DeckCard[]>();
    for (const card of mainCards) {
      const bucket = typeBucket(getCardMeta(card.scryfallId));
      const list = groups.get(bucket);
      if (list) list.push(card);
      else groups.set(bucket, [card]);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    const curve = Array.from({ length: CURVE_BUCKETS }, () => 0);
    for (const card of mainCards) {
      const meta = getCardMeta(card.scryfallId);
      if (!meta || typeBucket(meta) === 'land') continue;
      const bucket = Math.min(CURVE_BUCKETS - 1, Math.max(0, Math.round(meta.manaValue)));
      curve[bucket] = (curve[bucket] ?? 0) + card.quantity;
    }

    const fmt = formatFor(deck.format);

    // Commander color identity - only meaningful when every commander is known.
    const commanderMetas = commanderCards.map((c) => getCardMeta(c.scryfallId));
    const identityKnown = commanderCards.length > 0 && commanderMetas.every((meta) => meta !== undefined);
    const commanderIdentity = new Set<string>();
    for (const meta of commanderMetas) for (const color of meta?.colorIdentity ?? []) commanderIdentity.add(color);

    // Cards whose known identity escapes the commander's. Unknown cards pass;
    // the rule only exists in commander-led formats.
    const violations = new Set<string>();
    if (fmt.hasCommander && identityKnown) {
      for (const card of mainCards) {
        const meta = getCardMeta(card.scryfallId);
        if (meta && meta.colorIdentity.some((color) => !commanderIdentity.has(color))) {
          violations.add(card.scryfallId);
        }
      }
    }

    // The format's copy limit (singleton, four-of); basic lands are exempt.
    const copyWarnings = new Set<string>();
    if (fmt.maxCopies !== null) {
      for (const card of [...mainCards, ...sideCards]) {
        if (card.quantity > fmt.maxCopies && !isBasicLand(card.name)) {
          copyWarnings.add(card.scryfallId);
        }
      }
    }
    const ruleWarnings = new Set([...violations, ...copyWarnings]);

    // Deck-wide identity for the header: the commander's when known, otherwise
    // the union of every known card.
    const deckIdentity = identityKnown
      ? [...commanderIdentity]
      : [...new Set(deck.cards.flatMap((c) => getCardMeta(c.scryfallId)?.colorIdentity ?? []))];

    const total = commanderCards.reduce((sum, c) => sum + c.quantity, 0) + mainCards.reduce((sum, c) => sum + c.quantity, 0);

    // Per-type quantity counts (mains only, matching the decklist groups).
    const typeCounts = new Map<TypeBucket, number>();
    for (const [bucket, list] of groups) {
      typeCounts.set(
        bucket,
        list.reduce((sum, c) => sum + c.quantity, 0),
      );
    }
    const landCount = typeCounts.get('land') ?? 0;

    // Average mana value of the nonland mains. Unknown cards are skipped so a
    // half-loaded deck never reports a fake curve.
    let mvSum = 0;
    let mvCount = 0;
    for (const card of mainCards) {
      const meta = getCardMeta(card.scryfallId);
      if (!meta || typeBucket(meta) === 'land') continue;
      mvSum += meta.manaValue * card.quantity;
      mvCount += card.quantity;
    }
    const avgMv = mvCount > 0 ? mvSum / mvCount : 0;

    const bracket = estimateBracket(deck.cards);

    return {
      fmt,
      commanderCards,
      mainCards,
      sideCards,
      groups,
      curve,
      violations,
      copyWarnings,
      ruleWarnings,
      deckIdentity,
      total,
      typeCounts,
      landCount,
      avgMv,
      bracket,
    };
  }, [deck, metaVersion]);

  // --- deck tint: the app accent leans toward the open deck's identity ---
  const identityKey = derived ? derived.deckIdentity.join('') : null;
  useEffect(() => {
    if (identityKey === null) return;
    applyDeckTint(identityKey.split(''));
  }, [identityKey]);
  useEffect(
    () => () => clearDeckTint(loadPreferences().accent, DEFAULT_PREFERENCES.accent),
    [],
  );

  const popup = useCardPopup();
  const heroLongPress = useLongPress(() => setHeaderPicking(true));

  if (loadFailed) {
    return (
      <div className="page deckEditorPage">
        <Text tone={TextTone.Danger}>{t('obOffline')}</Text>
        <div>
          <Button variant="soft" onClick={goBack}>
            {t('dbBack')}
          </Button>
        </div>
      </div>
    );
  }

  if (!deck || !derived) {
    return (
      <div className="page deckEditorPage deckEditorLoading">
        <CardRowSkeleton count={4} width={104} />
        <Text size={Size.Small} tone={TextTone.Subtle}>
          {t('esShuffling')}
        </Text>
      </div>
    );
  }

  const fmt = derived.fmt;
  const sizeTarget = formatTarget(fmt);
  // Cyberpunk decks reuse the MTG "standard" format shell but have no mana curve,
  // color identity, or bracket, so those MTG-only stats are hidden. Instead the
  // view reads through Legends' RAM budget, colour spread, and avg Cost/Power.
  const cyber = deck.game === 'cyberpunk';
  const cyberStats = cyber ? cyberDeckStats(deck) : null;

  const heroCommander = derived.commanderCards[0];
  const heroMeta = heroCommander ? getCardMeta(heroCommander.scryfallId) : undefined;

  // The hero leads with the chosen header card. Unset Commander decks default
  // to the commander itself; only commanderless lists fall back to a random
  // pick that holds still for the visit (re-rolled next time).
  const headerCard = (() => {
    const stored = deck.header ? deck.cards.find((c) => c.scryfallId === deck.header) : undefined;
    if (stored) return stored;
    if (heroCommander) return heroCommander;
    if (deck.cards.length === 0) return undefined;
    if (
      !randomHeaderRef.current ||
      !deck.cards.some((c) => c.scryfallId === randomHeaderRef.current)
    ) {
      randomHeaderRef.current =
        deck.cards[Math.floor(Math.random() * deck.cards.length)]!.scryfallId;
    }
    return deck.cards.find((c) => c.scryfallId === randomHeaderRef.current);
  })();

  return (
    <div className="page deckEditorPage">
      <Button variant="glass" size="sm" className="deckBack" onClick={goBack}>
        <ChevronLeft size={16} className="flipInRtl" />
        {t('dbBack')}
      </Button>

      {/* hero - the commander's art IS the header */}
      <header
        className="deckHero"
        data-has-art={headerCard ? '' : undefined}
        {...heroLongPress}
        onContextMenu={(event) => {
          if ((event.target as HTMLElement).closest('input, button')) return;
          event.preventDefault();
          setHeaderPicking(true);
        }}
      >
        {headerCard && (
          <div
            className="deckHeroArt"
            style={{ backgroundImage: `url(${artCrop(headerCard.scryfallId)})` }}
            aria-hidden
          />
        )}
        <div className="deckHeroScrim" aria-hidden />
        <div className="deckHeroContent">
        {headerCard && (
          <div
            className="deckHeroCard"
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setHeaderPicking(true);
            }}
          >
            <GameCard
              name={headerCard.name}
              imageUrl={resolveCardImage(deck?.game, headerCard.scryfallId)}
              width={224}
              foil
              tilt={9}
              onClick={() =>
                popup.open({ scryfallId: headerCard.scryfallId, name: headerCard.name, foil: true })
              }
            />
          </div>
        )}
          <div className="deckHeaderMain">
            <input
              className="deckNameInput"
              value={deck.name}
              onChange={(event) => rename(event.target.value)}
              onBlur={() => {
                if (!deck.name.trim()) rename(t('dbUntitled'));
              }}
              aria-label={t('dbDeckName')}
              spellCheck={false}
            />
            <div className="deckHeaderMeta">
              <span className="deckFormatSelect">
                {cyber ? (
                  <GameTag game="cyberpunk" />
                ) : (
                  <Select
                    size="sm"
                    value={fmt.id}
                    onValueChange={(value) =>
                      mutate((d) => ({ ...d, format: FORMATS.find((f) => f.id === value)?.name ?? value }))
                    }
                    options={FORMATS.map((f) => ({ value: f.id, label: f.name }))}
                    aria-label={t('dbFormat')}
                  />
                )}
              </span>
              {heroCommander && (
                <span className="deckHeroCommander">
                  <Crown size={13} aria-hidden />
                  <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                    {heroCommander.name}
                  </Text>
                  {!cyber && heroMeta?.manaCost && <ManaPips cost={heroMeta.manaCost} />}
                </span>
              )}
              {!cyber && <ColorPips colors={derived.deckIdentity} label={t('dbIdentity')} />}
              <Text as="span" size={Size.Small} tone={TextTone.Muted} mono>
                {derived.total} {t('decksCards')}
              </Text>
              <span className="deckSaveState" aria-live="polite">
                {saveState === 'saving' || saveState === 'dirty' ? (
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                    {t('dbSaving')}
                  </Text>
                ) : saveState === 'saved' ? (
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                    {t('dbSaved')}
                  </Text>
                ) : saveState === 'error' ? (
                  <Text as="span" size={Size.XSmall} tone={TextTone.Danger}>
                    {t('dbSaveFailed')}
                  </Text>
                ) : null}
              </span>
            </div>
            {!cyber && (
              <div className="deckCurveBand deckStat">
                <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                  {t('dbCurve')}
                </Text>
                <ManaCurveChart buckets={derived.curve} />
              </div>
            )}
          </div>
        </div>
      {/* the fact chips share the row below */}
      <div className="deckStats" data-commander={fmt.hasCommander ? '' : undefined}>
        {/* identity + size share one tile: both are small facts, and merging
            them keeps the strip a single balanced row. Hidden for Cyberpunk
            (no color identity / mana size target; the card count is in the
            header row). */}
        {!cyber && (
        <div className="deckStat deckStatIdentity">
          <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
            {t('dbIdentity')}
          </Text>
          <ColorPips colors={derived.deckIdentity} label={t('dbIdentity')} />
          {derived.violations.size > 0 && (
            <Pill size="sm" tone="warning">
              {derived.violations.size} {t('dbIdentityWarnSummary')}
            </Pill>
          )}
          {derived.copyWarnings.size > 0 && (
            <Pill size="sm" tone="warning">
              {derived.copyWarnings.size} {t('dbCopyWarnSummary')}
            </Pill>
          )}
          {sizeTarget !== null && (
            <div className="deckStatSizeBlock">
              <div className="deckStatRow">
                <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                  {t('dbDeckSize')}
                </Text>
                <Text as="span" size={Size.Small} mono>
                  {derived.total} / {sizeTarget}
                  {fmt.exactSize === null ? '+' : ''}
                </Text>
              </div>
              <ProgressBar
                value={Math.min(derived.total, sizeTarget)}
                max={sizeTarget}
                size="sm"
                tone={
                  (fmt.exactSize !== null ? derived.total === sizeTarget : derived.total >= sizeTarget)
                    ? 'success'
                    : 'accent'
                }
                aria-label={t('dbDeckSize')}
              />
            </div>
          )}
        </div>
        )}
        {fmt.brackets && (
          <Tooltip
            content={
              <span className="bracketTip">
                {derived.bracket.gameChangers.length > 0 && (
                  <>
                    <span className="bracketTipHead">{t('bkGameChangers')}</span>
                    <span className="bracketTipList">
                      {derived.bracket.gameChangers.map((name) => (
                        <span key={name}>{name}</span>
                      ))}
                    </span>
                  </>
                )}
                <span className="bracketTipNote">{t('bkNote')}</span>
              </span>
            }
          >
            <div
              className="deckStat deckStatBracket"
              data-bracket={derived.bracket.bracket}
              tabIndex={0}
              aria-label={`${t('bkBracket')} ${derived.bracket.bracket}: ${t(bracketKey(derived.bracket.bracket))} (${t('bkEstimate')})`}
            >
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                {t('bkBracket')} · {t('bkEstimate')}
              </Text>
              <span className="bracketBig">
                <span className="bracketNumeral">{derived.bracket.bracket}</span>
                <span className="bracketName">{t(bracketKey(derived.bracket.bracket))}</span>
              </span>
              {derived.bracket.gameChangers.length > 0 && (
                <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
                  {derived.bracket.gameChangers.length} {t('bkGameChangers')}
                </Text>
              )}
            </div>
          </Tooltip>
        )}
        {cyber && cyberStats ? (
          <div className="deckStat deckStatAnalytics deckStatCyber">
            <div className="deckStatRow deckStatTypesRow">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                {t('dbRamBudget')}
              </Text>
              <span className="cyberChipRow">
                {cyberStats.ramBudget.length === 0 ? (
                  <Text as="span" size={Size.Small} tone={TextTone.Subtle} mono>
                    —
                  </Text>
                ) : (
                  cyberStats.ramBudget.map((b) => (
                    <span key={b.color} className="cyberChip" title={`${b.color}: ${b.ram} RAM`}>
                      <span className="cyberDot" style={{ background: cyberColorHex(b.color) }} aria-hidden />
                      <Text as="span" size={Size.XSmall} mono>
                        {b.ram}
                      </Text>
                    </span>
                  ))
                )}
              </span>
            </div>
            <div className="deckStatRow deckStatTypesRow">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                {t('dbColors')}
              </Text>
              <span className="cyberChipRow">
                {cyberStats.colorCounts.map((c) => (
                  <span key={c.color} className="cyberChip" title={`${c.color}: ${c.count}`}>
                    <span className="cyberDot" style={{ background: cyberColorHex(c.color) }} aria-hidden />
                    <Text as="span" size={Size.XSmall} tone={TextTone.Muted} mono>
                      {c.count}
                    </Text>
                  </span>
                ))}
              </span>
            </div>
            <div className="deckStatRow">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                {t('dbAvgCost')}
              </Text>
              <Text as="span" size={Size.Small} mono>
                {cyberStats.avgCost.toFixed(1)}
              </Text>
            </div>
            <div className="deckStatRow">
              <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
                {t('dbAvgPower')}
              </Text>
              <Text as="span" size={Size.Small} mono>
                {cyberStats.avgPower.toFixed(1)}
              </Text>
            </div>
          </div>
        ) : (
        <div className="deckStat deckStatAnalytics">
          <div className="deckStatRow">
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
              {t('anAvgMv')}
            </Text>
            <Text as="span" size={Size.Small} mono>
              {derived.avgMv.toFixed(1)}
            </Text>
          </div>
          <div className="deckStatRow">
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
              {t('anLands')}
            </Text>
            <Text as="span" size={Size.Small} mono>
              {derived.landCount}
            </Text>
          </div>
          {sizeTarget !== null && derived.total >= sizeTarget && derived.landCount < Math.round(sizeTarget / 3) && (
            <Pill size="sm" tone="warning" icon={<TriangleAlert size={12} />} className="landsWarnPill">
              {t('anLowLands')}
            </Pill>
          )}
          <div className="deckStatRow deckStatTypesRow">
            <Text as="span" size={Size.XSmall} tone={TextTone.Muted} className="deckStatLabel">
              {t('anTypes')}
            </Text>
            <span className="deckTypeRow">
              {TYPE_ORDER.map((bucket) => {
                const count = derived.typeCounts.get(bucket);
                if (!count) return null;
                return (
                  <Tooltip key={bucket} content={t(TYPE_LABEL[bucket])}>
                    <span className="deckTypeStat" role="img" aria-label={`${t(TYPE_LABEL[bucket])}: ${count}`}>
                      <span className="deckTypeGlyph" aria-hidden>
                        {TYPE_ICON[bucket]}
                      </span>
                      <Text as="span" size={Size.XSmall} tone={TextTone.Muted} mono>
                        {count}
                      </Text>
                    </span>
                  </Tooltip>
                );
              })}
            </span>
          </div>
        </div>
        )}
      </div>
      </header>

      {/* the search bar spans the page, right above the list */}
      <div className="deckSearchBar">
        {cyber ? (
          <CyberpunkCardSearch onAdd={addCyberCard} />
        ) : (
          <CardSearch onAdd={addCard} onSetCommander={setCommander} allowCommander={fmt.hasCommander} />
        )}
      </div>

      <div className="deckList">
          {cyber && cyberStats ? (
            /* Cyberpunk: Legends anchor group, then mains grouped by printed type
               (Unit / Gear / Program …) instead of the MTG card-type buckets. */
            <>
              {cyberStats.legends.length > 0 && (
                <DeckGroup title={t('dbLegends')} count={cyberStats.legendCount} icon={<Crown size={13} />}>
                  <CardGrid
                    game={deck?.game}
                    cards={cyberStats.legends}
                    violations={derived.ruleWarnings}
                    foil
                    onQuantity={changeQuantity}
                    onRemove={removeCard}
                    onHover={showPreview}
                    onLeave={hidePreview}
                    onArt={openArtPicker}
                  />
                </DeckGroup>
              )}
              {cyberStats.groups.map((group) => (
                <DeckGroup key={group.type} title={group.type} count={group.count} icon={cyberTypeIcon(group.type)}>
                  <CardGrid
                    game={deck?.game}
                    cards={group.cards}
                    violations={derived.ruleWarnings}
                    onQuantity={changeQuantity}
                    onRemove={removeCard}
                    onHover={showPreview}
                    onLeave={hidePreview}
                    onArt={openArtPicker}
                  />
                </DeckGroup>
              ))}
            </>
          ) : (
            <>
          {derived.fmt.hasCommander && (
            <DeckGroup title={t('dbCommander')} icon={<Crown size={13} />}>
              {derived.commanderCards.length === 0 ? (
                <Text size={Size.Small} tone={TextTone.Subtle} className="deckGroupEmpty">
                  {t('dbNoCommander')}
                </Text>
              ) : (
                <CardGrid
                  game={deck?.game}
                  cards={derived.commanderCards}
                  violations={derived.ruleWarnings}
                  foil
                  onQuantity={changeQuantity}
                  onRemove={removeCard}
                  onHover={showPreview}
                  onLeave={hidePreview}
                  onArt={openArtPicker}
                />
              )}
            </DeckGroup>
          )}

          {TYPE_ORDER.map((bucket) => {
            const cards = derived.groups.get(bucket);
            if (!cards || cards.length === 0) return null;
            const count = cards.reduce((sum, c) => sum + c.quantity, 0);
            return (
              <DeckGroup key={bucket} title={t(TYPE_LABEL[bucket])} count={count} icon={TYPE_ICON[bucket]}>
                <CardGrid
                  game={deck?.game}
                  cards={cards}
                  violations={derived.ruleWarnings}
                  onQuantity={changeQuantity}
                  onRemove={removeCard}
                  onHover={showPreview}
                  onLeave={hidePreview}
                  onArt={openArtPicker}
                />
              </DeckGroup>
            );
          })}
            </>
          )}

          {derived.sideCards.length > 0 && (
            <DeckGroup title={t('dbSide')} count={derived.sideCards.reduce((sum, c) => sum + c.quantity, 0)}>
              <CardGrid
                game={deck?.game}
                cards={derived.sideCards}
                violations={derived.ruleWarnings}
                onQuantity={changeQuantity}
                onRemove={removeCard}
                onHover={showPreview}
                onLeave={hidePreview}
                onArt={openArtPicker}
              />
            </DeckGroup>
          )}

          {derived.total === 0 && derived.sideCards.length === 0 && (
            <Text size={Size.Small} tone={TextTone.Subtle}>
              {t('decksEmpty')}
            </Text>
          )}
        </div>

      <AnimatePresence>
        {artFor && (
          <ArtPicker
            scryfallId={artFor.scryfallId}
            name={artFor.name}
            onSelect={(printingId) => changeArtwork(artFor, printingId)}
            onClose={() => setArtFor(null)}
          />
        )}
        {headerPicking && (
          <HeaderCardPicker
            deckName={deck.name}
            current={headerCard?.scryfallId ?? deck.header}
            cards={[...new Map(deck.cards.map((c) => [c.scryfallId, { scryfallId: c.scryfallId, name: c.name }])).values()]}
            onSelect={setHeaderCard}
            onClose={() => setHeaderPicking(false)}
          />
        )}
      </AnimatePresence>

      {/* destructive actions live at the end, away from the everyday chrome */}
      <footer className="deckFooter">
        <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="deckFooterHint">
          {t('apRightClickHint')}
        </Text>
        <Button variant="ghost" size="sm" className="deckDelete" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={15} />
          {t('dbDelete')}
        </Button>
      </footer>

      {/* floating card preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            key={preview.scryfallId}
            className="deckPreview"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            style={{ left: preview.x, top: preview.y }}
          >
            <GameCard name={preview.name} imageUrl={resolveCardImage(deck?.game, preview.scryfallId)} width={PREVIEW_WIDTH} tilt={0} />
          </motion.div>
        )}
      </AnimatePresence>

      <AlertDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('dbDelete')}
        description={t('dbDeleteBody')}
        actionLabel={t('dbDelete')}
        cancelLabel={t('dbCancel')}
        tone="danger"
        actionLoading={deleting}
        onAction={() => void deleteDeck()}
      />
    </div>
  );
}

/** A glyph per card-type group, so the decklist scans by shape, not just text. */
const TYPE_ICON: Record<TypeBucket, React.ReactNode> = {
  creature: <Swords size={13} />,
  instant: <Zap size={13} />,
  sorcery: <ScrollText size={13} />,
  artifact: <Cog size={13} />,
  enchantment: <Sparkles size={13} />,
  planeswalker: <Flame size={13} />,
  battle: <Shield size={13} />,
  land: <Mountain size={13} />,
  other: <Shapes size={13} />,
};

function DeckGroup({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="deckGroup">
      <div className="deckGroupHead">
        {icon && (
          <span className="deckGroupIcon" aria-hidden>
            {icon}
          </span>
        )}
        <Heading level={3} visualLevel={6} noMargin>
          {title}
        </Heading>
        {count !== undefined && (
          <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
            {count}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

function CardGrid({
  cards,
  violations,
  foil,
  game,
  onQuantity,
  onRemove,
  onHover,
  onLeave,
  onArt,
}: {
  cards: DeckCard[];
  violations: Set<string>;
  foil?: boolean;
  game?: string;
  onQuantity: (card: DeckCard, delta: number) => void;
  onRemove: (card: DeckCard) => void;
  onHover: (card: DeckCard) => (event: PointerEvent<HTMLElement>) => void;
  onLeave: () => void;
  onArt: (card: DeckCard) => void;
}) {
  return (
    <div className="deckCardGrid">
      <AnimatePresence initial={false}>
        {cards.map((card) => (
          <CardCell
            key={`${card.board}-${card.scryfallId}`}
            card={card}
            foil={foil}
            game={game}
            warns={violations.has(card.scryfallId)}
            onQuantity={onQuantity}
            onRemove={onRemove}
            onHover={onHover}
            onLeave={onLeave}
            onArt={onArt}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function CardCell({
  card,
  foil,
  warns,
  game,
  onQuantity,
  onRemove,
  onHover,
  onLeave,
  onArt,
}: {
  card: DeckCard;
  foil?: boolean;
  warns: boolean;
  game?: string;
  onQuantity: (card: DeckCard, delta: number) => void;
  onRemove: (card: DeckCard) => void;
  onHover: (card: DeckCard) => (event: PointerEvent<HTMLElement>) => void;
  onLeave: () => void;
  onArt: (card: DeckCard) => void;
}) {
  const t = useT();
  const popup = useCardPopup();
  // Long-press opens the artwork picker on touch; mouse uses onContextMenu.
  const longPress = useLongPress(() => onArt(card));
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className="deckCardCell"
      onPointerEnter={onHover(card)}
      onPointerLeave={(event) => {
        onLeave();
        longPress.onPointerLeave(event);
      }}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onClickCapture={longPress.onClickCapture}
      onContextMenu={(event) => {
        event.preventDefault();
        onArt(card);
      }}
    >
      <GameCard
        name={card.name}
        imageUrl={resolveCardImage(game, card.scryfallId)}
        fluid
        foil={foil}
        tilt={5}
        className="deckCardFace"
        onClick={() => {
          onLeave(); // drop the hover preview before the lightbox takes over
          popup.open({ scryfallId: card.scryfallId, name: card.name, foil });
        }}
      />
      {card.quantity > 1 && (
        <span className="deckCardQty" aria-label={`x${card.quantity}`}>
          ×{card.quantity}
        </span>
      )}
      {warns && (
        <Tooltip content={t('dbRuleWarn')}>
          <span className="deckCardWarn" role="img" aria-label={t('dbIdentityWarn')}>
            <TriangleAlert size={12} />
          </span>
        </Tooltip>
      )}
      <span className="deckCardTools">
        <IconButton aria-label={`− ${card.name}`} size="sm" variant="ghost" onClick={() => onQuantity(card, -1)}>
          <Minus size={13} />
        </IconButton>
        <IconButton aria-label={`+ ${card.name}`} size="sm" variant="ghost" onClick={() => onQuantity(card, 1)}>
          <Plus size={13} />
        </IconButton>
        <IconButton
          aria-label={`${t('dbRemove')}: ${card.name}`}
          size="sm"
          variant="ghost"
          onClick={() => onRemove(card)}
        >
          <X size={13} />
        </IconButton>
      </span>
    </motion.div>
  );
}
