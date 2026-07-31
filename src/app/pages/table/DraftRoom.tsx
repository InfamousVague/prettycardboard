import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Button,
  Heading,
  Input,
  Pill,
  SearchField,
  SegmentedControl,
  Size,
  Spinner,
  Switch,
  Text,
  TextTone,
  useToast,
} from '@glacier/react';
import { ArrowLeft, ArrowRight, Check, Hourglass, PackageOpen, Share2, Sparkles } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { cardImage, COLOR_ORDER } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { ManaSymbol } from '../../components/Mana.tsx';
import { PackFan, SetIcon, useBoosterArt } from '../../components/packVisuals.tsx';
import { loadBoosterSets, loadSetPool, type BoosterSet, type PoolCard } from '../../data/boosterSets.ts';
import { loadPackIndex, openCollated, type PackIndex } from '../../data/packs.ts';
import { getCardMeta, hydrateCardMeta } from '../../data/scryfall.ts';
import { TYPE_LABEL, TYPE_ORDER, typeBucket, type TypeBucket } from '../deckbuilder/shared.tsx';
import * as api from '../../net/api.ts';
import * as ws from '../../net/ws.ts';
import { useGame } from '../../state/gameStore.ts';
import type { DeckCard, DraftCard, LimitedMode, RoomState, TablePlayer } from '../../net/types.ts';
import './draft.css';

/**
 * Limited: open packs at the table and play with what came out.
 *
 * Two formats share this screen because they are the same evening with one
 * step removed. A booster draft passes packs round the table a card at a time;
 * sealed hands you six packs and no decisions to make about anyone else's. The
 * pool, the build, the build clock and the deck lock are identical, so sealed
 * is not a second implementation - it is this one with the picking phase
 * skipped (see rooms::Draft::begin on the server).
 *
 * This is one component across three phases because they are one continuous
 * thing to the player - the table never leaves this screen between opening the
 * first pack and sitting down to play with what came out of it:
 *
 *   setup     the host picks a format, a set and how many packs
 *   picking   packs go round the table, one card at a time (draft only)
 *   building  each seat cuts its pool down to a deck and saves it
 *
 * When the last seat saves, this steps aside entirely and the ORDINARY pre-game
 * lobby takes over with everyone's new deck already seated. Nothing downstream
 * - lobby, start, table, match history - knows a draft happened.
 *
 * Hidden information is the server's job, not this file's: your pack and your
 * pool arrive only in your own room.state (rooms.rs `draft_view`), so there is
 * no snapshot on this client that could leak another drafter's picks.
 */

/** Packs per drafter. Three is the draft; the rest are for the curious. */
const PACK_CHOICES = [1, 2, 3, 4] as const;

/** Packs per player in sealed. Six is the tournament; four is a quicker night. */
const SEALED_PACK_CHOICES = [3, 4, 5, 6] as const;

/** Where each format's pack count starts. */
const PACK_DEFAULT: Record<LimitedMode, number> = { draft: 3, sealed: 6 };

/** Seconds on the pick clock. 0 is untimed, for tables that would rather talk. */
const CLOCK_CHOICES = [0, 30, 60, 90] as const;

/** Seconds to build in. Off by default: a build clock that fires builds someone
 *  ELSE'S deck for them, which no table should opt into by accident. */
const BUILD_CHOICES = [0, 300, 600, 900] as const;

/** A drafted deck is forty cards, lands included. */
const DECK_TARGET = 40;

/** How many recent picks the "waiting" fan shows. */
const RECENT_PICKS = 7;

/** Sets offered in the picker before anyone searches. */
const SUGGESTED = ['fdn', 'mh3', 'ltr', 'dsk', 'blb', 'znr', 'khm', 'dom'];

/** A search hands back a list to scan, not a catalogue to browse. */
const RESULT_MAX = 40;

/** Mana values at or above this share the last column of the curve. */
const CURVE_MAX = 6;

export function DraftRoom({
  room,
  me,
  isHost,
  spectating,
  onShare,
}: {
  room: RoomState;
  me?: TablePlayer;
  isHost: boolean;
  spectating: boolean;
  onShare: () => void;
}) {
  const t = useT();
  const draft = room.draft ?? null;
  const art = useBoosterArt(draft?.set ?? '');

  return (
    <div className="dfRoot">
      {art && <div className="dfBackdrop" style={{ backgroundImage: `url("${art}")` }} aria-hidden />}
      {!draft ? (
        <DraftSetup room={room} isHost={isHost} onShare={onShare} />
      ) : draft.phase === 'picking' ? (
        <DraftPicking room={room} spectating={spectating} />
      ) : (
        <DraftBuilding room={room} me={me} spectating={spectating} />
      )}
      <p className="dfFoot">
        <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
          {draft?.mode === 'sealed' ? t('dfLedeSealed') : t('dfLede')}
        </Text>
      </p>
    </div>
  );
}

