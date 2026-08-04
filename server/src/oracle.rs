//! Oracle card facts for enforced rooms (and anything else that wants them).
//!
//! The freeform engine deliberately knows nothing about cards. Enforced rooms
//! need real facts - costs with colors, types, keywords, what a land taps for -
//! so this module lazily fetches each card's oracle data from Scryfall the
//! first time it is seen, parses it down to the compact `OracleCard` the rules
//! engine consumes, and caches it in memory plus SQLite so a restart never
//! refetches. Bots and the client read the same truths (the client keeps its
//! own Scryfall cache; ids are shared so they can never disagree about a card).
//!
//! Unknown cards (fetch failed, custom `pc-…` art ids with no oracle identity)
//! stay unknown: the rules engine treats them permissively rather than
//! bricking a deck the tabletop would happily play.

use crate::App;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

/// Bumped whenever the parse below learns something new: cached rows stamped
/// with an older version are treated as missing and refetched, so a deploy
/// never leaves half the oracle table without the new fields.
pub const ORACLE_VERSION: u32 = 14;

/// A characteristic-defining ability that sets power (and sometimes toughness)
/// to a count of permanents - "...is equal to the number of artifacts you
/// control". The only CDA shape the engine reads; every other `*` keeps its
/// numeric floor rather than being guessed at.
#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CountCda {
    /// Singular lowercase type word to count ("artifact", "creature", ...).
    pub counts: String,
    /// Count your opponents' permanents rather than your own.
    pub opponents: bool,
    /// The ability defines toughness as well as power.
    pub toughness: bool,
}

/// A continuously-true effect a permanent projects (rules pass B).
#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum StaticEffect {
    /// "(Other) creatures you control get +P/+T" - folded into effective
    /// power/toughness for the controller's creatures.
    Anthem { power: i64, toughness: i64, others_only: bool },
    /// "(<type> )spells you cast cost {N} less to cast" - folded into the
    /// generic component of solve_payment. `filter` is a lowercased type word
    /// matched against the spell's type line; None = every spell.
    CostCut { filter: Option<String>, n: i64 },
}

/// One loyalty ability on a planeswalker: the +N/-N/0 cost and its text.
#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LoyaltyAbility {
    pub delta: i64,
    pub text: String,
}

/// When a parsed triggered ability fires (pass A of the rules roadmap).
#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub enum TriggerWhen {
    /// "When ~ enters (the battlefield), ..."
    Etb,
    /// "When ~ dies, ..."
    Dies,
    /// "Whenever ~ attacks, ..."
    Attacks,
    /// "At the beginning of your upkeep, ..."
    Upkeep,
    /// "At the beginning of your end step, ..."
    EndStep,
    /// "Whenever ~ deals combat damage to a player, ..." (saboteurs).
    DealsPlayerDamage,
    /// "Whenever you draw a card, ..." - fires once per card drawn.
    YouDraw,
    /// "Whenever an opponent draws a card, ..." - fires once per card THAT
    /// PLAYER draws, and its effects land on them, not on every opponent
    /// (see PendingTrigger::subject).
    OpponentDraws,
    /// Landfall: "whenever a land you control enters, ...", or the keyword
    /// line "Landfall - ...". Fires for the land's controller.
    LandEtb,
    /// "Whenever (an)other creature you control enters, ..." - a permanent
    /// WATCHING another creature arrive, not its own ETB.
    CreatureEtb,
    /// "Whenever (an)other creature you control dies, ..."
    CreatureDies,
    /// "Whenever you attack, ..." - once per combat when attackers are
    /// declared, not once per attacker.
    YouAttack,
    /// "At the beginning of combat on your turn, ..."
    CombatStart,
    /// "At the beginning of each upkeep, ..." - every player's, not just the
    /// controller's.
    EachUpkeep,
    /// "Whenever you cast a spell, ..." and its commonest narrowings. The
    /// firing site checks the cast card's types against the variant.
    CastSpell,
    CastCreatureSpell,
    CastNoncreatureSpell,
    CastInstantOrSorcery,
    /// A loyalty ability the player just activated (not a trigger shape the
    /// parser finds - the activation queues its text through the same prompt).
    Activated,
}

/// One effect the engine can apply on the controller's behalf. `Manual` marks
/// a recognized trigger whose effect the engine cannot do - the prompt still
/// fires, the player performs the text by hand.
#[derive(Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum TriggerEffect {
    Draw { n: i64 },
    GainLife { n: i64 },
    LoseLife { n: i64 },
    EachOpponentLoses { n: i64 },
    /// N counters of `counter` kind on the trigger's own source.
    SelfCounters { counter: String, n: i64 },
    /// `count` stub tokens (name + printed P/T; riders are not modeled).
    Token { name: String, power: i64, toughness: i64, count: i64, tapped: bool },
    /// The controller discards N. On "apply" the engine chooses (highest mana
    /// value; truly random when `random`) - a player who wants a specific card
    /// answers "resolve by hand" instead, which is the existing button.
    Discard { n: i64, random: bool },
    /// Every opponent sacrifices N creatures. The engine cannot pick for a
    /// human (which creature is a real decision), so bots choose immediately
    /// and humans get a PendingSacrifice prompt.
    EachOpponentSacrifices { n: i64 },
    /// A wrath: every creature on every battlefield dies.
    DestroyAllCreatures,
    /// Every opponent discards N: bots choose immediately, humans get a
    /// PendingDiscard prompt with a lapse-to-random deadline.
    EachOpponentDiscards { n: i64, random: bool },
    /// Scry N. Bots apply a keep-lands-when-short heuristic; a human gets the
    /// top N as a private peek (the existing library viewer finishes the job).
    Scry { n: i64 },
    /// The controller mills N: top of library to the graveyard, cards named.
    Mill { n: i64 },
    Manual,
}

/// A parsed triggered ability: fire condition, the effect list (all applied
/// together), and the verbatim sentence for prompts and logs.
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Trigger {
    pub when: TriggerWhen,
    pub effects: Vec<TriggerEffect>,
    pub text: String,
}

impl Trigger {
    /// Can the engine apply this trigger itself (no Manual part)?
    pub fn auto(&self) -> bool {
        !self.effects.iter().any(|e| matches!(e, TriggerEffect::Manual))
    }
}

/// One card's rules-relevant facts, trimmed from the Scryfall record.
#[derive(Clone, Serialize, Deserialize)]
pub struct OracleCard {
    pub name: String,
    pub type_line: String,
    /// Mana value (converted cost). X counts as 0.
    pub mv: i64,
    /// Generic component of the cost ({3} -> 3). Hybrid and Phyrexian pips
    /// are counted here too - payable-any-way is close enough for v1.
    pub generic: i64,
    /// Required colored pips by color letter (W U B R G C).
    pub pips: BTreeMap<char, i64>,
    pub power: Option<i64>,
    pub toughness: Option<i64>,
    /// Lowercased keyword list from Scryfall ("flying", "first strike", ...).
    pub keywords: HashSet<String>,
    /// Colors of mana this card can produce (lands, rocks, dorks).
    pub produced: Vec<char>,
    /// Oracle rules text (faces joined by newlines), kept verbatim so later
    /// passes can reparse without refetching.
    #[serde(default)]
    pub oracle_text: String,
    /// Triggered abilities parsed from the text at fetch time.
    #[serde(default)]
    pub triggers: Vec<Trigger>,
    /// Reads as removal/burn aimed at creatures - the bot's threat table.
    #[serde(default)]
    pub threat: bool,
    /// The card's colors (W U B R G) - evasion checks read these.
    #[serde(default)]
    pub colors: Vec<char>,
    /// Static effects this permanent projects (anthems, cost cuts).
    #[serde(default)]
    pub statics: Vec<StaticEffect>,
    /// "~ can't be blocked." with no qualifier.
    #[serde(default)]
    pub unblockable: bool,
    /// Colors this card has protection from (blocks + damage; "from all
    /// colors" expands to all five).
    #[serde(default)]
    pub protection_from: Vec<char>,
    /// Ward cost as printed ("{2}", "pay 3 life"), for the tax reminder.
    #[serde(default)]
    pub ward: Option<String>,
    /// "~ enters tapped." - applied by the engine on battlefield arrival.
    #[serde(default)]
    pub enters_tapped: bool,
    /// "~ enters with N <kind> counters on it" - (kind, n), auto-applied.
    #[serde(default)]
    pub enters_counters: Option<(String, i64)>,
    /// "If ~ would die, exile it instead." - deaths route to exile.
    #[serde(default)]
    pub dies_to_exile: bool,
    /// "Prevent all combat damage that would be dealt to ~."
    #[serde(default)]
    pub prevent_combat_to: bool,
    /// "Prevent all combat damage that would be dealt by ~."
    #[serde(default)]
    pub prevent_combat_by: bool,
    /// "Discover N" - fires a cascade-style dig for mv <= N on cast.
    #[serde(default)]
    pub discover: Option<i64>,
    /// Set when the printed power is `*`: what the defining ability counts.
    #[serde(default)]
    pub cda: Option<CountCda>,
    /// A planeswalker's printed starting loyalty; it enters with this many
    /// loyalty counters under enforcement.
    #[serde(default)]
    pub loyalty: Option<i64>,
    /// Spell intent for instants/sorceries, parsed so a bot can cast them ON
    /// PURPOSE and the table can be told what resolved. All None/false for
    /// permanents and for texts outside the closed patterns.
    /// "Counter target spell."
    #[serde(default)]
    pub counters_spell: bool,
    /// "Draw N cards" somewhere in the spell's own text.
    #[serde(default)]
    pub draws_spell: Option<i64>,
    /// "Each opponent/target player/target opponent discards N card(s)".
    #[serde(default)]
    pub opp_discards: Option<i64>,
    /// That discard is "at random".
    #[serde(default)]
    pub opp_discards_random: bool,
    /// The discard reads "target player/opponent", not "each opponent". A
    /// player target cannot be expressed on the stack, so multiplayer rooms
    /// leave these to the caster's hand; a 2-seat room applies them (the
    /// target is unambiguous).
    #[serde(default)]
    pub opp_discards_targeted: bool,
    /// "Scry N" in the spell's own text.
    #[serde(default)]
    pub scry_spell: Option<i64>,
    /// A clean "{T}: Add ..." mana-ability line on a NONLAND permanent (rocks
    /// and dorks; lands pay through `produced` alone). Lines with extra costs
    /// ("{1}, {T}:", "Sacrifice ...:") or triggered adds do not count.
    #[serde(default)]
    pub taps_for_mana: bool,
    /// A planeswalker's loyalty abilities: cost delta + the ability text.
    /// X-cost abilities are skipped - the engine cannot price them.
    #[serde(default)]
    pub loyalty_abilities: Vec<LoyaltyAbility>,
    /// Clause-initial engine-appliable spell effects beyond the dedicated
    /// intent fields: token-making, lifegain, and self-mill. Per-clause on
    /// purpose - unrecognized clauses stay the caster's to perform.
    #[serde(default)]
    pub spell_effects: Vec<TriggerEffect>,
    /// Parse-schema version this row was written with (see ORACLE_VERSION).
    #[serde(default)]
    pub v: u32,
}

impl OracleCard {
    pub fn is_land(&self) -> bool {
        self.type_line.contains("Land")
    }
    pub fn is_creature(&self) -> bool {
        self.type_line.contains("Creature")
    }
    pub fn is_instant(&self) -> bool {
        self.type_line.contains("Instant")
    }
    pub fn is_sorcery(&self) -> bool {
        self.type_line.contains("Sorcery")
    }
    /// Something that stays on the battlefield when it resolves.
    pub fn is_permanent(&self) -> bool {
        !self.is_instant() && !self.is_sorcery() && !self.is_land()
    }
    pub fn has(&self, keyword: &str) -> bool {
        self.keywords.contains(keyword)
    }
    /// Total pips of one color required by the cost.
    pub fn pip(&self, color: char) -> i64 {
        self.pips.get(&color).copied().unwrap_or(0)
    }
}

