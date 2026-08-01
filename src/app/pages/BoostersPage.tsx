import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Button,
  Heading,
  Pagination,
  Pill,
  SearchField,
  SegmentedControl,
  Size,
  Spinner,
  Text,
  TextTone,
  useLocale,
} from '@glacier/react';
import { ArrowLeft, ChevronRight, Sparkles } from '@glacier/icons';
import { PlayingCardPack } from '../icons/cards.ts';
import { APP_LOCALES, useT, type AppLocale } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { useCardPopup } from '../components/CardPopup.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { EmptyFan } from '../components/Skeletons.tsx';
import { boosterArtUrl, boosterCardUrl, loadBoosterSets, loadSetPool, type BoosterSet, type SetPool } from '../data/boosterSets.ts';
import { foilChancePerPack, mythicChance, openPack, specFor, type PackCard } from '../data/boosters.ts';
import { recordPackSilently } from '../data/packRecord.ts';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
import { PackOpening } from './boosters/PackOpening.tsx';
import './boosters.css';

/**
 * Boosters: browse every set that shipped in packs and open one - dressed as
 * the shop's pack wall. The marquee band wears the newest set's art and offers
 * it as the featured product; the grid below is the wall itself, box art
 * forward on notched shelf plates. The opener page is the counter: the 3D
 * display box, a drop-rates panel (games publish their odds; so do we), and
 * one unmissable OPEN PACK.
 *
 * The point is fidelity - the pack you open here has the slots that set's real
 * boosters had, drawn from the cards those boosters could actually contain,
 * with the mythic rate computed from the set's own rare/mythic counts. Groundwork
 * for draft: once a pack is trustworthy, a draft is just eight of them passed
 * around a table. All of that machinery is untouched; this file's changes are
 * presentation.
 */

/**
 * Strings this redesign introduces. i18n.ts is shared ground, so they live
 * here (same Entry shape, same fallback rule) until they are folded in; the
 * hook resolves the exact locale the app-wide useT() does.
 */
const LOCAL_MESSAGES = {
  boWallKicker: {
    en: 'The pack wall',
    es: 'El muro de sobres',
    fr: 'Le mur des boosters',
    ar: 'جدار العبوات',
  },
  boDropRates: {
    en: 'Drop rates',
    es: 'Probabilidades',
    fr: 'Taux d’obtention',
    ar: 'معدلات السحب',
  },
  boNewest: {
    en: 'Newest',
    es: 'Novedad',
    fr: 'Nouveauté',
    ar: 'الأحدث',
  },
  boEra: {
    en: 'Era',
    es: 'Época',
    fr: 'Époque',
    ar: 'الحقبة',
  },
  boOpenPackSub: {
    en: 'Tear the foil — see what is inside',
    es: 'Rasga el sobre y descubre qué hay dentro',
    fr: 'Déchirez l’emballage — voyez ce qu’il contient',
    ar: 'مزّق الغلاف واكتشف ما بداخله',
  },
} satisfies Record<string, Record<AppLocale, string>>;

function useLocalT(): (key: keyof typeof LOCAL_MESSAGES) => string {
  const locale = useLocale();
  const active: AppLocale = (APP_LOCALES as readonly string[]).includes(locale)
    ? (locale as AppLocale)
    : 'en';
  return (key) => LOCAL_MESSAGES[key][active] ?? LOCAL_MESSAGES[key].en;
}

/**
 * The set's cached poster art, or null until it is known to load. The URL only
 * becomes a background/wrapper once the browser has it, so a set with no art
 * (or a server without the cache yet) degrades to the brandless pack. An empty
 * code (nothing to feature yet) probes nothing.
 */
function useBoosterArt(code: string): string | null {
  const [ok, setOk] = useState(false);
  const url = code ? boosterArtUrl(code) : '';
  useEffect(() => {
    setOk(false);
    if (!url) return;
    const probe = new Image();
    probe.onload = () => setOk(true);
    probe.src = url;
    return () => {
      probe.onload = null;
    };
  }, [url]);
  return ok && url ? url : null;
}

