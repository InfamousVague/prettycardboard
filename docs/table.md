# The game table (`src/app/pages/table/`)

The table is the most complex part of the client: a freeform, server-authoritative
board with drag-and-drop, a fanned hand, zone piles, guided combat, and a stage
that swaps which player's board is in focus. This is the map.

`TablePage.tsx` is the shell that assembles everything below. It renders whenever
`gameStore.room` is non-null (that overrides the current route).

## Files

| File | Role |
|------|------|
| `TablePage.tsx` | The table shell: top bar (share / start / concede / **settings** / leave), the stage, the side rail (vitals + players + log), and all the overlays. Owns the pinned-seat/stage logic and the keyboard shortcuts. |
| `MyBoard.tsx` | **Your** board: the battlefield (free placement + drag), the fanned hand (`HandCard`), the zone piles, and the drop/peek machinery. Also exports `Vitals` (life + conveniences). The largest, most coupled file — see the drag notes below. |
| `SeatFrame.tsx` | An **opponent's** board. When staged, a 180° mirror (their cards face away; piles in the far corner; hand fans from the top). Blocking happens here. |
| `bits.tsx` | Small shared table pieces (zone piles, the 3D `LibraryStack`, badges). |
| `overlays.tsx` | The transient overlays: `LibraryViewer`, `PileViewer`, `MulliganOverlay`, `CmdChoiceDialog`, `RollBanner`. |
| `CombatModals.tsx` | Combat v3 UI: `AttackTargetModal`, `DefenseModal`, `DefenseReturnChip`, `CombatResultsModal`. |
| `PhaseRibbon.tsx` / `StackTray.tsx` / `TurnCue.tsx` | Phase strip, the spell stack, and the turn indicator. |
| `PreMatch.tsx` / `PostMatch.tsx` | The matchup splash and the results screen (endorsements). |
| `BotPicker.tsx` | The host's "Add AI opponent" control (only rendered when the `aiOpponents` dev preference is on). |
| `boardModes.ts` | Board layout math (Free / Smart / Rows / Grid), tidy, and `effectivePT` (client-side power/toughness with counters). |
| `tableUi.ts` | A small zustand store for table-only UI state (attack/defense picks, hidden panels). |
| `juice.ts` | Card-flight animation helpers (`flightAnchor`, `flyCard`). |
| `shims.ts` | Normalizes v1 server events (e.g. minted tokens arrive as `action.card`, not `action.token`) and dedupes by iid. |
| `table.css` | All table styling. |

## The stage model

A started game puts **one** board on the stage — the active player's by default.
Everyone else is a clickable row in the side rail (the `PlayersCard` in
`TablePage`). Clicking a player's row pins their seat. Combat auto-stages the
relevant board (yours when you
attack, the opponent's when you block). `MyBoard` only renders when it's your
turn or your seat is staged; otherwise your hand strip docks at the bottom.

The felt wears the **active** player's playmat (each `Player.playmat` is synced
via the `playmat.set` WS message on join/reconnect/preference change).

## Drag-and-drop notes (read before touching MyBoard)

- Dropping a hand card onto the felt plays it; a `HAND_DROP_BUFFER` around the
  hand springs it back instead of playing. Dragging a battlefield card back into
  the buffer returns it to hand.
- The bottom band of the field is **reserved** (non-droppable): `fieldPos`
  clamps the drop `y` so cards never land under the hand/piles.
- The hand auto-peeks: it rests half-off the bottom edge and rises on
  `data-peek`, driven by a **stable viewport threshold** (a window `pointermove`
  listener), *not* the hand's own enter/leave — the latter oscillates and breaks
  dragging.
- Testing drags from the browser pane: React's drag-arm needs the `drag` state
  committed between pointerdown and the moves, so synchronous synthetic drags
  collapse into a click. Drive the fiber's pointer props with real `setTimeout`
  gaps (≥16 ms).

## Combat UI flow

`useEffect(combatOn -> stage the active seat)`. Attacking opens
`AttackTargetModal` (pick a target, send effective P/T). When a combat locks and
targets you, `DefenseModal` opens on the staged opponent board: toggle blockers
(live incoming-damage recompute), then *Play a response / Prevent all / Take the
damage / Confirm blocks*. `CombatResultsModal` shows the outcome to every viewer.
The server owns resolution (see [server.md](./server.md) → Combat v3); these are
presentation only.

## Future refactor candidates

`MyBoard.tsx` (~930 lines) and `TablePage.tsx` (~735) are the two files still
worth breaking up. They resisted a quick split because the drag state, refs, and
the peek machinery are shared across the hand, battlefield, and piles — a safe
extraction needs those hoisted into a small controller/hook first (e.g. a
`useBoardDrag` hook and a separate `Hand` component). Do that behind the existing
playtest coverage rather than as a mechanical cut.
