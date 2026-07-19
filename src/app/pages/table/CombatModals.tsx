import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, Modal, Pill, Size, Text, TextTone } from '@glacier/react';
import { Shield, Skull, Swords } from '@glacier/icons';
import { useT } from '../../i18n.ts';
import { useGame } from '../../state/gameStore.ts';
import { cardImage } from '../../data/cards.ts';
import { GameCard } from '../../components/GameCard.tsx';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';
import { useTableUi } from './tableUi.ts';
import { effectivePT, isCreature, ptLabel } from './boardModes.ts';

/**
 * Combat v3's modal moments (PROTOCOL.md Combat v3 addendum): the attacker's
 * target picker, the defender's block-or-take-it response sheet, and the
 * resolved-results breakdown every viewer sees. The server stays freeform -
 * these popups only make suggestions real, and undo or the pile browsers fix
 * whatever a fog, indestructible or regeneration effect changes.
 */

/** Every seat a locked combat is aimed at (explicit seat, or everyone else on an open swing). */
export function targetedSeats(room: RoomState): number[] {
  const combat = room.combat;
  if (!combat) return [];
  const seats = new Set<number>();
  for (const entry of combat.attackers) {
    if (entry.defenderSeat != null) {
      seats.add(entry.defenderSeat);
    } else {
      for (const player of room.players) {
        if (player.seat !== room.activeSeat && !player.conceded) seats.add(player.seat);
      }
    }
  }
  // 2-player tables treat the lone opponent as targeted even without a seat.
  if (seats.size === 0 && combat.attackers.length > 0 && room.players.length === 2) {
    for (const player of room.players) {
      if (player.seat !== room.activeSeat) seats.add(player.seat);
    }
  }
  return [...seats];
}

export function seatTargeted(room: RoomState, seat: number): boolean {
  return targetedSeats(room).includes(seat);
}

/* ------------------------------------------------------------------------ */
/* Attacker: pick who a creature attacks                                     */
/* ------------------------------------------------------------------------ */

