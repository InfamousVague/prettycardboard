import { useEffect, useState, type ReactNode } from 'react';
import { Heading, Size, Spinner, Text, TextTone } from '@glacier/react';
import { CircleDollarSign, Coins, Cpu, Layers, Link2, Palette, Shield, Star, Swords } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cyberpunkCard, type CyberpunkCard } from '../data/cyberpunk.ts';
import {
  isYugiohId,
  loadYugiohCatalog,
  primeYugiohCatalog,
  yugiohCard,
  yugiohStat,
  type YugiohCard,
} from '../data/yugioh.ts';
import { isAltArtId } from '../data/cards.ts';
import { ManaCost, ManaSymbol, parseCost } from './Mana.tsx';

/**
 * The card details renderer, shared by the fullscreen CardPopup and the hover
 * preview. Given a card id (Scryfall UUID, bundled Cyberpunk id, or Yu-Gi-Oh
 * passcode) it resolves the right game's data — Cyberpunk ships offline,
 * Yu-Gi-Oh reads the lazily-fetched catalog, MTG resolves from the bundled
 * precon index first and falls back to a cached Scryfall lookup — and renders a
 * readable panel: title, cost/type, rules text, flavour, artist.
 */

export interface CardDetails {
  typeLine?: string;
  manaCost?: string;
  oracleText?: string;
  flavorText?: string;
  artist?: string;
  setName?: string;
  power?: string;
  toughness?: string;
}

const DETAILS = new Map<string, CardDetails>();

// The bundled precons carry full rules text, so starter-deck cards need no
// network — but that decklist data is heavy (~850KB), so build the offline
// index lazily on the first card lookup rather than pulling it into the initial
// payload. `fetchDetails` is already async, so awaiting the build is free.
let detailsIndex: Promise<void> | null = null;
function ensureDetails(): Promise<void> {
  if (!detailsIndex) {
    detailsIndex = import('../data/precons.ts').then(({ PRECONS }) => {
      for (const precon of PRECONS) {
        for (const card of precon.cards) {
          DETAILS.set(card.id, {
            typeLine: card.typeLine,
            manaCost: card.manaCost,
            oracleText: card.oracleText,
            flavorText: card.flavorText,
            artist: card.artist,
            power: card.power,
            toughness: card.toughness,
          });
        }
      }
    });
  }
  return detailsIndex;
}

/**
 * The Scryfall record behind a card id. A card wearing our own curated art has
 * a `pc-…` id Scryfall has never heard of - `/cards/pc-…` is a 404, which is
 * why those cards used to open with a title and nothing else. They carry an
 * oracle identity instead, so ask for the card by that.
 *
 * The alt-art registry lives in the (heavy) scryfall module, so it is imported
 * dynamically: this file is reachable from the always-loaded shell.
 */
async function fetchScryCard(scryfallId: string): Promise<Record<string, unknown> | undefined> {
  if (isAltArtId(scryfallId)) {
    const { altArtOracleId, loadAltArtCatalog } = await import('../data/scryfall.ts');
    await loadAltArtCatalog();
    const oracleId = altArtOracleId(scryfallId);
    if (!oracleId) return undefined;
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ identifiers: [{ oracle_id: oracleId }] }),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { data?: Record<string, unknown>[] };
    return body.data?.[0];
  }
  const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Record<string, unknown>;
}

