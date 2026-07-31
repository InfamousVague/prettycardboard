import { oracleFacts, primePrintedPT, type OracleFacts } from '../../data/printedPt.ts';
import type { CardInst, RoomState, TablePlayer } from '../../net/types.ts';

/**
 * Client half of the hybrid rules enforcement (the server's rules.rs is the
 * authority; this mirrors it so the UI can glow what is legal and refuse the
 * rest without a round trip). Everything here is advisory rendering - a stale
 * answer just means a rejected action and a toast, never a broken game.
 */

export function enforcedRoom(room: RoomState): boolean {
  return Boolean(room.settings?.enforced) && (room.game ?? 'mtg') === 'mtg';
}

/** Can this player pay `generic` + `pips` with floating mana + untapped lands?
 * Greedy mirror of the server's solver: pool first, then scarcest-color lands,
 * least-flexible producers first. */
export function canAfford(me: TablePlayer, generic: number, pips: Record<string, number>): boolean {
  let needGeneric = generic;
  const need: Record<string, number> = { ...pips };
  const pool: Record<string, number> = { ...(me.mana ?? {}) };
  for (const color of Object.keys(need)) {
    const take = Math.min(need[color] ?? 0, Math.max(0, pool[color] ?? 0));
    need[color] = (need[color] ?? 0) - take;
    pool[color] = (pool[color] ?? 0) - take;
  }
  for (const color of Object.keys(pool)) {
    if (needGeneric <= 0) break;
    const take = Math.min(needGeneric, Math.max(0, pool[color] ?? 0));
    needGeneric -= take;
    pool[color] = (pool[color] ?? 0) - take;
  }
  // Untapped mana-producing lands.
  let lands = me.battlefield
    .filter((c) => !c.tapped)
    .map((c) => oracleFacts(c.scryfallId))
    .filter((f): f is OracleFacts => Boolean(f && f.typeLine.includes('Land') && f.produced.length > 0));
  const colors = Object.keys(need)
    .filter((c) => (need[c] ?? 0) > 0)
    .sort((a, b) => lands.filter((l) => l.produced.includes(a)).length - lands.filter((l) => l.produced.includes(b)).length);
  for (const color of colors) {
    let remaining = need[color] ?? 0;
    while (remaining > 0) {
      const candidates = lands
        .filter((l) => l.produced.includes(color))
        .sort((a, b) => a.produced.length - b.produced.length);
      const pick = candidates[0];
      if (!pick) return false;
      lands = lands.filter((l) => l !== pick);
      remaining -= 1;
    }
  }
  return lands.length >= needGeneric;
}

/** The generic cost of `facts` for `me` after battlefield cost cuts
 * ("<type> spells you cast cost {N} less"), mirroring the server's fold. */
export function discountedGeneric(me: TablePlayer, facts: OracleFacts): number {
  let cut = 0;
  const line = facts.typeLine.toLowerCase();
  for (const c of me.battlefield) {
    const f = oracleFacts(c.scryfallId);
    for (const s of f?.costCuts ?? []) {
      if (!s.filter || line.includes(s.filter)) cut += s.n;
    }
  }
  return Math.max(0, facts.generic - cut);
}

/** How a hand card may enter play right now: play it as the land drop, cast
 * it for mana, or not at all (null). Unknown cards return null - the freeform
 * drag still works for them, the glow just stays off. */
export function handPlayability(
  room: RoomState,
  me: TablePlayer,
  card: CardInst,
): 'land' | 'cast' | null {
  if (!enforcedRoom(room) || !room.started) return null;
  primePrintedPT(card);
  const facts = oracleFacts(card.scryfallId);
  if (!facts) return null;
  // Instants (and flash) go at instant speed: any turn, any phase, mid-combat,
  // in response to the stack - whenever the cost is payable.
  const instantSpeed = facts.typeLine.includes('Instant') || facts.keywords.includes('flash');
  if (instantSpeed) {
    return canAfford(me, discountedGeneric(me, facts), facts.pips) ? 'cast' : null;
  }
  // Everything else is sorcery speed: your turn, a main phase, empty stack.
  if (room.activeSeat !== me.seat) return null;
  if (room.phase !== 'main1' && room.phase !== 'main2') return null;
  if (room.combat) return null;
  if ((room.stack ?? []).length > 0) return null;
  if (facts.typeLine.includes('Land')) {
    return (me.landsThisTurn ?? 0) === 0 ? 'land' : null;
  }
  return canAfford(me, discountedGeneric(me, facts), facts.pips) ? 'cast' : null;
}

