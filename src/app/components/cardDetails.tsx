import { useEffect, useState, type ReactNode } from 'react';
import { Heading, Size, Spinner, Text, TextTone } from '@glacier/react';
import { CircleDollarSign, Coins, Cpu, Layers, Palette, Swords } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cyberpunkCard, type CyberpunkCard } from '../data/cyberpunk.ts';
import { ManaCost, ManaSymbol, parseCost } from './Mana.tsx';

/**
 * The card details renderer, shared by the fullscreen CardPopup and the hover
 * preview. Given a card id (Scryfall UUID or bundled Cyberpunk id) it resolves
 * the right game's data — Cyberpunk ships offline, MTG resolves from the bundled
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

async function fetchDetails(scryfallId: string): Promise<CardDetails> {
  await ensureDetails();
  const cached = DETAILS.get(scryfallId);
  if (cached) return cached;
  const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(String(response.status));
  const card = (await response.json()) as {
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
  DETAILS.set(scryfallId, details);
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
  // full details ship with the app, so we never hit Scryfall for it.
  const cyber = scryfallId ? cyberpunkCard(scryfallId) : undefined;
  const [details, setDetails] = useState<CardDetails | null>(
    scryfallId ? (DETAILS.get(scryfallId) ?? null) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDetails(scryfallId ? (DETAILS.get(scryfallId) ?? null) : null);
    setFailed(false);
    if (!scryfallId || cyber) return;
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
  }, [scryfallId, cyber]);

  const costSymbols = parseCost(details?.manaCost);

  return (
    <>
      <div className="cpTitleRow">
        <Heading level={headingLevel} noMargin>
          {name}
        </Heading>
        {!cyber && costSymbols.length > 0 && <ManaCost cost={details?.manaCost} size="1.05rem" />}
      </div>
      {cyber ? (
        <CyberpunkDetails card={cyber} />
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

/** True when this id has details we can render instantly (no network) — a
 *  bundled Cyberpunk card or an already-cached MTG lookup. */
export function hasInstantDetails(id: string | undefined): boolean {
  if (!id) return false;
  return cyberpunkCard(id) !== undefined || DETAILS.has(id);
}

/** Warm the MTG offline precon index + fetch, so hovering resolves quickly. */
export function primeDetails(scryfallId: string | undefined): void {
  if (!scryfallId || cyberpunkCard(scryfallId) || DETAILS.has(scryfallId)) return;
  fetchDetails(scryfallId).catch(() => {});
}