async function fetchDetails(scryfallId: string): Promise<CardDetails> {
  await ensureDetails();
  const cached = DETAILS.get(scryfallId);
  if (cached) return cached;
  const raw = await fetchScryCard(scryfallId);
  if (!raw) throw new Error('not_found');
  const card = raw as {
    type_line?: string;
    mana_cost?: string;
    oracle_text?: string;
    flavor_text?: string;
    artist?: string;
    set_name?: string;
    power?: string;
    toughness?: string;
    card_faces?: {
      type_line?: string;
      mana_cost?: string;
      oracle_text?: string;
      flavor_text?: string;
      power?: string;
      toughness?: string;
    }[];
  };
  const face = card.card_faces?.[0];
  const details: CardDetails = {
    typeLine: card.type_line ?? face?.type_line,
    manaCost: card.mana_cost ?? face?.mana_cost,
    oracleText: card.oracle_text ?? face?.oracle_text,
    flavorText: card.flavor_text ?? face?.flavor_text,
    artist: card.artist,
    setName: card.set_name,
    power: card.power ?? face?.power,
    toughness: card.toughness ?? face?.toughness,
  };
  // Scryfall named the artist of a PAPER printing. This card is wearing our
  // art, so credit whoever actually drew what is on screen.
  if (isAltArtId(scryfallId)) {
    const { altArtById } = await import('../data/scryfall.ts');
    const art = altArtById(scryfallId);
    if (art) {
      details.artist = art.artist ?? details.artist;
      details.setName = art.setName || details.setName;
    }
  }
  DETAILS.set(scryfallId, details);
  // The board wants the same P/T for its on-card total; hand it over rather
  // than let it fetch this card a second time. Imported dynamically and only
  // here: printedPt pulls in the (heavy) bundled precon index, and this module
  // is reachable from the always-loaded shell.
  const { notePrintedPT } = await import('../data/printedPt.ts');
  notePrintedPT(scryfallId, details.power, details.toughness, details.typeLine);
  return details;
}

/**
 * A bundled Cyberpunk card's structured details (stats, type, rules, artist) —
 * everything the API gave us, no network. Rules tokens like {Call}/{Tap} render
 * as chips.
 */
