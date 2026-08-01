//! Casting: which spell, which land, and the queued follow-through.

use super::*;

// ------------------------------------------------------------------ casting

/// One step of casting per tick: continue paying for the planned spell (tap a
/// land), fire it once paid, or pick a new affordable target. The commander
/// gets priority when the lands cover mana value plus tax. Enforced rooms
/// skip the tap choreography entirely: the Cast action pays server-side with
/// real colors, so the bot just picks the best affordable card.
pub(crate) fn cast_step(app: &App, room: &Room, me: &Player, mind: &mut BotMind, style: Style, tier: i32, tn: u64) -> Option<Decision> {
    let budget = (cast_budget(style) as i32 + tier).max(1) as u32;
    if crate::rules::enforced(room) {
        if mind.casts.1 >= budget {
            return None;
        }
        // Commander first when the real cost plus tax is payable.
        let commander = me.command.iter().filter(|c| c.is_commander).find(|c| {
            crate::rules::facts(app, c)
                .map(|f| {
                    let tax = me.commander_tax.get(&c.iid).copied().unwrap_or(0);
                    crate::rules::can_afford(
                        app,
                        room,
                        me,
                        crate::rules::reduced_generic(app, me, &f, f.generic + tax),
                        &f.pips,
                    )
                })
                .unwrap_or(false)
        });
        let k = me.battlefield.iter().filter(|c| !is_land(c)).count();
        let x = (0.15 + 0.11 * (k % 7) as f64).min(0.92);
        let y = 0.5;
        if let Some(c) = commander {
            mind.casts = (tn, mind.casts.1 + 1);
            mind.played_this_turn.push(c.iid.clone());
            return Some(Decision {
                action: Some(Action::CmdCast { iid: c.iid.clone(), x, y }),
                say: vec![commander_line(&c.name)],
                fast: false,
            });
        }
        // Biggest affordable spell, creatures breaking ties. Reactive
        // instants (counterspells, instant-speed removal) stay in hand for
        // the response windows instead of being dumped at sorcery speed.
        let opponents_alive = room.players.iter().any(|p| p.seat != me.seat && !p.conceded);
        let mut best: Option<(&Card, i64, bool)> = None;
        for c in &me.hand {
            let Some(f) = crate::rules::facts(app, c) else { continue };
            let reactive = f.counters_spell || (f.threat && f.is_instant());
            if opponents_alive && reactive {
                continue;
            }
            if f.is_land()
                || !crate::rules::can_afford(
                    app,
                    room,
                    me,
                    crate::rules::reduced_generic(app, me, &f, f.generic),
                    &f.pips,
                )
            {
                continue;
            }
            let better = match &best {
                Some((_, mv, creature)) => (f.mv, f.is_creature()) > (*mv, *creature),
                None => true,
            };
            if better {
                best = Some((c, f.mv, f.is_creature()));
            }
        }
        let (card, best_mv, _) = best?;
        // Instant-speed discipline (idea: hold up answers): keep the
        // cheapest held trick's mana open. One trick, never more - a bot
        // hoarding its whole hand reads as passive, not clever.
        if tier >= 0 && opponents_alive {
            let reserve = me
                .hand
                .iter()
                .filter_map(|h| {
                    let f = crate::rules::facts(app, h)?;
                    let reactive = f.counters_spell || (f.threat && f.is_instant());
                    reactive.then_some(f.mv)
                })
                .min()
                .unwrap_or(0);
            if reserve > 0 {
                let sources = me
                    .battlefield
                    .iter()
                    .filter(|s| {
                        !s.tapped
                            && crate::rules::facts(app, s)
                                .map(|f| (f.is_land() || f.taps_for_mana) && !f.produced.is_empty())
                                .unwrap_or(false)
                    })
                    .count() as i64;
                if best_mv + reserve > sources {
                    return None;
                }
            }
        }
        mind.casts = (tn, mind.casts.1 + 1);
        mind.played_this_turn.push(card.iid.clone());
        return Some(Decision::act(Action::Cast {
            iid: card.iid.clone(),
            payment: None,
            x: Some(x),
            y: Some(y),
        }));
    }
    if let Some(d) = plan_step(me, mind, tn) {
        return Some(d);
    }
    if mind.casts.1 >= budget {
        return None;
    }
    let untapped: Vec<String> = me
        .battlefield
        .iter()
        .filter(|c| is_land(c) && !c.tapped)
        .map(|c| c.iid.clone())
        .collect();
    let lands = untapped.len() as i64;
    let commander = me.command.iter().filter(|c| c.is_commander).find_map(|c| {
        let cost = mana_value(c) + me.commander_tax.get(&c.iid).copied().unwrap_or(0);
        (cost <= lands).then(|| CastPlan {
            iid: c.iid.clone(),
            from_command: true,
            taps: Vec::new(),
            to_stack: false,
            announce: Some(commander_line(&c.name)),
        })
        .map(|p| (p, cost))
    });
    let opponents_alive = room.players.iter().any(|p| p.seat != me.seat && !p.conceded);
    let target = commander.or_else(|| {
        me.hand
            .iter()
            .filter(|c| attr(c).is_some() && !is_land(c) && mana_value(c) <= lands)
            .filter(|c| {
                // Counterspells never main-phase in freeform either.
                !(opponents_alive
                    && crate::rules::facts(app, c).map(|f| f.counters_spell).unwrap_or(false))
            })
            .max_by_key(|c| (mana_value(c), is_creature(c)))
            .map(|c| {
                (
                    CastPlan {
                        iid: c.iid.clone(),
                        from_command: false,
                        taps: Vec::new(),
                        to_stack: is_spell(c),
                        announce: None,
                    },
                    mana_value(c),
                )
            })
    });
    let (mut plan, cost) = target?;
    plan.taps = untapped.into_iter().take(cost.max(0) as usize).collect();
    mind.casting = Some(plan);
    plan_step(me, mind, tn)
}

