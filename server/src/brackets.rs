//! Commander Bracket estimation, server side.
//!
//! The mirror of `src/app/data/brackets.ts`, reading the SAME source of truth:
//! `src/data/gamechangers.json`, the official 53-card Game Changers list synced
//! from Scryfall's `is:gamechanger`. The list is never restated in Rust - it is
//! pulled in from that one file so the two sides cannot drift.
//!
//! The rules, matching the client exactly:
//!
//!   Bracket 2 (Core):      no Game Changers
//!   Bracket 3 (Upgraded):  1-3 Game Changers
//!   Bracket 4 (Optimized): 4+ Game Changers
//!
//! Brackets 1 (Exhibition) and 5 (cEDH) are social judgments a card list cannot
//! make, so the estimator never claims them.
//!
//! The deck list endpoint needs this for every row, so the server derives it
//! where the cards already sit rather than shipping each deck's full card list
//! to the browser just to have it count names.

use crate::db::DeckCard;
use serde::Deserialize;
use std::collections::{BTreeSet, HashSet};
use std::sync::OnceLock;

/// The client's list, verbatim. Embedded at build time rather than read from
/// disk at runtime because the deploy ships a bare binary, not the repo - a
/// runtime path would be a file the production host does not have.
const GAME_CHANGERS_JSON: &str = include_str!("../../src/data/gamechangers.json");

#[derive(Deserialize)]
struct GameChangersFile {
    names: Vec<String>,
}

/// Lowercased Game Changer names, parsed once on first use and kept for the
/// process lifetime - never per request, never per deck row.
fn game_changers() -> &'static HashSet<String> {
    static SET: OnceLock<HashSet<String>> = OnceLock::new();
    SET.get_or_init(|| {
        serde_json::from_str::<GameChangersFile>(GAME_CHANGERS_JSON)
            .map(|file| file.names.iter().map(|name| name.to_lowercase()).collect())
            .unwrap_or_default()
    })
}

pub struct BracketEstimate {
    /// 2 | 3 | 4 - the range a card list can actually prove.
    pub bracket: u8,
    /// The Game Changer card names found, deduped and sorted.
    pub game_changers: Vec<String>,
}

/// Estimate a deck's bracket from its cards.
pub fn estimate(cards: &[DeckCard]) -> BracketEstimate {
    let list = game_changers();
    let mut found: BTreeSet<String> = BTreeSet::new();
    for card in cards {
        // Front-face match covers split/double-faced entries ("A // B"), the
        // same way the client does it.
        let name = card.name.to_lowercase();
        let front = name.split(" // ").next().unwrap_or(&name);
        if list.contains(&name) || list.contains(front) {
            found.insert(card.name.clone());
        }
    }
    let count = found.len();
    BracketEstimate {
        bracket: if count == 0 {
            2
        } else if count <= 3 {
            3
        } else {
            4
        },
        game_changers: found.into_iter().collect(),
    }
}

/// Brackets are a Magic Commander idea: they mean nothing for a Cyberpunk deck
/// or for a 60-card constructed list, so those decks get `None` and the client
/// shows no chip at all. The format test is case-insensitive because decks
/// store either the format id ("commander") or its display name ("Commander"),
/// exactly as `formatFor()` tolerates on the client.
pub fn estimate_for(game: &str, format: &str, cards: &[DeckCard]) -> Option<BracketEstimate> {
    if game != "mtg" || !format.trim().eq_ignore_ascii_case("commander") {
        return None;
    }
    Some(estimate(cards))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(name: &str) -> DeckCard {
        DeckCard {
            scryfall_id: String::new(),
            name: name.to_string(),
            quantity: 1,
            board: "main".to_string(),
        }
    }

    #[test]
    fn the_shared_list_actually_parses() {
        // A silent parse failure would quietly call every deck bracket 2.
        assert!(game_changers().len() >= 50, "Game Changers list failed to load");
        assert!(game_changers().contains("cyclonic rift"));
    }

    #[test]
    fn counts_map_to_brackets() {
        assert_eq!(estimate(&[card("Llanowar Elves")]).bracket, 2);
        assert_eq!(estimate(&[card("Cyclonic Rift")]).bracket, 3);
        let four: Vec<DeckCard> = ["Cyclonic Rift", "Demonic Tutor", "Ancient Tomb", "Chrome Mox"]
            .iter()
            .map(|n| card(n))
            .collect();
        assert_eq!(estimate(&four).bracket, 4);
    }

    #[test]
    fn matches_case_insensitively_and_by_front_face() {
        let est = estimate(&[card("cYcLoNiC rIfT"), card("Fierce Guardianship // Whatever")]);
        assert_eq!(est.game_changers.len(), 2);
        // Names come back as the deck spelled them, sorted.
        assert_eq!(est.game_changers[0], "Fierce Guardianship // Whatever");
    }

    #[test]
    fn only_mtg_commander_gets_a_bracket() {
        let cards = [card("Cyclonic Rift")];
        assert!(estimate_for("mtg", "Commander", &cards).is_some());
        assert!(estimate_for("mtg", "commander", &cards).is_some());
        assert!(estimate_for("mtg", "Standard", &cards).is_none());
        assert!(estimate_for("cyberpunk", "Standard", &cards).is_none());
    }
}