/// Parse a Scryfall mana cost string ("{2}{W}{W}", "{X}{R}", "{W/U}") into
/// (generic, colored pips). Hybrid/Phyrexian symbols count as generic; X is 0.
fn parse_cost(cost: &str) -> (i64, BTreeMap<char, i64>) {
    let mut generic = 0i64;
    let mut pips: BTreeMap<char, i64> = BTreeMap::new();
    for sym in cost.trim_start_matches('{').trim_end_matches('}').split("}{") {
        if sym.is_empty() {
            continue;
        }
        if let Ok(n) = sym.parse::<i64>() {
            generic += n;
        } else if sym.len() == 1 && "WUBRGC".contains(sym) {
            *pips.entry(sym.chars().next().unwrap()).or_insert(0) += 1;
        } else if sym == "X" || sym == "Y" || sym == "Z" {
            // X costs: the X itself is chosen at cast time; v1 charges 0 for it.
        } else {
            // Hybrid ({W/U}), Phyrexian ({G/P}), twobrid ({2/W}), snow ({S}):
            // payable more ways than we model, so charge the permissive unit.
            generic += 1;
        }
    }
    (generic, pips)
}

// ------------------------------------------------------------ text parsing

/// Strip reminder text `(...)` and granted-ability quotes `"..."` so a card
/// that TEACHES a trigger ("gains 'Whenever this creature attacks...'") is
/// never mistaken for having one itself.
fn strip_asides(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut paren = 0usize;
    let mut quoted = false;
    for ch in line.chars() {
        match ch {
            '(' => paren += 1,
            ')' => paren = paren.saturating_sub(1),
            '"' => quoted = !quoted,
            _ if paren == 0 && !quoted => out.push(ch),
            _ => {}
        }
    }
    out.trim().to_string()
}

/// "a"/"an"/"one"/"two"/... or a digit string -> the number.
fn word_number(word: &str) -> Option<i64> {
    match word {
        "a" | "an" | "one" => Some(1),
        "two" => Some(2),
        "three" => Some(3),
        "four" => Some(4),
        "five" => Some(5),
        "six" => Some(6),
        "seven" => Some(7),
        "eight" => Some(8),
        "nine" => Some(9),
        "ten" => Some(10),
        _ => word.parse::<i64>().ok(),
    }
}

/// Does the (lowercased) subject clause refer to the card itself? Modern
/// templating says "this creature"/"this land"/...; legends self-refer by
/// short name; older text may still carry the full card name.
fn is_self_subject(subject: &str, name_lower: &str, short_lower: &str) -> bool {
    let s = subject.trim();
    s.starts_with("this ") || s == name_lower || (!short_lower.is_empty() && s == short_lower)
}

/// Is this (lowercased) phrase a self-reference target for counters?
fn is_self_target(target: &str, name_lower: &str, short_lower: &str) -> bool {
    let t = target.trim();
    t == "it" || is_self_subject(t, name_lower, short_lower)
}