export function AttackTargetModal({ room, me }: { room: RoomState; me: TablePlayer }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const attackPick = useTableUi((state) => state.attackPick);
  const setAttackPick = useTableUi((state) => state.setAttackPick);

  const card = attackPick ? me.battlefield.find((c) => c.iid === attackPick) : undefined;
  const open = card !== undefined && room.combat != null && !room.combat.locked;

  // The pick can go stale (combat ended, card left the field) - drop it.
  useEffect(() => {
    if (attackPick && !open) setAttackPick(null);
  }, [attackPick, open, setAttackPick]);

  if (!open || !card) return null;

  const targets = room.players.filter((player) => player.seat !== me.seat && !player.conceded);
  const declare = (defenderSeat: number) => {
    const { power, toughness } = effectivePT(card);
    act({ kind: 'combat.attack', iid: card.iid, defenderSeat, power, toughness });
    setAttackPick(null);
  };

  return (
    <Modal open onClose={() => setAttackPick(null)} size="sm" title={t('cbChooseTarget')} description={t('cbTargetLede')}>
      <div className="cbTargetBody">
        <div className="cbTargetCard">
          <GameCard name={card.name} imageUrl={card.imageUrl || cardImage(card.scryfallId)} width={92} tilt={0} />
          <div className="cbTargetCardMeta">
            <Text as="span" size={Size.Small} weight="semibold">
              {card.name}
            </Text>
            {ptLabel(card) && (
              <Pill size="sm" tone="accent" icon={<Swords size={11} />}>
                {ptLabel(card)}
              </Pill>
            )}
          </div>
        </div>
        <div className="cbTargetList">
          {targets.map((player) => (
            <button key={player.userId} type="button" className="cbTargetRow" onClick={() => declare(player.seat)}>
              <Avatar name={player.username} size="sm" />
              <span className="cbTargetName">{player.username}</span>
              <span className="cbTargetLife">{player.life}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Defender: block, take it, or prevent it all                               */
/* ------------------------------------------------------------------------ */

export function DefenseModal({ room, me }: { room: RoomState; me: TablePlayer }) {
  const t = useT();
  const act = useGame((state) => state.act);
  const defenseHidden = useTableUi((state) => state.defenseHidden);
  const setDefenseHidden = useTableUi((state) => state.setDefenseHidden);

  const combat = room.combat;
  const locked = combat?.locked === true;
  const targetsMe = combat != null && locked && seatTargeted(room, me.seat);
  const amReady = (combat?.ready ?? []).includes(me.seat);
  const due = targetsMe && !amReady;

  // A fresh locked combat always resurfaces the sheet.
  useEffect(() => {
    if (!locked) setDefenseHidden(false);
  }, [locked, setDefenseHidden]);

  const incoming = useMemo(
    () =>
      combat === null || combat === undefined
        ? []
        : combat.attackers.filter(
            (entry) => entry.defenderSeat === me.seat || (entry.defenderSeat == null && room.activeSeat !== me.seat),
          ),
    [combat, me.seat, room.activeSeat],
  );
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    const first = incoming[0];
    if (due && first !== undefined && (picked === null || !incoming.some((entry) => entry.iid === picked))) {
      setPicked(first.iid);
    }
  }, [due, incoming, picked]);

  if (!due || defenseHidden) return null;

  const attacker = room.players.find((player) => player.seat === room.activeSeat);
  const findCard = (iid: string): CardInst | undefined => {
    for (const player of room.players) {
      const hit = player.battlefield.find((c) => c.iid === iid);
      if (hit) return hit;
    }
    return undefined;
  };
  const blocksFor = (attackerIid: string) => (combat?.blocks ?? []).filter((block) => block.attackerIid === attackerIid);
  const myBlockOn = (attackerIid: string, blockerIid: string) =>
    blocksFor(attackerIid).some((block) => block.blockerIid === blockerIid);
  const myBlockers = me.battlefield.filter((c) => !c.tapped && !c.attachedTo && isCreature(c));
  const iBlockAnything = (combat?.blocks ?? []).some((block) => me.battlefield.some((c) => c.iid === block.blockerIid));

  const unblockedDamage = incoming.reduce((sum, entry) => {
    if (blocksFor(entry.iid).length > 0) return sum;
    const power = parseInt((entry.power ?? findCard(entry.iid)?.power ?? '0').trim(), 10);
    return sum + (Number.isFinite(power) ? Math.max(0, power) : 0);
  }, 0);

  const toggleBlock = (creature: CardInst) => {
    if (!picked) return;
    const { power, toughness } = effectivePT(creature);
    act({ kind: 'combat.block', blockerIid: creature.iid, attackerIid: picked, power, toughness });
  };

  return (
    <Modal
      open
      onClose={() => setDefenseHidden(true)}
      size="lg"
      title={t('cbIncoming')}
      description={t('cbIncomingLede')}
      footer={
        <div className="cbDefenseActions">
          <Button variant="ghost" onClick={() => setDefenseHidden(true)}>
            {t('cbRespond')}
          </Button>
          <Button variant="ghost" onClick={() => act({ kind: 'combat.ready', prevent: true })}>
            {t('cbPreventAll')}
          </Button>
          <Button variant="solid" onClick={() => act({ kind: 'combat.ready' })}>
            {iBlockAnything ? t('cbConfirmBlocks') : t('cbTakeDamage')}
          </Button>
        </div>
      }
    >
      <div className="cbDefense">
        <div className="cbDefenseHead">
          {attacker && (
            <>
              <Avatar name={attacker.username} size="sm" />
              <Text as="span" size={Size.Small} weight="semibold">
                {attacker.username}
              </Text>
            </>
          )}
          <Pill size="sm" tone={unblockedDamage > 0 ? 'danger' : 'neutral'} icon={<Swords size={11} />}>
            {t('cbIncomingDamage')}: {unblockedDamage}
          </Pill>
        </div>

        <div className="cbAttackRow">
          {incoming.map((entry) => {
            const card = findCard(entry.iid);
            const blocks = blocksFor(entry.iid);
            const pt = entry.power != null ? `${entry.power}/${entry.toughness ?? '?'}` : card ? ptLabel(card) : '';
            return (
              <button
                key={entry.iid}
                type="button"
                className="cbAttacker"
                data-picked={picked === entry.iid || undefined}
                onClick={() => setPicked(entry.iid)}
              >
                <GameCard
                  name={card?.name ?? '?'}
                  imageUrl={card ? card.imageUrl || cardImage(card.scryfallId) : ''}
                  width={82}
                  tilt={0}
                />
                <span className="cbAttackerMeta">
                  {pt && <span className="cbPt">{pt}</span>}
                  {blocks.length > 0 ? (
                    <Pill size="sm" tone="success" icon={<Shield size={11} />}>
                      {blocks.length}
                    </Pill>
                  ) : (
                    <Pill size="sm" tone="neutral">
                      {t('cbUnblocked')}
                    </Pill>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <Text as="div" size={Size.XSmall} tone={TextTone.Muted} className="cbBlockersLabel">
          {t('cbYourCreatures')}
        </Text>
        {myBlockers.length === 0 ? (
          <Text as="div" size={Size.XSmall} tone={TextTone.Subtle}>
            {t('gpNoCreatures')}
          </Text>
        ) : (
          <div className="cbBlockerRow">
            {myBlockers.map((creature) => (
              <button
                key={creature.iid}
                type="button"
                className="cbBlocker"
                data-blocking={(picked && myBlockOn(picked, creature.iid)) || undefined}
                onClick={() => toggleBlock(creature)}
              >
                <GameCard
                  name={creature.name}
                  imageUrl={creature.imageUrl || cardImage(creature.scryfallId)}
                  width={70}
                  tilt={0}
                />
                {ptLabel(creature) && <span className="cbPt">{ptLabel(creature)}</span>}
              </button>
            ))}
          </div>
        )}

        <Text as="div" size={Size.XSmall} tone={TextTone.Subtle}>
          {t('cbPreventHint')}
        </Text>
      </div>
    </Modal>
  );
}

/** Floating chip that brings the dismissed response sheet back. */
export function DefenseReturnChip({ room, me }: { room: RoomState; me: TablePlayer }) {
  const t = useT();
  const defenseHidden = useTableUi((state) => state.defenseHidden);
  const setDefenseHidden = useTableUi((state) => state.setDefenseHidden);
  const combat = room.combat;
  const due =
    combat?.locked === true && seatTargeted(room, me.seat) && !(combat.ready ?? []).includes(me.seat);
  if (!due || !defenseHidden) return null;
  return (
    <button type="button" className="cbReturnChip" onClick={() => setDefenseHidden(false)}>
      <Shield size={13} />
      {t('cbReturnCombat')}
    </button>
  );
}

/* ------------------------------------------------------------------------ */
/* Everyone: the resolved combat breakdown                                   */
/* ------------------------------------------------------------------------ */

export function CombatResultsModal({ room }: { room: RoomState }) {
  const t = useT();
  const results = useGame((state) => state.combatResults);
  const clearCombatResults = useGame((state) => state.clearCombatResults);
  if (!results) return null;

  const nameOf = (seat: number | undefined) =>
    seat == null ? '' : (room.players.find((player) => player.seat === seat)?.username ?? `#${seat + 1}`);
  const attackerName = nameOf(results.attackerSeat);
  const totals = Object.entries(results.totalBySeat).filter(([, damage]) => damage > 0);

  return (
    <Modal
      open
      onClose={clearCombatResults}
      size="md"
      title={t('cbResultsTitle')}
      description={attackerName}
      footer={
        <div className="cbDefenseActions">
          <Button variant="solid" onClick={clearCombatResults}>
            {t('cpClose')}
          </Button>
        </div>
      }
    >
      <div className="cbResults">
        {results.entries.map((entry) => (
          <div key={entry.attackerIid} className="cbResultRow">
            <span className="cbResultName" data-died={entry.attackerDied || undefined}>
              <Swords size={12} />
              {entry.name}
              {entry.attackerDied && <Skull size={12} />}
            </span>
            <span className="cbResultOutcome">
              {entry.prevented ? (
                <Pill size="sm" tone="neutral">
                  {t('cbPrevented')}
                </Pill>
              ) : entry.blockers.length > 0 ? (
                entry.blockers.map((blocker) => (
                  <span key={blocker.iid} className="cbResultBlocker" data-died={blocker.died || undefined}>
                    <Shield size={11} />
                    {blocker.name}
                    {blocker.died && <Skull size={11} />}
                  </span>
                ))
              ) : (
                <Pill size="sm" tone={entry.damageToDefender > 0 ? 'danger' : 'neutral'}>
                  {entry.damageToDefender > 0
                    ? `${entry.damageToDefender} ${t('cbDamageTo')} ${nameOf(entry.defenderSeat)}`
                    : t('cbNoDamage')}
                </Pill>
              )}
            </span>
          </div>
        ))}
        {totals.length > 0 && (
          <div className="cbResultTotals">
            {totals.map(([seat, damage]) => (
              <Pill key={seat} size="sm" tone="danger" icon={<Swords size={11} />}>
                {nameOf(Number(seat))} −{damage}
              </Pill>
            ))}
          </div>
        )}
        <Text as="div" size={Size.XSmall} tone={TextTone.Subtle}>
          {t('cbResultsUndo')}
        </Text>
      </div>
    </Modal>
  );
}
