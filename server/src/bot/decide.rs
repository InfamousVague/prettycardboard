//! The brain: the strict priority ladder that yields one decision per tick,
//! and the bot's own turn.

use super::*;

// -------------------------------------------------------------------- brain

/// The bot's one decision for this tick.
pub(crate) fn decide(app: &App, room: &Room, uid: &str, mind: &mut BotMind, now: i64) -> Decision {
    let Some(me) = room.players.iter().find(|p| p.user_id == uid) else {
        return Decision::none();
    };
    if !room.started {
        return Decision::none();
    }
    if let Some(result) = &room.match_result {
        // The table is frozen, but a winning bot still gets its handshake in.
        if result.winner_user_id == me.user_id && !mind.said_win {
            mind.said_win = true;
            return Decision { action: None, say: vec![win_line()], fast: false };
        }
        return Decision::none();
    }
    if me.conceded {
        return Decision::none();
    }
    let style = style_of(me);
    let mut say: Vec<String> = Vec::new();

    // A combat that ended (combat.end, or cleared by a turn change) settles
    // its damage against this bot from the room's authoritative record; a
    // fast attack sequence can begin and end entirely between two ticks, so
    // a live snapshot could never be trusted to exist. Enforced rooms skip
    // all of it - combat.resolve already applied damage and deaths.
    if crate::rules::enforced(room) {
        mind.adopted = true;
        mind.settled_combat = room.last_combat.as_ref().map(|e| e.seq);
    } else if room.combat.is_none() {
        mind.block_says = 0;
        match (&room.last_combat, mind.adopted) {
            (Some(ended), true) => {
                if mind.settled_combat != Some(ended.seq) {
                    mind.settled_combat = Some(ended.seq);
                    settle_combat(app, room, me, ended, mind, &mut say);
                }
            }
            (ended, false) => {
                // A brand-new mind (boot/restart) must not re-settle a combat
                // that ended before it existed.
                mind.adopted = true;
                mind.settled_combat = ended.as_ref().map(|e| e.seq);
            }
            (None, true) => {}
        }
    } else if !mind.adopted {
        mind.adopted = true;
        mind.settled_combat = room.last_combat.as_ref().map(|e| e.seq);
    }
    // A spell someone else cast resolved while pointed at one of MY
    // permanents. The freeform contract makes the owner perform the effect, so
    // the bot does what a human opponent would: move the card to the
    // graveyard. Its commander then rides the existing cmd.choice path back to
    // the command zone. Countered spells are skipped, and each seq is honored
    // once so an undo/redo cannot double-apply it.
    for rt in &room.resolved_targets {
        if rt.countered || rt.caster == me.user_id || mind.honored_targets.contains(&rt.seq) {
            continue;
        }
        let Some(card) = me.battlefield.iter().find(|c| c.iid == rt.target_iid) else {
            continue;
        };
        mind.honored_targets.push(rt.seq);
        if mind.honored_targets.len() > 16 {
            mind.honored_targets.remove(0);
        }
        say.push(honor_line(&card.name, &rt.spell));
        return Decision {
            action: Some(Action::CardMove {
                iid: card.iid.clone(),
                to: Zone::Graveyard,
                x: None,
                y: None,
                index: None,
                face_down: false,
            }),
            say,
            fast: false,
        };
    }

    if let Some(action) = mind.queue.pop_front() {
        return Decision { action: Some(action), say, fast: true };
    }

    // Dead by the numbers: concede so the match can actually end.
    let cmd_dead = me.cmd_damage.values().any(|&d| d >= 21);
    if me.life <= 0 || me.poison >= 10 || cmd_dead {
        if !mind.said_gg {
            mind.said_gg = true;
            say.push(gg_line());
        }
        return Decision { action: Some(Action::Concede), say, fast: false };
    }

    // Own mulligan first; it blocks everything else this bot might do.
    if let Some(m) = &me.mulligan {
        if m.state == "deciding" {
            let (action, line) = mulligan_action(room, me, m.taken, tier_of(me));
            if let Some(line) = line {
                say.push(line);
            }
            return Decision { action: Some(action), say, fast: false };
        }
    }

    // Commander headed off the battlefield: always accept the command zone.
    if let Some(p) = room.pending_cmd.iter().find(|p| p.owner == uid) {
        return Decision { action: Some(Action::CmdReturn { iid: p.iid.clone(), accept: true }), say, fast: false };
    }

    // A fired trigger of mine: apply what the engine parsed and say so;
    // triggers only a human could perform are dismissed (their text is table
    // knowledge either way). `fast` so a burst of triggers clears in one tick.
    if crate::rules::enforced(room) {
        if let Some(pt) = room.pending_triggers.iter().find(|t| t.owner == uid) {
            if pt.auto {
                say.push(format!(
                    "{} triggers: {}.",
                    pt.source_name,
                    crate::rules::effects_summary(&pt.effects)
                ));
            }
            return Decision {
                action: Some(Action::TriggerAnswer { id: pt.id.clone(), apply: pt.auto }),
                say,
                fast: true,
            };
        }
    }

    // Wait politely while anyone is still deciding their mulligan. Conceded
    // seats never keep (their decision is void), so they do not hold this up.
    let all_kept = room
        .players
        .iter()
        .filter(|p| !p.conceded)
        .all(|p| p.mulligan.as_ref().map(|m| m.state == "kept").unwrap_or(true));
    if !all_kept {
        return Decision { action: None, say, fast: false };
    }

    // An empty stack ends any response bookkeeping: the threat is gone.
    if room.stack.is_empty() {
        mind.spent_counter = None;
        mind.responded_to = None;
    }

    // An open stack (enforced): resolve my own top spell once everyone has
    // passed, respond rarely (hard bots with a spare instant), else pass.
    if crate::rules::enforced(room) && !room.stack.is_empty() {
        let top = room.stack.last().unwrap();
        if top.owner == me.user_id {
            let f = crate::rules::facts(app, &top.card);
            // Removal names its victim while the spell is still on the stack:
            // the whole table sees "targets X with Y", and the owner (human or
            // bot) settles it on resolution. Biggest opposing creature.
            let is_threat = f.as_ref().map(|f| f.threat).unwrap_or(false);
            if is_threat && top.target_iid.is_none() {
                let victim = room
                    .players
                    .iter()
                    .filter(|p| p.seat != me.seat && !p.conceded)
                    .flat_map(|p| p.battlefield.iter())
                    .filter(|c| is_creature(c) || crate::rules::facts(app, c).map(|f| f.is_creature()).unwrap_or(false))
                    .max_by_key(|c| eval_creature_at(app, room, c));
                if let Some(victim) = victim {
                    return Decision {
                        action: Some(Action::StackTarget {
                            iid: top.card.iid.clone(),
                            target_iid: Some(victim.iid.clone()),
                        }),
                        say,
                        fast: true,
                    };
                }
            }
            if crate::rules::stack_resolvable(room, me.seat) {
                // A counterspell answers the newest opposing spell beneath it:
                // StackCounter removes the victim and the table reads
                // "counters X with Y". One counterspell counters exactly ONE
                // spell (spent_counter remembers), then resolves to the
                // graveyard on the next tick through this same branch.
                if f.as_ref().map(|f| f.counters_spell).unwrap_or(false)
                    && mind.spent_counter.as_deref() != Some(top.card.iid.as_str())
                {
                    let victim = room.stack[..room.stack.len() - 1]
                        .iter()
                        .rev()
                        .find(|e| e.owner != me.user_id);
                    if let Some(victim) = victim {
                        mind.spent_counter = Some(top.card.iid.clone());
                        return Decision {
                            action: Some(Action::StackCounter {
                                iid: victim.card.iid.clone(),
                                to: Zone::Graveyard,
                            }),
                            say,
                            fast: false,
                        };
                    }
                }
                // Permanents (a cascade hit riding the stack) resolve onto
                // the battlefield; instants and sorceries to the graveyard.
                let to_battlefield = f
                    .map(|f| f.is_permanent() || f.is_land())
                    .unwrap_or(false);
                let k = me.battlefield.iter().filter(|c| !is_land(c)).count();
                return Decision {
                    action: Some(Action::StackResolve {
                        iid: top.card.iid.clone(),
                        to: if to_battlefield { Zone::Battlefield } else { Zone::Graveyard },
                        x: to_battlefield.then(|| (0.15 + 0.11 * (k % 7) as f64).min(0.92)),
                        y: to_battlefield.then_some(0.5),
                    }),
                    say,
                    fast: false,
                };
            }
            return Decision { action: None, say, fast: false };
        }
        if !room.stack_passed.contains(&me.seat) {
            // Responses that actually DO something when they resolve. An
            // affordable instant (or flash spell) qualifies through its
            // parsed intent - counters / draws / discards / scry - so the
            // bot never wastes a combat trick into an empty stack.
            let affordable_instant = |c: &&Card| {
                crate::rules::facts(app, c)
                    .map(|f| {
                        (f.is_instant() || f.has("flash"))
                            && crate::rules::can_afford(
                                app,
                                room,
                                me,
                                crate::rules::reduced_generic(app, me, &f, f.generic),
                                &f.pips,
                            )
                    })
                    .unwrap_or(false)
            };
            let top_facts = crate::rules::facts(app, &top.card);
            // One response per opposing spell (responded_to remembers), or a
            // hard bot would dump its whole hand at a single threat, one
            // instant per pass round.
            let answered = mind.responded_to.as_deref() == Some(top.card.iid.as_str());
            // A recognized removal/burn spell while I have a board, or any
            // big opposing play, is worth a real answer from a hard bot.
            let scary = top_facts.as_ref().map(|f| f.threat).unwrap_or(false)
                && me.battlefield.iter().any(is_creature);
            let big = top_facts.as_ref().map(|f| f.mv >= 5).unwrap_or(false);
            if tier_of(me) > 0 && !answered && (scary || big) {
                let counter = me.hand.iter().filter(affordable_instant).find(|c| {
                    crate::rules::facts(app, c).map(|f| f.counters_spell).unwrap_or(false)
                });
                if let Some(card) = counter {
                    mind.responded_to = Some(top.card.iid.clone());
                    return Decision {
                        action: Some(Action::Cast {
                            iid: card.iid.clone(),
                            payment: None,
                            x: Some(0.5),
                            y: Some(0.5),
                        }),
                        say,
                        fast: false,
                    };
                }
            }
            // Removal at instant speed answers the scary board directly.
            if tier_of(me) > 0 && !answered && scary {
                let removal = me.hand.iter().filter(affordable_instant).find(|c| {
                    crate::rules::facts(app, c).map(|f| f.threat).unwrap_or(false)
                });
                if let Some(card) = removal {
                    mind.responded_to = Some(top.card.iid.clone());
                    return Decision {
                        action: Some(Action::Cast {
                            iid: card.iid.clone(),
                            payment: None,
                            x: Some(0.5),
                            y: Some(0.5),
                        }),
                        say,
                        fast: false,
                    };
                }
            }
            // Occasionally, a value instant whose intent the engine resolves
            // for real (draw / scry / each-opponent discard).
            if tier_of(me) > 0 && !answered && rand::random_range(0..100) < 30 {
                let value = me.hand.iter().filter(affordable_instant).find(|c| {
                    crate::rules::facts(app, c)
                        .map(|f| {
                            f.draws_spell.is_some()
                                || f.scry_spell.is_some()
                                || f.opp_discards.is_some()
                        })
                        .unwrap_or(false)
                });
                if let Some(card) = value {
                    mind.responded_to = Some(top.card.iid.clone());
                    return Decision {
                        action: Some(Action::Cast {
                            iid: card.iid.clone(),
                            payment: None,
                            x: Some(0.5),
                            y: Some(0.5),
                        }),
                        say,
                        fast: false,
                    };
                }
            }
            return Decision { action: Some(Action::StackPass), say, fast: true };
        }
        return Decision { action: None, say, fast: false };
    }

    // Someone's end-step window is open and the stack is empty: a hard bot
    // with a held answer USES the window (that is what it held mana for);
    // everyone else passes so the turn can end.
    if crate::rules::enforced(room)
        && room.end_window.is_some()
        && room.active_seat != me.seat
        && room.stack.is_empty()
        && !room.stack_passed.contains(&me.seat)
    {
        if tier_of(me) > 0 && mind.responded_to.is_none() {
            let opposing_board = room
                .players
                .iter()
                .filter(|p| p.seat != me.seat && !p.conceded)
                .flat_map(|p| p.battlefield.iter())
                .any(|c| is_creature(c) || crate::rules::facts(app, c).map(|f| f.is_creature()).unwrap_or(false));
            if opposing_board {
                let trick = me.hand.iter().find(|c| {
                    crate::rules::facts(app, c)
                        .map(|f| {
                            f.threat
                                && f.is_instant()
                                && crate::rules::can_afford(
                                    app,
                                    room,
                                    me,
                                    crate::rules::reduced_generic(app, me, &f, f.generic),
                                    &f.pips,
                                )
                        })
                        .unwrap_or(false)
                });
                if let Some(card) = trick {
                    mind.responded_to = Some(format!("endstep:{}", room.turn_number));
                    return Decision {
                        action: Some(Action::Cast {
                            iid: card.iid.clone(),
                            payment: None,
                            x: Some(0.5),
                            y: Some(0.5),
                        }),
                        say,
                        fast: false,
                    };
                }
            }
        }
        return Decision { action: Some(Action::StackPass), say, fast: true };
    }

    // Someone else's combat: declare blocks, one per tick.
    if let Some(combat) = &room.combat {
        if room.active_seat != me.seat {
            if crate::rules::enforced(room) {
                // Enforced machine: wait for the lock, block, then Ready.
                if !combat.locked || combat.blocks_ready {
                    return Decision { action: None, say, fast: false };
                }
                if !defends_enforced(room, combat, me.seat) {
                    return Decision { action: None, say, fast: false };
                }
                if let Some(action) = choose_block(app, room, me, combat, style, mind, &mut say) {
                    return Decision { action: Some(action), say, fast: false };
                }
                return Decision { action: Some(Action::CombatReady), say, fast: false };
            }
            if let Some(action) = choose_block(app, room, me, combat, style, mind, &mut say) {
                return Decision { action: Some(action), say, fast: false };
            }
            return Decision { action: None, say, fast: false };
        }
    }

    if room.active_seat != me.seat {
        return Decision { action: None, say, fast: false };
    }
    // My own end window is open: the turn is over except for the waiting.
    // No new plays; the pass fires when the window closes. (Usually the last
    // opposing StackPass advances the turn before this ever fires.)
    if crate::rules::enforced(room) && room.end_window.is_some() {
        if crate::rules::turn_pass_completes(room) {
            return Decision { action: Some(Action::TurnPass), say, fast: false };
        }
        return Decision { action: None, say, fast: false };
    }
    let mut d = own_turn(app, room, me, mind, style, now);
    if !say.is_empty() {
        let mut merged = say;
        merged.extend(d.say);
        d.say = merged;
    }
    d
}