/// Execute one step of the current cast plan; clears plans whose card left
/// its zone (self-healing after restarts or interference).
pub(crate) fn plan_step(me: &Player, mind: &mut BotMind, tn: u64) -> Option<Decision> {
    let mut clear = false;
    let mut tap: Option<String> = None;
    if let Some(plan) = &mut mind.casting {
        let still_there = if plan.from_command {
            me.command.iter().any(|c| c.iid == plan.iid)
        } else {
            me.hand.iter().any(|c| c.iid == plan.iid)
        };
        if !still_there {
            clear = true;
        } else {
            while let Some(land) = plan.taps.pop() {
                if me.battlefield.iter().any(|c| c.iid == land && !c.tapped) {
                    tap = Some(land);
                    break;
                }
            }
        }
    }
    if clear {
        mind.casting = None;
        return None;
    }
    if let Some(iid) = tap {
        return Some(Decision::fast(Action::CardTap { iid, tapped: true, mana: None }));
    }
    let plan = mind.casting.take()?;
    mind.casts = (tn, mind.casts.1 + 1);
    let say = plan.announce.map(|l| vec![l]).unwrap_or_default();
    let k = me.battlefield.iter().filter(|c| !is_land(c)).count();
    let x = (0.15 + 0.11 * (k % 7) as f64).min(0.92);
    let y = 0.5;
    mind.played_this_turn.push(plan.iid.clone());
    let action = if plan.from_command {
        Action::CmdCast { iid: plan.iid, x, y }
    } else if plan.to_stack {
        Action::StackPush { iid: plan.iid }
    } else {
        Action::CardMove {
            iid: plan.iid,
            to: Zone::Battlefield,
            x: Some(x),
            y: Some(y),
            index: None,
            face_down: false,
        }
    };
    Some(Decision { action: Some(action), say, fast: false })
}
