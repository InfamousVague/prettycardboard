# Sources for bot AI, rules data, and training corpora

Survey run 2026-07-30. Five parallel researchers plus first-hand verification
of every load-bearing claim (licenses fetched from the actual LICENSE files,
APIs called, formats sampled). Facts marked **[verified here]** were checked
directly by fetching the source, not taken from a summary.

## ⚠️ Read this first: the license fault line

**This repo has no LICENSE file, no `license` field in `package.json`, and no
`license` in `server/Cargo.toml`** — i.e. all-rights-reserved by default — and
it **ships desktop binaries** (`src-tauri/`, `scripts/release-mac.mjs`, the
desktop-build workflow). Distributing binaries is exactly what triggers the
GPL's obligations, so copyleft sources are off the table unless the whole
product is relicensed:

| Project | License **[verified here]** | Verdict |
|---|---|---|
| **XMage** (magefree/mage) | **MIT** | ✅ code reusable with attribution |
| **phase-rs/phase** | **MIT OR Apache-2.0** (both files present) | ✅ reusable, and it is Rust |
| **MTGJSON** | MIT | ✅ already used |
| **Scryfall** | WotC Fan Content Policy | ✅ already used |
| Forge (Card-Forge/forge) | **GPL-3.0** | ❌ blocked for copying |
| Magarena | **GPL-3.0** | ❌ blocked for copying |
| Cockatrice | GPL-2.0 | ❌ blocked |
| manabrew | AGPL-3.0 | ❌ worst case — reaches the hosted server too |

Forge's **data files are not separately licensed**: one `LICENSE` (GPL-3.0) at
the repo root covers `forge-gui/res/`, and `CONTRIBUTING.md` carves out only
*art*. So the card scripts and `.ai` profiles are GPL-3.0 as distributed.

### Self-report: three constants in our code trace to Forge

`server/src/bot.rs`'s `eval_creature` is `100 + 15*power + 10*toughness +
5*mana_value`. Forge's `CreatureEvaluator.java` (GPL-3.0) is `80 + 20
(non-token) + power*15 + toughness*10 + cmc*5` — **[verified here]** by
fetching the file. Those coefficients came from a research summary of Forge
during this project's first session and are, collapsed, the same numbers.

Practical read (not legal advice): a single coefficient is an unprotectable
idea; a tuned *compilation* of many is a different question. Three constants
is the low end of that spectrum, but it is trivially fixable and worth fixing
before shipping binaries. **Recommended:** replace with independently chosen
weights, or adopt XMage's MIT scoring with attribution (below). Either way,
add a LICENSE file so the project's own terms are explicit.

## Tier 1 — take these

### mtgish — 33,208 cards already parsed into an executable AST **[verified here]**
`https://github.com/i5jb/mtgish` · **MIT** (LICENSE file fetched — note GitHub's
API reports NOASSERTION, but the file is plain MIT) · Rust.

Ships **prebuilt data** (`data/mtgish.lines.json` 30 MB, `.ron` 15.7 MB) plus
**generated Rust serde types** (`rust_syntax/src/mtg_types.rs`, 0.48 MB). A
researcher compiled those types against serde and parsed the whole corpus:
`parsed_ok=33208 parse_err=0` in 0.18 s.

Sampled directly during this survey — a real entry:

```json
{"Name":"\"Lifetime\" Pass Holder",
 "Typeline":{"Supertypes":[],"Cardtypes":["Creature"],"Subtypes":["Zombie","Guest"]},
 "ManaCost":[{"_ManaSymbol":"ManaCostB"}],
 "Rules":[{"_Rule":"AsPermanentEnters","args":[{"_Permanent":"ThisPermanent"},
            [{"_ReplacementActionWouldEnter":"EntersTapped"}]]},
          {"_Rule":"TriggerA","args":[{"_Trigger":"WhenAPermanentDies", ...}]}]}
```

**This single source resolves three bugs we already logged**, because it gives
structured facts where we currently string-match Scryfall:

- `AsPermanentEnters → EntersTapped` — the **tapland bug** (`docs/ai-findings.md`
  finding 1) becomes a lookup instead of oracle-text parsing.
- `Typeline` pre-split into Supertypes/Cardtypes/Subtypes — kills the
  **"Sorcery // Land" mis-typing** of split/adventure cards.
- `ManaCost` as structured symbols — kills the **split-card cost mis-parse**.

And its trigger taxonomy is exactly the roadmap's Pass A:
`WhenAPermanentEntersTheBattlefield` (5,084 cards),
`WhenACreatureAttacks` (1,164), `WhenAPermanentDies` (1,041),
`AtTheBeginningOfAPlayersUpkeep` (953). Anthems appear as
`EachPermanentLayerEffect + AdjustPT(1,1)`, cost reduction as
`PlayerEffect + DecreaseSpellCost`, and replacement effects as `Replace*`
rules — Passes A, B and C of `docs/rules-roadmap.md`, as data, under MIT.

