/**
 * Quickplay: a table nobody brings a deck to.
 *
 * Every seat is dealt one of the bundled precons the moment it is taken - the
 * same pool the bots draw from - and may reroll it a few times before the game
 * starts. The point is a table you can sit down at with an empty collection,
 * so the deal happens server-side on join rather than being something the
 * client asks for: a player with no decks at all still ends up holding one.
 *
 * The cap lives on the server (rooms.rs, MAX_QUICKPLAY_ROLLS) because a
 * counter the roller owns is a suggestion, not a cap. This copy exists so the
 * lobby can say how many rolls are left without a round trip; the two are
 * asserted equal by the server refusing a roll past its own limit, which is
 * what actually holds the line if they ever drift.
 */
export const MAX_QUICKPLAY_ROLLS = 3;
