# Liliana Goth Mommy — scripted match plan

A hand-played test with a known deal. Every step below says what you do and
what should happen; when they disagree, that line is the bug report.

**Setup**

```bash
node playtest/scripted-match.mjs
```

It uploads the Bracket 4 list from `~/Desktop/liliana-goth-mommy-b4.txt`,
opens a 2-seat **Commander** table with **enforced rules on**, seats one
casual bot, stacks your library, deals the scripted seven, and prints the join
code. Join that code in the app and play from there.

Two things it deliberately does:

- **Enforced rules on.** Every trigger in this plan is engine-driven, and the
  engine only runs on an enforced table. On a freeform table the correct
  behaviour is silence, so a freeform run would produce a page of false bug
  reports.
- **Curated art kept.** The cards carry their `pc-…` art ids, because that is
  what your real deck carries — and until this week those ids were invisible
  to the rules engine. Playing with paper printings would not test the thing
  most likely to be broken.

**The deal**

| | |
|---|---|
| Opening seven | Swamp · Sol Ring · Swamp · Carrion Feeder · Swamp · Blood Artist · Bitterblossom |
| Draw 1 (turn 2) | Swamp |
| Draw 2 (turn 3) | Grave Pact |
| Draw 3 (turn 4) | Swamp |
| Draw 4 (turn 5) | Zulaport Cutthroat |
| Draw 5 (turn 6) | Damnation |
| Draw 6 (turn 7) | Swamp |
| Draw 7 (turn 8) | Sheoldred, the Apocalypse |
| Draw 8 (turn 9) | Swamp |
| Draw 9 (turn 10) | Liliana's Triumph |

If a draw is not the card in this table, **stop and record it** — the stack
did not take, and nothing after that point is meaningful.

**How to record**

For each step: `OK`, or what happened instead. Note the turn number and copy
the room log line if there is one. The log is the ground truth for what the
engine thinks it did.

---

## Turn 1 — you

| # | Do | Expect |
|---|---|---|
| 1.1 | Look at your hand | Exactly the seven above, in that order |
| 1.2 | Play a Swamp | Land drop consumed; a second Swamp is refused |
| 1.3 | Cast Sol Ring | Auto-taps the Swamp; log reads "casts Sol Ring (paying 1)" |
| 1.4 | Tap Sol Ring | Two colorless in your mana pool |
| 1.5 | Cast Carrion Feeder with it | Resolves to the battlefield |
| 1.6 | Pass the turn | Turn passes to the bot |

*Watch for:* Sol Ring is a mana rock — the auto-tapper should offer it for the
next spell without you tapping it by hand.

## Turn 2 — bot, then you

| # | Do | Expect |
|---|---|---|
| 2.1 | Watch the bot's turn | It untaps, draws, plays a land, casts something if it can |
| 2.2 | Your turn: draw | Swamp |
| 2.3 | Play the Swamp, cast Blood Artist | Resolves |
| 2.4 | Pass | — |

*Watch for:* the bot should not sit idle for the full 35-second failsafe. If
it does, note how long it took.

## Turn 3 — Bitterblossom and the upkeep trigger

| # | Do | Expect |
|---|---|---|
| 3.1 | Draw | Grave Pact |
| 3.2 | Play a land, cast Bitterblossom | Resolves |
| 3.3 | Pass, and come back to your turn 4 upkeep | **A trigger prompt: Bitterblossom.** "At the beginning of your upkeep, you lose 1 life and create a 1/1 black Faerie Rogue token with flying" |
| 3.4 | Apply it | You lose 1 life. **The token is the question** — a token with a keyword is something the engine flags as manual, so expect to be asked to make it yourself rather than have it appear |

*Watch for:* whether the prompt says Apply/Skip or just Acknowledge. Either is
defensible; record which, and whether the life loss happened.

## Turn 4–5 — the aristocrat engine

