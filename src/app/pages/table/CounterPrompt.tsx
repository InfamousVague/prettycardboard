import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Text, Size, TextTone } from '@glacier/react';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { applyPreferences, loadPreferences, savePreferences } from '../../preferences.ts';
import { onMessage } from '../../net/ws.ts';
import { oracleFacts, primePrintedPT } from '../../data/printedPt.ts';
import type { PlusCounters } from '../../data/printedPt.ts';
import { isCreature } from './boardModes.ts';
import { playSound } from '../../sounds.ts';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';

/**
 * "Add the +1/+1 counters?" — offered when a spell or permanent that hands out
 * +1/+1 counters resolves, so the bookkeeping is one tap instead of a trip
 * through each creature's counter menu.
 *
 * WHY THIS RUNS ON EVERY CLIENT RATHER THAN THE CASTER'S. `card.counter` is
 * scoped to the actor's OWN zones server-side (game.rs finds the card only in
 * `room.players[pi]`), so the player who cast Giant Growth physically cannot
 * put its counters on an opponent's creature. But the resolve event is
 * broadcast to everyone and the stack entry carries `targetIid`, so each client
 * can independently work out which of the affected creatures are on ITS board
 * and offer only those. The caster gets asked about their own creatures, the
 * target's controller gets asked about theirs, and nobody is ever asked about a
 * card they cannot legally touch.
 *
 * The offer is deliberately never automatic on arrival: see `autoCounters`,
 * which is what the prompt's "Always" answer sets.
 */

/** One live offer, keyed by the resolving card's instance id. */
interface Offer {
  /** The resolving card's iid — also the de-dupe key. */
  id: string;
  sourceName: string;
  counters: PlusCounters;
  /** Candidate recipients, worked out when the resolve arrived. Re-filtered
   * against the live board at apply time, because a `self` card is still on
   * the stack at that point and lands a beat later. */
  candidates: string[];
}

/** Which of MY cards this effect would put counters on. */
function candidatesFor(
  entry: CardInst & { targetIid?: string; ownerSeat?: number },
  counters: PlusCounters,
  me: TablePlayer,
): string[] {
  const mine = me.battlefield.filter(isCreature).map((card) => card.iid);
  switch (counters.scope) {
    case 'self':
      // Still on the stack right now; it will be on my battlefield by the time
      // Apply is pressed, so it is a candidate on ownership alone.
      return entry.ownerSeat === me.seat ? [entry.iid] : [];
    case 'target':
      return entry.targetIid && mine.includes(entry.targetIid) ? [entry.targetIid] : [];
    case 'each-yours':
      // "each creature you control" is the CASTER's board, so this only ever
      // offers to the player who cast it.
      return entry.ownerSeat === me.seat ? mine : [];
    case 'each':
      return mine;
    default:
      return [];
  }
}

