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
/** A clean "{T}: Add ..." ability on a nonland - the server's rocks-and-dorks
 * rule, mirrored off the parsed ability list. */
function tapsForMana(f: OracleFacts): boolean {
  return f.abilities.some(
    (a) => a.cost.trim() === '{T}' && a.effect.trim().toLowerCase().startsWith('add '),
  );
}

/** The sources an automatic payment would tap, in the server's preference
 * order (pool first - pooled spend is invisible here - then scarcest pip from
 * the least flexible source, then generic). Null = unaffordable. Mirrors
 * solve_payment: lands plus rocks/dorks with a clean tap-for-mana line, a
 * summoning-sick creature excluded. */
export function paymentPlan(
  room: RoomState,
  me: TablePlayer,
  generic: number,
  pips: Record<string, number>,
): string[] | null {
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
  // Untapped mana sources: lands, plus rocks and dorks (no sick creatures).
  let sources = me.battlefield
    .filter((c) => !c.tapped)
    .map((c) => ({ iid: c.iid, entered: c.enteredTurn, facts: oracleFacts(c.scryfallId) }))
    .filter((s): s is { iid: string; entered: number | undefined; facts: OracleFacts } => {
      const f = s.facts;
      if (!f || f.produced.length === 0) return false;
      if (f.typeLine.includes('Land')) return true;
      if (!tapsForMana(f)) return false;
      const sick =
        f.typeLine.includes('Creature') &&
        s.entered != null &&
        s.entered === room.turnNumber &&
        !f.keywords.includes('haste');
      return !sick;
    });
  const picked: string[] = [];
  const colors = Object.keys(need)
    .filter((c) => (need[c] ?? 0) > 0)
    .sort(
      (a, b) =>
        sources.filter((s) => s.facts.produced.includes(a)).length -
        sources.filter((s) => s.facts.produced.includes(b)).length,
    );
  for (const color of colors) {
    let remaining = need[color] ?? 0;
    while (remaining > 0) {
      const candidates = sources
        .filter((s) => s.facts.produced.includes(color))
        .sort((a, b) => a.facts.produced.length - b.facts.produced.length);
      const pick = candidates[0];
      if (!pick) return null;
      picked.push(pick.iid);
      sources = sources.filter((s) => s !== pick);
      remaining -= 1;
    }
  }
  if (sources.length < needGeneric) return null;
  // Generic prefers the least flexible leftovers, saving duals for later.
  const leftovers = [...sources].sort((a, b) => a.facts.produced.length - b.facts.produced.length);
  for (let i = 0; i < needGeneric; i += 1) {
    const src = leftovers[i];
    if (!src) return null;
    picked.push(src.iid);
  }
  return picked;
}

export function canAfford(
  room: RoomState,
  me: TablePlayer,
  generic: number,
  pips: Record<string, number>,
): boolean {
  return paymentPlan(room, me, generic, pips) != null;
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

/** Why a hand card cannot be played right now. These mirror the messages
 *  rules.rs rejects with, because a player who is told nothing assumes the
 *  reason is the one they can see - "I have three lands, why can't I cast a
 *  one-drop" is almost always a phase or a stack, not the mana. */
export type PlayBlock =
  | 'efNotYourTurn'
  | 'efNotMain'
  | 'efInCombat'
  | 'efStackBusy'
  | 'efOneLand'
  | 'efNoMana';

/** How a hand card may enter play right now, and if it may not, why.
 *
 * One function answers both so the glow and the explanation can never
 * disagree: `play` non-null and `block` non-null are mutually exclusive by
 * construction. Unknown cards return both null - the freeform drag still works
 * for them, the glow stays off, and there is nothing truthful to say about a
 * card whose rules we have not loaded. */
export function handVerdict(
  room: RoomState,
  me: TablePlayer,
  card: CardInst,
): { play: 'land' | 'cast' | null; block: PlayBlock | null } {
  const no = (block: PlayBlock | null) => ({ play: null, block });
  if (!enforcedRoom(room) || !room.started) return no(null);
  primePrintedPT(card);
  const facts = oracleFacts(card.scryfallId);
  if (!facts) return no(null);
  const afford = () => canAfford(room, me, discountedGeneric(me, facts), facts.pips);
  // Instants (and flash) go at instant speed: any turn, any phase, mid-combat,
  // in response to the stack - whenever the cost is payable.
  const instantSpeed = facts.typeLine.includes('Instant') || facts.keywords.includes('flash');
  if (instantSpeed) {
    return afford() ? { play: 'cast', block: null } : no('efNoMana');
  }
  // Everything else is sorcery speed: your turn, a main phase, empty stack.
  // Checked in the server's order, so the reason we name is the one it would
  // have rejected on.
  if (room.activeSeat !== me.seat) return no('efNotYourTurn');
  if (room.phase !== 'main1' && room.phase !== 'main2') return no('efNotMain');
  if (room.combat) return no('efInCombat');
  if ((room.stack ?? []).length > 0) return no('efStackBusy');
  if (facts.typeLine.includes('Land')) {
    return (me.landsThisTurn ?? 0) === 0 ? { play: 'land', block: null } : no('efOneLand');
  }
  return afford() ? { play: 'cast', block: null } : no('efNoMana');
}

/** How a hand card may enter play right now: play it as the land drop, cast
 * it for mana, or not at all (null). */
export function handPlayability(
  room: RoomState,
  me: TablePlayer,
  card: CardInst,
): 'land' | 'cast' | null {
  return handVerdict(room, me, card).play;
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