### phase-rs/phase — a Rust MTG engine with an AI crate **[verified here]**
`https://github.com/phase-rs/phase` · dual **MIT OR Apache-2.0** · 209 stars ·
Rust · actively pushed (same day as this survey).

Crates include `engine` (turns, priority, stack, combat, state-based actions,
**layers, triggers, replacement effects**), **`phase-ai`** (game-tree search,
eval, combat AI, a named-policy registry, an `ai_tune` binary), plus
`mtgish-import`, `manabrew-compat`, `phase-server`, `engine-wasm`.

README claims 34,300+ cards parsed from MTGJSON into a typed ability IR.
Same language, permissive license, so this is usable three ways: as a crate
dependency, as a source of ported logic, or purely as its generated card IR
consumed by our `oracle.rs`. Notably it already consumes **mtgish** through an
`mtgish-import` crate that maps that AST onto Ability/Trigger/Static/
Replacement definitions — read that crate before writing our own mapper.

### Scryfall Oracle Tags — the missing "what does this card DO" signal **[verified here]**
`https://api.scryfall.com/bulk-data` → `oracle_tags` → a gzipped JSONL
(5.8 MB, refreshed daily; downloaded and parsed during this survey).

**4,505 functional tags keyed by `oracle_id`** — exactly the join key our
oracle cache already uses. Coverage sampled directly:

| tag | cards | tag | cards |
|---|---|---|---|
| `spot-removal` | 4,996 | `draw-engine` | 1,508 |
| `evasion` | 4,582 | `pure-draw` | 1,275 |
| `removal-creature` | 1,930 | `burn-any` | 910 |
| `repeatable-removal` | 1,776 | `lifegain` | 889 |
| `removal-destroy` | 1,713 | `multi-removal` | 642 |
| `gives-pp-counters` | 1,355 | `ramp` | 560 |

This is the cheapest large win available: the bot currently has *no* concept
of "this card is removal / a wipe / ramp", and this supplies it without
parsing a word of oracle text. Same source and terms we already comply with.

Also already in every card object we cache and currently unused:
`edhrec_rank` (Commander popularity as a card-quality proxy), `game_changer`,
`legalities`, `layout`, `card_faces`, `all_parts`, `loyalty`, `defense`.

### XMage — MIT, so its heuristics are legally portable **[verified here]**
`https://github.com/magefree/mage` · **MIT** (LICENSE.txt fetched).

- AI at `Mage.Server.Plugins/Mage.Player.AI/src/mage/player/ai/`:
  `ComputerPlayer`, `CombatEvaluator`, `PermanentEvaluator`, `Attackers`,
  `PossibleTargetsSelector`, and a `score/` package of pure heuristic tables.
- `PermanentEvaluator` **[read here]** scores planeswalkers as
  `2 × loyalty` and adds a point per activated/mana ability — both things our
  bot ignores today.
- 250 keyword-ability classes and 399 common-effect classes: a ready-made
  *vocabulary* of what effects exist, useful as the target enum for our own
  trigger/effect parsing even where we do not port code.

### Academy Ruins — the Comprehensive Rules as structured JSON **[verified here]**
`https://api.academyruins.com/cr` → HTTP 200, **1.24 MB, 3,153 numbered
rules** as a dict keyed by rule number, each with `ruleNumber`, `ruleText`,
`examples`. Sampled 509.1a (the blocking rule) directly. Ideal for citing a
rule in a rejection message ("509.1a: blockers must be untapped") and for
building the rules-checker's reference text.

### MTGJSON — already used, more available
MIT. `AtomicCards` (oracle-level), `Keywords.json`, `CardTypes.json`,
`AllPrintings` (also SQLite). The keyword and type enumerations are useful as
a closed vocabulary for the parser.

## Tier 2 — read for design, do not copy

- **Forge** (GPL-3.0) is still the best *design* reference. Its
  `CreatureEvaluator` has ~40 additive terms (flying `+10×P`, deathtouch
  `+25`, lifelink `+10×P`, double strike `+10+15×P`, trample `+5×(P−1)`,
  vigilance `+5×(P+T)`, hexproof `+35`, defender `−(9×P+40)`), and
  `evaluateBoardPosition` / `choosePreferredDefenderPlayer` is the only
  published numeric *multiplayer* threat model found (hand ×15, lands ×8,
  planeswalkers `50+20×CMC+10×loyalty`, monarch/initiative +80). One idea
  worth re-deriving independently: keep every opponent within
  `max − 10 − turnNumber` of the top threat score and pick randomly among
  them, so a single land drop cannot make the archenemy choice predictable.