export function CounterPrompt({ room, me }: { room: RoomState; me: TablePlayer | undefined }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const auto = usePreference('autoCounters') ?? false;
  const [offers, setOffers] = useState<Offer[]>([]);

  // The listener is registered once and reads the live room/seat through refs:
  // resubscribing on every room snapshot would drop events mid-flight.
  const roomRef = useRef(room);
  const meRef = useRef(me);
  roomRef.current = room;
  meRef.current = me;

  useEffect(
    () =>
      onMessage((message) => {
        if (message.type !== 'room.event') return;
        const action = message.action as { kind?: string; iid?: string };
        if (action.kind !== 'stack.resolve' || !action.iid) return;
        const mine = meRef.current;
        if (!mine) return;
        // Read the entry BEFORE the follow-up snapshot clears the stack. The
        // store has no `stack.resolve` case, so it is still here.
        const stack = (roomRef.current.stack ?? []) as (CardInst & {
          targetIid?: string;
          ownerSeat?: number;
        })[];
        const entry = stack.find((card) => card.iid === action.iid);
        if (!entry) return;
        // The oracle lookup is lazy; nudge it so the NEXT copy of this card is
        // known even when this one resolves before the fetch lands.
        primePrintedPT(entry);
        const counters = oracleFacts(entry.scryfallId)?.plusCounters;
        if (!counters) return;
        const candidates = candidatesFor(entry, counters, mine);
        if (candidates.length === 0) return;
        setOffers((prev) =>
          prev.some((o) => o.id === entry.iid)
            ? prev
            : [...prev, { id: entry.iid, sourceName: entry.name, counters, candidates }],
        );
      }),
    [],
  );

  const dismiss = useCallback((id: string) => {
    setOffers((prev) => prev.filter((offer) => offer.id !== id));
  }, []);

  const apply = useCallback(
    (offer: Offer) => {
      const mine = meRef.current;
      if (mine) {
        const onBoard = new Set(mine.battlefield.map((card) => card.iid));
        for (const iid of offer.candidates) {
          // A creature that died or moved while the prompt was up is simply
          // skipped rather than sending an iid the server will reject.
          if (onBoard.has(iid)) {
            act({ kind: 'card.counter', iid, counter: '+1/+1', delta: offer.counters.n });
          }
        }
      }
      dismiss(offer.id);
    },
    [act, dismiss],
  );

  // Auto-apply fires from here, not from the listener: a `self` card is still
  // on the stack when its resolve arrives, so applying immediately would name
  // an iid the server cannot find yet. Waiting for it to appear on the board
  // makes the automatic path take exactly the same route as the manual one.
  useEffect(() => {
    if (!auto || offers.length === 0 || !me) return;
    const onBoard = new Set(me.battlefield.map((card) => card.iid));
    for (const offer of offers) {
      if (offer.candidates.some((iid) => onBoard.has(iid))) apply(offer);
    }
  }, [auto, offers, me, apply]);

  // A prompt arriving for you is worth an ear, same as a trigger.
  const chime = useRef(0);
  useEffect(() => {
    if (!auto && offers.length > chime.current) playSound('ping');
    chime.current = offers.length;
  }, [offers.length, auto]);

  if (!me || auto || offers.length === 0) return null;

  return (
    <div className="triggerPrompts">
      <AnimatePresence>
        {offers.map((offer) => {
          const { n } = offer.counters;
          const unit =
            n === 1 ? t('gpCountersUnit') : t('gpCountersUnitN').replace('{n}', String(n));
          const live = offer.candidates.filter((iid) =>
            me.battlefield.some((card) => card.iid === iid),
          );
          // `self` has not landed yet, so it has no live entry to count; it is
          // always exactly one card and reads better by name anyway.
          const single = offer.counters.scope === 'self' || live.length <= 1;
          const label = single
            ? t('gpCountersOne').replace('{n}', unit).replace('{card}', offer.sourceName)
            : t('gpCountersMany').replace('{n}', unit).replace('{count}', String(live.length));
          return (
            <motion.div
              key={offer.id}
              className="triggerPrompt"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <div className="triggerPromptText">
                <Text size={Size.Small} weight="semibold">
                  {offer.sourceName}
                </Text>
                <Text size={Size.XSmall} tone={TextTone.Subtle}>
                  {label}
                </Text>
              </div>
              <div className="triggerPromptActions">
                <Button size="sm" variant="soft" onClick={() => apply(offer)}>
                  {t('gpTriggerApply')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismiss(offer.id)}>
                  {t('gpTriggerSkip')}
                </Button>
                {/* Apply this one AND stop asking. It writes the same
                    preference the Settings switch reads, so the two stay in
                    step, and it persists BEFORE applying for the reason App.tsx
                    gives: applyPreferences fires `pc:preferences` synchronously
                    and listeners re-read localStorage. */}
                <Button
                  size="sm"
                  variant="ghost"
                  title={t('gpCountersAlwaysHint')}
                  onClick={() => {
                    const next = { ...loadPreferences(), autoCounters: true };
                    savePreferences(next);
                    applyPreferences(next);
                    apply(offer);
                  }}
                >
                  {t('gpCountersAlways')}
                </Button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