/// Parse one effect part ("draw a card", "you gain 2 life", "create a 2/2
/// black Zombie creature token"). None = not in the closed set.
fn parse_effect_part(part: &str, name_lower: &str, short_lower: &str) -> Option<TriggerEffect> {
    // "you" is the controller and "they"/"that player" the trigger's subject
    // (the opponent who drew): which player an effect lands on is carried by
    // the trigger, not by this clause, so every form strips the same way.
    //
    // "that player" is not a synonym nobody writes - it is how the printed
    // text names a singular subject. Sheoldred says "they lose 2 life" and
    // parsed; Scrawling Crawler says "that player loses 1 life" and did not,
    // so its trigger was detected, prompted, and then did nothing at all.
    let p = part
        .trim()
        .trim_start_matches("you ")
        .trim_start_matches("they ")
        .trim_start_matches("that player ")
        .trim();

    // "draw a card" / "draw two cards"
    if let Some(rest) = p.strip_prefix("draw ") {
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        let noun = words.next()?;
        if (noun == "card" || noun == "cards") && words.next().is_none() {
            return Some(TriggerEffect::Draw { n });
        }
        return None;
    }
    // "gain 2 life" / "lose 1 life", and the third-person forms a singular
    // subject takes ("that player LOSES 1 life"). The -s forms come first:
    // "loses 2 life" also starts with "lose ", and matching that leaves "s 2
    // life", which fails the number check and bails out of the whole parse.
    for (verb, gain) in [("gains ", true), ("loses ", false), ("gain ", true), ("lose ", false)] {
        if let Some(rest) = p.strip_prefix(verb) {
            let mut words = rest.split_whitespace();
            let n = word_number(words.next()?)?;
            if words.next() == Some("life") && words.next().is_none() {
                return Some(if gain {
                    TriggerEffect::GainLife { n }
                } else {
                    TriggerEffect::LoseLife { n }
                });
            }
            return None;
        }
    }
    // "<source> deals 2 damage to each opponent" - Impact Tremors, Purphoros.
    // The engine models no damage prevention or replacement, so this is life
    // loss by another name.
    if let Some((_, rest)) = p.split_once(" deals ") {
        if let Some(amount) = rest.strip_suffix(" damage to each opponent") {
            let mut words = amount.split_whitespace();
            let n = word_number(words.next()?)?;
            if words.next().is_none() {
                return Some(TriggerEffect::EachOpponentLoses { n });
            }
        }
        return None;
    }
    // "each opponent sacrifices a creature" (Grave Pact, Dictate of Erebos,
    // Liliana's Triumph). The "of their choice" tail is the rules text saying
    // out loud that it is not a targeted choice - which is exactly why the
    // prompt goes to the sacrificing player.
    // Two templates say the same thing: modern cards use "each opponent",
    // older ones (Grave Pact) "each other player". In every format this
    // engine runs, the set of other players IS the set of opponents.
    if let Some(rest) = p
        .strip_prefix("each opponent sacrifices ")
        .or_else(|| p.strip_prefix("each other player sacrifices "))
    {
        let rest = rest.trim_end_matches(" of their choice").trim();
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        if words.next().map(|w| w.starts_with("creature")).unwrap_or(false)
            && words.next().is_none()
        {
            return Some(TriggerEffect::EachOpponentSacrifices { n });
        }
        return None;
    }
    // "destroy all creatures" - a wrath, and nothing narrower. A rider
    // ("...they can't be regenerated") is stripped as an aside upstream, but
    // any surviving qualifier means this is NOT the whole board and must not
    // be treated as one.
    if p == "destroy all creatures" {
        return Some(TriggerEffect::DestroyAllCreatures);
    }
    // "each opponent loses 2 life"
    if let Some(rest) = p.strip_prefix("each opponent loses ") {
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        if words.next() == Some("life") && words.next().is_none() {
            return Some(TriggerEffect::EachOpponentLoses { n });
        }
        return None;
    }
    // "put a +1/+1 counter on it" / "put two -1/-1 counters on this creature"
    if let Some(rest) = p.strip_prefix("put ") {
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        let kind = words.next()?;
        if !kind.contains('/') {
            return None;
        }
        let counter_word = words.next()?;
        if counter_word != "counter" && counter_word != "counters" {
            return None;
        }
        if words.next() != Some("on") {
            return None;
        }
        let target: Vec<&str> = words.collect();
        if is_self_target(&target.join(" "), name_lower, short_lower) {
            return Some(TriggerEffect::SelfCounters { counter: kind.to_string(), n });
        }
        return None;
    }
    // "discard a card" / "discard two cards( at random)"
    if let Some(rest) = p.strip_prefix("discard ") {
        let (body, random) = match rest.strip_suffix(" at random") {
            Some(head) => (head, true),
            None => (rest, false),
        };
        let mut words = body.split_whitespace();
        let n = word_number(words.next()?)?;
        let noun = words.next()?;
        if (noun == "card" || noun == "cards") && words.next().is_none() {
            return Some(TriggerEffect::Discard { n, random });
        }
        return None;
    }
    // "each opponent discards a card( at random)"
    if let Some(rest) = p.strip_prefix("each opponent discards ") {
        let (body, random) = match rest.strip_suffix(" at random") {
            Some(head) => (head, true),
            None => (rest, false),
        };
        let mut words = body.split_whitespace();
        let n = word_number(words.next()?)?;
        let noun = words.next()?;
        if (noun == "card" || noun == "cards") && words.next().is_none() {
            return Some(TriggerEffect::EachOpponentDiscards { n, random });
        }
        return None;
    }
    // "scry 1" / "scry 2"
    if let Some(rest) = p.strip_prefix("scry ") {
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        if words.next().is_none() && n > 0 {
            return Some(TriggerEffect::Scry { n });
        }
        return None;
    }
    // "mill a card" / "mill three cards"
    if let Some(rest) = p.strip_prefix("mill ") {
        let mut words = rest.split_whitespace();
        let n = word_number(words.next()?)?;
        let noun = words.next()?;
        if (noun == "card" || noun == "cards") && words.next().is_none() {
            return Some(TriggerEffect::Mill { n });
        }
        return None;
    }
    // "create a 2/2 black Zombie creature token" (optionally "a tapped ...",
    // "N ... tokens", "artifact creature token"). Riders after "token" or
    // unknown descriptor words fall out of the closed set.
    if let Some(rest) = p.strip_prefix("create ") {
        let words: Vec<&str> = rest.split_whitespace().collect();
        let mut i = 0usize;
        let count = word_number(words.get(i).copied()?)?;
        i += 1;
        let mut tapped = false;
        if words.get(i).copied() == Some("tapped") {
            tapped = true;
            i += 1;
        }
        let pt = words.get(i).copied()?;
        let (ps, ts) = pt.split_once('/')?;
        let (power, toughness) = (ps.parse::<i64>().ok()?, ts.parse::<i64>().ok()?);
        i += 1;
        let mut name_words: Vec<&str> = Vec::new();
        while i < words.len() {
            let w = words[i];
            if w == "creature" {
                break;
            }
            match w {
                "white" | "blue" | "black" | "red" | "green" | "colorless" | "and" => {}
                "artifact" | "enchantment" => {}
                _ => name_words.push(w),
            }
            i += 1;
        }
        // The remainder must be exactly "creature token" / "creature tokens".
        let tail: Vec<&str> = words[i..].to_vec();
        let clean = tail == ["creature", "token"] || tail == ["creature", "tokens"];
        if !clean || name_words.is_empty() {
            return None;
        }
        // Title-case the subtype words for the token's display name.
        let name = name_words
            .iter()
            .map(|w| {
                let mut c = w.chars();
                match c.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    None => String::new(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        return Some(TriggerEffect::Token { name, power, toughness, count, tapped });
    }
    None
}

/// Parse a full effect clause into its parts. A clause with several
/// sentences, or any part outside the closed set, collapses to [Manual] -
/// the engine must never half-apply a trigger.
fn parse_effects(clause: &str, name_lower: &str, short_lower: &str) -> Vec<TriggerEffect> {
    let c = clause.trim().trim_end_matches('.').trim();
    if c.is_empty() {
        return vec![TriggerEffect::Manual];
    }
    // Sentences apply in order ("...each opponent loses 1 life. Scry 1."), and
    // within one sentence parts join with " and " / ", then " / "then ". The
    // closed-set rule is unchanged: ANY part outside it makes the whole
    // trigger Manual - the engine must never half-apply.
    let mut effects = Vec::new();
    for sentence in c.split(". ") {
        let sentence = sentence.trim().trim_end_matches('.').trim();
        if sentence.is_empty() {
            continue;
        }
        // "you may X": the prompt itself models the choice; parse X.
        let sentence = sentence.strip_prefix("you may ").unwrap_or(sentence);
        for part in sentence.split(" and ") {
            for step in part.split(", then ") {
                let step = step.trim().trim_start_matches("then ").trim();
                match parse_effect_part(step, name_lower, short_lower) {
                    Some(e) => effects.push(e),
                    None => return vec![TriggerEffect::Manual],
                }
            }
        }
    }
    if effects.is_empty() {
        return vec![TriggerEffect::Manual];
    }
    effects
}

/// Parse every triggered ability this module recognizes out of the card's
/// oracle text. Lines that grant abilities (quoted) or carry intervening-"if"
/// clauses parse to Manual or nothing - never to a wrong auto effect.
fn parse_triggers(name: &str, text: &str) -> Vec<Trigger> {
    let name_lower = name.to_lowercase();
    // Legends self-refer by short name: "Nadaar, Selfless Paladin" -> "nadaar".
    let short_lower = name_lower.split(',').next().unwrap_or("").trim().to_string();
    let mut out: Vec<Trigger> = Vec::new();
    for raw_line in text.lines() {
        let line = strip_asides(raw_line);
        if line.is_empty() {
            continue;
        }
        let lower = line.to_lowercase();
        // An ability word ("Landfall — Whenever a land you control enters, ...")
        // is an italic marker with no rules meaning; the trigger is what
        // follows it. Only strip it when a trigger really does follow, so a
        // genuine em dash inside rules text is left alone.
        let lower = match lower.split_once(" \u{2014} ").or_else(|| lower.split_once(" - ")) {
            Some((_, rest))
                if rest.starts_with("whenever ")
                    || rest.starts_with("when ")
                    || rest.starts_with("at the beginning of") =>
            {
                rest.to_string()
            }
            _ => lower,
        };
        let Some((cond, effect_clause)) = lower.split_once(", ") else { continue };
        // The verbatim sentence (original case) for prompts.
        let text_orig = line.clone();

        // "at the beginning of your upkeep/end step, ..."
        for (prefix, when) in [
            ("at the beginning of your upkeep", TriggerWhen::Upkeep),
            ("at the beginning of your end step", TriggerWhen::EndStep),
            ("at the beginning of each upkeep", TriggerWhen::EachUpkeep),
            ("at the beginning of combat on your turn", TriggerWhen::CombatStart),
        ] {
            if cond == prefix {
                out.push(Trigger {
                    when,
                    effects: parse_effects(effect_clause, &name_lower, &short_lower),
                    text: text_orig.clone(),
                });
            }
        }

        // "whenever you/an opponent draws a card, ..." - the subject is a
        // PLAYER, not this card, so it never reaches the card-subject verbs
        // below. Closed set: exactly these two shapes.
        let mut player_trigger = false;
        for (prefix, when) in [
            ("whenever you draw a card", TriggerWhen::YouDraw),
            ("whenever an opponent draws a card", TriggerWhen::OpponentDraws),
            // Watching another permanent arrive or leave. "another" and "a"
            // both land here; the firing site never counts the source itself,
            // which is the conservative reading of "a".
            ("whenever a land you control enters", TriggerWhen::LandEtb),
            ("whenever a land enters the battlefield under your control", TriggerWhen::LandEtb),
            ("whenever another creature you control enters", TriggerWhen::CreatureEtb),
            ("whenever a creature you control enters", TriggerWhen::CreatureEtb),
            (
                "whenever another creature enters the battlefield under your control",
                TriggerWhen::CreatureEtb,
            ),
            (
                "whenever a creature enters the battlefield under your control",
                TriggerWhen::CreatureEtb,
            ),
            // The aristocrats line covers both halves at once; it fires for
            // the source's own death and for every other creature's.
            (
                "whenever this creature or another creature you control dies",
                TriggerWhen::CreatureDies,
            ),
            ("whenever another creature you control dies", TriggerWhen::CreatureDies),
            ("whenever a creature you control dies", TriggerWhen::CreatureDies),
            ("whenever you attack", TriggerWhen::YouAttack),
            // Cast triggers, narrowest first so "creature spell" never matches
            // the bare "a spell" rule.
            ("whenever you cast a creature spell", TriggerWhen::CastCreatureSpell),
            ("whenever you cast a noncreature spell", TriggerWhen::CastNoncreatureSpell),
            ("whenever you cast an instant or sorcery spell", TriggerWhen::CastInstantOrSorcery),
            ("whenever you cast a spell", TriggerWhen::CastSpell),
        ] {
            if cond == prefix {
                out.push(Trigger {
                    when,
                    effects: parse_effects(effect_clause, &name_lower, &short_lower),
                    text: text_orig.clone(),
                });
                player_trigger = true;
            }
        }
        if player_trigger {
            continue;
        }

        // "when(ever) SUBJECT <verb>, ..."
        let subject_verb = cond
            .strip_prefix("whenever ")
            .or_else(|| cond.strip_prefix("when "));
        let Some(sv) = subject_verb else { continue };
        // Longest verb first so "enters the battlefield" wins over "enters".
        let verbs: [(&str, &[TriggerWhen]); 7] = [
            ("deals combat damage to a player", &[TriggerWhen::DealsPlayerDamage]),
            ("enters the battlefield or attacks", &[TriggerWhen::Etb, TriggerWhen::Attacks]),
            ("enters or attacks", &[TriggerWhen::Etb, TriggerWhen::Attacks]),
            ("enters the battlefield", &[TriggerWhen::Etb]),
            ("enters", &[TriggerWhen::Etb]),
            ("dies", &[TriggerWhen::Dies]),
            ("attacks", &[TriggerWhen::Attacks]),
        ];
        for (verb, whens) in verbs {
            let Some(subject) = sv.strip_suffix(verb).map(str::trim_end) else { continue };
            if !is_self_subject(subject, &name_lower, &short_lower) {
                break; // another card's/creatures' trigger - not ours to fire
            }
            let effects = parse_effects(effect_clause, &name_lower, &short_lower);
            for when in whens {
                out.push(Trigger { when: *when, effects: effects.clone(), text: text_orig.clone() });
            }
            break;
        }
    }
    out
}

/// Parse static effects (rules pass B): plain anthems and cost cuts. Gated
/// or one-shot variants ("until end of turn", "as long as", subtype anthems,
/// "the first ... each turn") are deliberately not recognized - a static the
/// engine cannot honor continuously must not be half-applied.
fn parse_statics(text: &str) -> Vec<StaticEffect> {
    let mut out = Vec::new();
    for raw_line in text.lines() {
        let line = strip_asides(raw_line);
        let lower = line.to_lowercase();
        if lower.contains("until end of turn") || lower.contains("as long as") {
            continue;
        }
        // "(other) creatures you control get +P/+T" (riders like "and have
        // vigilance" are tolerated; only the P/T fold is modeled).
        let anthem = lower
            .strip_prefix("other creatures you control get ")
            .map(|r| (r, true))
            .or_else(|| lower.strip_prefix("creatures you control get ").map(|r| (r, false)));
        if let Some((rest, others_only)) = anthem {
            let stat = rest.split_whitespace().next().unwrap_or("");
            if let Some((ps, ts)) = stat.trim_end_matches('.').split_once('/') {
                let p = ps.trim_start_matches('+').parse::<i64>().ok();
                let t = ts.trim_start_matches('+').parse::<i64>().ok();
                if let (Some(power), Some(toughness)) = (p, t) {
                    if power >= 0 && toughness >= 0 {
                        let tail = rest[stat.len()..].trim().trim_end_matches('.');
                        let clean = tail.is_empty()
                            || tail.starts_with("and have ")
                            || tail.starts_with("and gain ");
                        if clean {
                            out.push(StaticEffect::Anthem { power, toughness, others_only });
                        }
                    }
                }
            }
            continue;
        }
        // "(<type> )spells you cast cost {N} less to cast"
        if let Some(idx) = lower.find("spells you cast cost {") {
            let prefix = lower[..idx].trim();
            let filter = match prefix {
                "" => Some(None),
                w if !w.contains(' ') => Some(Some(w.to_string())),
                _ => None, // "the first artifact ..." and friends: not modeled
            };
            let rest = &lower[idx + "spells you cast cost {".len()..];
            let n = rest.split('}').next().and_then(|d| d.parse::<i64>().ok());
            if let (Some(filter), Some(n)) = (filter, n) {
                if rest[rest.find('}').map(|i| i + 1).unwrap_or(0)..]
                    .trim()
                    .trim_end_matches('.')
                    == "less to cast"
                {
                    out.push(StaticEffect::CostCut { filter, n });
                }
            }
        }
    }
    out
}

/// "~ can't be blocked." with no qualifier ("by", "except") on the line.
fn parse_unblockable(text: &str) -> bool {
    for raw_line in text.lines() {
        let line = strip_asides(raw_line).to_lowercase();
        let line = line.trim_end_matches('.');
        if let Some(subject) = line.strip_suffix(" can't be blocked") {
            if subject.starts_with("this ") {
                return true;
            }
        }
    }
    false
}

/// Colors named after "protection from"; "all colors"/"everything" is all
/// five. Only color protection is modeled (blocks + the bot's read).
fn parse_protection(text: &str) -> Vec<char> {
    let t = strip_asides(&text.replace('\n', " ")).to_lowercase();
    let mut out: Vec<char> = Vec::new();
    let mut push = |c: char| {
        if !out.contains(&c) {
            out.push(c);
        }
    };
    let mut rest = t.as_str();
    while let Some(idx) = rest.find("protection from ") {
        rest = &rest[idx + "protection from ".len()..];
        loop {
            let tail = rest.trim_start();
            let matched = [
                ("white", 'W'),
                ("blue", 'U'),
                ("black", 'B'),
                ("red", 'R'),
                ("green", 'G'),
            ]
            .iter()
            .find(|(word, _)| tail.starts_with(word));
            if let Some((word, c)) = matched {
                push(*c);
                rest = &tail[word.len()..];
                // "protection from red and from white" / "from red and white"
                let more = tail[word.len()..].trim_start();
                if let Some(r) = more.strip_prefix("and from ") {
                    rest = r;
                    continue;
                }
                if let Some(r) = more.strip_prefix("and ") {
                    rest = r;
                    continue;
                }
            } else if tail.starts_with("all colors") || tail.starts_with("everything") {
                for c in ['W', 'U', 'B', 'R', 'G'] {
                    push(c);
                }
            }
            break;
        }
    }
    out
}

/// The printed ward cost ("{2}", "pay 3 life"), for the tax reminder relay.
/// Word-boundary match per line, so "toward"/"reward" never read as the
/// keyword and the capture never bleeds into the next ability.
fn parse_ward(text: &str) -> Option<String> {
    for raw_line in text.lines() {
        let line = strip_asides(raw_line).to_lowercase();
        let mut offset = 0usize;
        while let Some(rel) = line[offset..].find("ward") {
            let idx = offset + rel;
            let boundary = idx == 0
                || !line[..idx].chars().next_back().map(|c| c.is_alphabetic()).unwrap_or(false);
            let after = &line[idx + 4..];
            if boundary && (after.starts_with(' ') || after.starts_with('—')) {
                let cost: String = after
                    .trim_start_matches('—')
                    .trim_start()
                    .chars()
                    .take_while(|c| !matches!(c, '.' | ','))
                    .collect();
                let cost = cost.trim().to_string();
                if !cost.is_empty() && cost.len() <= 24 {
                    return Some(cost);
                }
            }
            offset = idx + 4;
        }
    }
    None
}

/// Replacement effects the engine applies itself (rules pass C): enters
/// tapped, enters with counters, dies-to-exile, combat damage prevention.
/// Conditional variants ("unless", "for each", ...) stay unmodeled.
struct Replacements {
    enters_tapped: bool,
    enters_counters: Option<(String, i64)>,
    dies_to_exile: bool,
    prevent_to: bool,
    prevent_by: bool,
}

fn parse_replacements(name: &str, text: &str) -> Replacements {
    let mut out = Replacements {
        enters_tapped: false,
        enters_counters: None,
        dies_to_exile: false,
        prevent_to: false,
        prevent_by: false,
    };
    // Legends self-refer by short name: "Edgar, Master Machinist" -> "edgar".
    let name = name.to_lowercase();
    let short = name.split(',').next().unwrap_or("").trim();
    for raw_line in text.lines() {
        let line = strip_asides(raw_line).to_lowercase();
        let line = line.trim_end_matches('.').trim();
        // Older templating names the card ("Radiant Grove enters tapped");
        // current oracle text says "This land". Normalize the former into the
        // latter so one matcher covers both. Note this only rewrites a SELF
        // reference - "that artifact enters tapped" (Edgar, about a spell he
        // lets you recast) is a different object and must not match.
        let owned;
        let line: &str = if !short.is_empty() && line.starts_with(short) {
            owned = format!("this permanent {}", line[short.len()..].trim_start());
            &owned
        } else {
            line
        };
        // "this land enters tapped" / "~ enters the battlefield tapped"
        if let Some(rest) = line.strip_prefix("this ") {
            if let Some(after_kind) = rest.split_once(' ').map(|(_, r)| r) {
                let after_kind = after_kind
                    .strip_prefix("enters the battlefield")
                    .or_else(|| after_kind.strip_prefix("enters"))
                    .map(str::trim_start);
                if let Some(clause) = after_kind {
                    if clause == "tapped" {
                        out.enters_tapped = true;
                        continue;
                    }
                    // "with a +1/+1 counter on it" / "with two charge counters
                    // on it" - exactly that shape; "for each ..." riders and
                    // other qualifiers fall out of the closed set.
                    if let Some(with) = clause.strip_prefix("with ") {
                        let words: Vec<&str> = with.split_whitespace().collect();
                        if words.len() == 5
                            && (words[2] == "counter" || words[2] == "counters")
                            && words[3] == "on"
                            && words[4] == "it"
                        {
                            if let Some(n) = word_number(words[0]) {
                                out.enters_counters = Some((words[1].to_string(), n));
                                continue;
                            }
                        }
                    }
                }
            }
        }
        // "if this creature would die, exile it instead"
        if line.starts_with("if this ") && line.ends_with("would die, exile it instead") {
            out.dies_to_exile = true;
            continue;
        }
        // "prevent all combat damage that would be dealt to and dealt by ~"
        if line.starts_with("prevent all combat damage that would be dealt ") {
            let tail = &line["prevent all combat damage that would be dealt ".len()..];
            let to = tail.starts_with("to and dealt by")
                || tail.starts_with("by and dealt to")
                || tail.starts_with("to this");
            let by = tail.starts_with("to and dealt by")
                || tail.starts_with("by and dealt to")
                || tail.starts_with("by this");
            out.prevent_to |= to;
            out.prevent_by |= by;
        }
    }
    out
}

/// "Discover N" (word boundary, digits) - the cascade-style dig threshold.
fn parse_discover(text: &str) -> Option<i64> {
    let t = strip_asides(&text.replace('\n', " ")).to_lowercase();
    let idx = t.find("discover ")?;
    let boundary =
        idx == 0 || !t[..idx].chars().next_back().map(|c| c.is_alphabetic()).unwrap_or(false);
    if !boundary {
        return None;
    }
    let digits: String =
        t[idx + "discover ".len()..].chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

/// Read a "power is equal to the number of X you control" ability off the
/// oracle text. Anything more exotic stays unparsed - a `*` the engine cannot
/// count keeps whatever numeric floor `stat` found (see `CountCda`).
fn parse_cda(text: &str) -> Option<CountCda> {
    let text = strip_asides(&text.replace('\n', " ")).to_lowercase();
    // "'s power is equal to ..." / "'s power and toughness are each equal to ..."
    let at = text.find("power")?;
    let rest = &text[at..];
    let toughness = rest.starts_with("power and toughness");
    let marker = "equal to the number of ";
    let start = rest.find(marker)? + marker.len();
    let tail = &rest[start..];
    // Only "<things> you control" / "<things> your opponents control": counts
    // over graveyards, hands or the whole battlefield are a different question.
    let (phrase, opponents) = if let Some(i) = tail.find(" your opponents control") {
        (&tail[..i], true)
    } else if let Some(i) = tail.find(" you control") {
        (&tail[..i], false)
    } else {
        return None;
    };
    // "artifacts" -> "artifact"; a multi-word phrase ("creature cards") is a
    // shape we do not model.
    let word = phrase.trim();
    if word.is_empty() || word.contains(' ') {
        return None;
    }
    Some(CountCda {
        counts: word.strip_suffix('s').unwrap_or(word).to_string(),
        opponents,
        toughness,
    })
}

/// Spell-intent classification: what an instant/sorcery DOES, coarsely, so a
/// bot can pick spells for a reason and announcements can say what happened.
/// Closed patterns like everything else here - unknown text classifies as
/// nothing rather than wrongly.
fn parse_spell_intent(
    text: &str,
) -> (bool, Option<i64>, Option<i64>, bool, bool, Option<i64>) {
    let t = strip_asides(&text.replace('\n', " ")).to_lowercase();
    // Free-text scanning runs into sentence punctuation ("scry 1."), which
    // the clause-level parsers never see; shed it before reading a number.
    let number = |word: &str| word_number(word.trim_matches(|c: char| ".,;:".contains(c)));
    let counters_spell = t.contains("counter target spell");
    // "Draw two cards" as a CASTER effect: the verb must open its clause
    // (optionally after "you"), or "each opponent draws" / "target player
    // draws" would wrongly credit the caster.
    let draws = t
        .split(['.', ';'])
        .flat_map(|s| s.split(", then "))
        .find_map(|part| {
            let part = part.trim();
            let part = part.strip_prefix("you ").unwrap_or(part);
            let rest = part.strip_prefix("draw ")?;
            let mut words = rest.split_whitespace();
            let n = number(words.next()?)?;
            let noun = words.next()?;
            noun.starts_with("card").then_some(n)
        });
    // "each opponent discards N" (symmetric), or "target player/opponent
    // discards N" (targeted - the flag lets multiplayer keep it manual,
    // since a player target cannot be expressed on the stack).
    let mut discards = None;
    let mut discards_random = false;
    let mut discards_targeted = false;
    for (prefix, targeted) in [
        ("each opponent discards ", false),
        ("target player discards ", true),
        ("target opponent discards ", true),
    ] {
        if let Some(start) = t.find(prefix) {
            let tail = &t[start + prefix.len()..];
            let mut words = tail.split_whitespace();
            if let Some(n) = words.next().and_then(&number) {
                if words.next().map(|w| w.starts_with("card")).unwrap_or(false) {
                    discards = Some(n);
                    discards_targeted = targeted;
                    // The random rider follows the noun: "...two cards at random".
                    discards_random = tail
                        .split(". ")
                        .next()
                        .map(|sentence| sentence.contains("at random"))
                        .unwrap_or(false);
                    break;
                }
            }
        }
    }
    // "scry N" anywhere in the text.
    let scry = t.find("scry ").and_then(|at| {
        let mut words = t[at + "scry ".len()..].split_whitespace();
        number(words.next()?)
    });
    (counters_spell, draws, discards, discards_random, discards_targeted, scry)
}

/// Parse a bare ability/effect clause ("You gain 2 life. Draw a card") with
/// the trigger parser's closed effect set - used for loyalty activations,
/// where the +N/-N is the cost and this text is the effect. Unknown parts
/// collapse to [Manual], exactly like triggers.
pub fn parse_ability_effects(text: &str, card_name: &str) -> Vec<TriggerEffect> {
    let name_lower = card_name.to_lowercase();
    let short_lower = name_lower.split(',').next().unwrap_or(&name_lower).to_string();
    parse_effects(text, &name_lower, &short_lower)
}

/// A clean mana-ability line: "{T}: Add ..." with nothing before the tap
/// symbol. "{1}, {T}: Add", "Sacrifice ...: Add", and triggered adds all fail
/// the prefix test on purpose - a cost the engine cannot pay must not create
/// mana it cannot charge for.
fn parse_taps_for_mana(text: &str) -> bool {
    text.lines().any(|l| strip_asides(l).trim().to_lowercase().starts_with("{t}: add "))
}

/// "+2: ...", "\u{2212}3: ...", "0: ..." loyalty lines (Scryfall templating
/// is rigid here). Lines whose cost is not a plain signed number (X-costs,
/// ability words) are skipped.
fn parse_loyalty_abilities(text: &str) -> Vec<LoyaltyAbility> {
    let mut out = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        let Some((cost, body)) = line.split_once(':') else { continue };
        let cost = cost.trim();
        let delta = if cost == "0" {
            Some(0)
        } else if let Some(n) = cost.strip_prefix('+') {
            n.parse::<i64>().ok()
        } else if let Some(n) = cost.strip_prefix('\u{2212}').or_else(|| cost.strip_prefix('-')) {
            n.parse::<i64>().ok().map(|v| -v)
        } else {
            None
        };
        if let Some(delta) = delta {
            let body = body.trim();
            if !body.is_empty() {
                out.push(LoyaltyAbility { delta, text: body.to_string() });
            }
        }
    }
    out
}

/// Clause-initial spell effects the engine can apply on resolution, beyond
/// the dedicated intent fields: token-making, lifegain, and self-mill.
/// Deliberately per-clause (NOT all-or-nothing): "Destroy target creature.
/// Draw a card." keeps its recognizable parts and leaves the rest manual.
fn parse_spell_effects(text: &str, name: &str) -> Vec<TriggerEffect> {
    let name_lower = name.to_lowercase();
    let short_lower = name_lower.split(',').next().unwrap_or(&name_lower).to_string();
    let t = strip_asides(&text.replace('\n', " ")).to_lowercase();
    t.split(['.', ';'])
        .flat_map(|sentence| sentence.split(", then "))
        .filter_map(|part| parse_effect_part(part.trim(), &name_lower, &short_lower))
        .filter(|e| {
            matches!(
                e,
                TriggerEffect::Token { .. }
                    | TriggerEffect::GainLife { .. }
                    | TriggerEffect::Mill { .. }
                    | TriggerEffect::EachOpponentSacrifices { .. }
                    | TriggerEffect::DestroyAllCreatures
            )
        })
        .collect()
}

/// Does this text read as removal or burn aimed at creatures? Feeds the
/// bot's threat table; deliberately coarse.
fn parse_threat(text: &str) -> bool {
    let t = strip_asides(&text.replace('\n', " ")).to_lowercase();
    t.contains("destroy target creature")
        || t.contains("exile target creature")
        || t.contains("destroy target permanent")
        || t.contains("exile target permanent")
        || t.contains("damage to any target")
        || (t.contains("damage to target creature") && t.contains("deals"))
        || t.contains("target creature gets -")
}

/// The raw slice of a Scryfall card record this module reads.
#[derive(Deserialize)]
struct ScryCard {
    id: Option<String>,
    name: Option<String>,
    type_line: Option<String>,
    mana_cost: Option<String>,
    cmc: Option<f64>,
    power: Option<String>,
    toughness: Option<String>,
    #[serde(default)]
    oracle_text: Option<String>,
    #[serde(default)]
    colors: Option<Vec<String>>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    produced_mana: Vec<String>,
    #[serde(default)]
    loyalty: Option<String>,
    #[serde(default)]
    card_faces: Vec<ScryFace>,
}

#[derive(Deserialize)]
struct ScryFace {
    type_line: Option<String>,
    mana_cost: Option<String>,
    power: Option<String>,
    toughness: Option<String>,
    #[serde(default)]
    loyalty: Option<String>,
    #[serde(default)]
    oracle_text: Option<String>,
    #[serde(default)]
    colors: Option<Vec<String>>,
}

/// A printed stat as a number. `*` and friends are not numbers; "1+*" is worth
/// the 1 it guarantees, rather than being thrown away and fighting as a 0.
fn stat(s: &Option<String>) -> Option<i64> {
    let raw = s.as_deref()?.trim();
    if let Ok(n) = raw.parse::<i64>() {
        return Some(n);
    }
    let digits: String = raw.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

fn parse_card(raw: &ScryCard) -> Option<OracleCard> {
    // Scryfall returns COMBINED strings for split and adventure layouts:
    // Murderous Rider's type line is "Creature - Zombie Knight // Instant" and
    // its cost "{1}{B}{B} // {1}{B}". Read those literally and the creature
    // looks like an instant (it resolves to the graveyard instead of the
    // battlefield) and costs the sum of both halves. Whenever the record has
    // faces, face 0 is the one cast from hand - that is the card we enforce.
    let face = raw.card_faces.first();
    let type_line = face
        .and_then(|f| f.type_line.clone())
        .filter(|t| !t.is_empty())
        .or_else(|| raw.type_line.clone())?;
    let cost = face
        .and_then(|f| f.mana_cost.clone())
        .filter(|c| !c.is_empty())
        .or_else(|| raw.mana_cost.clone())
        .unwrap_or_default();
    let (generic, pips) = parse_cost(&cost);
    let power = stat(&raw.power).or_else(|| face.map(|f| stat(&f.power)).unwrap_or(None));
    let toughness =
        stat(&raw.toughness).or_else(|| face.map(|f| stat(&f.toughness)).unwrap_or(None));
    let name = raw.name.clone().unwrap_or_default();
    // Full-card oracle text; DFC/split cards join their faces' texts. The
    // FRONT face is what enters the battlefield, but keeping every face's
    // text costs nothing and later passes may want the back.
    let oracle_text = raw
        .oracle_text
        .clone()
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| {
            raw.card_faces
                .iter()
                .filter_map(|f| f.oracle_text.clone())
                .collect::<Vec<_>>()
                .join("\n")
        });
    let triggers = parse_triggers(&name, &oracle_text);
    let threat = parse_threat(&oracle_text);
    let colors: Vec<char> = raw
        .colors
        .clone()
        .or_else(|| face.and_then(|f| f.colors.clone()))
        .unwrap_or_default()
        .iter()
        .filter_map(|c| c.chars().next())
        .filter(|c| "WUBRG".contains(*c))
        .collect();
    let has_ward_kw = raw.keywords.iter().any(|k| k.eq_ignore_ascii_case("ward"));
    let repl = parse_replacements(&name, &oracle_text);
    // `cmc` counts BOTH halves of a split card, so a front-face cost has to
    // bring its own mana value or the two would disagree.
    let mv = if face.is_some() {
        generic + pips.values().sum::<i64>()
    } else {
        raw.cmc.unwrap_or(0.0).round() as i64
    };
    // `*` power is defined by an ability, not printed. Recording what it
    // counts is what lets those creatures attack and block at all.
    let starred = raw
        .power
        .as_deref()
        .or_else(|| face.and_then(|f| f.power.as_deref()))
        .map(|p| p.contains('*'))
        .unwrap_or(false);
    let (counters_spell, draws_spell, opp_discards, opp_discards_random, opp_discards_targeted, scry_spell) =
        parse_spell_intent(&oracle_text);
    let loyalty = raw
        .loyalty
        .as_deref()
        .or_else(|| face.and_then(|f| f.loyalty.as_deref()))
        .and_then(|l| l.parse::<i64>().ok());
    let taps_for_mana = parse_taps_for_mana(&oracle_text);
    let loyalty_abilities = if type_line.contains("Planeswalker") {
        parse_loyalty_abilities(&oracle_text)
    } else {
        Vec::new()
    };
    let spell_effects = parse_spell_effects(&oracle_text, &name);
    Some(OracleCard {
        name,
        type_line,
        mv,
        generic,
        pips,
        power,
        toughness,
        keywords: raw.keywords.iter().map(|k| k.to_lowercase()).collect(),
        produced: raw
            .produced_mana
            .iter()
            .filter_map(|c| c.chars().next())
            .filter(|c| "WUBRGC".contains(*c))
            .collect(),
        statics: parse_statics(&oracle_text),
        unblockable: parse_unblockable(&oracle_text),
        protection_from: parse_protection(&oracle_text),
        ward: if has_ward_kw { parse_ward(&oracle_text) } else { None },
        enters_tapped: repl.enters_tapped,
        enters_counters: repl.enters_counters,
        dies_to_exile: repl.dies_to_exile,
        prevent_combat_to: repl.prevent_to,
        prevent_combat_by: repl.prevent_by,
        discover: parse_discover(&oracle_text),
        cda: if starred { parse_cda(&oracle_text) } else { None },
        loyalty,
        counters_spell,
        draws_spell,
        opp_discards,
        opp_discards_random,
        opp_discards_targeted,
        scry_spell,
        taps_for_mana,
        loyalty_abilities,
        spell_effects,
        colors,
        oracle_text,
        triggers,
        threat,
        v: ORACLE_VERSION,
    })
}


/// Cache an oracle row, and teach the bot's card reader about it on the way in.
///
/// The bot reads cards through a compact attribute table that only covers the
/// decks bundled with the server (bot/knowledge.rs). A card outside it is not
/// "unknown but playable" - it is invisible: `is_land()` answers false, so the
/// bot makes no land drop, casts nothing and sees no creatures. A generated
/// deck pool that shipped without attributes put bots in exactly that state.
///
/// Everything at a table passes through here, so this is the one place that can
/// make the bot's table-reading fallback real rather than assumed.
fn cache_card(app: &App, id: String, card: OracleCard) {
    crate::bot::learn(
        &id,
        &card.type_line,
        card.mv as f64,
        card.power.map(|v| v.to_string()).as_deref(),
        card.toughness.map(|v| v.to_string()).as_deref(),
    );
    app.oracle.insert(id, Arc::new(card));
}

/// Synchronous cache read. None = not (yet) known.
pub fn get(app: &App, scryfall_id: &str) -> Option<Arc<OracleCard>> {
    app.oracle.get(scryfall_id).map(|e| e.value().clone())
}

/// Make sure every id in `ids` is cached: memory first, then the SQLite
/// mirror, then Scryfall in /cards/collection batches of 75. Failures leave
/// ids unknown (retried the next time something asks).
/// `pc-<slug>` -> Scryfall oracle id, read once from the alt-art catalog the
/// server already serves at /api/alt-art/catalog.json.
///
/// Without this, every card wearing curated art is invisible to the rules
/// engine: the id is not a Scryfall id, so the oracle skipped it and the card
/// arrived with no triggers, no keywords and no type line. A deck of custom
/// art played as a deck of blanks - Sheoldred in a Goth Mommy frame drew for
/// turn and did nothing at all.
fn alt_art_identities(app: &Arc<App>) -> Arc<BTreeMap<String, String>> {
    static MAP: std::sync::OnceLock<Arc<BTreeMap<String, String>>> = std::sync::OnceLock::new();
    MAP.get_or_init(|| {
        #[derive(Deserialize)]
        struct Entry {
            id: String,
            #[serde(rename = "oracleId")]
            oracle_id: Option<String>,
        }
        #[derive(Deserialize)]
        struct Catalog {
            #[serde(default)]
            arts: Vec<Entry>,
        }
        let path = app.alt_art_dir.join("catalog.json");
        let mut out = BTreeMap::new();
        match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Catalog>(&raw) {
                Ok(cat) => {
                    for e in cat.arts {
                        if let Some(oid) = e.oracle_id {
                            out.insert(e.id, oid);
                        }
                    }
                }
                Err(e) => eprintln!("oracle: alt-art catalog did not parse ({e})"),
            },
            // No catalog is normal on a fresh install; custom art simply has
            // no identities to map yet.
            Err(_) => {}
        }
        Arc::new(out)
    })
    .clone()
}

/// Fetch one card by ORACLE id (the only handle a `pc-` art has) and cache the
/// parse under the art's own id, so every later lookup is a plain hit.
async fn fetch_by_oracle_id(app: &Arc<App>, art_id: &str, oracle_id: &str) {
    let url = format!(
        "https://api.scryfall.com/cards/search?q=oracleid%3A{oracle_id}&unique=cards&order=released"
    );
    let output = tokio::process::Command::new("curl")
        .arg("-s")
        .arg("-m")
        .arg("20")
        .arg("-H")
        .arg("user-agent: PrettyCardboard/0.5 (tabletop; oracle cache)")
        .arg("-H")
        .arg("accept: application/json")
        .arg(&url)
        .output()
        .await;
    let Ok(out) = output else {
        eprintln!("oracle: could not run curl for {art_id}");
        return;
    };
    #[derive(Deserialize)]
    struct Search {
        #[serde(default)]
        data: Vec<ScryCard>,
    }
    let Ok(parsed) = serde_json::from_slice::<Search>(&out.stdout) else {
        eprintln!(
            "oracle: no card for oracle id {oracle_id} ({art_id}): {}",
            String::from_utf8_lossy(&out.stdout).chars().take(160).collect::<String>()
        );
        return;
    };
    let Some(raw) = parsed.data.first() else {
        eprintln!("oracle: oracle id {oracle_id} ({art_id}) matched no printing");
        return;
    };
    let Some(card) = parse_card(raw) else { return };
    {
        let conn = app.db.lock().unwrap();
        if let Ok(json) = serde_json::to_string(&card) {
            crate::db::oracle_store(&conn, art_id, &json);
        }
    }
    cache_card(app, art_id.to_string(), card);
}

pub async fn ensure(app: &Arc<App>, ids: Vec<String>) {
    let mut missing: Vec<String> = Vec::new();
    // Curated art ids, which Scryfall answers to only by oracle identity.
    let mut art_missing: Vec<(String, String)> = Vec::new();
    let identities = alt_art_identities(app);
    {
        let conn = app.db.lock().unwrap();
        for id in ids {
            if app.oracle.contains_key(&id) {
                continue;
            }
            // A custom art id is not a Scryfall id, but the catalog knows
            // which card it IS. Anything with no identity stays unknown, as
            // before - the rules engine treats unknown cards permissively.
            let is_scryfall_shaped = id.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
            if !is_scryfall_shaped {
                if let Some(oracle_id) = identities.get(&id) {
                    if let Some(json) = crate::db::oracle_load(&conn, &id) {
                        if let Ok(card) = serde_json::from_str::<OracleCard>(&json) {
                            if card.v == ORACLE_VERSION {
                                cache_card(app, id, card);
                                continue;
                            }
                        }
                    }
                    art_missing.push((id, oracle_id.clone()));
                }
                continue;
            }
            if let Some(json) = crate::db::oracle_load(&conn, &id) {
                if let Ok(mut card) = serde_json::from_str::<OracleCard>(&json) {
                    if card.v == ORACLE_VERSION {
                        cache_card(app, id, card);
                        continue;
                    }
                    // A v4+ row carries everything reparsing needs (text +
                    // colors + keywords): upgrade locally instead of asking
                    // Scryfall again. Anything older is missing raw facts
                    // (v3 had no colors) and falls through to a refetch.
                    // Exception: loyalty (new in v7) is a RAW fact no reparse
                    // can recover, so a cached planeswalker refetches once.
                    let walker_needs_loyalty =
                        card.type_line.contains("Planeswalker") && card.loyalty.is_none();
                    if card.v >= 4 && !card.oracle_text.is_empty() && !walker_needs_loyalty {
                        card.triggers = parse_triggers(&card.name, &card.oracle_text);
                        card.threat = parse_threat(&card.oracle_text);
                        card.statics = parse_statics(&card.oracle_text);
                        card.unblockable = parse_unblockable(&card.oracle_text);
                        card.protection_from = parse_protection(&card.oracle_text);
                        card.ward = if card.keywords.contains("ward") {
                            parse_ward(&card.oracle_text)
                        } else {
                            None
                        };
                        let repl = parse_replacements(&card.name, &card.oracle_text);
                        card.enters_tapped = repl.enters_tapped;
                        card.enters_counters = repl.enters_counters;
                        card.dies_to_exile = repl.dies_to_exile;
                        card.prevent_combat_to = repl.prevent_to;
                        card.prevent_combat_by = repl.prevent_by;
                        card.discover = parse_discover(&card.oracle_text);
                        let (counters_spell, draws_spell, opp_discards, opp_discards_random, opp_discards_targeted, scry_spell) =
                            parse_spell_intent(&card.oracle_text);
                        card.counters_spell = counters_spell;
                        card.draws_spell = draws_spell;
                        card.opp_discards = opp_discards;
                        card.opp_discards_random = opp_discards_random;
                        card.opp_discards_targeted = opp_discards_targeted;
                        card.scry_spell = scry_spell;
                        card.taps_for_mana = parse_taps_for_mana(&card.oracle_text);
                        card.loyalty_abilities = if card.type_line.contains("Planeswalker") {
                            parse_loyalty_abilities(&card.oracle_text)
                        } else {
                            Vec::new()
                        };
                        card.spell_effects = parse_spell_effects(&card.oracle_text, &card.name);
                        card.v = ORACLE_VERSION;
                        if let Ok(fresh) = serde_json::to_string(&card) {
                            crate::db::oracle_store(&conn, &id, &fresh);
                        }
                        cache_card(app, id, card);
                        continue;
                    }
                }
            }
            missing.push(id);
        }
    }
    if missing.is_empty() && art_missing.is_empty() {
        return;
    }
    // One fetch at a time server-wide keeps us far inside Scryfall's limits
    // even if several enforced rooms start at once.
    let _guard = app.oracle_lock.lock().await;
    // Curated art first: one request each (there is no batch endpoint for
    // oracle ids), and a deck of custom art is otherwise a deck of blanks.
    art_missing.retain(|(id, _)| !app.oracle.contains_key(id));
    for (art_id, oracle_id) in &art_missing {
        fetch_by_oracle_id(app, art_id, oracle_id).await;
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    }
    if missing.is_empty() {
        return;
    }
    missing.retain(|id| !app.oracle.contains_key(id));
    for batch in missing.chunks(75) {
        let identifiers: Vec<serde_json::Value> =
            batch.iter().map(|id| serde_json::json!({ "id": id })).collect();
        let body = serde_json::json!({ "identifiers": identifiers }).to_string();
        // Scryfall REQUIRES a User-Agent; requests without one are refused.
        let output = tokio::process::Command::new("curl")
            .arg("-s")
            .arg("-m")
            .arg("20")
            .arg("-X")
            .arg("POST")
            .arg("-H")
            .arg("user-agent: PrettyCardboard/0.5 (tabletop; oracle cache)")
            .arg("-H")
            .arg("content-type: application/json")
            .arg("-H")
            .arg("accept: application/json")
            .arg("--data-binary")
            .arg(&body)
            .arg("https://api.scryfall.com/cards/collection")
            .output()
            .await;
        // Every failure here is loud. A silently-swallowed fetch leaves the
        // cache empty, and an empty cache makes an enforced table reject every
        // cast with "no rules data yet" - a symptom that looks like a rules bug
        // and is nearly impossible to trace back to the network without a log.
        let out = match output {
            Ok(out) => out,
            Err(e) => {
                eprintln!("oracle: could not run curl ({e}); {} cards left unknown", batch.len());
                continue;
            }
        };
        if !out.status.success() {
            eprintln!(
                "oracle: scryfall fetch failed (curl exit {:?}); {} cards left unknown: {}",
                out.status.code(),
                batch.len(),
                String::from_utf8_lossy(&out.stderr).trim(),
            );
            continue;
        }
        #[derive(Deserialize)]
        struct Collection {
            #[serde(default)]
            data: Vec<ScryCard>,
        }
        let parsed = match serde_json::from_slice::<Collection>(&out.stdout) {
            Ok(parsed) => parsed,
            Err(e) => {
                // Scryfall answers errors (a refused User-Agent, a rate limit)
                // as a JSON error object, which fails to parse as a collection.
                eprintln!(
                    "oracle: scryfall returned no usable card list ({e}); {} cards left unknown: {}",
                    batch.len(),
                    String::from_utf8_lossy(&out.stdout).chars().take(200).collect::<String>(),
                );
                continue;
            }
        };
        // Scoped: the std MutexGuard must be gone before the await below
        // (future Send analysis is lexical, an explicit drop does not count).
        {
            let conn = app.db.lock().unwrap();
            for raw in &parsed.data {
                let Some(id) = raw.id.clone() else { continue };
                let Some(card) = parse_card(raw) else { continue };
                if let Ok(json) = serde_json::to_string(&card) {
                    crate::db::oracle_store(&conn, &id, &json);
                }
                cache_card(app, id, card);
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn triggers(name: &str, text: &str) -> Vec<Trigger> {
        parse_triggers(name, text)
    }

    /// Every oracle string in the parse_card tests below is the real Scryfall
    /// text for that card.
    fn parse(json: serde_json::Value) -> OracleCard {
        parse_card(&serde_json::from_value::<ScryCard>(json).expect("ScryCard")).expect("parsed")
    }

    #[test]
    fn unconditional_taplands_enter_tapped() {
        // The card from the audit transcript: played, then immediately tapped
        // for a Nature's Lore it should not have been able to pay for.
        let grove = parse(serde_json::json!({
            "name": "Radiant Grove",
            "type_line": "Land",
            "oracle_text": "({T}: Add {G} or {W}.)\nThis land enters tapped.",
            "produced_mana": ["G", "W"],
        }));
        assert!(grove.enters_tapped);

        // Older templating names the card instead of saying "This land".
        let citadel = parse(serde_json::json!({
            "name": "Seaside Citadel",
            "type_line": "Land",
            "oracle_text": "Seaside Citadel enters the battlefield tapped.",
        }));
        assert!(citadel.enters_tapped);
    }

    #[test]
    fn conditional_taplands_do_not() {
        // An enforced table offers no way to untap a permanent the engine got
        // wrong, so anything the parser cannot decide stays untapped.
        for text in [
            "This land enters tapped unless you control two or more basic lands.",
            "This land enters tapped unless you control a Forest or a Plains.",
            "As this land enters, you may reveal a Plains or Island card from your hand. If you don't, this land enters tapped.",
        ] {
            let card = parse(serde_json::json!({
                "name": "Canopy Vista", "type_line": "Land", "oracle_text": text,
            }));
            assert!(!card.enters_tapped, "should NOT enter tapped: {text}");
        }
    }

    #[test]
    fn a_clause_about_someone_elses_card_is_not_about_this_one() {
        // Edgar taps the artifact he lets you recast, not himself.
        let edgar = parse(serde_json::json!({
            "name": "Edgar, Master Machinist",
            "type_line": "Legendary Creature — Human Artificer",
            "oracle_text": "Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped.",
            "power": "3", "toughness": "4",
        }));
        assert!(!edgar.enters_tapped);
    }

    #[test]
    fn adventure_cards_read_their_creature_face() {
        // Scryfall hands back both halves joined; taken literally the creature
        // reads as an Instant (and resolves to the graveyard) and is billed
        // for both costs at once.
        let rider = parse(serde_json::json!({
            "name": "Murderous Rider // Swift End",
            "type_line": "Creature — Zombie Knight // Instant",
            "mana_cost": "{1}{B}{B} // {1}{B}",
            "cmc": 3.0,
            "card_faces": [
                { "type_line": "Creature — Zombie Knight", "mana_cost": "{1}{B}{B}",
                  "power": "2", "toughness": "3", "oracle_text": "Lifelink" },
                { "type_line": "Instant", "mana_cost": "{1}{B}",
                  "oracle_text": "Destroy target creature or planeswalker." },
            ],
        }));
        assert!(!rider.is_instant(), "the creature half is what you cast from hand");
        assert!(rider.is_creature());
        assert!(rider.is_permanent(), "must resolve to the battlefield, not the graveyard");
        assert_eq!(rider.generic, 1);
        assert_eq!(rider.pip('B'), 2, "billed 5 when both halves were summed");
        assert_eq!(rider.mv, 3);
    }

    #[test]
    fn split_cards_are_billed_for_one_half() {
        let split = parse(serde_json::json!({
            "name": "Fire // Ice",
            "type_line": "Instant // Instant",
            "mana_cost": "{1}{R} // {1}{U}",
            "cmc": 4.0,
            "card_faces": [
                { "type_line": "Instant", "mana_cost": "{1}{R}" },
                { "type_line": "Instant", "mana_cost": "{1}{U}" },
            ],
        }));
        assert!(split.is_instant());
        assert_eq!((split.generic, split.pip('R'), split.pip('U')), (1, 1, 0));
        assert_eq!(split.mv, 2, "cmc counts both halves; the cast cost does not");
    }

    #[test]
    fn single_faced_cards_are_untouched() {
        let bolt = parse(serde_json::json!({
            "name": "Lightning Bolt", "type_line": "Instant",
            "mana_cost": "{R}", "cmc": 1.0,
            "oracle_text": "Lightning Bolt deals 3 damage to any target.",
        }));
        assert!(bolt.is_instant());
        assert_eq!((bolt.generic, bolt.pip('R'), bolt.mv), (0, 1, 1));
        assert!(!bolt.enters_tapped);
    }

    #[test]
    fn star_power_carries_its_defining_ability() {
        let guardian = parse(serde_json::json!({
            "name": "Bronze Guardian",
            "type_line": "Artifact Creature — Golem",
            "mana_cost": "{4}{W}", "cmc": 5.0,
            "power": "*", "toughness": "5",
            "oracle_text": "Double strike\nWard {2}\nOther artifacts you control have ward {2}.\nBronze Guardian's power is equal to the number of artifacts you control.",
        }));
        let cda = guardian.cda.expect("counting CDA");
        assert_eq!(cda.counts, "artifact");
        assert!(!cda.opponents);
        assert!(!cda.toughness);

        let avalanche = parse(serde_json::json!({
            "name": "Avalanche of Sector 7",
            "type_line": "Legendary Creature — Human Rebel",
            "mana_cost": "{2}{R}", "power": "*", "toughness": "3",
            "oracle_text": "Menace\nAvalanche of Sector 7's power is equal to the number of artifacts your opponents control.",
        }));
        assert!(avalanche.cda.expect("counting CDA").opponents);
    }

    #[test]
    fn a_numeric_prefix_is_a_floor_not_a_zero() {
        // "1+*" guarantees at least 1; the old parser threw the whole string
        // away and the creature fought as a 0/0.
        let card = parse(serde_json::json!({
            "name": "Nighthawk Scavenger", "type_line": "Creature — Vampire Rogue",
            "mana_cost": "{2}{B}", "power": "1+*", "toughness": "3",
            "oracle_text": "Flying, deathtouch, lifelink\nNighthawk Scavenger's power is equal to 1 plus the number of card types among cards in your opponents' graveyards.",
        }));
        assert_eq!(card.power, Some(1));
        assert!(card.cda.is_none(), "not a plain permanent count");
    }

    #[test]
    fn etb_draw() {
        let t = triggers("Elvish Visionary", "When this creature enters, draw a card.");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::Etb);
        assert_eq!(t[0].effects, vec![TriggerEffect::Draw { n: 1 }]);
        assert!(t[0].auto());
    }

    #[test]
    fn land_etb_life() {
        let t = triggers(
            "Radiant Fountain",
            "When this land enters, you gain 2 life.\n{T}: Add {C}.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::Etb);
        assert_eq!(t[0].effects, vec![TriggerEffect::GainLife { n: 2 }]);
    }

    #[test]
    fn dies_token() {
        let t = triggers(
            "Doomed Dissenter",
            "When this creature dies, create a 2/2 black Zombie creature token.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::Dies);
        assert_eq!(
            t[0].effects,
            vec![TriggerEffect::Token {
                name: "Zombie".into(),
                power: 2,
                toughness: 2,
                count: 1,
                tapped: false
            }]
        );
    }

    #[test]
    fn compound_draw_and_lose() {
        let t = triggers(
            "Dusk Legion Zealot",
            "When this creature enters, you draw a card and you lose 1 life.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(
            t[0].effects,
            vec![TriggerEffect::Draw { n: 1 }, TriggerEffect::LoseLife { n: 1 }]
        );
    }

    #[test]
    fn compound_drain() {
        let t = triggers(
            "Vampire Spawn",
            "When this creature enters, each opponent loses 2 life and you gain 2 life.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(
            t[0].effects,
            vec![TriggerEffect::EachOpponentLoses { n: 2 }, TriggerEffect::GainLife { n: 2 }]
        );
    }

    #[test]
    fn attack_counter_and_etb_draw() {
        let t = triggers(
            "Operations Officer",
            "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nWhen this creature enters, draw a card.\nWhenever this creature attacks, put a +1/+1 counter on it.",
        );
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].when, TriggerWhen::Etb);
        assert_eq!(t[1].when, TriggerWhen::Attacks);
        assert_eq!(
            t[1].effects,
            vec![TriggerEffect::SelfCounters { counter: "+1/+1".into(), n: 1 }]
        );
    }

    #[test]
    fn upkeep_and_end_step() {
        let t = triggers(
            "Breeding Pit",
            "At the beginning of your upkeep, sacrifice this enchantment unless you pay {B}{B}.\nAt the beginning of your end step, create a 0/1 black Thrull creature token.",
        );
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].when, TriggerWhen::Upkeep);
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);
        assert!(!t[0].auto());
        assert_eq!(t[1].when, TriggerWhen::EndStep);
        assert!(t[1].auto());
    }

    #[test]
    fn granted_abilities_do_not_fire() {
        // A card that TEACHES an attack trigger has no attack trigger itself.
        let t = triggers(
            "Root Manipulation",
            "Until end of turn, creatures you control get +2/+2 and gain menace and \"Whenever this creature attacks, you gain 1 life.\" (A creature with menace can't be blocked except by two or more creatures.)",
        );
        assert!(t.is_empty());
    }

    #[test]
    fn other_creatures_do_not_fire() {
        let t = triggers(
            "Hellrider",
            "Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking.",
        );
        assert!(t.is_empty());
    }

    #[test]
    fn trailing_scry_sentence_parses() {
        // Once collapsed the whole trigger to Manual; sentences now apply in
        // order as long as every one stays inside the closed set.
        let t = triggers(
            "Dream Beavers",
            "Flying\nWhen this creature enters, each opponent loses 1 life and you gain 1 life. Scry 1.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(
            t[0].effects,
            vec![
                TriggerEffect::EachOpponentLoses { n: 1 },
                TriggerEffect::GainLife { n: 1 },
                TriggerEffect::Scry { n: 1 },
            ]
        );
    }

    #[test]
    fn trailing_unknown_sentence_is_still_manual() {
        let t = triggers(
            "Test Beast",
            "When this creature enters, draw a card. Proliferate.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);
    }

    #[test]
    fn discard_effects_parse() {
        let t = triggers("Raving Oni-Slave", "When this creature enters, discard a card.");
        assert_eq!(t[0].effects, vec![TriggerEffect::Discard { n: 1, random: false }]);
        let t = triggers(
            "Burglar Rat",
            "When this creature enters, each opponent discards a card.",
        );
        assert_eq!(
            t[0].effects,
            vec![TriggerEffect::EachOpponentDiscards { n: 1, random: false }]
        );
        let t = triggers(
            "Chaos Imp",
            "When this creature enters, each opponent discards two cards at random.",
        );
        assert_eq!(
            t[0].effects,
            vec![TriggerEffect::EachOpponentDiscards { n: 2, random: true }]
        );
    }

    #[test]
    fn scry_mill_and_then_chains_parse() {
        let t = triggers("Sage Owl", "When this creature enters, scry 2.");
        assert_eq!(t[0].effects, vec![TriggerEffect::Scry { n: 2 }]);
        let t = triggers("Codex Shredder Beast", "When this creature enters, mill three cards.");
        assert_eq!(t[0].effects, vec![TriggerEffect::Mill { n: 3 }]);
        let t = triggers(
            "Sea Gate Oracle Kin",
            "When this creature enters, draw a card, then discard a card.",
        );
        assert_eq!(
            t[0].effects,
            vec![
                TriggerEffect::Draw { n: 1 },
                TriggerEffect::Discard { n: 1, random: false },
            ]
        );
    }

    #[test]
    fn spell_intent_classifies() {
        let (counters, draws, discards, random, targeted, scry) =
            parse_spell_intent("Counter target spell.");
        assert!(counters);
        assert_eq!((draws, discards, random, targeted, scry), (None, None, false, false, None));
        let (_, draws, _, _, _, scry) = parse_spell_intent("Draw two cards, then scry 1.");
        assert_eq!(draws, Some(2));
        assert_eq!(scry, Some(1));
        let (_, draws, _, _, _, scry) = parse_spell_intent("Scry 2, then draw a card.");
        assert_eq!(draws, Some(1));
        assert_eq!(scry, Some(2));
        let (_, _, discards, random, targeted, _) =
            parse_spell_intent("Target player discards two cards at random.");
        assert_eq!(discards, Some(2));
        assert!(random);
        assert!(targeted);
        let (_, _, discards, random, targeted, _) =
            parse_spell_intent("Each opponent discards a card.");
        assert_eq!(discards, Some(1));
        assert!(!random);
        assert!(!targeted);
    }

    #[test]
    fn mana_ability_lines_classify() {
        assert!(parse_taps_for_mana("{T}: Add {C}{C}."));
        assert!(parse_taps_for_mana("{T}: Add {G}."));
        // A second, costed line does not spoil the clean first one.
        assert!(parse_taps_for_mana(
            "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."
        ));
        // Extra costs before the tap, or triggered adds, are not mana the
        // engine can charge for.
        assert!(!parse_taps_for_mana("{2}, {T}: Add one mana of any color."));
        assert!(!parse_taps_for_mana("Sacrifice a creature: Add {B}{B}."));
        assert!(!parse_taps_for_mana("Whenever this creature becomes tapped, add {C}."));
    }

    #[test]
    fn loyalty_abilities_parse() {
        let text = "+1: Exile the top card of your library.\n0: Draw a card.\n\u{2212}3: Chandra deals 4 damage to target creature.\n\u{2212}X: Destroy X permanents.";
        let abilities = parse_loyalty_abilities(text);
        assert_eq!(abilities.len(), 3); // the X-cost line is skipped
        assert_eq!(abilities[0].delta, 1);
        assert_eq!(abilities[1].delta, 0);
        assert_eq!(abilities[2].delta, -3);
        assert!(abilities[2].text.starts_with("Chandra deals"));
    }

    #[test]
    fn spell_effects_parse_per_clause() {
        let effects = parse_spell_effects("Create two 1/1 white Soldier creature tokens.", "Raise the Alarm");
        assert_eq!(
            effects,
            vec![TriggerEffect::Token { name: "Soldier".into(), power: 1, toughness: 1, count: 2, tapped: false }]
        );
        assert_eq!(
            parse_spell_effects("You gain 4 life.", "Revitalize"),
            vec![TriggerEffect::GainLife { n: 4 }]
        );
        assert_eq!(
            parse_spell_effects("Mill three cards.", "Sift"),
            vec![TriggerEffect::Mill { n: 3 }]
        );
        // Per-clause: the unrecognized clause stays manual, the known one lands.
        assert_eq!(
            parse_spell_effects("Destroy target creature. You gain 2 life.", "Murderous Cut"),
            vec![TriggerEffect::GainLife { n: 2 }]
        );
        // An activated-ability line is not a spell effect.
        assert!(parse_spell_effects("Sacrifice a creature: You gain 2 life.", "Altar").is_empty());
    }

    #[test]
    fn saboteur_triggers_parse() {
        let t = triggers(
            "Thieving Magpie",
            "Flying\nWhenever this creature deals combat damage to a player, draw a card.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::DealsPlayerDamage);
        assert_eq!(t[0].effects, vec![TriggerEffect::Draw { n: 1 }]);
    }

    #[test]
    fn spell_intent_never_credits_opponent_draws_to_the_caster() {
        // The draw verb must open its clause: another player's draw is not
        // the caster's cantrip.
        let (_, draws, _, _, _, _) = parse_spell_intent("Each opponent draws a card.");
        assert_eq!(draws, None);
        let (_, draws, _, _, _, _) = parse_spell_intent("Target player draws two cards.");
        assert_eq!(draws, None);
        let (_, draws, _, _, _, _) = parse_spell_intent("You draw a card.");
        assert_eq!(draws, Some(1));
        let (_, draws, _, _, _, _) =
            parse_spell_intent("Destroy target creature. Draw a card.");
        assert_eq!(draws, Some(1));
    }

    #[test]
    fn scaling_effects_are_manual() {
        let t = triggers(
            "Honden of Cleansing Fire",
            "At the beginning of your upkeep, you gain 2 life for each Shrine you control.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);
    }

    #[test]
    fn short_name_self_reference() {
        let t = triggers(
            "Krenko, Mob Boss",
            "Whenever Krenko attacks, create a 1/1 red Goblin creature token.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::Attacks);
        assert!(t[0].auto());
    }

    #[test]
    fn threat_classification() {
        assert!(parse_threat("Destroy target creature."));
        assert!(parse_threat("Lightning Strike deals 3 damage to any target."));
        assert!(!parse_threat("Counter target spell."));
        assert!(!parse_threat("Draw two cards."));
    }

    // ---- pass B: statics, evasion text, ward ----

    #[test]
    fn anthem_parses() {
        assert_eq!(
            parse_statics("Creatures you control get +1/+1."),
            vec![StaticEffect::Anthem { power: 1, toughness: 1, others_only: false }]
        );
        assert_eq!(
            parse_statics("Other creatures you control get +2/+2 and have vigilance."),
            vec![StaticEffect::Anthem { power: 2, toughness: 2, others_only: true }]
        );
        // One-shot, conditional, and subtype anthems stay unmodeled.
        assert!(parse_statics("Creatures you control get +1/+0 until end of turn.").is_empty());
        assert!(parse_statics(
            "Creatures you control get +1/+1 as long as you control an artifact."
        )
        .is_empty());
        assert!(parse_statics("Elves you control get +1/+1.").is_empty());
    }

    #[test]
    fn cost_cut_parses() {
        assert_eq!(
            parse_statics("Artifact spells you cast cost {1} less to cast."),
            vec![StaticEffect::CostCut { filter: Some("artifact".into()), n: 1 }]
        );
        assert_eq!(
            parse_statics("Spells you cast cost {2} less to cast."),
            vec![StaticEffect::CostCut { filter: None, n: 2 }]
        );
        // "The first artifact spell each turn" is a gated variant: skipped.
        assert!(parse_statics(
            "The first artifact spell you cast each turn costs {1} less to cast."
        )
        .is_empty());
    }

    #[test]
    fn unblockable_parses() {
        assert!(parse_unblockable("This creature can't be blocked."));
        assert!(!parse_unblockable(
            "This creature can't be blocked by creatures with power 2 or greater."
        ));
        assert!(!parse_unblockable("This creature can't be blocked except by Walls."));
    }

    #[test]
    fn protection_parses() {
        assert_eq!(
            parse_protection(
                "First strike (This creature deals combat damage first.)\nProtection from black (It can't be blocked by anything black.)"
            ),
            vec!['B']
        );
        assert_eq!(parse_protection("Protection from red and from white"), vec!['R', 'W']);
        assert_eq!(
            parse_protection("Protection from all colors"),
            vec!['W', 'U', 'B', 'R', 'G']
        );
        assert!(parse_protection("Flying, lifelink").is_empty());
    }

    // ---- pass C: replacements + discover ----

    #[test]
    fn replacements_parse() {
        let r = parse_replacements(
            "Test Card",
            "This land enters tapped.\nWhen this land enters, you gain 1 life.\n{T}: Add {B} or {R}.",
        );
        assert!(r.enters_tapped);
        assert!(r.enters_counters.is_none());

        let r = parse_replacements("Test Card", "This creature enters with a +1/+1 counter on it.");
        assert_eq!(r.enters_counters, Some(("+1/+1".to_string(), 1)));
        assert!(!r.enters_tapped);

        // Riders and conditions stay unmodeled.
        let r = parse_replacements(
            "Test Card",
            "This creature enters with a +1/+1 counter on it for each creature you control.",
        );
        assert!(r.enters_counters.is_none());
        let r = parse_replacements("Test Card", "This land enters tapped unless you control a Mountain.");
        assert!(!r.enters_tapped);

        let r = parse_replacements("Test Card", "If this creature would die, exile it instead.");
        assert!(r.dies_to_exile);
        // Replacing OTHER creatures' deaths is not this card's replacement.
        let r = parse_replacements("Test Card", "If a creature an opponent controls would die, exile it instead.");
        assert!(!r.dies_to_exile);

        let r = parse_replacements(
            "Test Card",
            "Defender (This creature can't attack.)\nFlying\nPrevent all combat damage that would be dealt to and dealt by this creature.",
        );
        assert!(r.prevent_to && r.prevent_by);
        let r = parse_replacements("Test Card", "Prevent all combat damage that would be dealt to this creature.");
        assert!(r.prevent_to && !r.prevent_by);
    }

    #[test]
    fn discover_parses() {
        assert_eq!(parse_discover("When this creature enters, discover 4."), Some(4));
        assert_eq!(parse_discover("Draw a card."), None);
    }

    #[test]
    fn ward_parses() {
        assert_eq!(
            parse_ward("Ward {1} (Whenever this creature becomes the target...)\n{3}{W}: This creature gets +X/+0 until end of turn, where X is its toughness."),
            Some("{1}".to_string())
        );
        assert_eq!(parse_ward("Flying, ward {2}"), Some("{2}".to_string()));
        assert_eq!(parse_ward("Ward—Pay 3 life."), Some("pay 3 life".to_string()));
        assert_eq!(parse_ward("Creatures you control move toward the exit."), None);
    }
}

/// Fire-and-forget: cache oracle facts for every card this room could see
/// (all zones of every seat). Called when an enforced room gains a deck and
/// again at start, so by the time cards matter the answers are local.
pub fn prefetch_room(app: &Arc<App>, room: &crate::rooms::Room) {
    let mut ids: HashSet<String> = HashSet::new();
    for p in &room.players {
        for zone in [&p.hand, &p.library, &p.battlefield, &p.graveyard, &p.exile, &p.command] {
            for card in zone.iter() {
                if let Some(sid) = &card.scryfall_id {
                    ids.insert(sid.clone());
                }
            }
        }
    }
    if ids.is_empty() {
        return;
    }
    let app = app.clone();
    tokio::spawn(async move {
        ensure(&app, ids.into_iter().collect()).await;
    });
}

#[cfg(test)]
mod draw_trigger_tests {
    use super::*;

    #[test]
    fn sheoldred_parses_both_draw_triggers() {
        let text = "Deathtouch\nWhenever you draw a card, you gain 2 life.\nWhenever an opponent draws a card, they lose 2 life.";
        let t = parse_triggers("Sheoldred, the Apocalypse", text);
        assert_eq!(t.len(), 2, "both draw triggers parse: {t:?}");
        assert_eq!(t[0].when, TriggerWhen::YouDraw);
        assert_eq!(t[0].effects, vec![TriggerEffect::GainLife { n: 2 }]);
        assert!(t[0].auto());
        assert_eq!(t[1].when, TriggerWhen::OpponentDraws);
        assert_eq!(t[1].effects, vec![TriggerEffect::LoseLife { n: 2 }]);
        assert!(t[1].auto());
    }

    #[test]
    fn that_player_loses_parses_like_they_lose() {
        // Confirmed Scryfall oracle text (2026-08-04):
        //   Scrawling Crawler {4}
        //     "At the beginning of your upkeep, each player draws a card.
        //      Whenever an opponent draws a card, that player loses 1 life."
        //
        // The trigger half always parsed, so the prompt appeared and the card
        // LOOKED wired up - but "that player loses 1 life" matched no effect
        // rule ("they " was stripped, "that player " was not, and the verb is
        // "loses" not "lose"), so the effect fell to Manual and neither the
        // engine nor the bot's own draw-tax shortcut would perform it. The
        // opponent drew and took nothing.
        let text = "At the beginning of your upkeep, each player draws a card.\nWhenever an opponent draws a card, that player loses 1 life.";
        let t = parse_triggers("Scrawling Crawler", text);
        let opp = t
            .iter()
            .find(|x| x.when == TriggerWhen::OpponentDraws)
            .expect("the opponent-draws trigger parses");
        assert_eq!(opp.effects, vec![TriggerEffect::LoseLife { n: 1 }], "{opp:?}");
        assert!(opp.auto(), "and the engine can perform it");
    }

    #[test]
    fn that_player_gains_parses_too() {
        // The same subject in its other verb form, so the -s handling is not
        // a one-off patched in for a single card.
        let t = parse_triggers("Test", "Whenever an opponent draws a card, that player gains 3 life.");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].effects, vec![TriggerEffect::GainLife { n: 3 }]);
    }

    #[test]
    fn unknown_draw_payoffs_stay_manual() {
        // Closed set: a payoff the engine cannot perform must never auto-apply.
        let t = parse_triggers(
            "Nezahal, Primal Tide",
            "Whenever an opponent draws a card, exile the top three cards of your library.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::OpponentDraws);
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);
        assert!(!t[0].auto());
    }

    #[test]
    fn a_draw_trigger_never_becomes_a_card_trigger() {
        // "whenever you draw" has a PLAYER subject; it must not fall through
        // to the card-subject verb table and become somebody's ETB.
        let t = parse_triggers("Whatever", "Whenever you draw a card, you gain 2 life.");
        assert!(t.iter().all(|x| x.when == TriggerWhen::YouDraw));
    }
}


#[cfg(test)]
mod witness_trigger_tests {
    use super::*;

    /// Every text here is verbatim Scryfall oracle text (2026-08-01).
    fn parsed(name: &str, text: &str) -> Vec<Trigger> {
        parse_triggers(name, text)
    }

    #[test]
    fn landfall_reads_past_its_ability_word() {
        let t = parsed(
            "Lotus Cobra",
            "Landfall — Whenever a land you control enters, add one mana of any color.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::LandEtb);
        // Mana is not an effect the engine performs: it prompts, it does not
        // pretend.
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);
    }

    #[test]
    fn pingers_fire_and_apply() {
        let t = parsed(
            "Impact Tremors",
            "Whenever a creature you control enters, this enchantment deals 1 damage to each opponent.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::CreatureEtb);
        assert_eq!(t[0].effects, vec![TriggerEffect::EachOpponentLoses { n: 1 }]);
        assert!(t[0].auto());

        let t = parsed(
            "Purphoros, God of the Forge",
            "Whenever another creature you control enters, Purphoros deals 2 damage to each opponent.",
        );
        assert_eq!(t[0].when, TriggerWhen::CreatureEtb);
        assert_eq!(t[0].effects, vec![TriggerEffect::EachOpponentLoses { n: 2 }]);
    }

    #[test]
    fn aristocrats_drain_on_any_of_my_creatures_dying() {
        let t = parsed(
            "Zulaport Cutthroat",
            "Whenever this creature or another creature you control dies, each opponent loses 1 life and you gain 1 life.",
        );
        assert!(t.iter().any(|x| x.when == TriggerWhen::CreatureDies));
        let d = t.iter().find(|x| x.when == TriggerWhen::CreatureDies).unwrap();
        assert_eq!(
            d.effects,
            vec![TriggerEffect::EachOpponentLoses { n: 1 }, TriggerEffect::GainLife { n: 1 }]
        );
    }

    #[test]
    fn combat_and_cast_and_attack_shapes() {
        let t = parsed(
            "Goblin Rabblemaster",
            "At the beginning of combat on your turn, create a 1/1 red Goblin creature token with haste.",
        );
        assert_eq!(t[0].when, TriggerWhen::CombatStart);
        // A token with a keyword is a stub the engine cannot make faithfully.
        assert_eq!(t[0].effects, vec![TriggerEffect::Manual]);

        let t = parsed(
            "Talrand, Sky Summoner",
            "Whenever you cast an instant or sorcery spell, create a 2/2 blue Drake creature token with flying.",
        );
        assert_eq!(t[0].when, TriggerWhen::CastInstantOrSorcery);

        let t = parsed("Test", "Whenever you attack, each opponent loses 1 life.");
        assert_eq!(t[0].when, TriggerWhen::YouAttack);
        assert_eq!(t[0].effects, vec![TriggerEffect::EachOpponentLoses { n: 1 }]);

        let t = parsed("Test", "At the beginning of each upkeep, you gain 1 life.");
        assert_eq!(t[0].when, TriggerWhen::EachUpkeep);
        assert_eq!(t[0].effects, vec![TriggerEffect::GainLife { n: 1 }]);
    }

    #[test]
    fn cast_narrowings_do_not_collide() {
        let creature = parsed("Test", "Whenever you cast a creature spell, you gain 1 life.");
        assert_eq!(creature[0].when, TriggerWhen::CastCreatureSpell);
        let noncreature = parsed("Test", "Whenever you cast a noncreature spell, you gain 1 life.");
        assert_eq!(noncreature[0].when, TriggerWhen::CastNoncreatureSpell);
        let any = parsed("Test", "Whenever you cast a spell, you gain 1 life.");
        assert_eq!(any[0].when, TriggerWhen::CastSpell);
        // Each shape produces exactly one trigger - a narrowing must never
        // also match the bare rule, or the payoff would fire twice.
        for t in [creature, noncreature, any] {
            assert_eq!(t.len(), 1);
        }
    }

    #[test]
    fn an_em_dash_in_rules_text_is_not_an_ability_word() {
        // Only a trigger following the dash is an ability word; a modal
        // "choose one —" must not eat the line.
        let t = parsed("Test", "When this creature enters, choose one — you gain 2 life.");
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::Etb);
    }
}

#[cfg(test)]
mod edict_and_wrath_tests {
    use super::*;

    #[test]
    fn grave_pact_and_dictate_read_as_edicts() {
        // Verbatim Scryfall (2026-08-01).
        let t = parse_triggers(
            "Grave Pact",
            "Whenever a creature you control dies, each other player sacrifices a creature of their choice.",
        );
        assert_eq!(t.len(), 1);
        assert_eq!(t[0].when, TriggerWhen::CreatureDies);
        assert_eq!(t[0].effects, vec![TriggerEffect::EachOpponentSacrifices { n: 1 }]);
        assert!(t[0].auto());

        let t = parse_triggers(
            "Dictate of Erebos",
            "Flash\nWhenever a creature you control dies, each opponent sacrifices a creature of their choice.",
        );
        assert_eq!(t[0].effects, vec![TriggerEffect::EachOpponentSacrifices { n: 1 }]);
    }

    #[test]
    fn damnation_is_a_wrath() {
        // "Destroy all creatures. They can't be regenerated." - the second
        // sentence is a rider the engine does not model, and a wrath that
        // ignored it would still destroy exactly the same creatures.
        let e = parse_spell_effects("Destroy all creatures. They can't be regenerated.", "Damnation");
        assert!(e.contains(&TriggerEffect::DestroyAllCreatures), "{e:?}");
    }

    #[test]
    fn a_narrower_sweeper_is_not_a_wrath() {
        // Anything qualified is NOT "all creatures", and treating it as one
        // would wipe boards it should never touch.
        for text in [
            "Destroy all creatures with flying.",
            "Destroy all creatures your opponents control.",
            "Destroy all creatures with mana value 3 or less.",
        ] {
            let e = parse_spell_effects(text, "Test");
            assert!(!e.contains(&TriggerEffect::DestroyAllCreatures), "{text} -> {e:?}");
        }
    }

    #[test]
    fn a_narrower_edict_is_not_an_each_opponent_edict() {
        let e = parse_spell_effects("Each opponent sacrifices an artifact.", "Test");
        assert!(!e.iter().any(|x| matches!(x, TriggerEffect::EachOpponentSacrifices { .. })), "{e:?}");
    }
}