// ----------------------------------------------------------------- own turn

/// The bot's own turn: resolve its stack spells, drop a land, cast what the
/// untapped lands afford, run the attack plan, wrap combat, pass. Never
/// stalls past the failsafe.
pub(crate) fn own_turn(app: &App, room: &Room, me: &Player, mind: &mut BotMind, style: Style, now: i64) -> Decision {
    let tn = room.turn_number;
    if mind.turn_started.map(|(t, _)| t) != Some(tn) {
        mind.turn_started = Some((tn, now));
        mind.casting = None;
        mind.attack = None;
        mind.played_this_turn.clear();
        // Every fresh turn gets a beat of "thinking" before the first move.
        return Decision::none();
    }
    // The beat is a real minimum, not just a skipped tick: whatever the
    // scheduler cadence, a turn's first action waits TURN_MIN_THINK_MS.
    if now - mind.turn_started.map(|(_, ts)| ts).unwrap_or(now) < TURN_MIN_THINK_MS {
        return Decision::none();
    }
    if mind.casts.0 != tn {
        mind.casts = (tn, 0);
    }
    // The turn failsafe, EXCEPT while an announced attack is holding the
    // response window open - that clock belongs to the defender and is
    // bounded by its own cap.
    let awaiting_response = mind.attack.as_ref().map(|p| p.announced).unwrap_or(false);
    if !awaiting_response
        && now - mind.turn_started.map(|(_, ts)| ts).unwrap_or(now) > TURN_FAILSAFE_MS
    {
        mind.casting = None;
        mind.attack = None;
        if room.combat.is_some() {
            return Decision::act(Action::CombatEnd);
        }
        return Decision::act(Action::TurnPass);
    }
    // Spells the bot pushed ride the stack one tick, then hit the graveyard.
    // (Enforced rooms handled this earlier in decide(), passes included.)
    // A recognized removal/burn spell DECLARES ITS VICTIM first - the whole
    // table sees "targets X with Y" and the owner settles it on resolution,
    // exactly the freeform contract humans play by. Oracle facts are
    // prefetched for every room, not just enforced ones.
    if !crate::rules::enforced(room) {
        if let Some(entry) = room.stack.iter().find(|e| e.owner == me.user_id) {
            let is_threat = crate::rules::facts(app, &entry.card)
                .map(|f| f.threat)
                .unwrap_or(false);
            if is_threat && entry.target_iid.is_none() {
                let victim = room
                    .players
                    .iter()
                    .filter(|p| p.seat != me.seat && !p.conceded)
                    .flat_map(|p| p.battlefield.iter())
                    .filter(|c| is_creature(c) || crate::rules::facts(app, c).map(|f| f.is_creature()).unwrap_or(false))
                    .max_by_key(|c| eval_creature_at(app, room, c));
                if let Some(victim) = victim {
                    return Decision {
                        action: Some(Action::StackTarget {
                            iid: entry.card.iid.clone(),
                            target_iid: Some(victim.iid.clone()),
                        }),
                        say: Vec::new(),
                        fast: true,
                    };
                }
            }
            return Decision::act(Action::StackResolve {
                iid: entry.card.iid.clone(),
                to: Zone::Graveyard,
                x: None,
                y: None,
            });
        }
    }

    // Mid-combat: declare the next attacker, announce, wait, then wrap.
    if let Some(combat) = &room.combat {
        let explicit_defender = room.players.len() > 2;
        if let Some(plan) = &mut mind.attack {
            if let Some(iid) = plan.pending.pop() {
                let card = me.battlefield.iter().find(|c| c.iid == iid);
                let Some(card) = card else {
                    return Decision::none();
                };
                return Decision::act(Action::CombatAttack {
                    iid,
                    defender_seat: explicit_defender.then_some(plan.defender_seat),
                    power: Some(power(card).to_string()),
                    toughness: Some(toughness(card).to_string()),
                });
            }
            if !plan.announced {
                plan.announced = true;
                plan.announced_at = now;
                plan.blocks_seen = combat.blocks.len();
                plan.needs_lock = crate::rules::enforced(room);
                plan.defender_life = room
                    .players
                    .iter()
                    .find(|p| p.seat == plan.defender_seat)
                    .map(|p| p.life)
                    .unwrap_or(0);
                // Announce from what actually got declared.
                let mut total = 0i64;
                let mut names: Vec<String> = Vec::new();
                for a in &combat.attackers {
                    if let Some(c) = me.battlefield.iter().find(|c| c.iid == a.iid) {
                        total += stat(a.power.as_deref()).unwrap_or_else(|| power(c));
                        names.push(c.name.clone());
                    }
                }
                let defender_name = room
                    .players
                    .iter()
                    .find(|p| p.seat == plan.defender_seat)
                    .map(|p| p.username.clone())
                    .unwrap_or_else(|| "the table".to_string());
                if !names.is_empty() {
                    // Enforced rooms pair the announcement with the lock-in.
                    let action = plan.needs_lock.then_some(Action::CombatLock);
                    plan.needs_lock = false;
                    return Decision {
                        action,
                        say: vec![attack_line(&defender_name, total, &names)],
                        fast: false,
                    };
                }
                if plan.needs_lock {
                    plan.needs_lock = false;
                    return Decision::act(Action::CombatLock);
                }
                return Decision::none();
            }
            if crate::rules::enforced(room) {
                // Enforced machine: wait for the defender's Ready (the server
                // computed the preview), give the table a beat to read it,
                // then resolve. A silent defender caps out and the attack is
                // withdrawn rather than force-resolved.
                if combat.preview.is_some() {
                    if now - plan.announced_at < 1_200 {
                        return Decision::none();
                    }
                    mind.attack = None;
                    return Decision::act(Action::CombatResolve);
                }
                let humans_defending = room
                    .players
                    .iter()
                    .any(|p| !p.is_bot && !p.conceded && p.seat != me.seat);
                let cap = if humans_defending { ATTACK_WAIT_HUMAN_MAX_MS } else { 6_000 };
                if now - plan.announced_at >= cap {
                    mind.attack = None;
                    return Decision::act(Action::CombatEnd);
                }
                return Decision::none();
            }
            // The response window. All-bot tables move on almost at once;
            // against humans the combat stays open until the defender has
            // actually answered, up to a generous cap. The defender can
            // always cut this short with their own End combat / Take damage.
            let humans_defending = room
                .players
                .iter()
                .any(|p| !p.is_bot && !p.conceded && p.seat != me.seat);
            let watched = !room.spectators.is_empty();
            if !humans_defending {
                if now - plan.announced_at < if watched { 4_000 } else { ATTACK_WAIT_BOTS_MS } {
                    return Decision::none();
                }
                mind.attack = None;
                return Decision::act(Action::CombatEnd);
            }
            // New blocks reset the grace window: they are still deciding.
            if combat.blocks.len() != plan.blocks_seen {
                plan.blocks_seen = combat.blocks.len();
                plan.respond_grace_until = now + ATTACK_RESPONSE_GRACE_MS;
                return Decision::none();
            }
            // The defender settled the damage on their own life: nearly done,
            // give them a beat and wrap.
            let defender_life_now = room
                .players
                .iter()
                .find(|p| p.seat == plan.defender_seat)
                .map(|p| p.life)
                .unwrap_or(plan.defender_life);
            if defender_life_now < plan.defender_life && plan.respond_grace_until == 0 {
                plan.respond_grace_until = now + 1_500;
                return Decision::none();
            }
            let responded = plan.respond_grace_until > 0;
            if responded && now >= plan.respond_grace_until {
                mind.attack = None;
                return Decision::act(Action::CombatEnd);
            }
            if now - plan.announced_at >= ATTACK_WAIT_HUMAN_MAX_MS {
                mind.attack = None;
                return Decision::act(Action::CombatEnd);
            }
            return Decision::none();
        }
        // Combat overlay without a plan (restart, or someone else opened it
        // on our turn): just close it out.
        return Decision::act(Action::CombatEnd);
    }

    let tier = tier_of(me);
    match room.phase.as_str() {
        "main2" | "end" => {
            // Post-combat: maybe one more spell from the budget, then pass.
            if let Some(d) = cast_step(app, room, me, mind, style, tier, tn) {
                return d;
            }
            Decision::act(Action::TurnPass)
        }
        _ => {
            // First main phase: land, spells, then combat when the style
            // likes an attack.
            if mind.land_turn != Some(tn) {
                mind.land_turn = Some(tn);
                if let Some(land) = me.hand.iter().find(|c| is_land(c)) {
                    let n = me.battlefield.iter().filter(|c| is_land(c)).count();
                    return Decision::act(Action::CardMove {
                        iid: land.iid.clone(),
                        to: Zone::Battlefield,
                        x: Some((0.05 + 0.085 * (n % 11) as f64).min(0.95)),
                        y: Some(0.78),
                        index: None,
                        face_down: false,
                    });
                }
            }
            if let Some(d) = cast_step(app, room, me, mind, style, tier, tn) {
                return d;
            }
            if let Some(plan) = plan_attack(app, room, me, mind, style, tier) {
                mind.attack = Some(plan);
                return Decision::act(Action::CombatBegin);
            }
            Decision::act(Action::TurnPass)
        }
    }
}