// --- setup ----------------------------------------------------------------

/**
 * The host's console. Only sets with REAL collation are offered: a pool opened
 * off an inferred pack would deal the wrong number of rares from the wrong
 * sheet, which is the one thing limited cannot be approximate about.
 */
function DraftSetup({ room, isHost, onShare }: { room: RoomState; isHost: boolean; onShare: () => void }) {
  const t = useT();
  const { toast } = useToast();
  const draftStart = useGame((state) => state.draftStart);
  const [sets, setSets] = useState<BoosterSet[] | null>(null);
  const [index, setIndex] = useState<PackIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<LimitedMode>('draft');
  const [rounds, setRounds] = useState(PACK_DEFAULT.draft);
  const [clock, setClock] = useState<number>(60);
  const [buildClock, setBuildClock] = useState<number>(0);
  const [lockDecks, setLockDecks] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([loadBoosterSets(), loadPackIndex()])
      .then(([list, idx]) => {
        if (!alive) return;
        setSets(list);
        setIndex(idx);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  /** Every set that can actually be drafted, newest first. */
  const draftable = useMemo(() => {
    if (!sets || !index) return [];
    return sets.filter((item) => !!index.specs[item.code] && !item.preview);
  }, [sets, index]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle) {
      return draftable
        .filter((item) => item.name.toLowerCase().includes(needle) || item.code.includes(needle))
        .slice(0, RESULT_MAX);
    }
    const picks: BoosterSet[] = [];
    const seen = new Set<string>();
    for (const wanted of SUGGESTED) {
      const found = draftable.find((item) => item.code === wanted);
      if (!found) continue;
      picks.push(found);
      seen.add(found.code);
    }
    for (const item of draftable) {
      if (picks.length >= 12) break;
      if (seen.has(item.code)) continue;
      picks.push(item);
      seen.add(item.code);
    }
    return picks;
  }, [draftable, query]);

  const chosen = draftable.find((item) => item.code === code) ?? null;
  const drafters = room.players.length;
  const sealed = mode === 'sealed';
  // Two seats is the minimum that can pass a pack to anyone. Sealed passes
  // nothing, so one player can open a pool alone and invite an opponent after.
  const enough = sealed || drafters >= 2;
  const packChoices = sealed ? SEALED_PACK_CHOICES : PACK_CHOICES;

  // Each format has its own sensible pack count, and carrying three packs over
  // into sealed (or six into a draft) would be a worse default than either.
  const changeMode = useCallback((value: string) => {
    const next = value as LimitedMode;
    setMode(next);
    setRounds(PACK_DEFAULT[next]);
  }, []);

  const begin = useCallback(async () => {
    if (!chosen || busy) return;
    setBusy(true);
    try {
      // Every pack is collated HERE, from the bundled sheets, and uploaded with
      // the draft - the server has no idea what a Magic set is (see the note on
      // rooms::DraftCard). One pack per drafter per round.
      const wanted = rounds * drafters;
      const packs: DraftCard[][] = [];
      for (let n = 0; n < wanted; n += 1) {
        const cards = await openCollated(chosen.code);
        if (cards.length === 0) throw new Error('empty pack');
        packs.push(
          cards.map((card) => ({
            id: card.id,
            name: card.name,
            rarity: card.rarity,
            foil: card.foil,
            colors: card.colors.join(''),
            typeLine: card.typeLine,
            cn: card.collectorNumber,
          })),
        );
      }
      // The set's own basics ride along, unused unless the build clock has to
      // finish someone's deck for them. Best-effort: a pool with no lands is a
      // worse forced deck, not a broken draft.
      let basics: DraftCard[] = [];
      if (buildClock > 0) {
        basics = await loadSetPool(chosen.code)
          .then((pool) =>
            pool.basic.slice(0, 8).map((card) => ({
              id: card.id,
              name: card.name,
              rarity: card.rarity,
              foil: false,
              colors: card.colors.join(''),
              typeLine: card.typeLine,
              cn: card.collectorNumber,
            })),
          )
          .catch(() => []);
      }
      draftStart({
        set: chosen.code,
        setName: chosen.name,
        mode,
        rounds,
        pickSeconds: sealed ? 0 : clock,
        buildSeconds: buildClock,
        lockDecks,
        basics,
        packs,
      });
    } catch {
      toast({ tone: 'danger', message: t('dfFailed') });
    } finally {
      setBusy(false);
    }
  }, [chosen, busy, mode, sealed, rounds, drafters, clock, buildClock, lockDecks, draftStart, toast, t]);

  if (!isHost) {
    return (
      <div className="dfWait">
        <PackageOpen size={30} aria-hidden />
        <Text size={Size.Medium}>{t('dfWaitHost')}</Text>
        <Text size={Size.Small} tone={TextTone.Muted}>
          {`${drafters} / ${room.seats}`}
        </Text>
        <Button variant="ghost" size="sm" onClick={onShare}>
          <Share2 size={16} aria-hidden />
          {t('dfInvite')}
        </Button>
      </div>
    );
  }

  return (
    <div className="dfSetup">
      <header className="dfSetupHead">
        <Heading level={2}>{sealed ? t('dfSetupSealed') : t('dfSetup')}</Heading>
        <Button variant="ghost" size="sm" onClick={onShare}>
          <Share2 size={16} aria-hidden />
          {t('dfInvite')}
        </Button>
      </header>

      {/* First, because it changes what everything below it means: the pack
          count, the clocks, and whether there is a picking phase at all. */}
      <div className="dfMode">
        <SegmentedControl
          size="sm"
          value={mode}
          onValueChange={changeMode}
          aria-label={t('dfMode')}
          options={[
            { value: 'draft', label: t('dfModeDraft') },
            { value: 'sealed', label: t('dfModeSealed') },
          ]}
        />
        <Text size={Size.XSmall} tone={TextTone.Subtle}>
          {sealed ? t('dfSealedHint') : t('dfDraftHint')}
        </Text>
      </div>

      {failed ? (
        <Text size={Size.Small} tone={TextTone.Muted}>
          {t('dfSetsFailed')}
        </Text>
      ) : !sets ? (
        <div className="dfLoading">
          <Spinner size="sm" />
        </div>
      ) : (
        <>
          <SearchField
            size="sm"
            value={query}
            onValueChange={setQuery}
            placeholder={t('dfSearch')}
            aria-label={t('dfSearch')}
          />
          <ul className="dfSets" aria-label={t('dfSet')}>
            {results.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className="dfSet"
                  data-active={item.code === code || undefined}
                  aria-pressed={item.code === code}
                  onClick={() => setCode(item.code)}
                >
                  {item.iconUrl && (
                    <SetIcon className="dfSetIcon" code={item.code} url={item.iconUrl} />
                  )}
                  <span className="dfSetName">{item.name}</span>
                  <span className="dfSetYear">{item.released.slice(0, 4)}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="dfOptions">
            <label className="dfOption">
              <span className="dfOptionLabel">{t('dfPacks')}</span>
              <SegmentedControl
                size="sm"
                value={String(rounds)}
                onValueChange={(value) => setRounds(Number(value))}
                options={packChoices.map((n) => ({ value: String(n), label: String(n) }))}
              />
            </label>
            {/* Sealed has no picks, so there is nothing to put a clock on. */}
            {!sealed && (
              <label className="dfOption">
                <span className="dfOptionLabel">{t('dfClock')}</span>
                <SegmentedControl
                  size="sm"
                  value={String(clock)}
                  onValueChange={(value) => setClock(Number(value))}
                  options={CLOCK_CHOICES.map((n) => ({
                    value: String(n),
                    label: n === 0 ? t('dfNoClock') : `${n}s`,
                  }))}
                />
              </label>
            )}
            <label className="dfOption">
              <span className="dfOptionLabel">{t('dfBuildClock')}</span>
              <SegmentedControl
                size="sm"
                value={String(buildClock)}
                onValueChange={(value) => setBuildClock(Number(value))}
                options={BUILD_CHOICES.map((n) => ({
                  value: String(n),
                  label: n === 0 ? t('dfNoClock') : `${n / 60}m`,
                }))}
              />
            </label>
          </div>

          <div className="dfToggles">
            <Switch label={t('dfLockDecks')} checked={lockDecks} onCheckedChange={setLockDecks} />
            <Text size={Size.XSmall} tone={TextTone.Subtle}>
              {lockDecks ? t('dfLockOn') : t('dfLockOff')}
            </Text>
            {buildClock > 0 && (
              <Text size={Size.XSmall} tone={TextTone.Subtle}>
                {t('dfBuildClockHint')}
              </Text>
            )}
          </div>

          <div className="dfSetupFoot">
            <Button size="lg" fullWidth loading={busy} disabled={!chosen || !enough} onClick={() => void begin()}>
              <PackageOpen size={18} aria-hidden />
              {busy ? t('dfCollating') : sealed ? t('dfStartSealed') : t('dfStart')}
            </Button>
            {!enough && (
              <Text size={Size.XSmall} tone={TextTone.Muted}>
                {t('dfNeedPlayers')}
              </Text>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// --- picking --------------------------------------------------------------

function DraftPicking({ room, spectating }: { room: RoomState; spectating: boolean }) {
  const t = useT();
  const draft = room.draft!;
  const draftPick = useGame((state) => state.draftPick);
  const mine = draft.seats.find((seat) => seat.pack);
  const pack = mine?.pack ?? [];
  const pool = mine?.pool ?? [];

  // Optimistic: the pick is gone from the pack the instant it is clicked, so a
  // slow round trip cannot be mistaken for a dead card. Cleared whenever the
  // server's own view of "have I picked" changes.
  const [sent, setSent] = useState<string | null>(null);
  const picked = mine?.picked ?? false;
  useEffect(() => {
    setSent(null);
  }, [picked, draft.round, draft.pick]);

  const take = useCallback(
    (index: number, id: string) => {
      if (picked || sent) return;
      setSent(id);
      draftPick(index, id);
    },
    [picked, sent, draftPick],
  );

  const waiting = picked || !!sent;
  const recent = pool.slice(-RECENT_PICKS);
  // Odd packs go left, even packs go right - so a pack arriving in an odd round
  // came from the right. The grid slides in from that side, which is the only
  // thing on screen that says a pack physically moved rather than reshuffled.
  const fromRight = draft.round % 2 === 1;
  // How big this pack STARTED. Every seat has taken one card per pick, so the
  // cards still in hand plus the picks already made is the original size - and
  // that is what turns "pick 3" into "pick 3 of 15".
  const packSize = pack.length > 0 ? pack.length + draft.pick - 1 : 0;

  // What to actually do, in one line. A draft is a game of doing the same small
  // thing fifteen times in a row, and someone who has never drafted cannot tell
  // from a grid of cards whether they are meant to pick one, pick several, or
  // wait - so the screen says which, every single pass.
  const coach = spectating
    ? t('dfCoachWatch')
    : waiting
      ? t('dfCoachWait')
      : pack.length === 0
        ? t('dfCoachPack')
        : t('dfCoachPick');

  return (
    <div className="dfPickRoot">
      <DraftBar room={room} />

      <div className="dfPickMain">
        <div className="dfStage">
          <p className="dfCoach" role="status">
            <Sparkles size={14} aria-hidden />
            <Text as="span" size={Size.Small}>
              {coach}
            </Text>
          </p>

          {spectating ? (
            <div className="dfWait">
              <Text size={Size.Medium}>{t('dfSpectating')}</Text>
            </div>
          ) : waiting ? (
            <div className="dfWaiting">
              <Spinner size="sm" />
              <Text size={Size.Medium}>{t('dfWaitTable')}</Text>
              {/* The picks so far, in the dock's own fan - a reminder of what you
                  are actually building while the pack goes round. */}
              {recent.length > 0 && (
                <div className="dfRecent">
                  <PackFan cards={recent} label={t('dfRecent')} feature />
                </div>
              )}
            </div>
          ) : pack.length === 0 ? (
            <div className="dfWait">
              <Spinner size="sm" />
              <Text size={Size.Medium}>{t('dfWaitPack')}</Text>
            </div>
          ) : (
            <>
              <p className="dfPackNote">
                <Text as="span" size={Size.Small} tone={TextTone.Muted}>
                  {`${t('dfPick')} ${draft.pick} / ${packSize} · ${t('dfCardsLeft')}: ${pack.length}`}
                </Text>
              </p>
              <AnimatePresence mode="wait" initial={false}>
                <motion.ul
                  key={`${draft.round}-${draft.pick}`}
                  className="dfPack"
                  aria-label={t('dfPackLabel')}
                  initial={{ opacity: 0, x: fromRight ? 90 : -90 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: fromRight ? -60 : 60 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                >
                  {pack.map((card, index) => (
                    <li
                      key={`${card.id}-${index}`}
                      className="dfPick"
                      data-rarity={card.rarity}
                      data-preview-src={cardImage(card.id)}
                      data-preview-name={card.name}
                    >
                      <GameCard
                        name={card.name}
                        imageUrl={cardImage(card.id)}
                        fluid
                        foil={card.foil}
                        tilt={6}
                        onClick={() => take(index, card.id)}
                      />
                    </li>
                  ))}
                </motion.ul>
              </AnimatePresence>
            </>
          )}
        </div>

        <div className="dfRail">
          <DraftPool cards={pool} />
          <DraftRoster room={room} />
        </div>
      </div>
    </div>
  );
}

/**
 * Who is at the table and what each of them is doing right now.
 *
 * A draft is the one table state where everyone acts at once and nobody can see
 * anyone else's cards, so without this the other seats are pure guesswork: you
 * cannot tell whether the pack is late because someone is agonising or because
 * someone has disconnected. Names, a per-seat state and a running pick count
 * are the whole of what can be honestly shown - never WHAT they took.
 */
function DraftRoster({ room }: { room: RoomState }) {
  const t = useT();
  const draft = room.draft!;
  const building = draft.phase === 'building';
  const pending = draft.seats.filter((seat) => (building ? !seat.built : !seat.picked));
  const nameOf = (userId: string) =>
    room.players.find((player) => player.userId === userId)?.username ?? '—';

  return (
    <aside className="dfRoster" aria-label={t('dfRoster')}>
      <h3 className="dfRosterHead">{t('dfRoster')}</h3>
      <ul className="dfRosterList">
        {draft.seats.map((seat) => {
          const done = building ? seat.built : seat.picked;
          return (
            <li key={seat.userId} className="dfRosterRow" data-done={done || undefined}>
              <span className="dfRosterState" aria-hidden>
                {done ? <Check size={13} /> : <Hourglass size={13} />}
              </span>
              <span className="dfRosterName">{nameOf(seat.userId)}</span>
              <span className="dfRosterWhat">
                {done
                  ? building
                    ? t('dfReady')
                    : t('dfPicked')
                  : building
                    ? t('dfBuilding')
                    : t('dfThinking')}
              </span>
              <span className="dfRosterCount" title={t('dfDrafted')}>
                {seat.poolCount}
              </span>
            </li>
          );
        })}
      </ul>
      {pending.length > 0 && (
        <p className="dfRosterWait">
          {`${t('dfWaitingOn')}: ${pending.map((seat) => nameOf(seat.userId)).join(', ')}`}
        </p>
      )}
    </aside>
  );
}

/**
 * Everything you have taken so far, and what it adds up to.
 *
 * A draft is decided by the shape of a pool rather than by any one card in it,
 * and by pick twenty nobody remembers whether they are short on two-drops or
 * accidentally three colours deep. Counting that up is exactly the bookkeeping
 * a screen should do for you, so the running totals sit beside the pack the
 * whole way through: the curve, the colours, and the type split.
 *
 * This is your own pool only. The server never sends anyone else's (rooms.rs
 * `draft_view` redacts every seat but yours), so there is nothing here that
 * could leak - and the counts are computed from what you already hold.
 */
function DraftPool({ cards }: { cards: DraftCard[] }) {
  const t = useT();

  // Mana value is the one thing a pick does NOT arrive with: packs are dealt
  // from the bundled collation tuples, which carry a name, colours and a type
  // line but no cost (data/packs.ts, CardTuple). So costs are filled in from
  // the shared card registry, hydrated in the background - while the colour and
  // type splits below come straight off the pick and never wait for a network.
  const [costs, setCosts] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let alive = true;
    const ids = cards.map((card) => card.id);
    void hydrateCardMeta(ids)
      .then(() => {
        if (!alive) return;
        setCosts((current) => {
          const next = new Map(current);
          let changed = false;
          for (const id of ids) {
            if (next.has(id)) continue;
            const meta = getCardMeta(id);
            if (!meta) continue;
            next.set(id, meta.manaValue);
            changed = true;
          }
          // Same map back when nothing was learned, so a pool that is already
          // fully known cannot re-render itself in a loop.
          return changed ? next : current;
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cards]);

  const stats = useMemo(() => {
    const curve = new Array<number>(CURVE_MAX + 1).fill(0);
    const types = new Map<TypeBucket, number>();
    const colors = new Map<string, number>();
    let sum = 0;
    let costed = 0;
    for (const card of cards) {
      const bucket = typeBucket(card);
      types.set(bucket, (types.get(bucket) ?? 0) + 1);
      // `colors` arrives joined ('WU'), so iterating the string IS the split.
      for (const color of card.colors) colors.set(color, (colors.get(color) ?? 0) + 1);
      // Lands sit off the curve: they cost nothing to cast, and counting them
      // would drag the average toward a zero nobody ever actually pays.
      if (bucket === 'land') continue;
      const mv = costs.get(card.id);
      if (mv === undefined) continue;
      const column = Math.min(Math.round(mv), CURVE_MAX);
      curve[column] = (curve[column] ?? 0) + 1;
      sum += mv;
      costed += 1;
    }
    return {
      curve,
      // The tallest column sets the scale, floored at one so an empty curve
      // cannot divide by zero and a single card does not fill the panel.
      peak: Math.max(1, ...curve),
      colors,
      types,
      avg: costed > 0 ? sum / costed : 0,
      costed,
    };
  }, [cards, costs]);

  // Newest first - the card you just took is the one you are still thinking
  // about. The original pool position rides along so keys stay put as it grows.
  const newest = useMemo(
    () => cards.map((card, index) => ({ card, index })).reverse(),
    [cards],
  );

  const typeRows = TYPE_ORDER.map((bucket) => [bucket, stats.types.get(bucket) ?? 0] as const).filter(
    ([, count]) => count > 0,
  );

  return (
    <section className="dfTally" aria-label={t('dfPool')}>
      <header className="dfTallyHead">
        <h3 className="dfRosterHead">{t('dfPool')}</h3>
        <span className="dfRosterCount">{cards.length}</span>
      </header>

      {cards.length === 0 ? (
        <p className="dfRosterWait">{t('dfPoolEmpty')}</p>
      ) : (
        <>
          <div className="dfStat">
            <span className="dfStatLabel">
              {t('dbCurve')}
              {stats.costed > 0 && (
                <span className="dfStatNote">{`${t('dfAvgMv')} ${stats.avg.toFixed(1)}`}</span>
              )}
            </span>
            <ol className="dfCurve">
              {stats.curve.map((count, mv) => (
                <li key={mv} className="dfCurveCol">
                  <span className="dfCurveCount">{count > 0 ? count : ''}</span>
                  <span className="dfCurveTrack">
                    <span
                      className="dfCurveBar"
                      style={{ height: `${(count / stats.peak) * 100}%` }}
                    />
                  </span>
                  <span className="dfCurveTick">{mv === CURVE_MAX ? `${CURVE_MAX}+` : mv}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="dfStat">
            <span className="dfStatLabel">{t('dbColors')}</span>
            <ul className="dfPips">
              {COLOR_ORDER.map((color) => {
                const count = stats.colors.get(color) ?? 0;
                return (
                  <li key={color} className="dfPip" data-off={count === 0 || undefined}>
                    <ManaSymbol symbol={color} size="0.95rem" />
                    <span>{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <ul className="dfSplit">
            {typeRows.map(([bucket, count]) => (
              <li key={bucket} className="dfSplitRow">
                <span className="dfSplitName">{t(TYPE_LABEL[bucket])}</span>
                <span className="dfSplitTrack">
                  <span
                    className="dfSplitBar"
                    data-type={bucket}
                    style={{ width: `${(count / cards.length) * 100}%` }}
                  />
                </span>
                <span className="dfSplitCount">{count}</span>
              </li>
            ))}
          </ul>

          <ul className="dfTallyList">
            {newest.map(({ card, index }) => (
              <li key={`${card.id}-${index}`} className="dfTallyCard" data-rarity={card.rarity}>
                <img src={cardImage(card.id)} alt={card.name} title={card.name} loading="lazy" />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Round, pick, clock, and who the table is waiting on. */
function DraftBar({ room }: { room: RoomState }) {
  const t = useT();
  const draft = room.draft!;
  const left = useCountdown(draft.deadlineMs);

  return (
    <header className="dfBar">
      <span className="dfBarSet">
        <Text as="span" size={Size.Small} tone={TextTone.Muted}>
          {draft.setName}
        </Text>
      </span>
      <span className="dfBarWhere">
        {`${t('dfPack')} ${draft.round}/${draft.rounds} · ${t('dfPick')} ${draft.pick}`}
      </span>
      {/* Which way the packs are going. Odd packs pass left, even packs pass
          right - the real alternation, and invisible without saying so. */}
      <span className="dfPassing">
        {draft.round % 2 === 1 ? <ArrowLeft size={13} aria-hidden /> : <ArrowRight size={13} aria-hidden />}
        {draft.round % 2 === 1 ? t('dfPassLeft') : t('dfPassRight')}
      </span>
      {left !== null && (
        <span className="dfClockPill" data-low={left <= 10 || undefined}>
          {left}s
        </span>
      )}
      <ul className="dfSeats" aria-label={t('dfDrafters')}>
        {draft.seats.map((seat) => {
          const player = room.players.find((p) => p.userId === seat.userId);
          return (
            <li
              key={seat.userId}
              className="dfSeat"
              data-picked={seat.picked || undefined}
              title={player?.username ?? ''}
            >
              {seat.picked ? <Check size={12} aria-hidden /> : <span className="dfSeatDot" aria-hidden />}
              <span className="dfSeatName">{player?.username ?? '—'}</span>
            </li>
          );
        })}
      </ul>
    </header>
  );
}

/** Seconds left on the current clock, or null when there isn't one. */
function useCountdown(deadlineMs: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineMs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [deadlineMs]);
  if (!deadlineMs) return null;
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}

// --- building -------------------------------------------------------------

/**
 * Cut the pool down to a deck.
 *
 * Deliberately NOT the full deck editor: that builds against a searchable
 * universe and a saved deck id, and neither exists here. What a limited deck
 * needs is the pool in front of you, a count against forty, and as many of the
 * set's own basics as you want - so that is all this is.
 */
function DraftBuilding({
  room,
  me,
  spectating,
}: {
  room: RoomState;
  me?: TablePlayer;
  spectating: boolean;
}) {
  const t = useT();
  const { toast } = useToast();
  const draftBuilt = useGame((state) => state.draftBuilt);
  const draft = room.draft!;
  const mine = draft.seats.find((seat) => seat.pool);
  const pool = useMemo(() => mine?.pool ?? [], [mine]);
  const built = mine?.built ?? false;

  /** How many of each pool card are in the deck, by position in the pool. */
  const [inDeck, setInDeck] = useState<Set<number>>(new Set());
  /** Basic lands added, by scryfall id. */
  const [lands, setLands] = useState<Record<string, number>>({});
  const [basics, setBasics] = useState<PoolCard[]>([]);
  const [name, setName] = useState(`${draft.setName} draft`);
  const [busy, setBusy] = useState(false);
  const savedRef = useRef(false);
  const left = useCountdown(draft.deadlineMs);

  // The set's OWN basics, so a drafted deck's lands match the packs it came
  // out of. Failure is silent: the deck is still legal without them.
  useEffect(() => {
    let alive = true;
    loadSetPool(draft.set)
      .then((setPool) => {
        if (!alive) return;
        // The pool lists EVERY printing of each basic, ordered by collector
        // number - slicing the head used to hand you five Plains arts. Keep
        // one printing per basic, in WUBRG order.
        const order = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
        const seen = new Map<string, PoolCard>();
        for (const card of setPool.basic) {
          const base = order.find((n) => card.name === n || card.name === `Snow-Covered ${n}`);
          if (base && !seen.has(base)) seen.set(base, card);
        }
        setBasics(order.filter((n) => seen.has(n)).map((n) => seen.get(n)!));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [draft.set]);

  const landCount = Object.values(lands).reduce((sum, n) => sum + n, 0);
  const total = inDeck.size + landCount;

  const toggle = useCallback((index: number) => {
    setInDeck((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const bumpLand = useCallback((id: string, delta: number) => {
    setLands((current) => {
      const next = { ...current };
      const value = (next[id] ?? 0) + delta;
      if (value <= 0) delete next[id];
      else next[id] = Math.min(value, 40);
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (busy || savedRef.current) return;
    setBusy(true);
    try {
      // Quantities, not one row per copy: two Mountains are one DeckCard with
      // quantity 2, which is the shape the deck API and the table both expect.
      const counts = new Map<string, DeckCard>();
      const add = (id: string, cardName: string, quantity: number) => {
        const existing = counts.get(id);
        if (existing) existing.quantity += quantity;
        else counts.set(id, { scryfallId: id, name: cardName, quantity, board: 'main' });
      };
      for (const index of inDeck) {
        const card = pool[index];
        if (card) add(card.id, card.name, 1);
      }
      for (const [id, quantity] of Object.entries(lands)) {
        const basic = basics.find((card) => card.id === id);
        if (basic) add(id, basic.name, quantity);
      }
      const cards = [...counts.values()];
      const cover = pool[[...inDeck][0] ?? 0]?.id ?? null;
      const { id } = await api.createDeck(name.trim() || `${draft.setName} draft`, 'draft', cards, cover, 'mtg');
      savedRef.current = true;
      // Seat the deck through the ordinary path, then report the seat done -
      // two small messages rather than a second deck-loading code path on the
      // server that could drift from room.deck.set.
      ws.send({ type: 'room.deck.set', deckId: id });
      draftBuilt();
    } catch {
      toast({ tone: 'danger', message: t('dfSaveFailed') });
    } finally {
      setBusy(false);
    }
  }, [busy, inDeck, lands, pool, basics, name, draft.setName, draftBuilt, toast, t]);

  if (spectating || !me) {
    return (
      <div className="dfWait">
        <Text size={Size.Medium}>{t('dfSpectating')}</Text>
      </div>
    );
  }

  if (built) {
    const waitingOn = draft.seats.filter((seat) => !seat.built).length;
    return (
      <div className="dfBuildDone">
        <div className="dfWait">
          <Check size={30} aria-hidden />
          <Text size={Size.Medium}>{t('dfBuiltDone')}</Text>
          <Text size={Size.Small} tone={TextTone.Muted}>
            {waitingOn > 0 ? `${t('dfWaitBuild')} · ${waitingOn}` : t('dfAllBuilt')}
          </Text>
        </div>
        <DraftRoster room={room} />
      </div>
    );
  }

  return (
    <div className="dfBuild">
      <p className="dfCoach" role="status">
        <Sparkles size={14} aria-hidden />
        <Text as="span" size={Size.Small}>
          {t('dfCoachBuild')}
        </Text>
      </p>
      <header className="dfBuildHead">
        <Input
          size="sm"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={t('dfDeckName')}
          className="dfName"
        />
        <span className="dfCount" data-ok={total >= DECK_TARGET || undefined}>
          {`${total} / ${DECK_TARGET}`}
        </span>
        {left !== null && (
          <span className="dfClockPill" data-low={left <= 60 || undefined} title={t('dfBuildClock')}>
            {left >= 60 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : `${left}s`}
          </span>
        )}
        <Button size="sm" loading={busy} disabled={total < DECK_TARGET} onClick={() => void save()}>
          <Check size={16} aria-hidden />
          {t('dfSave')}
        </Button>
      </header>

      {total < DECK_TARGET && (
        <Text size={Size.XSmall} tone={TextTone.Muted}>
          {t('dfNeedCards')}
        </Text>
      )}
      {basics.length > 0 && (
        <div className="dfLands">
          <span className="dfLandsLabel">{t('dfLands')}</span>
          {basics.map((basic) => (
            <span
              key={basic.id}
              className="dfLand"
              data-preview-src={cardImage(basic.id)}
              data-preview-name={basic.name}
            >
              <img src={cardImage(basic.id)} alt={basic.name} className="dfLandArt" />
              <span className="dfLandRow">
                <button
                  type="button"
                  className="dfLandStep"
                  aria-label={`${basic.name} −`}
                  onClick={() => bumpLand(basic.id, -1)}
                >
                  −
                </button>
                <span className="dfLandCount">{lands[basic.id] ?? 0}</span>
                <button
                  type="button"
                  className="dfLandStep"
                  aria-label={`${basic.name} +`}
                  onClick={() => bumpLand(basic.id, 1)}
                >
                  +
                </button>
              </span>
            </span>
          ))}
        </div>
      )}

      <ul className="dfPool" aria-label={t('dfPool')}>
        {pool.map((card, index) => {
          const chosen = inDeck.has(index);
          return (
            <li
              key={`${card.id}-${index}`}
              className="dfPoolCard"
              data-in={chosen || undefined}
              data-preview-src={cardImage(card.id)}
              data-preview-name={card.name}
            >
              <GameCard
                name={card.name}
                imageUrl={cardImage(card.id)}
                fluid
                foil={card.foil}
                tilt={0}
                selected={chosen}
                onClick={() => toggle(index)}
              />
              {chosen && (
                <Pill size="sm" tone="accent" variant="solid" className="dfPoolTick" icon={<Sparkles size={11} />}>
                  {t('dfIn')}
                </Pill>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