- **Card-script DSLs** — both blocked, both instructive. Forge
  **[sampled here]**: `A:SP$ DealDamage | ValidTgts$ Any | NumDmg$ 2`.
  Magarena **[sampled here]** is *not* a DSL despite its reputation — its
  `effect=` field holds normalized English (`SN deals 2 damage to target
  creature or player.`). What it does ship, usefully, is **per-card AI
  metadata**: `value=2.000`, `removal=2`, `timing=removal`. Forge's
  `Key:Param$ Value` form is the real DSL (33,473 files, 16,842 triggers,
  7,040 statics, 1,687 replacements) — and it is the GPL-3.0 one.
- **mtgish** (`i5jb/mtgish`, Rust, **MIT [verified here]** — GitHub's API
  reports NOASSERTION, but the LICENSE file is plain MIT): oracle text parsed
  to a structured AST.

## Tier 3 — training data (the honest answer)

**There is no public corpus of constructed-format MTG gameplay decisions.**
Every large public dataset is limited-format, draft-picks-only, or decklists.

- **17Lands public datasets** — genuinely **CC BY 4.0**, the best real data
  available. Three shapes, at
  `https://17lands-public.s3.amazonaws.com/analysis_data/{game_data,draft_data,replay_data}/`:
  - `game_data_*` — one row per game (563,418 games / 1,740 columns / 45.6 MB
    gz for one recent set), bag-of-cards plus outcome. **No play decisions.**
  - `draft_data_*` — one row per pick. Draft only.
  - `replay_data_*` — the only one with turn structure: per-turn columns for
    `lands_played, creatures_cast, creatures_attacked/blocked, combat_damage_taken,
    creatures_killed_combat, mana_spent` and end-of-turn snapshots.

  **The one narrowly usable slice:** `replay_data` carries
  `candidate_hand_1..7` plus `opening_hand` — the *complete mulligan ladder*
  for hundreds of thousands of games. That is real supervised data for exactly
  one decision our bot makes today with a hand-written rule
  (`bot.rs::mulligan_action`). Everything else is a per-turn *summary*: no
  priority passes, no targets, no attack/block pairings, so a legal action
  sequence cannot be reconstructed from it. And it is Arena **Limited** only,
  keyed by card name — useless for Commander precons.
- **MageZero** — AlphaZero-style RL built on XMage (MIT). The only credible
  path to a *learned* MTG policy, and it needs an engine that can self-play.
- Untapped.gg is proprietary/ToS-blocked; MTGO/Arena logs are client-side and
  unlicensed for redistribution.
- Dead end worth recording so nobody re-checks it: **Cockatrice has no rules
  engine and no AI at all** — a tree-wide grep for AI paths matched exactly one
  file, `cockatrice/resources/countries/ai.svg` (the flag of Anguilla).

**Conclusion for this project:** self-play against our own engine is the only
realistic training source, and it is gated on the engine understanding card
effects — i.e. `docs/rules-roadmap.md` is the prerequisite for any ML, not an
alternative to it.

## Bugs in our own code this survey surfaced

- **`oracle.rs` mis-types multi-face cards.** It reads top-level `type_line`,
  so "Agadeem's Awakening // Agadeem, the Undercrypt" is `"Sorcery // Land"`
  and `is_land()` returns **true**. Same root cause as the split/adventure bug
  already queued.
- **`parse_cost()` breaks on split costs.** `"{1}{R} // {1}{U}"` split on
  `"}{"` yields the unparseable token `"R} // {1"`, silently producing
  `{1}{U}`.
- **Scryfall request pacing is worth re-checking.** `oracle.rs:404` sleeps
  150 ms between `/cards/collection` batches (~6.7 req/s). Scryfall's general
  guidance is <10 req/s, but a stricter per-endpoint limit was reported for
  `/cards/collection`; the docs page 403s to automated fetches, so confirm in
  a browser. Raising the sleep is cheap insurance either way — we are a good
  citizen of a free service we depend on.
- All three evaporate if we ingest **mtgish** instead of string-matching
  Scryfall text.

## Recommended order of work

1. Add a LICENSE file; re-derive the three `eval_creature` coefficients.
2. Ingest **mtgish** (MIT, prebuilt, Rust types included) as the structured
   card-effect layer. It is the roadmap's Pass A/B/C data and it fixes three
   known bugs on arrival.
3. Ingest **Scryfall oracle tags** into the oracle cache (`otag` set per
   card) and use them for casting priority, removal targeting, and threat
   scoring. Cheapest large behavior win, no new dependency.
4. Use `edhrec_rank` (already cached) as a tiebreaker for "what to cast".
5. Evaluate **phase-rs/phase** seriously — either depend on its engine crate
   or ingest its card IR; it is the only permissively-licensed Rust engine
   with layers, triggers, and replacement effects already built.
6. Port **XMage**'s `score/` tables (MIT, with attribution) to replace the
   hand-rolled evaluator, including planeswalker loyalty scoring.
7. Cite **Academy Ruins** rule numbers in enforced-mode rejection messages.
