import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@glacier/react';
import { Minus, Plus } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { oracleFacts } from '../../data/printedPt.ts';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';
import { enforcedRoom } from './enforce.ts';

/**
 * A planeswalker's loyalty, in the bottom-trailing corner where the card
 * prints it - and clickable.
 *
 * The menu is built from the WALKER'S OWN abilities: Chandra offers +1, +1,
 * −3 and −7 with their rules text, not a generic stepper, so activating is
 * one read and one click. Costs the current loyalty cannot pay are shown
 * disabled rather than hidden, because "what could I do at 5 loyalty" is
 * exactly the question being asked. A plain ±1 stays at the bottom for
 * damage, proliferate, and everything the parser does not model.
 *
 * On an enforced table the pick goes through `loyalty.activate`, so the
 * server applies the once-per-turn rule, sorcery timing, and the zero floor,
 * and queues the ability text as a prompt. On a freeform table it is a
 * counter edit, exactly like every other freeform bookkeeping gesture.
 */
export function LoyaltyBadge({
  card,
  room,
  me,
  canAct,
  onCounter,
  onActivate,
}: {
  card: CardInst;
  room: RoomState;
  me?: TablePlayer;
  /** False for an opponent's walker: the number still shows, read-only. */
  canAct: boolean;
  onCounter: (delta: number) => void;
  onActivate: (index: number) => void;
}) {
  const t = useT();
  const loyalty = card.counters?.loyalty ?? 0;
  const facts = oracleFacts(card.scryfallId);
  const isWalker = facts?.typeLine.includes('Planeswalker') ?? false;
  // Only a walker gets this treatment; anything else keeps the ordinary
  // counter badges.
  if (!isWalker) return null;

  const abilities = (facts?.abilities ?? [])
    .map((a, index) => ({ ...a, index }))
    .filter((a) => a.loyalty != null);
  const label = String(loyalty);
  const enforced = enforcedRoom(room);
  const myTurn = me != null && room.activeSeat === me.seat;

  if (!canAct) {
    return (
      <span className="loyaltyBadge" data-static title={t('gpLoyalty')}>
        {label}
      </span>
    );
  }

  return (
    <Menu
      aria-label={t('gpLoyalty')}
      placement="top-end"
      trigger={
        <button
          type="button"
          className="loyaltyBadge"
          title={t('gpLoyaltyHint')}
          aria-label={`${t('gpLoyalty')} ${label}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </button>
      }
    >
      {abilities.length > 0 && <MenuLabel>{t('gpLoyaltyAbilities')}</MenuLabel>}
      {abilities.map((a) => {
        const delta = a.loyalty ?? 0;
        // A minus you cannot pay is dead on this card right now; on an
        // enforced table so is anything at all off-turn.
        const unpayable = loyalty + delta < 0;
        const offTurn = enforced && !myTurn;
        return (
          <MenuItem
            key={`${a.cost}-${a.index}`}
            disabled={unpayable || offTurn}
            icon={delta >= 0 ? <Plus size={13} /> : <Minus size={13} />}
            onSelect={() => (enforced ? onActivate(a.index) : onCounter(delta))}
          >
            <span className="loyaltyItem">
              <span className="loyaltyCost" data-sign={delta >= 0 ? 'up' : 'down'}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
              <span className="loyaltyEffect">{a.effect}</span>
            </span>
          </MenuItem>
        );
      })}
      {abilities.length > 0 && <MenuSeparator />}
      <MenuLabel>{t('gpLoyaltyAdjust')}</MenuLabel>
      <MenuItem icon={<Plus size={13} />} onSelect={() => onCounter(1)}>
        {t('gpLoyaltyPlusOne')}
      </MenuItem>
      <MenuItem icon={<Minus size={13} />} disabled={loyalty <= 0} onSelect={() => onCounter(-1)}>
        {t('gpLoyaltyMinusOne')}
      </MenuItem>
    </Menu>
  );
}