/** May this creature be declared as an attacker right now? */
export function canDeclareAttacker(room: RoomState, me: TablePlayer, card: CardInst): boolean {
  if (card.tapped) return false;
  const facts = oracleFacts(card.scryfallId);
  if (!enforcedRoom(room)) return true;
  const haste = facts?.keywords.includes('haste') ?? false;
  if (card.enteredTurn != null && card.enteredTurn === room.turnNumber && !haste) return false;
  if (facts?.keywords.includes('defender')) return false;
  return true;
}

/** May `blocker` legally block `attacker`? Mirrors the server's pass-B
 * evasion table (flying, fear, intimidate, shadow, skulk, unblockable,
 * protection from color); the server stays the authority. */
export function canPairBlock(room: RoomState, blocker: CardInst, attacker: CardInst): boolean {
  if (!enforcedRoom(room)) return true;
  const atk = oracleFacts(attacker.scryfallId);
  if (!atk) return true; // unknown attacker: permissive
  const blk = oracleFacts(blocker.scryfallId);
  const blkHas = (kw: string) => blk?.keywords.includes(kw) ?? false;
  const blkArtifact = blk?.typeLine.includes('Artifact') ?? false;
  const blkColors = blk?.colors ?? [];
  if (atk.unblockable) return false;
  if (atk.keywords.includes('flying') && !blkHas('flying') && !blkHas('reach')) return false;
  if (atk.keywords.includes('shadow') && !blkHas('shadow')) return false;
  if (!atk.keywords.includes('shadow') && blkHas('shadow')) return false;
  if (atk.keywords.includes('horsemanship') && !blkHas('horsemanship')) return false;
  if (atk.keywords.includes('fear') && !blkArtifact && !blkColors.includes('B')) return false;
  if (
    atk.keywords.includes('intimidate') &&
    !blkArtifact &&
    !blkColors.some((c) => atk.colors.includes(c))
  ) {
    return false;
  }
  if (atk.protectionFrom.length > 0 && blkColors.some((c) => atk.protectionFrom.includes(c))) {
    return false;
  }
  // Skulk compares printed power only (the client mirror skips counters and
  // anthems; a stale yes just means one rejected block and a toast).
  return true;
}

/** The target kinds of a stack card that wants targets ([] = untargeted or
 * unknown). Any mode - this drives the aim affordance, not enforcement. */
export function stackTargetKinds(card: CardInst): string[] {
  primePrintedPT(card);
  return oracleFacts(card.scryfallId)?.targetKinds ?? [];
}

/** Do these kinds allow aiming at a PLAYER rather than a permanent?
 * "any target" in modern templating means creature, player or planeswalker. */
export function targetsPlayers(kinds: string[]): boolean {
  return kinds.some((kind) => kind === 'player' || kind === 'opponent' || kind === 'any');
}

/** Would `card` satisfy one of these target kinds? Loose on purpose: the
 * pointing gesture is communication, not a judge. */
export function matchesTargetKind(kinds: string[], card: CardInst): boolean {
  if (kinds.length === 0) return false;
  const line = oracleFacts(card.scryfallId)?.typeLine ?? '';
  return kinds.some((kind) => {
    switch (kind) {
      case 'creature':
        return line.includes('Creature') || card.power != null;
      case 'planeswalker':
        return line.includes('Planeswalker');
      case 'artifact':
        return line.includes('Artifact');
      case 'enchantment':
        return line.includes('Enchantment');
      case 'land':
        return line.includes('Land');
      case 'permanent':
      case 'any':
        return true;
      default:
        return false;
    }
  });
}