export function CyberpunkDetails({ card }: { card: CyberpunkCard }) {
  const t = useT();
  const typeLine = [card.type, card.color, ...card.classifications].filter(Boolean).join(' · ');
  const stats: { label: string; value: string; icon: ReactNode }[] = [];
  if (card.cost != null) stats.push({ label: t('cpCost'), value: String(card.cost), icon: <CircleDollarSign size={12} /> });
  if (card.power != null) stats.push({ label: t('cpPower'), value: String(card.power), icon: <Swords size={12} /> });
  if (card.ram != null) stats.push({ label: t('cpRam'), value: String(card.ram), icon: <Cpu size={12} /> });
  return (
    <>
      {typeLine && (
        <Text size={Size.Small} tone={TextTone.Muted} className="cpTypeLine">
          {typeLine}
        </Text>
      )}
      {(stats.length > 0 || card.isEddiable) && (
        <div className="cpCyberStats">
          {stats.map((stat) => (
            <span key={stat.label} className="cpStat">
              <span className="cpStatIcon" aria-hidden>
                {stat.icon}
              </span>
              <span className="cpStatLabel">{stat.label}</span>
              <span className="cpStatVal">{stat.value}</span>
            </span>
          ))}
          {card.isEddiable && (
            <span className="cpStat cpEddie">
              <Coins size={12} /> {t('cpEddiable')}
            </span>
          )}
        </div>
      )}
      {card.rulesText && (
        <div className="cpRules">
          {card.rulesText.split('\n').map((line, li) => (
            <p key={li} className="cpRuleLine">
              {line.split(/(\{[^}]+\})/g).map((part, pi) =>
                part.startsWith('{') && part.endsWith('}') ? (
                  <span key={pi} className="cpToken">
                    {part.slice(1, -1)}
                  </span>
                ) : (
                  <span key={pi}>{part}</span>
                ),
              )}
            </p>
          ))}
        </div>
      )}
      {card.flavorText && (
        <Text size={Size.Small} tone={TextTone.Subtle} className="cpFlavor">
          {card.flavorText}
        </Text>
      )}
      <div className="cpFooter">
        {card.artist && (
          <span className="cpMeta" title={t('cpArtist')}>
            <Palette size={11} aria-hidden /> {card.artist}
          </span>
        )}
        {card.set?.name && (
          <span className="cpMeta">
            <Layers size={11} aria-hidden /> {card.set.name}
            {card.rarity ? ` · ${card.rarity}` : ''}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * A Yu-Gi-Oh card's structured details from the lazily-loaded catalog —
 * type line, ATK/DEF (or Link rating), Level/Rank, Pendulum Scale, card text.
 */
export function YugiohDetails({ card }: { card: YugiohCard }) {
  const typeLine = [card.type, card.race, card.attribute].filter(Boolean).join(' · ');
  const isLink = card.frameType.startsWith('link');
  const isXyz = card.frameType.startsWith('xyz');
  const stats: { label: string; value: string; icon: ReactNode }[] = [];
  // yugiohStat renders the '?' that YGOPRODeck encodes as -1.
  if (card.atk != null) stats.push({ label: 'ATK', value: yugiohStat(card.atk), icon: <Swords size={12} /> });
  if (isLink) stats.push({ label: 'LINK', value: String(card.linkval ?? 0), icon: <Link2 size={12} /> });
  else if (card.def != null) stats.push({ label: 'DEF', value: yugiohStat(card.def), icon: <Shield size={12} /> });
  if (card.level != null)
    stats.push({ label: isXyz ? 'Rank' : 'Level', value: String(card.level), icon: <Star size={12} /> });
  if (card.scale != null) stats.push({ label: 'Scale', value: String(card.scale), icon: <Layers size={12} /> });
  return (
    <>
      {typeLine && (
        <Text size={Size.Small} tone={TextTone.Muted} className="cpTypeLine">
          {typeLine}
        </Text>
      )}
      {stats.length > 0 && (
        <div className="cpCyberStats">
          {stats.map((stat) => (
            <span key={stat.label} className="cpStat">
              <span className="cpStatIcon" aria-hidden>
                {stat.icon}
              </span>
              <span className="cpStatLabel">{stat.label}</span>
              <span className="cpStatVal">{stat.value}</span>
            </span>
          ))}
        </div>
      )}
      {card.desc && (
        <div className="cpRules">
          {card.desc.split('\n').map((line, li) => (
            <p key={li} className="cpRuleLine">
              {line}
            </p>
          ))}
        </div>
      )}
      {card.archetype && (
        <div className="cpFooter">
          <span className="cpMeta">
            <Layers size={11} aria-hidden /> {card.archetype}
          </span>
        </div>
      )}
    </>
  );
}

/** Rules text with inline {W}{U}{T} symbols rendered as the real glyphs. */
function OracleText({ text }: { text: string }) {
  const paragraphs = text.split('\n');
  return (
    <div className="cpOracle">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split(/(\{[^}]+\})/g).map((chunk, chunkIndex) =>
            /^\{[^}]+\}$/.test(chunk) ? (
              <ManaSymbol key={chunkIndex} symbol={chunk} size="0.95em" />
            ) : (
              <span key={chunkIndex}>{chunk}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

/**
 * The full details body for one card, resolving its game from the id. `compact`
 * (the hover preview) suppresses the loading spinner and network flash — it
 * shows what's already resolved and nothing while an MTG lookup is in flight.
 */
export function CardDetailsBody({
  scryfallId,
  name,
  compact = false,
  headingLevel = 2,
}: {
  scryfallId?: string;
  name: string;
  compact?: boolean;
  headingLevel?: 2 | 3;
}) {
  const t = useT();
  // A Cyberpunk card is recognized by its id living in the bundled catalog; its
  // full details ship with the app, so we never hit Scryfall for it. A Yu-Gi-Oh
  // card is recognized by its all-digits passcode; its details come from the
  // lazily-fetched catalog, never Scryfall.
  const cyber = scryfallId ? cyberpunkCard(scryfallId) : undefined;
  const isYgo = !!scryfallId && isYugiohId(scryfallId);
  const [ygo, setYgo] = useState<YugiohCard | undefined>(scryfallId ? yugiohCard(scryfallId) : undefined);
  const [details, setDetails] = useState<CardDetails | null>(
    scryfallId ? (DETAILS.get(scryfallId) ?? null) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setYgo(scryfallId ? yugiohCard(scryfallId) : undefined);
    if (!scryfallId || !isYugiohId(scryfallId) || yugiohCard(scryfallId)) return;
    let cancelled = false;
    loadYugiohCatalog()
      .then(() => {
        if (!cancelled) setYgo(yugiohCard(scryfallId));
      })
      // Offline (or a deployment missing the catalog): stop at the card's name
      // rather than spinning forever, exactly like the Scryfall path does.
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scryfallId]);

  useEffect(() => {
    setDetails(scryfallId ? (DETAILS.get(scryfallId) ?? null) : null);
    setFailed(false);
    if (!scryfallId || cyber || isYgo) return;
    if (DETAILS.get(scryfallId)) return;
    let cancelled = false;
    fetchDetails(scryfallId)
      .then((loaded) => {
        if (!cancelled) setDetails(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scryfallId, cyber, isYgo]);

  const costSymbols = parseCost(details?.manaCost);

  return (
    <>
      <div className="cpTitleRow">
        <Heading level={headingLevel} noMargin>
          {name}
        </Heading>
        {!cyber && !isYgo && costSymbols.length > 0 && <ManaCost cost={details?.manaCost} size="1.05rem" />}
      </div>
      {cyber ? (
        <CyberpunkDetails card={cyber} />
      ) : ygo ? (
        <YugiohDetails card={ygo} />
      ) : isYgo ? (
        compact || failed ? null : (
          <div className="cpLoading">
            <Spinner size="sm" aria-label={t('cpLoading')} />
            <Text size={Size.Small} tone={TextTone.Subtle}>
              {t('cpLoading')}
            </Text>
          </div>
        )
      ) : (
        <>
          {details?.typeLine && (
            <Text size={Size.Small} tone={TextTone.Muted} className="cpTypeLine">
              {details.typeLine}
              {details.power != null && details.toughness != null && (
                <span className="cpPT">
                  <Swords size={11} aria-hidden /> {details.power}/{details.toughness}
                </span>
              )}
            </Text>
          )}
          {details?.oracleText ? (
            <OracleText text={details.oracleText} />
          ) : failed || compact ? null : scryfallId ? (
            <div className="cpLoading">
              <Spinner size="sm" aria-label={t('cpLoading')} />
              <Text size={Size.Small} tone={TextTone.Subtle}>
                {t('cpLoading')}
              </Text>
            </div>
          ) : null}
          {details?.flavorText && (
            <Text size={Size.Small} tone={TextTone.Subtle} className="cpFlavor">
              {details.flavorText}
            </Text>
          )}
          <div className="cpFooter">
            {details?.artist && (
              <span className="cpMeta" title={t('cpArtist')}>
                <Palette size={11} aria-hidden /> {details.artist}
              </span>
            )}
            {details?.setName && (
              <span className="cpMeta">
                <Layers size={11} aria-hidden /> {details.setName}
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * Card details for an id: the cached copy immediately when we have one, else a
 * fetch that fills in. Shared so anything wanting a card's cost or type line
 * (the details body, the hover mana cost) reads the same cache rather than
 * re-implementing the fetch-or-cache dance.
 */
export function useCardDetails(scryfallId: string | undefined): CardDetails | null {
  const cyber = scryfallId ? cyberpunkCard(scryfallId) : undefined;
  const [details, setDetails] = useState<CardDetails | null>(
    scryfallId ? (DETAILS.get(scryfallId) ?? null) : null,
  );
  useEffect(() => {
    setDetails(scryfallId ? (DETAILS.get(scryfallId) ?? null) : null);
    if (!scryfallId || cyber || isYugiohId(scryfallId) || DETAILS.get(scryfallId)) return;
    let cancelled = false;
    fetchDetails(scryfallId)
      .then((loaded) => {
        if (!cancelled) setDetails(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [scryfallId, cyber]);
  return details;
}

/** True when this id has details we can render instantly (no network) — a
 *  bundled Cyberpunk card, a Yu-Gi-Oh card whose catalog has loaded, or an
 *  already-cached MTG lookup. */
export function hasInstantDetails(id: string | undefined): boolean {
  if (!id) return false;
  if (isYugiohId(id)) return yugiohCard(id) !== undefined;
  return cyberpunkCard(id) !== undefined || DETAILS.has(id);
}

/** Warm the offline indexes (MTG precons / Yu-Gi-Oh catalog) + fetch, so
 *  hovering resolves quickly. */
export function primeDetails(scryfallId: string | undefined): void {
  if (!scryfallId || cyberpunkCard(scryfallId) || DETAILS.has(scryfallId)) return;
  if (isYugiohId(scryfallId)) {
    primeYugiohCatalog();
    return;
  }
  fetchDetails(scryfallId).catch(() => {});
}
