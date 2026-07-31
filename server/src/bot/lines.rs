//! Table talk: every sentence the bot says in chat lives here, so tone is
//! tuned in one place.

// --------------------------------------------------------------- table talk

pub(crate) fn pick<'a>(pool: &[&'a str]) -> &'a str {
    pool[rand::random_range(0..pool.len())]
}

pub fn greeting_line() -> String {
    pick(&[
        "Hey table, good luck everyone!",
        "Shuffling up. This should be fun.",
        "I brought one of the house decks. Be gentle.",
        "Ready when you are!",
    ])
    .to_string()
}

pub(crate) fn keep_line() -> String {
    pick(&[
        "I'll keep this hand.",
        "Keeping. Looks playable.",
        "This will do.",
    ])
    .to_string()
}

pub(crate) fn mull_line(down_to: usize) -> String {
    match rand::random_range(0..3) {
        0 => format!("Not a fan of these. Going to {down_to}."),
        1 => format!("Mulligan for me, down to {down_to}."),
        _ => format!("These cards owe me an apology. Taking a mulligan to {down_to}."),
    }
}

/// Acknowledge a resolved spell that killed one of the bot's permanents.
pub(crate) fn honor_line(card: &str, spell: &str) -> String {
    match rand::random_range(0..3) {
        0 => format!("{spell} gets {card}. Moving it to the graveyard."),
        1 => format!("Fair enough - {card} dies to {spell}."),
        _ => format!("{card} goes to the graveyard from {spell}."),
    }
}

pub(crate) fn gg_line() -> String {
    pick(&[
        "That's it for me. GG all!",
        "I'm done for. Good game!",
        "You got me. GG!",
    ])
    .to_string()
}

pub(crate) fn win_line() -> String {
    pick(&[
        "GG everyone, that was fun!",
        "Good game, all!",
        "GG! The house deck delivers.",
    ])
    .to_string()
}

pub(crate) fn commander_line(name: &str) -> String {
    match rand::random_range(0..3) {
        0 => format!("Casting my commander, {name}!"),
        1 => format!("Here comes {name}."),
        _ => format!("{name} joins the party."),
    }
}

/// "Attacking Matt for 12 damage with A, B and C." Creature list capped at
/// three names, the rest folded into a count.
pub(crate) fn attack_line(defender: &str, total: i64, names: &[String]) -> String {
    let listed = match names.len() {
        0 => "nothing".to_string(),
        1 => names[0].clone(),
        2 => format!("{} and {}", names[0], names[1]),
        3 => format!("{}, {} and {}", names[0], names[1], names[2]),
        n => format!("{}, {} and {} more", names[0], names[1], n - 2),
    };
    format!("Attacking {defender} for {total} damage with {listed}.")
}

pub(crate) fn block_line(blocker: &str, attacker: &str) -> String {
    match rand::random_range(0..3) {
        0 => format!("Blocking {attacker} with {blocker}."),
        1 => format!("{blocker} steps in front of {attacker}."),
        _ => format!("I'll put {blocker} in the way of {attacker}."),
    }
}

pub(crate) fn damage_line(taken: i64, life_after: i64) -> String {
    match rand::random_range(0..3) {
        0 => format!("Ouch, {taken} damage. I'm at {life_after}."),
        1 => format!("Taking {taken}. That puts me at {life_after} life."),
        _ => format!("{taken} damage goes through. Down to {life_after}."),
    }
}