/** Tiles per page of the set grid. */
const PAGE = 24;

export function BoostersPage() {
  const t = useT();
  const lt = useLocalT();
  const [sets, setSets] = useState<BoosterSet[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [decade, setDecade] = useState('all');
  const [openSet, setOpenSet] = useState<BoosterSet | null>(null);
  // Paged: ~150 sets rendered at once means ~150 art probes at once. A page
  // of tiles keeps the grid snappy and lets the server's art cache warm in
  // strides. Filters reset to the first page.
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    loadBoosterSets()
      .then((list) => alive && setSets(list))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    if (!sets) return [];
    const q = query.trim().toLowerCase();
    return sets.filter((set) => {
      if (decade !== 'all' && !set.released.startsWith(decade.slice(0, 3))) return false;
      if (!q) return true;
      return set.name.toLowerCase().includes(q) || set.code.toLowerCase().includes(q);
    });
  }, [sets, query, decade]);

  useEffect(() => {
    setPage(1);
  }, [query, decade]);

  // The marquee: loadBoosterSets sorts newest first, so [0] is the latest
  // wave on the wall. Its art paints the band; the featured plate opens it.
  const newest = sets?.[0] ?? null;
  const bandArt = useBoosterArt(newest?.code ?? '');

  if (openSet) {
    return <PackOpener set={openSet} onBack={() => setOpenSet(null)} />;
  }

  return (
    <div className="page boostersPage">
      {/* ---- the marquee band: newest set's art, big title, featured plate ---- */}
      <section className="bshBand" aria-label={t('boTitle')}>
        <div
          className="bshArt"
          style={bandArt ? { backgroundImage: `url("${bandArt}")` } : undefined}
          data-noart={bandArt ? undefined : ''}
          aria-hidden
        />
        <div className="bshScrim" aria-hidden />
        <div className="bshIntro">
          <span className="bshKicker">{lt('boWallKicker')}</span>
          <Heading level={1} noMargin className="bshTitle">
            {t('boTitle')}
          </Heading>
          <Text size={Size.Large} tone={TextTone.Muted} className="lede">
            {t('boLede')}
          </Text>
        </div>
        {newest && (
          <button type="button" className="bshFeature" onClick={() => setOpenSet(newest)}>
            <span className="bshFeatureTag">
              <Sparkles size={13} aria-hidden />
              {lt('boNewest')}
            </span>
            <span className="bshFeatureName">{newest.name}</span>
            <span className="bshFeatureMeta">
              {newest.code.toUpperCase()} · {newest.released.slice(0, 4)} · {newest.cardCount} {t('boCards')}
            </span>
            <span className="bshFeatureCta">
              <PlayingCardPack size={16} aria-hidden />
              {t('boOpenPack')}
              <ChevronRight size={14} className="bshFeatureChevron" aria-hidden />
            </span>
          </button>
        )}
      </section>

      <div className="boToolbar" role="group" aria-label={t('boSearch')}>
        <div className="boSearch">
          <SearchField value={query} onValueChange={setQuery} placeholder={t('boSearch')} aria-label={t('boSearch')} />
        </div>
        <div className="bshEra">
          <span className="bshEraLabel">{lt('boEra')}</span>
          <SegmentedControl
            size="sm"
            aria-label={t('boTitle')}
            value={decade}
            onValueChange={setDecade}
            options={[
              { value: 'all', label: t('boAll') },
              { value: '2020', label: '2020s' },
              { value: '2010', label: '2010s' },
              { value: '2000', label: '2000s' },
            ]}
          />
        </div>
      </div>

      {failed ? (
        <div className="boNotice">
          <Text tone={TextTone.Muted}>{t('boSetsFailed')}</Text>
        </div>
      ) : !sets ? (
        <div className="boNotice">
          <Spinner size="lg" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyFan quip={t('boNoSets')} />
      ) : (
        <>
          <div className="boGrid">
            {shown.slice((page - 1) * PAGE, page * PAGE).map((set, index) => (
              <SetTile key={set.code} set={set} index={index} onOpen={() => setOpenSet(set)} />
            ))}
          </div>
          {shown.length > PAGE && (
            <div className="boMore">
              <Pagination
                page={page}
                total={shown.length}
                pageSize={PAGE}
                onPageChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0 });
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** One shelf slot on the wall: the product shot on a notched plate. Entrance
 * is CSS (base state = settled), staggered by the --i index. */
function SetTile({ set, index, onOpen }: { set: BoosterSet; index: number; onOpen: () => void }) {
  const t = useT();
  const spec = specFor(set.released, set.setType);
  const art = useBoosterArt(set.code);
  return (
    <button
      type="button"
      className="boSetTile"
      onClick={onOpen}
      style={{ '--i': Math.min(index, 10) } as CSSProperties}
    >
      {/* The product shot: the display box wearing the set's art, with the
          set's three rarest cards fanned out of its bottom-right corner. */}
      <span className="boShot" aria-hidden data-noart={art ? undefined : ''}>
        <span className="boBox">
          <span className="boBoxFront" style={art ? { backgroundImage: `url("${art}")` } : undefined}>
            {set.iconUrl && <img className="boBoxIcon" src={set.iconUrl} alt="" />}
            <span className="boBoxName">{set.name}</span>
          </span>
          <span className="boBoxSide" />
        </span>
        <span className="boTileFan">
          {[0, 1, 2].map((index) => (
            <img
              key={index}
              className="boTileFanCard"
              src={boosterCardUrl(set.code, index)}
              alt=""
              loading="lazy"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ))}
        </span>
      </span>
      <span className="boSetBody">
        <span className="boSetName">{set.name}</span>
        <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} mono>
          {set.code.toUpperCase()} · {set.released.slice(0, 4)} · {set.cardCount} {t('boCards')}
        </Text>
      </span>
      <span className="boSetPills">
        <Pill size="sm" variant="outline" className="boSetSpec">
          {t(spec.labelKey)}
        </Pill>
        {set.preview && (
          <Pill size="sm" tone="accent" variant="soft">
            {t('boPreviews')}
          </Pill>
        )}
      </span>
    </button>
  );
}

/** The opened-pack view: load the set's pool once, then deal packs from it. */
function PackOpener({ set, onBack }: { set: BoosterSet; onBack: () => void }) {
  const t = useT();
  const lt = useLocalT();
  const phone = useMobileLayout();
  const art = useBoosterArt(set.code);
  const popup = useCardPopup();
  const [pool, setPool] = useState<SetPool | null>(null);
  const [failed, setFailed] = useState(false);
  const [pack, setPack] = useState<PackCard[] | null>(null);
  const [opened, setOpened] = useState(0);
  // The fullscreen opening owns the reveal; the page keeps the last pull.
  const [opening, setOpening] = useState(false);
  const spec = useMemo(() => specFor(set.released, set.setType), [set]);
  // These packs are Magic, so the back is the REAL Magic one - not the back the
  // player picked for their own table, and never a placeholder. Passing no
  // preference is deliberate: a booster's cards are face-down Magic cards.
  const backSrc = cardBackUrl(effectiveCardBack(undefined, 'mtg'));
  // Keep the latest pool for the deal handler without re-creating it per render.
  const poolRef = useRef<SetPool | null>(null);
  poolRef.current = pool;

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setPool(null);
    loadSetPool(set.code)
      .then((loaded) => alive && setPool(loaded))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [set.code]);

  const deal = () => {
    const current = poolRef.current;
    if (!current) return;
    setPack(recordPackSilently(openPack(current, spec, set.released), set.code, set.released));
    setOpened((n) => n + 1);
    setOpening(true);
  };

  const mythicRate = pool ? mythicChance(pool, set.released) : 0;
  // Classic packs have no unified foil slot, so `foilChance` is 0 for all of
  // them: they foiled a card of its own RARITY instead, and the pack rate is
  // the chance any of those three rolls lands - hence the tilde. The era maths
  // itself lives in data/boosters.ts so the pack dock prints the same number.
  const foilPerPack = foilChancePerPack(spec);
  const foilRate =
    foilPerPack === null
      ? '—'
      : foilPerPack >= 1
        ? `1 ${t('boPerPack')}`
        : `${spec.perRarityFoil ? '~' : ''}1 in ${(1 / foilPerPack).toFixed(1)}`;
  const poolSize = pool
    ? pool.common.length + pool.uncommon.length + pool.rare.length + pool.mythic.length
    : 0;

  return (
    <div className="page boostersPage boOpenerPage">
      {/* The expansion's own art fills the room the pack is opened in. */}
      {art && <div className="boSetBackdrop" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}
      <div className="boOpenerHead">
        <Button variant="ghost" size="sm" onClick={onBack} className="boBack">
          <ArrowLeft size={16} aria-hidden />
          {t('boBackToSets')}
        </Button>
        <div className="boOpenerTitle">
          {set.iconUrl && <img className="boSetIcon" src={set.iconUrl} alt="" aria-hidden />}
          <Heading level={1} noMargin>
            {set.name}
          </Heading>
          <Pill size="sm" variant="outline">
            {t(spec.labelKey)}
          </Pill>
        </div>
        <Text size={Size.Small} tone={TextTone.Muted}>
          {spec.noteKeys.map((key) => t(key)).join(' ')}
        </Text>
        {pool?.partial && (
          <Text size={Size.Small} tone={TextTone.Subtle}>
            {t('boPartialPool')}
          </Text>
        )}
      </div>

      <div className="boProductRow">
        <BoosterBox3D set={set} art={art} />
        <div className="boProductInfo">
          {/* Games publish their odds; so does the counter. Same figures the
              old stat row printed, now on a labelled drop-rates panel with
              rate meters, plus the pool size and the session's pack count. */}
          {pool && (
            <div className="bshOdds">
              <span className="bshOddsHead">
                <Sparkles size={14} aria-hidden />
                {lt('boDropRates')}
              </span>
              <div className="bshOddsRows">
                <OddsRow
                  label={t('boMythicRate')}
                  value={mythicRate > 0 ? `1 in ${(1 / mythicRate).toFixed(1)}` : '—'}
                  pct={mythicRate * 100}
                  tone="mythic"
                />
                {/* `perRarityFoil` tracks whether foils had been printed at
                    all, so pre-1999 sets show a dash rather than contradicting
                    their own "foils did not exist yet" note above. */}
                <OddsRow
                  label={t('boFoilRate')}
                  value={foilRate}
                  pct={foilPerPack == null ? 0 : Math.min(100, foilPerPack * 100)}
                  tone="foil"
                />
              </div>
              <div className="bshOddsStats">
                <span className="bshStat">
                  <span className="bshStatValue">{poolSize}</span>
                  <span className="bshStatLabel">{t('boCards')}</span>
                </span>
                <span className="bshStat">
                  <span className="bshStatValue">{opened}</span>
                  <span className="bshStatLabel">{t('boPacksOpened')}</span>
                </span>
              </div>
            </div>
          )}

          {failed ? (
            <div className="boNotice">
              <Text tone={TextTone.Muted}>{t('boPoolFailed')}</Text>
            </div>
          ) : !pool ? (
            <div className="boNotice">
              <Spinner size="lg" />
              <Text size={Size.Small} tone={TextTone.Subtle}>
                {t('boLoadingPool')}
              </Text>
            </div>
          ) : (
            /* The one unmissable action on the page. */
            <button type="button" className="bshOpen" onClick={deal}>
              <span className="bshOpenInner">
                <PlayingCardPack size={30} className="bshOpenIcon" aria-hidden />
                <span className="bshOpenText">
                  <span className="bshOpenTitle">{t('boOpenPack')}</span>
                  <span className="bshOpenSub">{lt('boOpenPackSub')}</span>
                </span>
              </span>
            </button>
          )}
        </div>
      </div>

      {failed || !pool ? null : (
        <>
          {/* The last pull stays on the page after the overlay closes, so a
              player can look back over what they got. */}
          {pack && (
            <div className="boPack">
              {pack.map((card, index) => (
                <PackSlot
                  key={`${card.id}-${index}`}
                  card={card}
                  faceUp
                  width={phone ? 104 : 150}
                  backSrc={backSrc}
                  onClick={() => popup.open({ scryfallId: card.id, name: card.name, foil: card.foil })}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {opening && pack && (
          <PackOpening
            cards={pack}
            pool={pool}
            setName={set.name}
            setIcon={set.iconUrl}
            art={art}
            backSrc={backSrc}
            onOpenAnother={deal}
            onClose={() => setOpening(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** One published rate: label, a rarity-toned meter filled to the chance, and
 * the human-readable figure. Presentation only - the numbers arrive computed. */
function OddsRow({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: 'mythic' | 'foil' }) {
  // A tiny-but-real chance still deserves a visible sliver of fill.
  const fill = pct > 0 ? Math.max(2, Math.min(100, pct)) : 0;
  return (
    <div className="bshOddsRow" data-tone={tone}>
      <span className="bshOddsLabel">{label}</span>
      <span className="bshOddsMeter" aria-hidden>
        <span className="bshOddsFill" style={{ inlineSize: `${fill}%` }} />
      </span>
      <span className="bshOddsValue">{value}</span>
    </div>
  );
}

/**
 * The set's booster display box as a real cuboid: front, side and lid faces
 * positioned in 3D, wearing the poster art, idling with a slow sway. This is
 * the product on the shelf; the pack you tear is dealt out of it.
 */
function BoosterBox3D({ set, art }: { set: BoosterSet; art: string | null }) {
  return (
    <div className="boBox3dWrap" aria-hidden>
      <div className="boBox3d" data-noart={art ? undefined : ''}>
        <span className="boBox3dFace" data-face="front" style={art ? { backgroundImage: `url("${art}")` } : undefined}>
          {set.iconUrl && <img className="boBox3dIcon" src={set.iconUrl} alt="" />}
          <span className="boBox3dName">{set.name}</span>
        </span>
        <span className="boBox3dFace" data-face="side" />
        <span
          className="boBox3dFace"
          data-face="top"
          style={art ? { backgroundImage: `url("${art}")` } : undefined}
        />
      </div>
      <span className="boBox3dShadow" />
    </div>
  );
}

const SLOT_LABEL = {
  common: 'boCommon',
  uncommon: 'boUncommon',
  rare: 'boRare',
  land: 'boLand',
  foil: 'boFoil',
  wildcard: 'boWildcard',
} as const;

/** One card in the fan: a face-down back that flips as the reveal reaches it.
 * The entrance is CSS; the flip stays sprung - it only ever runs after a deal,
 * which only ever happens in a visible, interacted-with page. */
function PackSlot({
  card,
  faceUp,
  width,
  backSrc,
  onClick,
}: {
  card: PackCard;
  faceUp: boolean;
  width: number;
  /** The player's card back - this page is outside the table, which is what
      normally publishes --pc-card-back. */
  backSrc: string;
  onClick: () => void;
}) {
  const t = useT();
  const rarityKey = card.rarity === 'mythic' ? 'boMythic' : SLOT_LABEL[card.slot];
  return (
    <div className="boSlot" data-rarity={card.rarity}>
      <motion.div
        className="boFlip"
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ type: 'spring', stiffness: 170, damping: 20 }}
      >
        <div className="boFace boFront">
          <GameCard
            name={card.name}
            imageUrl={cardImage(card.id)}
            width={width}
            foil={card.foil}
            tilt={6}
            onClick={faceUp ? onClick : undefined}
          />
        </div>
        <div
          className="boFace boCardBack"
          aria-hidden
          style={{
            width,
            height: Math.round(width * (680 / 488)),
            backgroundImage: `url("${backSrc}")`,
          }}
        />
      </motion.div>
      {faceUp && (
        <span className="boSlotTag" data-rarity={card.rarity}>
          {card.foil && card.slot !== 'foil' ? `${t('boFoil')} · ` : ''}
          {t(rarityKey)}
        </span>
      )}
    </div>
  );
}
