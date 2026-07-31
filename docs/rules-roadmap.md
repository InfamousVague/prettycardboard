# Rules-completeness roadmap (enforced mode v3+)

Goal: the enforced engine should recognize and react to card effects broadly
enough to act as a rule checker, and the bot should anticipate plays. This is
a staged build - a full CR-complete engine is a multi-month effort (compare
Forge/XMage), so each pass below is scoped to the highest-frequency rules
text, parsed from the oracle cache (`server/src/oracle.rs`), never hardcoded
per card.

## Where things stand (v2)

- Oracle cache: cost/colors, types, keywords, produced mana, printed P/T.
- Enforced: land drops, casting with pip payment, summoning sickness, turn
  ownership, instant-speed timing + LIFO stack with priority passes, combat
  machine (lock/ready/preview/resolve) honoring flying/reach/menace, first
  strike, double strike, deathtouch, trample, lifelink, commander damage.
- Manual escape hatches: life.deal, counters submenu, marks/aim relay.

## Pass A - triggered abilities (highest value) — SHIPPED (v3)

Landed 2026-07-30: oracle.rs parses trigger records (versioned cache rows
reparse on upgrade), rules.rs queues prompts on ETB / dies / attacks /
upkeep / end step, `trigger.answer` applies the closed set (draw, life,
each-opponent drain, self counters, token stubs) or acknowledges manual
text, bots auto-apply + announce and hard bots answer recognized
removal/burn on the stack (`threat`). Tested by
playtest/scenarios/enforced-triggers.js (deterministic solo goldfish) and
enforced-brawl.js (four FF precons bot-vs-bot, zero `[rules]` logs).

Original scope:
- `When ~ enters the battlefield, <effect>` (ETB) - detect draw/token/damage/
  life/counter effects with numeric payloads.
- `When ~ dies, ...` / `Whenever ~ attacks, ...` / beginning-of-upkeep/end-step.
- Engine: on the matching event, PROMPT the controller ("Skyknight's ETB:
  draw a card - apply?") rather than auto-resolving; auto-apply the closed
  set the engine can do (draw N, gain/lose N, +1/+1 counters, token stubs).
- Bot: auto-applies its own recognized triggers; announces them in chat.

## Pass B - static and evasion effects — SHIPPED (v3)

Landed 2026-07-30: plain anthems folded into effective_pt (and thus the
combat preview), the full evasion table in may_block (fear / intimidate /
shadow both ways / skulk by effective power / horsemanship / unblockable /
protection from color), cost cuts folded into cast + cmd.cast payment,
vigilance no longer taps attackers, and ward relayed as a tax reminder on
the aim gesture. Bots block through the same may_block table. Tested by
playtest/scenarios/enforced-statics.js (two-seat deterministic evasion
matrix + anthem-in-preview + single-land cost-cut cast) and the
enforced-brawl fuzz.

Original scope:

- Anthems (`Creatures you control get +X/+X`) folded into effective_pt.
- Evasion beyond v2: fear/intimidate/shadow/skulk/unblockable, protection
  from color (blocks + targeting), ward (tax reminder prompt), vigilance
  (no tap on attack), defender edge cases.
- Cost modifiers (`spells cost {1} less`) folded into solve_payment.

## Pass C - replacement and cascade-style effects — SHIPPED (v3)

Landed 2026-07-30: enters-tapped and enters-with-counters auto-apply on
every battlefield arrival (before that arrival's ETB prompts), dies-to-exile
replacements route deaths to exile with no dies trigger, damage-prevention
shields fold into the combat preview, and the `cascade` action (deck menu
"Cascade for N", plus automatic firing for the cascade keyword and
discover N) digs the library server-side - the hit rides the stack revealed
and free to cast, the rest bottoms in random order. `token.clone` now also
copies a spell on the stack. Impulse-style exile-and-play is still out of
scope. Tested by playtest/scenarios/enforced-cascade.js and the
enforced-brawl fuzz.

Original scope:

- Dies-to-exile replacements, "enters with N counters", "enters tapped"
  (auto-apply on resolve), damage prevention shields.
- Cascade/discover/impulse: reveal-until prompts driven by the engine
  (library manipulation verbs already exist: peek/reorder/bottom).
- Copy effects: token-copy of a stack spell / permanent (token.clone exists).

## Bot reaction model

- The bot already passes priority; give it a threat table: when a recognized
  removal/burn spell targets its permanent, respond (hard tier) or accept and
  pre-settle. Uses the same parsed trigger/effect records - no separate AI
  card knowledge.

## Testing contract

Each pass ships with a playtest scenario (playtest/scenarios/) using a
purpose-built deterministic deck exercising every parsed pattern, plus a
fuzz pass: run the four FF precons bot-vs-bot enforced and assert zero
illegal-state logs.

## Out of scope until the above land

Layers (CR 613), full priority APNAP edge cases, mana abilities with
riders, multiplayer replacement interaction ordering. Track, do not fake.
