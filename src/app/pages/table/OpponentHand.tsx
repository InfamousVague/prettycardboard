import { useEffect, useRef, useState } from 'react';
import { useMotionValue } from 'motion/react';
import { Button } from '@glacier/react';
import { ChevronDown, ChevronUp } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { selectCardScale, useTableUi } from './tableUi.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { useCardPopup } from '../../components/CardPopup.tsx';
import { focusFromPointer, handSlinky, paintSlinky, restFocus, slinkyOffsets } from '../../components/slinky.ts';
import { cardBackUrl, effectiveCardBack } from '../../data/cardBacks.ts';
import type { CardInst, TablePlayer } from '../../net/types.ts';
import { onMessage } from '../../net/ws.ts';
import { HandCard, HAND_PEEK_ZONE } from './HandCard.tsx';

/** A stand-in for a hidden hand slot; HandCard renders it as a back (faceDown),
 * so name/art are never read. */
const HAND_BACK: CardInst = {
  iid: '',
  name: '',
  imageUrl: '',
  tapped: false,
  faceDown: true,
  counters: {},
  x: 0,
  y: 0,
  isToken: false,
};

/**
 * The staged opponent's hand, rendered with the EXACT same fan as my own hand -
 * the shared HandCard (dock-genie magnification), the same rest/peek/hide
 * behavior, the same bottom-of-screen strip that hangs off the edge. It just
 * shows card BACKS unless a card is revealed, and flips 180deg in mirror mode
 * (their side of the table). Mounted at the screen level so it escapes the
 * staged board's border and sits exactly where my own hand does.
 */
export function OpponentHand({ player }: { player: TablePlayer }) {
  const t = useT();
  const popup = useCardPopup();
  const cardScale = useTableUi(selectCardScale);
  const mirror = usePreference('mirrorOpponent');
  // This hand fans at screen level (outside the seat frame), so it must carry
  // its own owner's card back rather than inheriting the viewer's.
  const game = useGame((state) => state.room?.game);
  const roomId = useGame((state) => state.room?.roomId);
  const backSrc = cardBackUrl(effectiveCardBack(player.cardBack ?? undefined, game));
  const [localPeek, setLocalPeek] = useState(false);
  const [remotePeek, setRemotePeek] = useState(false);
  const [hidden, setHidden] = useState(false);
  const handX = useMotionValue(Number.POSITIVE_INFINITY);
  const fanRef = useRef<HTMLDivElement>(null);
  const localHover = useRef(false);
  const remotePosition = useRef<number | null>(null);

  const applyRemotePosition = (position: number | null) => {
    if (position == null) {
      handX.set(Number.POSITIVE_INFINITY);
      paintSlinky(fanRef.current, null);
      return;
    }
    const rect = fanRef.current?.getBoundingClientRect();
    const visualPosition = mirror ? 1 - position : position;
    handX.set(rect ? rect.left + rect.width * visualPosition : Number.POSITIVE_INFINITY);
    // Their fan opens where THEY are hovering, which is most of the point of
    // sharing the position at all - you can watch them dither over a card.
    const count = fanRef.current?.children.length ?? 0;
    paintSlinky(fanRef.current, visualPosition * Math.max(0, count - 1));
  };

  useEffect(() => {
    if (!roomId) return;
    return onMessage((message) => {
      if (
        message.type !== 'room.hand.hover' ||
        message.roomId !== roomId ||
        message.fromUserId !== player.userId
      ) return;
      remotePosition.current = message.position;
      setRemotePeek(message.position != null);
      if (!localHover.current) applyRemotePosition(message.position);
    });
  }, [roomId, player.userId, handX, mirror]);

  useEffect(() => {
    if (player.online !== false) return;
    remotePosition.current = null;
    setRemotePeek(false);
    if (!localHover.current) handX.set(Number.POSITIVE_INFINITY);
  }, [player.online, handX]);
  // Peek up whenever the pointer sits in the bottom band of the screen, and feed
  // the same pointer x to the dock-genie. Driven off a window listener (not the
  // fan's own pointer events) so the strip can stay click-through and never
  // blocks the opponent's piles behind it.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const inBand = mirror
        ? event.clientY < HAND_PEEK_ZONE
        : event.clientY > window.innerHeight - HAND_PEEK_ZONE;
      localHover.current = inBand;
      setLocalPeek(inBand);
      if (inBand) {
        handX.set(event.clientX);
        const rect = fanRef.current?.getBoundingClientRect();
        const count = fanRef.current?.children.length ?? 0;
        paintSlinky(fanRef.current, rect ? focusFromPointer(event.clientX, rect, count) : null);
      } else applyRemotePosition(remotePosition.current);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [handX, mirror]);

  if (player.handCount <= 0) return null;

  const revealed = (player.hand ?? player.revealedHand ?? []).slice(0, 12);
  const backs = Math.max(0, Math.min(player.handCount, 12) - revealed.length);
  const slots: { card: CardInst; faceDown: boolean }[] = [
    ...revealed.map((card) => ({ card, faceDown: false })),
    ...Array.from({ length: backs }, (_, i) => ({ card: { ...HAND_BACK, iid: `back-${i}` }, faceDown: true })),
  ];
  const width = Math.round(132 * cardScale);
  // Same fixed track as my own hand: the fan asks for a card plus a step each,
  // the strip caps it, and the slinky deals the cards across whatever it gets.
  const span = Math.round(width + (slots.length - 1) * Math.max(18, width - 44 * cardScale));
  const offsets = slinkyOffsets(slots.length, restFocus(slots.length), handSlinky(slots.length));

  return (
    <div
      className="oppHandStrip"
      data-mirror={mirror || undefined}
      style={{
        ['--card-scale' as string]: cardScale,
        ['--pc-card-back' as string]: `url("${backSrc}")`,
        ['--pc-hand-h' as string]: `${Math.round(width * (680 / 488))}px`,
        ['--pc-hand-w' as string]: `${width}px`,
        ['--pc-hand-span' as string]: `${span}px`,
      }}
    >
      <div className="myHand">
        <div
          ref={fanRef}
          className="myFan"
          data-peek={((localPeek || remotePeek) && !hidden) || undefined}
          data-hidden={hidden || undefined}
        >
          {slots.map((slot, index) => (
            <HandCard
              key={slot.card.iid}
              card={slot.card}
              faceDown={slot.faceDown}
              width={width}
              offset={offsets[index] ?? 0.5}
              count={slots.length}
              dimmed={false}
              handX={handX}
              onPointerDown={() => {}}
              onPointerEnter={() => {}}
              onPointerLeave={() => {}}
              onClick={() =>
                slot.faceDown
                  ? undefined
                  : popup.open({ scryfallId: slot.card.scryfallId, name: slot.card.name, imageUrl: slot.card.imageUrl })
              }
              onContextMenu={(event) => event.preventDefault()}
            />
          ))}
        </div>
        {/* Same control as the one on my own board (MyBoard's .handTab): the kit
            Button, same size/variant - a bare <button> here rendered as a
            different-looking pill while spectating. */}
        <Button
          size="sm"
          variant="soft"
          className="handTab"
          onClick={() => setHidden((value) => !value)}
          title={hidden ? t('gpShowHand') : t('gpHideHand')}
        >
          {hidden ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {hidden ? t('gpShowHand') : t('gpHideHand')}
        </Button>
      </div>
    </div>
  );
}
