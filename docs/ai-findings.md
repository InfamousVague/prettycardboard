# AI + rules audit findings (4-bot pod, 2026-07-31)

Source data: `playtest/logs/bot-pod-2026-07-31T01-04-08-335Z.{txt,json}` — a
4-seat all-bot Commander pod under **enforced** rules, each seat dealt a KNOWN
precon, watched for 14 turn rounds by a spectator that recorded every log
line, chat line and per-turn snapshot.

```
cd playtest && PC_BASE=<server> node scenarios/bot-pod-audit.js       # the pod
cd playtest && PC_BASE=<server> node scenarios/planeswalker-audit.js  # walkers
```

Every claim below was raised by an independent auditor reading only the
transcript, then **adversarially re-verified against the code and raw data**.
Ten claims were tested; four survived. The six that were refuted are listed
too, because "we checked and it is fine" is the more useful half of an audit.

## Verified correct (the run's good news)

- Turn order rotates 0→1→2→3 across 52 handoffs with zero skips, repeats or
  out-of-turn actions; `turnNumber` increments exactly once per wrap; all 53
  turn starts emit untap+draw.
- **One land per turn per seat held all game** (36 land plays, never two in a
  round, always on the seat's own turn).
- **Zero rejected actions** in 359 log lines — the bots never asked the rules
  engine for anything illegal.
- Combat ran the enforced machine 17 times. All 17 chat announcements match
  the attackers actually declared, every announced total equals the sum of the
  attackers' printed power, and every applied damage matches — life totals and
  library counts reconcile exactly against the logged events.
- Stack handling is clean: 13/13 instants and sorceries went cast → three
  priority passes → resolve, with nothing stranded.

## Confirmed defects

> **Status:** #1 and #2 are fixed (`oracle.rs` parses the enters-tapped clause
> and reads split/adventure front faces; `PARSE_VERSION` invalidates rows an
> older parser wrote). The `*`-power gap under "known-by-design" is fixed too.
> Regression cover: `oracle.rs` unit tests + `playtest/scenarios/tapland-audit.js`.

### 1. Lands that enter tapped can be tapped for mana the turn they arrive
`rules.rs::solve_payment` accepts any untapped land with a non-empty
`produced` list. It has no notion of "enters tapped", so a tapland is spendable
immediately. Four provable seat-turns in this run, e.g.:

```
#25 Cirrus (AI) plays Radiant Grove from their hand onto the battlefield
#26 Cirrus (AI) casts Nature's Lore (paying 2)
```

Radiant Grove enters tapped; Cirrus had no other untapped source. Fix: read
the enters-tapped clause from oracle text (or a `tapped_on_entry` flag) and
mark the card `tapped` on arrival, which also makes the client's glow correct.

### 2. Split / adventure cards are mis-parsed two ways
Scryfall returns **combined-face strings** for `layout: adventure` and split
cards. Both parsers take them literally:

- `oracle.rs::is_instant()` is a substring test on the whole combined type
  line, so `Legendary Creature — Human Detective // Instant` reads as an
  instant. The creature is pushed to the stack and resolves to the
  **graveyard** instead of the battlefield (observed: Hildibrand Manderville,
  Murderous Rider — board 5→5, graveyard 0→1).
- `parse_cost` sums both halves' pips, so the same cards are **overcharged**
  (Murderous Rider billed 5).

Fix: prefer `card_faces[0]` for type line and mana cost whenever `card_faces`
is present, as the client-side parser already does for P/T.

### 3. (harness) Transcript land column counted basic-land names only
My own bug, now fixed: `bot-pod-audit.js` classified lands with a name regex,
under-reporting every seat (Cirrus showed 1 land against a real 8). It now
classifies from `server/src/data/bot_data.json` type letters, which is exact
for bot decks.

## Raised but refuted (checked, not defects)

- **"Seat 3 never attacked, so aggro/easy is broken."** *(This was my own
  first conclusion — it is wrong.)* Moss's only creatures all game were a 2/4,
  a 2/4 and a summoning-sick 2/2, while its best target always held an untapped
  4+ power blocker (Shadow's Hound 4/3, later Sepulchral Primordial 5/4, Angel
  of the Ruins 5/7). Every such attack scores safety class 5 ("dies for free"),
  which correctly requires an alpha-strike aggression level. **Declining was
  the right play.** The related "attacks should spread across opponents" claim
  is also backwards: `threat_score`/`pick_target` implement a deliberate
  archenemy rule, and Aster (21 permanents, 15 life) genuinely scored past the
  1.5× threshold.
- **"Only one block in 17 combats."** Six of those combats had *zero legal
  blockers* (the recurring attackers, Sunscorch Regent and Angel of the Ruins,
  both fly; the defenders were groundbound). Nine of the remaining ten were
  correct declines under the chump-block gate. One debatable call: Barret
  Wallace (4/4 reach) declined a near-even trade with a 4/3 flier because
  `bot.rs` requires `atk_eval >= eval_creature(blocker)`.
- **"turns_taken off-by-one for the starting seat."** The auditor missed the
  `ws.rs` call site; the counter is correct.
- **"1-based vs 0-based seat numbers."** Two different programs emit those
  strings (server log vs harness roster); not an app inconsistency.
- **"Log seq numbers are not unique."** True but by design: `extra_logs` share
  their parent action's room-state version, which is what `seq` means.
- **"16 seat-turns missed a land drop."** Those were turns with no land in
  hand.

## Known-by-design gaps (worth deciding on, not bugs today)

- **Spell effects do not execute.** Thirteen spells resolved as no-ops
  (Final Judgment and Cleansing Nova left every board untouched). This is the
  freeform contract — the caster performs the effect — but it is exactly what
  the trigger/effect passes in `docs/rules-roadmap.md` are meant to close.
- **Permanent spells bypass the stack** (`game.rs`: only instants/sorceries are
  pushed), so 35 of 48 casts offered no priority window and could not be
  countered.
- **A commander dying in combat goes straight to the graveyard** with no
  command-zone prompt, so it can never be recast.
- ~~**`*` power creatures** (Bronze Guardian) parse as power 0, so they never
  attack and never block usefully.~~ Fixed: `oracle.rs` records the counting
  ability ("power is equal to the number of artifacts you control"),
  `rules::effective_pt` evaluates it against the board, and `bot::power_of`
  reads the same answer so bots attack and block with them. Only the counting
  CDA shape is modelled; other `*` cards keep a numeric floor ("1+*" -> 1).
- **Bot decks contain zero planeswalkers** (verified across all four precons),
  so bots can never exercise loyalty. Covered instead by
  `scenarios/planeswalker-audit.js` — 11/11 passing: cast with auto-tap,
  loyalty counters up/down persisted server-side, loyalty surviving a turn
  cycle without being wiped by auto-untap, and the walker leaving for the
  graveyard at zero.

## Harness note (bit me twice — worth fixing in `lib.js`)

Public→public moves (battlefield→graveyard) and `card.counter` deliberately do
**not** force a `room.state` resync; the client applies the `room.event`
optimistically. Any assertion that reads state after such an action must call
`requestResync()` and wait with a `since` cursor. `lib.js::lastState()` is also
not room-scoped. Three "failures" in the first planeswalker run were purely
this. Both scenarios here now do it correctly.
