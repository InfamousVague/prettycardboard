/**
 * Plain-language one-liners for MTG keywords and ability words, keyed by the
 * lowercased keyword. Rendered as stacked chips on the card inspect (the way
 * Runeterra explains its cards) - a glossary, not rules text: each line says
 * what the ability DOES at the table, in one sentence.
 */
export const KEYWORD_GLOSSARY: Record<string, string> = {
  deathtouch: 'Any amount of damage this deals to a creature destroys it.',
  defender: "This creature can't attack.",
  'double strike': 'Deals first-strike damage AND normal combat damage.',
  enchant: 'Attaches to the named kind of thing as it resolves.',
  equip: 'Pay the cost at sorcery speed to attach it to a creature you control.',
  'first strike': 'Deals combat damage before creatures without first strike.',
  flash: 'Castable any time you could cast an instant.',
  flying: 'Only creatures with flying or reach can block it.',
  haste: 'Can attack and tap the turn it arrives.',
  hexproof: "Can't be the target of spells or abilities your opponents control.",
  indestructible: "Damage and 'destroy' effects don't destroy it.",
  lifelink: 'Damage this deals also gains you that much life.',
  menace: "Can't be blocked except by two or more creatures.",
  protection: "Can't be blocked, targeted, or damaged by anything with the named quality.",
  prowess: 'Gets +1/+1 until end of turn whenever you cast a noncreature spell.',
  reach: 'Can block creatures with flying.',
  shroud: "Can't be the target of ANY spells or abilities - including yours.",
  trample: 'Excess combat damage over the blockers carries through to the player.',
  vigilance: "Attacking doesn't tap it.",
  ward: 'Spells and abilities opponents aim at it are countered unless they pay the ward cost.',
  scry: 'Look at that many top cards of your library; keep or bottom them in any order.',
  cascade: 'When cast, exile from your library until a cheaper nonland card appears - cast it free.',
  fear: "Can't be blocked except by artifact or black creatures.",
  intimidate: "Can't be blocked except by artifacts or creatures sharing a color.",
  shadow: 'Can only block or be blocked by other creatures with shadow.',
  skulk: "Can't be blocked by creatures with greater power.",
  horsemanship: "Can't be blocked except by creatures with horsemanship.",
  flashback: 'Castable from the graveyard for its flashback cost, then exiled.',
  cycling: 'Pay the cost and discard it to draw a card.',
  kicker: 'An optional extra cost for an extra effect, paid as you cast it.',
  convoke: 'Tapping creatures helps pay the cost (one mana each).',
  landfall: 'Triggers whenever a land enters under your control.',
  mill: 'Put that many cards from the top of the library into the graveyard.',
  goad: 'That creature must attack someone other than you each combat.',
  partner: 'Your commander can be a pair of cards that both have partner.',
  'commander ninjutsu': 'Swap it in from the command zone for an unblocked attacker.',
  discover: 'Exile from your library until a cheaper nonland card - cast it free or keep it in hand.',
  exalted: 'A creature attacking alone gets +1/+1 for each exalted trigger.',
  monarch: 'The monarch draws an extra card each end step; combat damage steals the crown.',
  initiative: 'The initiative holder ventures into the Undercity; combat damage steals it.',
};

/** Keywords present on a card, matched against the glossary. Accepts a
 * Scryfall-style keyword list; 'protection' variants collapse to one chip. */
export function knownKeywords(keywords: string[]): Array<{ word: string; text: string }> {
  const seen = new Set<string>();
  const out: Array<{ word: string; text: string }> = [];
  for (const raw of keywords) {
    const k = raw.toLowerCase();
    const base = k.startsWith('protection') ? 'protection' : k;
    if (seen.has(base)) continue;
    const text = KEYWORD_GLOSSARY[base];
    if (text) {
      seen.add(base);
      out.push({ word: raw, text });
    }
  }
  return out;
}

/** Derive glossary-known keywords from oracle TEXT: ability lines (comma
 * lists of bare keywords, reminder text ignored) plus a few verbs that live
 * mid-sentence (scry, mill, cascade, ward N). */
export function keywordsFromText(text: string): string[] {
  const found: string[] = [];
  const push = (w: string) => {
    if (!found.some((f) => f.toLowerCase() === w.toLowerCase())) found.push(w);
  };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\(.*?\)/g, '').trim();
    if (!line) continue;
    const parts = line.split(/,\s*/);
    const allKnown = parts.length > 0 && parts.every((p) => {
      const w = p.trim().toLowerCase();
      if (!w) return false;
      if (w.startsWith('ward')) return true;
      if (w.startsWith('protection from')) return true;
      if (w.startsWith('equip')) return true;
      if (w.startsWith('enchant')) return true;
      return KEYWORD_GLOSSARY[w] != null;
    });
    if (allKnown) {
      for (const p of parts) {
        const w = p.trim();
        const base = w.toLowerCase();
        if (base.startsWith('ward')) push('Ward');
        else if (base.startsWith('protection')) push('Protection');
        else if (base.startsWith('equip')) push('Equip');
        else if (base.startsWith('enchant')) push('Enchant');
        else push(w);
      }
    }
  }
  const t = text.toLowerCase();
  if (/\bscry \d/.test(t)) push('Scry');
  if (/\bmills? (a|an|two|three|four|five|\d)/.test(t)) push('Mill');
  if (/\bcascade\b/.test(t)) push('Cascade');
  if (/\bgoad\b/.test(t)) push('Goad');
  return found;
}
