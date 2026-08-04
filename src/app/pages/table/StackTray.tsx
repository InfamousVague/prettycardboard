import { AnimatePresence, motion } from 'motion/react';
import { Button, MenuItem, SplitButton, Text, Size, TextTone } from '@glacier/react';
import {
  Check,
  Crosshair,
  PlayingCardStack,
  X,
} from '../../icons/backfilled.tsx';
import { useT } from '../../i18n.ts';
import { useApp } from '../../state/appStore.ts';
import { useGame } from '../../state/gameStore.ts';
import { enforcedRoom, stackTargetKinds } from './enforce.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import { useCardPopup } from '../../components/CardPopup.tsx';
import type { CardInst, RoomState, Zone } from '../../net/types.ts';
import { setFlightAnchor } from './juice.ts';
import { useTableUi } from './tableUi.ts';

/**
 * The shared stack: a center-floating glass tray, visible only while spells
 * are on it. Entries fan slightly; the top of the stack (last pushed) sits
 * rightmost and frontmost. Resolve defaults to the graveyard with a zone menu
 * for the exceptions; Counter is one click. Freeform - anyone seated may act.
 */

const RESOLVE_ZONES: { zone: Zone; key: 'tblGraveyard' | 'tblHand' | 'tblExile' }[] = [
  { zone: 'graveyard', key: 'tblGraveyard' },
  { zone: 'hand', key: 'tblHand' },
  { zone: 'exile', key: 'tblExile' },
];

export function StackTray({ room, canAct }: { room: RoomState; canAct: boolean }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const popup = useCardPopup();
  const myId = useApp((state) => state.identity?.userId);
  const setTargetPickerIid = useTableUi((state) => state.setTargetPickerIid);
  const stack = room.stack ?? [];
  // Enforced rooms run the Arena resolve loop: the TOP spell belongs to its
  // caster, everyone else responds or passes, and it resolves only when all
  // other live seats have passed.
  const enforced = enforcedRoom(room);
  const mySeat = room.players.find((p) => p.userId === myId)?.seat;
  const passed = room.stackPassed ?? [];
  const othersPassed = (ownerSeat: number | undefined) =>
    room.players
      .filter((p) => !p.conceded && p.seat !== ownerSeat)
      .every((p) => passed.includes(p.seat));

  const resolve = (card: CardInst, to: Zone) => {
    if (to === 'battlefield') act({ kind: 'stack.resolve', iid: card.iid, to, x: 0.5, y: 0.45 });
    else act({ kind: 'stack.resolve', iid: card.iid, to });
  };

  return (
    <AnimatePresence>
      {stack.length > 0 && (
        <motion.div
          className="stackTray"
          initial={{ opacity: 0, y: -18, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.94 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <div className="stackTrayHead">
            <PlayingCardStack size={13} />
            <Text as="span" size={Size.XSmall} weight="semibold">
              {t('gpStack')}
            </Text>
            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
              {stack.length}
            </Text>
            {(() => {
              const top = stack[stack.length - 1] as (CardInst & { ownerSeat?: number }) | undefined;
              if (top && mySeat != null && top.ownerSeat === mySeat) {
                const kinds = stackTargetKinds(top);
                // A targeting spell's hint reopens the picker; anything else
                // is just the "drag an arrow" reminder.
                if (kinds.length > 0) {
                  return (
                    <button
                      type="button"
                      className="stackAimHint stackAimHintButton"
                      onClick={() => setTargetPickerIid(top.iid)}
                    >
                      <Crosshair size={11} />
                      {`${t('stChooseTarget')} ${top.name}`}
                    </button>
                  );
                }
                return (
                  <Text as="span" size={Size.XSmall} tone={TextTone.Subtle} className="stackAimHint">
                    {t('stAimHint')}
                  </Text>
                );
              }
              return null;
            })()}
          </div>
          <div className="stackFan" ref={(el) => setFlightAnchor('stack', el)}>
            <AnimatePresence mode="popLayout">
              {stack.map((card, index) => {
                const fromTop = stack.length - 1 - index; // 0 = top
                return (
                  <motion.div
                    key={card.iid}
                    className="stackEntry"
                    data-top={fromTop === 0 || undefined}
                    style={{ zIndex: index + 1 }}
                    layout
                    initial={{ opacity: 0, y: -40, rotate: -6, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, rotate: (index - (stack.length - 1) / 2) * 3, scale: 1 }}
                    exit={{ opacity: 0, y: 34, scale: 0.8, transition: { duration: 0.22 } }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                  >
                    <GameCard
                      name={card.name}
                      imageUrl={card.faceDown && !card.revealed ? undefined : card.imageUrl || cardImage(card.scryfallId)}
                      faceDown={card.faceDown && !card.revealed}
                      width={82}
                      tilt={0}
                      onClick={() =>
                        popup.open({ scryfallId: card.scryfallId, name: card.name, imageUrl: card.imageUrl })
                      }
                    />
                    {canAct && enforced && (() => {
                      if (fromTop !== 0) return null;
                      const ownerSeat = (card as CardInst & { ownerSeat?: number }).ownerSeat;
                      const mine = ownerSeat != null && ownerSeat === mySeat;
                      if (mine) {
                        return (
                          <div className="stackActions">
                            {othersPassed(ownerSeat) ? (
                              <Button size="sm" variant="solid" onClick={() => resolve(card, 'graveyard')}>
                                <Check size={13} /> {t('gpResolve')}
                              </Button>
                            ) : (
                              <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                                {t('stWaiting')}
                              </Text>
                            )}
                          </div>
                        );
                      }
                      return (
                        <div className="stackActions">
                          {mySeat != null && passed.includes(mySeat) ? (
                            <Text as="span" size={Size.XSmall} tone={TextTone.Subtle}>
                              {t('stPassed')}
                            </Text>
                          ) : (
                            <Button size="sm" variant="solid" onClick={() => act({ kind: 'stack.pass' })}>
                              <Check size={13} /> {t('stPass')}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                    {canAct && !enforced && (
                      <div className="stackActions">
                        <SplitButton
                          size="sm"
                          variant="soft"
                          onAction={() => resolve(card, 'graveyard')}
                          menuLabel={t('gpResolve')}
                          placement="bottom"
                          menu={
                            <>
                              <MenuItem onSelect={() => resolve(card, 'battlefield')}>
                                {`${t('gpResolve')} → Battlefield`}
                              </MenuItem>
                              {RESOLVE_ZONES.map(({ zone, key }) => (
                                <MenuItem key={zone} onSelect={() => resolve(card, zone)}>
                                  {`${t('gpResolve')} → ${t(key)}`}
                                </MenuItem>
                              ))}
                            </>
                          }
                        >
                          <Check size={13} /> {t('gpResolve')}
                        </SplitButton>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act({ kind: 'stack.counter', iid: card.iid, to: 'graveyard' })}
                        >
                          <X size={13} /> {t('gpCounterIt')}
                        </Button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
