import { useEffect, useMemo, useRef, useState } from 'react';
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
} from '@glacier/react';
import { ArrowLeft, PackageOpen } from '@glacier/icons';
import { useT } from '../i18n.ts';
import { cardImage } from '../data/cards.ts';
import { cardBackUrl, effectiveCardBack } from '../data/cardBacks.ts';
import { usePreference } from '../hooks/usePreference.ts';
import { useCardPopup } from '../components/CardPopup.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { EmptyFan } from '../components/Skeletons.tsx';
import { boosterArtUrl, boosterCardUrl, loadBoosterSets, loadSetPool, type BoosterSet, type SetPool } from '../data/boosterSets.ts';
import { mythicChance, openPack, specFor, type PackCard } from '../data/boosters.ts';
import { useMobileLayout } from '../hooks/useIsPhone.ts';
import { PackOpening } from './boosters/PackOpening.tsx';
import './boosters.css';

/**
 * Boosters: browse every set that shipped in packs and open one.
 *
 * The point is fidelity - the pack you open here has the slots that set's real
 * boosters had, drawn from the cards those boosters could actually contain,
 * with the mythic rate computed from the set's own rare/mythic counts. Groundwork
 * for draft: once a pack is trustworthy, a draft is just eight of them passed
 * around a table.
 */
/**
 * The set's cached poster art, or null until it is known to load. The URL only
 * becomes a background/wrapper once the browser has it, so a set with no art
 * (or a server without the cache yet) degrades to the brandless pack.
 */
function useBoosterArt(code: string): string | null {
  const [ok, setOk] = useState(false);
  const url = boosterArtUrl(code);
  useEffect(() => {
    setOk(false);
    const probe = new Image();
    probe.onload = () => setOk(true);
    probe.src = url;
    return () => {
      probe.onload = null;
    };
  }, [url]);
  return ok ? url : null;
}

/** Tiles per page of the set grid. */
const PAGE = 24;

export function BoostersPage() {
  const t = useT();
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

  if (openSet) {
    return <PackOpener set={openSet} onBack={() => setOpenSet(null)} />;
  }

  return (
    <div className="page boostersPage">
      <div className="boHead">
        <Heading level={1}>{t('boTitle')}</Heading>
        <Text size={Size.Large} tone={TextTone.Muted} className="lede">
          {t('boLede')}
        </Text>
      </div>

      <div className="boToolbar" role="group" aria-label={t('boSearch')}>
        <div className="boSearch">
          <SearchField value={query} onValueChange={setQuery} placeholder={t('boSearch')} aria-label={t('boSearch')} />
        </div>
        <SegmentedControl
          size="sm"
          aria-label={t('boTitle')}
          value={decade}
          onValueChange={setDecade}
          options={[
            { value: 'all', label: 'All' },
            { value: '2020', label: '2020s' },
            { value: '2010', label: '2010s' },
            { value: '2000', label: '2000s' },
          ]}
        />
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

function SetTile({ set, index, onOpen }: { set: BoosterSet; index: number; onOpen: () => void }) {
  const t = useT();
  const spec = specFor(set.released, set.setType);
  const art = useBoosterArt(set.code);
  return (
    <motion.button
      type="button"
      className="boSetTile"
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(index, 10) * 0.03 }}
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
          {spec.label}
        </Pill>
        {set.preview && (
          <Pill size="sm" tone="accent" variant="soft">
            {t('boPreviews')}
          </Pill>
        )}
      </span>
    </motion.button>
  );
}

/** The opened-pack view: load the set's pool once, then deal packs from it. */
function PackOpener({ set, onBack }: { set: BoosterSet; onBack: () => void }) {
  const t = useT();
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
  // These packs are Magic, so the back is the Magic one regardless of which
  // game's back the player picked for their own table.
  const cardBackPref = usePreference('cardBack');
  const backSrc = cardBackUrl(effectiveCardBack(cardBackPref, 'mtg'));
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
    setPack(openPack(current, spec, set.released));
    setOpened((n) => n + 1);
    setOpening(true);
  };

  const mythicRate = pool ? mythicChance(pool, set.released) : 0;
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
            {spec.label}
          </Pill>
        </div>
        <Text size={Size.Small} tone={TextTone.Muted}>
          {spec.note}
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
      {pool && (
        <div className="boStats">
          <Stat label={t('boMythicRate')} value={mythicRate > 0 ? `1 in ${(1 / mythicRate).toFixed(1)}` : '—'} />
          <Stat
            label={t('boFoilRate')}
            value={
              spec.era === 'play'
                ? `1 ${t('boPerPack')}`
                : spec.foilChance > 0
                  ? `1 in ${(1 / spec.foilChance).toFixed(1)}`
                  : '~1 in 4.9'
            }
          />
          <Stat label={t('boCards')} value={String(poolSize)} />
          <Stat label={t('boPacksOpened')} value={String(opened)} />
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
        <>
          <div className="boActions">
            <Button size="lg" onClick={deal}>
              <PackageOpen size={18} aria-hidden />
              {t('boOpenPack')}
            </Button>
          </div>
        </>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="boStat">
      <span className="boStatValue">{value}</span>
      <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
        {label}
      </Text>
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

/** One card in the fan: a face-down back that flips as the reveal reaches it. */
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
    <motion.div
      className="boSlot"
      data-rarity={card.rarity}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
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
    </motion.div>
  );
}