| # | Do | Expect |
|---|---|---|
| 4.1 | Draw (turn 4) | Swamp |
| 4.2 | Play it; cast Grave Pact if you have four mana | Resolves |
| 4.3 | Draw (turn 5) | Zulaport Cutthroat |
| 4.4 | Cast Zulaport Cutthroat | Resolves |
| 4.5 | Sacrifice a Faerie token to Carrion Feeder | Carrion Feeder gets a +1/+1 counter |
| 4.6 | — | **Blood Artist fires:** "whenever this or another creature dies" |
| 4.7 | — | **Zulaport Cutthroat fires:** each opponent loses 1, you gain 1 |
| 4.8 | — | **Grave Pact fires:** the bot must sacrifice a creature |
| 4.9 | Apply all three | Bot loses life; **the bot's board loses a creature it chose** |

*This is the core of the deck and the newest code. Record the log lines
verbatim.* Expect one prompt per trigger, and note the order they arrive in.

*Watch for:* Blood Artist says "target player loses 1 life" — a targeted
effect the engine cannot aim on its own. It may come up as manual. Note it.

## Turn 6 — the wrath

| # | Do | Expect |
|---|---|---|
| 6.1 | Draw | Damnation |
| 6.2 | Let the bot develop a couple of creatures first | — |
| 6.3 | Cast Damnation ({2}{B}{B}) | Log: "Damnation destroys every creature" |
| 6.4 | — | **Every creature dies — yours too** |
| 6.5 | — | Each death should re-fire Blood Artist / Zulaport / Grave Pact |

*Watch for:* how many trigger prompts a wrath produces. If your board and the
bot's both die, that is a lot of prompts at once — note whether the queue is
usable or overwhelming. **That is a real finding either way.**

## Turn 7–8 — Sheoldred

| # | Do | Expect |
|---|---|---|
| 7.1 | Draw (turn 7) | Swamp |
| 7.2 | Draw (turn 8) | Sheoldred, the Apocalypse |
| 8.1 | Cast Sheoldred | Resolves; **art is your Goth Mommy frame** |
| 8.2 | Draw a card by any means | **You gain 2 life** |
| 8.3 | Pass the turn; watch the bot's draw step | **The bot loses 2 life** |

*This is the bug you reported.* Step 8.3 is the one that was doing nothing.
It should now produce a trigger prompt on your side (you control Sheoldred)
that takes 2 from the bot when applied.

*Watch for:* the prompt belongs to YOU, not the bot, because you control her.
The life comes off the bot.

## Turn 9–10 — the edict

| # | Do | Expect |
|---|---|---|
| 9.1 | Draw | Swamp |
| 10.1 | Draw | Liliana's Triumph |
| 10.2 | Cast it | "Each opponent sacrifices a creature of their choice" |
| 10.3 | — | **The bot sacrifices one, chosen by it** |

*Watch for:* the second half — "if you control a Liliana planeswalker, each
opponent also discards a card" — is a conditional the engine does not model.
Expect it to come up manual. Note whether it says so clearly.

## Free play

After step 10.3, keep playing until someone wins or it stops being
interesting. Things worth pushing on:

- **Commander:** cast Liliana, Heretical Healer, then let a nontoken creature
  of yours die. She should transform. The engine does not model transform-on-
  trigger, so expect a manual prompt — record exactly what it says.
- **Combat:** attack with a Faerie token. Does the bot block sensibly? Does it
  settle its own damage?
- **The bot's own spells:** does it ever respond to anything you cast?
- **Anything that reads as doing nothing.** A card that resolves with no log
  line and no visible effect is the exact failure this whole pass was about.

---

## Known limits — not bugs

Please don't spend time on these; they are understood and deliberate.

- A trigger the engine cannot perform **fires and prompts** rather than
  applying. Mana abilities ("add one mana of any color"), tokens with
  keywords, and anything with an intervening "if" all land here by design —
  the rule is that the engine never half-applies text it did not fully parse.
- **Targeted** effects ("target player loses 1 life") only auto-apply when
  there is exactly one opponent to aim at.
- The bot does not play instants on your turn except in narrow cases, and it
  never bluffs.
- Toxic Deluge, Bolas's Citadel, Necropotence, Ad Nauseam and the tutors are
  all manual — X costs, alternate costs and library manipulation are outside
  the parsed set.
