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

/// Bumped whenever `parse_card` changes what it produces. Rows cached by an
/// older parser are ignored on load and refetched, so a fix here reaches decks
/// the server has already seen instead of only brand-new cards.
///   1 -> 2: split/adventure cards read their front face; lands know whether
///           they enter tapped; `*` power carries its defining ability.
pub const PARSE_VERSION: i64 = 2;

/// A characteristic-defining ability that sets power (and sometimes toughness)
/// to a count of permanents - "...is equal to the number of artifacts you
/// control". The only CDA shape the engine reads; every other `*` stays
/// unknown rather than being guessed at.
#[derive(Clone, Serialize, Deserialize)]
pub struct CountCda {
    /// Singular lowercase type word to count ("artifact", "creature", ...).
    pub counts: String,
    /// Count your opponents' permanents rather than your own.
    pub opponents: bool,
    /// The ability defines toughness as well as power.
    pub toughness: bool,
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
    /// This permanent arrives tapped, unconditionally. Conditional taplands
    /// ("unless you control a Forest", "if you don't, it enters tapped") are
    /// deliberately false: the engine cannot judge the condition, and an
    /// enforced table gives no way to untap a permanent it got wrong.
    #[serde(default)]
    pub tapped_on_entry: bool,
    /// Set when the printed power is `*`: what the ability counts.
    #[serde(default)]
    pub cda: Option<CountCda>,
    /// The parser that produced this record (see `PARSE_VERSION`).
    #[serde(default)]
    pub version: i64,
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

/// Drop reminder text so its wording never counts as rules text ("({T}: Add
/// {G} or {W}.)" sits right beside the clause we scan for).
fn strip_reminders(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0usize;
    for ch in text.chars() {
        match ch {
            '(' => depth += 1,
            ')' => depth = depth.saturating_sub(1),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out
}

/// Does this card's own text say it arrives tapped, with no strings attached?
///
/// Three things have to hold, because the naive substring test is wrong on all
/// three counts in the bundled precons alone:
///   * the subject is this card ("this land enters tapped", or the card's own
///     name) - Edgar, Master Machinist says "that artifact enters tapped"
///     about someone else's spell;
///   * no `unless` rider - "enters tapped unless you control a Forest";
///   * no choice - "you may reveal ... If you don't, this land enters tapped".
fn enters_tapped(name: &str, text: &str) -> bool {
    let text = strip_reminders(text).to_lowercase();
    let name = name.to_lowercase();
    // Old templating names the card; new templating says "this land". Match the
    // short name too, so "Edgar, Master Machinist" answers to "edgar".
    let short = name.split(',').next().unwrap_or(&name).trim().to_string();
    for raw in text.split(['.', '\n', ';']) {
        let clause = raw.trim();
        let Some(at) = clause
            .find("enters tapped")
            .or_else(|| clause.find("enters the battlefield tapped"))
        else {
            continue;
        };
        // "...tapped unless you control a Forest": the condition is unknowable
        // here, so leave it untapped and let the table sort it out.
        if clause[at..].contains("unless") {
            continue;
        }
        // "as this land enters, you may reveal ...  if you don't, it enters
        // tapped" - a choice, not a certainty.
        if clause.contains("you may") || clause.contains("if you don't") || clause.contains("if you do") {
            continue;
        }
        // The subject sits between the last clause break and the verb.
        let subject = clause[..at].rsplit(',').next().unwrap_or("").trim();
        let is_self = subject.starts_with("this ")
            || subject == "it"
            || (!short.is_empty() && subject.starts_with(&short));
        if is_self {
            return true;
        }
    }
    false
}

/// Read a "power is equal to the number of X you control" ability off the
/// oracle text. Anything more exotic stays unparsed - see `CountCda`.
fn parse_cda(text: &str) -> Option<CountCda> {
    let text = strip_reminders(text).to_lowercase();
    // "'s power is equal to..." / "'s power and toughness are each equal to..."
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
    oracle_text: Option<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    produced_mana: Vec<String>,
    #[serde(default)]
    card_faces: Vec<ScryFace>,
}

#[derive(Deserialize)]
struct ScryFace {
    type_line: Option<String>,
    mana_cost: Option<String>,
    power: Option<String>,
    toughness: Option<String>,
    oracle_text: Option<String>,
}

/// A printed stat as a number. `*` and friends are not numbers; "1+*" is worth
/// the 1 it guarantees.
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
    let text = face
        .and_then(|f| f.oracle_text.clone())
        .filter(|t| !t.is_empty())
        .or_else(|| raw.oracle_text.clone())
        .unwrap_or_default();
    let name = raw.name.clone().unwrap_or_default();
    // `cmc` counts both halves of a split card, so a front-face cost has to
    // bring its own mana value or the two would disagree.
    let mv = if face.is_some() {
        generic + pips.values().sum::<i64>()
    } else {
        raw.cmc.unwrap_or(0.0).round() as i64
    };
    let starred = raw
        .power
        .as_deref()
        .or_else(|| face.and_then(|f| f.power.as_deref()))
        .map(|p| p.contains('*'))
        .unwrap_or(false);
    Some(OracleCard {
        name: name.clone(),
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
        tapped_on_entry: enters_tapped(&name, &text),
        cda: if starred { parse_cda(&text) } else { None },
        version: PARSE_VERSION,
    })
}

/// Synchronous cache read. None = not (yet) known.
pub fn get(app: &App, scryfall_id: &str) -> Option<Arc<OracleCard>> {
    app.oracle.get(scryfall_id).map(|e| e.value().clone())
}

/// Make sure every id in `ids` is cached: memory first, then the SQLite
/// mirror, then Scryfall in /cards/collection batches of 75. Failures leave
/// ids unknown (retried the next time something asks).
pub async fn ensure(app: &Arc<App>, ids: Vec<String>) {
    let mut missing: Vec<String> = Vec::new();
    {
        let conn = app.db.lock().unwrap();
        for id in ids {
            if app.oracle.contains_key(&id) {
                continue;
            }
            // Custom art ids have no Scryfall identity to ask about.
            if !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
                continue;
            }
            if let Some(json) = crate::db::oracle_load(&conn, &id) {
                if let Ok(card) = serde_json::from_str::<OracleCard>(&json) {
                    // Anything an older parser wrote is refetched rather than
                    // trusted, so a parser fix reaches decks already on disk.
                    if card.version == PARSE_VERSION {
                        app.oracle.insert(id, Arc::new(card));
                        continue;
                    }
                }
            }
            missing.push(id);
        }
    }
    if missing.is_empty() {
        return;
    }
    // One fetch at a time server-wide keeps us far inside Scryfall's limits
    // even if several enforced rooms start at once.
    let _guard = app.oracle_lock.lock().await;
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
        let Ok(out) = output else { continue };
        if !out.status.success() {
            continue;
        }
        #[derive(Deserialize)]
        struct Collection {
            #[serde(default)]
            data: Vec<ScryCard>,
        }
        let Ok(parsed) = serde_json::from_slice::<Collection>(&out.stdout) else {
            continue;
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
                app.oracle.insert(id, Arc::new(card));
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
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
mod tests {
    use super::*;

    /// Every oracle string below is the real Scryfall text for that card.
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
        assert!(grove.tapped_on_entry);

        for text in [
            "This land enters tapped.\nWhen this land enters, scry 1.",
            "Seaside Citadel enters the battlefield tapped.",
        ] {
            let card = parse(serde_json::json!({
                "name": "Seaside Citadel", "type_line": "Land", "oracle_text": text,
            }));
            assert!(card.tapped_on_entry, "should enter tapped: {text}");
        }
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
            assert!(!card.tapped_on_entry, "should NOT enter tapped: {text}");
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
        assert!(!edgar.tapped_on_entry);
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
        assert!(!bolt.tapped_on_entry);
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
}
