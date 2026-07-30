//! Card-collection ("Pokedex") domain rules shared by the REST handlers and the
//! websocket relay. The SQL lives in `db`; what lives here is the one judgement
//! call the feature makes: which pulls are worth telling other people about.

use serde::Deserialize;

/// One pulled card as the client posts it. `released` is the SET's release date
/// (ISO `YYYY-MM-DD`, exactly what Scryfall hands the booster code) and is
/// optional: without it a card simply cannot qualify under the vintage rule.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PulledCard {
    pub scryfall_id: String,
    pub name: String,
    pub set_code: String,
    pub rarity: String,
    #[serde(default)]
    pub foil: bool,
    #[serde(default)]
    pub released: Option<String>,
}

/// The year in `released`, when it parses as an ISO date.
fn released_year(released: Option<&str>) -> Option<i32> {
    released?.get(0..4)?.parse().ok()
}

/// NOTABLE - the single definition of "worth broadcasting", mirrored by the
/// client so both sides celebrate the same cards. A pull is notable when:
///
/// 1. it is MYTHIC (the modern chase slot), or
/// 2. it is RARE from a pre-1995 set - that window is where Black Lotus and the
///    rest of the Power Nine live, and those sets predate the mythic rarity
///    entirely, so their rares are the top of the sheet, or
/// 3. it is a FOIL of rare or better - a foil rare is a pack's best outcome
///    whatever the set.
///
/// Everything else (commons, uncommons, plain modern rares, foil commons) is
/// ordinary and stays out of the feed. Keep this rule HERE: every caller -
/// REST ingestion, the websocket relay, and the client's mirror - must agree,
/// or players see celebrations that never reach the feed.
pub fn is_notable(rarity: &str, foil: bool, released: Option<&str>) -> bool {
    let rarity = rarity.to_ascii_lowercase();
    let rare_plus = rarity == "rare" || rarity == "mythic";
    if rarity == "mythic" {
        return true;
    }
    if foil && rare_plus {
        return true;
    }
    rarity == "rare" && released_year(released).map(|y| y < 1995).unwrap_or(false)
}
