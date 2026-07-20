import { useEffect, useState } from 'react';
import { useMotionValue } from 'motion/react';
import { ChevronDown, ChevronUp } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { useTableUi } from './tableUi.ts';
import { usePreference } from '../../hooks/usePreference.ts';
import { useCardPopup } from '../../components/CardPopup.tsx';
import { cardBackUrl, effectiveCardBack } from '../../data/cardBacks.ts';
import type { CardInst, TablePlayer } from '../../net/types.ts';
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
  const cardScale = useTableUi((state) => state.cardScale);
  const mirror = usePreference('mirrorOpponent');
  // This hand fans at screen level (outside the seat frame), so it must carry
  // its own owner's card back rather than inheriting the viewer's.
  const game = useGame((state) => state.room?.game);
  const backSrc = cardBackUrl(effectiveCardBack(player.cardBack ?? undefined, game));
  const [peek, setPeek] = useState(false);
  const [hidden, setHidden] = useState(false);
  const handX = useMotionValue(Number.POSITIVE_INFINITY);

  // Peek up whenever the pointer sits in the bottom band of the screen, and feed
  // the same pointer x to the dock-genie. Driven off a window listener (not the
  // fan's own pointer events) so the strip can stay click-through and never
  // blocks the opponent's piles behind it.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const inBand = event.clientY > window.innerHeight - HAND_PEEK_ZONE;
      setPeek(inBand);
      handX.set(inBand ? event.clientX : Number.POSITIVE_INFINITY);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [handX]);

  if (player.handCount <= 0) return null;

  const revealed = (player.hand ?? player.revealedHand ?? []).slice(0, 12);
  const backs = Math.max(0, Math.min(player.handCount, 12) - revealed.length);
  const slots: { card: CardInst; faceDown: boolean }[] = [
    ...revealed.map((card) => ({ card, faceDown: false })),
    ...Array.from({ length: backs }, (_, i) => ({ card: { ...HAND_BACK, iid: `back-${i}` }, faceDown: true })),
  ];
  const width = Math.round(132 * cardScale);

  return (
    <div
      className="oppHandStrip"
      data-mirror={mirror || undefined}
      style={{ ['--card-scale' as string]: cardScale, ['--pc-card-back' as string]: `url("${backSrc}")` }}
    >
      <div className="myHand">
        <div className="myFan" data-peek={(peek && !hidden) || undefined} data-hidden={hidden || undefined}>
          {slots.map((slot, index) => (
            <HandCard
              key={slot.card.iid}
              card={slot.card}
              faceDown={slot.faceDown}
              width={width}
              spread={index - (slots.length - 1) / 2}
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
        <button
          type="button"
          className="handTab"
          onClick={() => setHidden((value) => !value)}
          title={hidden ? t('gpShowHand') : t('gpHideHand')}
        >
          {hidden ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {hidden ? t('gpShowHand') : t('gpHideHand')}
        </button>
      </div>
    </div>
  );
}
